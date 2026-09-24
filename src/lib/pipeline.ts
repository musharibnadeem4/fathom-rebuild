/**
 * Shared ingestion pipeline: upload media, transcribe + diarize with
 * AssemblyAI, run one combined Gemini analysis pass, and write everything to
 * the DB. Used by both scripts/seed.ts (local, pre-recorded files) and
 * src/app/api/meetings/[id]/ingest/route.ts (live uploads from /meetings/new).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { AssemblyAI } from "assemblyai";
import { GoogleGenAI, Type } from "@google/genai";
import { eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import {
  meetings,
  participants,
  utterances,
  summaries,
  chapters,
  actionItems,
  coachingFlags,
} from "@/db/schema";
import { CONTENT_TYPES, MAX_UPLOAD_DURATION_SECONDS, contentTypeForExt, isVideoContentType } from "@/lib/media-types";

export { CONTENT_TYPES, MAX_UPLOAD_DURATION_SECONDS, contentTypeForExt, isVideoContentType };

export const STORAGE_BUCKET = "meeting-media";

// A speaker is flagged as dominating the conversation once their share of
// total talk time crosses this. Purely deterministic — no LLM involved.
const TALK_TIME_IMBALANCE_THRESHOLD = 0.65;
const TALK_TIME_IMBALANCE_MIN_PARTICIPANTS = 2;

export const REQUIRED_PIPELINE_ENV = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ASSEMBLYAI_API_KEY",
  "GEMINI_API_KEY",
] as const;

export function missingPipelineEnv(): string[] {
  return REQUIRED_PIPELINE_ENV.filter((key) => !process.env[key]);
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export function createSupabaseServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    // Only Storage is used here, but the client's constructor always spins
    // up a Realtime client, which needs a WebSocket implementation. Node 20
    // has no native `WebSocket` global (Node 22+ does).
    { realtime: { transport: ws as never } },
  );
}

export function createAssemblyAIClient(): AssemblyAI {
  return new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! });
}

export function createGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
}

// ---------------------------------------------------------------------------
// 1. Storage
// ---------------------------------------------------------------------------

export async function ensureStorageBucket(supabase: SupabaseClient): Promise<void> {
  const { data: existingBucket } = await supabase.storage.getBucket(STORAGE_BUCKET);
  if (!existingBucket) {
    const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, { public: true });
    if (error) throw new Error(`Failed to create storage bucket: ${error.message}`);
  }
}

export function buildStorageKey(sourceName: string, ext: string): string {
  const sanitizedBasename = sourceName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${crypto.randomUUID()}${sanitizedBasename ? `-${sanitizedBasename}` : ""}${ext}`;
}

export async function uploadMediaBuffer(
  supabase: SupabaseClient,
  storageKey: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  await ensureStorageBucket(supabase);
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storageKey, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  return publicMediaUrl(supabase, storageKey);
}

export function publicMediaUrl(supabase: SupabaseClient, storageKey: string): string {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storageKey);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// 2. Transcription + diarization
// ---------------------------------------------------------------------------

type ParticipantDraft = { speakerLabel: string; name: string; talkTimeSeconds: number };
type UtteranceDraft = {
  speakerLabel: string;
  sequence: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type TranscriptionResult = {
  transcriptForPrompt: string;
  speakerOrder: string[];
  participantDrafts: ParticipantDraft[];
  utteranceDrafts: UtteranceDraft[];
  durationSeconds: number | null;
};

export async function transcribeAndDiarize(
  assemblyai: AssemblyAI,
  mediaUrl: string,
): Promise<TranscriptionResult> {
  const transcript = await assemblyai.transcripts.transcribe({
    audio: mediaUrl,
    speaker_labels: true,
  });

  if (transcript.status === "error") {
    throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
  }
  if (!transcript.utterances || transcript.utterances.length === 0) {
    throw new Error("AssemblyAI returned no utterances (silent file or diarization failure?)");
  }

  const durationSeconds = transcript.audio_duration ? Math.round(transcript.audio_duration) : null;

  const speakerOrder: string[] = [];
  const talkTimeMsBySpeaker = new Map<string, number>();
  for (const u of transcript.utterances) {
    if (!talkTimeMsBySpeaker.has(u.speaker)) {
      speakerOrder.push(u.speaker);
      talkTimeMsBySpeaker.set(u.speaker, 0);
    }
    talkTimeMsBySpeaker.set(u.speaker, talkTimeMsBySpeaker.get(u.speaker)! + (u.end - u.start));
  }

  const participantDrafts: ParticipantDraft[] = speakerOrder.map((label) => ({
    speakerLabel: label,
    name: `Speaker ${label}`,
    talkTimeSeconds: Math.round(talkTimeMsBySpeaker.get(label)! / 1000),
  }));

  const utteranceDrafts: UtteranceDraft[] = transcript.utterances.map((u, index) => ({
    speakerLabel: u.speaker,
    sequence: index,
    startMs: u.start,
    endMs: u.end,
    text: u.text,
  }));

  const transcriptForPrompt = transcript.utterances
    .map((u) => `[${u.start}ms] Speaker ${u.speaker}: ${u.text}`)
    .join("\n");

  return { transcriptForPrompt, speakerOrder, participantDrafts, utteranceDrafts, durationSeconds };
}

// ---------------------------------------------------------------------------
// 3. Gemini analysis
// ---------------------------------------------------------------------------

type Analysis = {
  summaries: {
    general: { purpose: string; takeaways: string[]; topics: string[] };
    sales: {
      prospect: string;
      dealStage: string;
      painPoints: string[];
      nextSteps: string[];
      risks: string[];
    };
    one_on_one: {
      checkIns: string[];
      updates: string[];
      blockers: string[];
      growthNotes: string[];
    };
  };
  chapters: { title: string; summary: string; startMs: number; endMs: number }[];
  actionItems: {
    text: string;
    ownerName: string;
    ownerSpeakerLabel?: string | null;
    sourceTimestampMs: number;
    isLowConfidence: boolean;
  }[];
  coachingFlags: {
    kind: "unanswered_question" | "objection_detected" | "follow_up_opportunity";
    timestampMs: number;
    label: string;
    detail: string;
  }[];
};

type DeterministicFlag = {
  kind: "talk_time_imbalance";
  timestampMs: number;
  label: string;
  metadata: Record<string, unknown>;
};

const analysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    summaries: {
      type: Type.OBJECT,
      properties: {
        general: {
          type: Type.OBJECT,
          properties: {
            purpose: { type: Type.STRING },
            takeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
            topics: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["purpose", "takeaways", "topics"],
        },
        sales: {
          type: Type.OBJECT,
          properties: {
            prospect: { type: Type.STRING },
            dealStage: { type: Type.STRING },
            painPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
            risks: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["prospect", "dealStage", "painPoints", "nextSteps", "risks"],
        },
        one_on_one: {
          type: Type.OBJECT,
          properties: {
            checkIns: { type: Type.ARRAY, items: { type: Type.STRING } },
            updates: { type: Type.ARRAY, items: { type: Type.STRING } },
            blockers: { type: Type.ARRAY, items: { type: Type.STRING } },
            growthNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["checkIns", "updates", "blockers", "growthNotes"],
        },
      },
      required: ["general", "sales", "one_on_one"],
    },
    chapters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          startMs: { type: Type.INTEGER },
          endMs: { type: Type.INTEGER },
        },
        required: ["title", "summary", "startMs", "endMs"],
      },
    },
    actionItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          ownerName: { type: Type.STRING },
          ownerSpeakerLabel: {
            type: Type.STRING,
            nullable: true,
            description:
              "One of the known speaker labels if you're confident which participant owns this, else null.",
          },
          sourceTimestampMs: { type: Type.INTEGER },
          isLowConfidence: { type: Type.BOOLEAN },
        },
        required: ["text", "ownerName", "sourceTimestampMs", "isLowConfidence"],
      },
    },
    coachingFlags: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            enum: ["unanswered_question", "objection_detected", "follow_up_opportunity"],
          },
          timestampMs: { type: Type.INTEGER },
          label: { type: Type.STRING },
          detail: {
            type: Type.STRING,
            description: "One or two sentences of extra context for a tooltip.",
          },
        },
        required: ["kind", "timestampMs", "label", "detail"],
      },
    },
  },
  required: ["summaries", "chapters", "actionItems", "coachingFlags"],
};

export async function analyzeTranscript(
  gemini: GoogleGenAI,
  transcriptForPrompt: string,
  speakerOrder: string[],
): Promise<{ analysis: Analysis }> {
  const prompt = `You are analyzing a meeting transcript. Speakers are diarized labels (${speakerOrder.join(", ")}), not real names.

Produce:
- Three summary variants: "general" (plain purpose + takeaways + topics), "sales" (deal/prospect framing: prospect, deal stage, pain points, next steps, risks), and "one_on_one" (check-in framing: check-ins, updates, blockers, growth notes). If a template doesn't fit the content (e.g. no sales content in a 1:1), still fill it out as best effort from what's there — do not invent facts not present in the transcript.
- Chapters: topic segments covering the whole call, each with a title, short summary, and start/end ms timestamps taken from the transcript lines.
- Action items: concrete commitments or follow-up tasks. For each, set isLowConfidence=true if it's an inferred/implicit suggestion rather than an explicit commitment, false if someone explicitly committed to it. Set ownerSpeakerLabel only when you're confident which speaker owns it; otherwise leave it null and just describe the owner in ownerName.
- Coaching flags: only "unanswered_question" (a question raised that nobody answered), "objection_detected" (pushback, hesitation, or a stated concern), and "follow_up_opportunity" (a topic raised but not resolved that warrants a future follow-up). Do NOT produce talk-time flags. If the call doesn't contain a given signal, return an empty array for it rather than inventing one.

All timestamps must be in milliseconds and correspond to actual line timestamps in the transcript below.

Transcript:
${transcriptForPrompt}`;

  const geminiResponse = await gemini.models.generateContent({
    model: "gemini-3.8-flash",
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: analysisResponseSchema },
  });

  const rawText = geminiResponse.text;
  if (!rawText) {
    throw new Error("Gemini returned an empty response");
  }

  let analysis: Analysis;
  try {
    analysis = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Gemini response was not valid JSON: ${(err as Error).message}`);
  }

  return { analysis };
}

// Talk-time imbalance is computed deterministically from participant numbers,
// not asked of the model.
export function computeTalkTimeImbalanceFlags(
  participantDrafts: ParticipantDraft[],
): DeterministicFlag[] {
  const deterministicFlags: DeterministicFlag[] = [];
  const totalTalkTimeSeconds = participantDrafts.reduce((sum, p) => sum + p.talkTimeSeconds, 0);
  if (
    participantDrafts.length >= TALK_TIME_IMBALANCE_MIN_PARTICIPANTS &&
    totalTalkTimeSeconds > 0
  ) {
    for (const p of participantDrafts) {
      const share = p.talkTimeSeconds / totalTalkTimeSeconds;
      if (share >= TALK_TIME_IMBALANCE_THRESHOLD) {
        const percent = Math.round(share * 100);
        const others = participantDrafts.filter((other) => other.speakerLabel !== p.speakerLabel);
        const othersPhrase =
          others.length === 1 ? others[0].name : `the other ${others.length} participants combined`;
        deterministicFlags.push({
          kind: "talk_time_imbalance",
          timestampMs: 0,
          label: `${p.name} dominated the conversation (${percent}% of talk time)`,
          metadata: {
            detail: `${p.name} spoke for ${p.talkTimeSeconds} of ${totalTalkTimeSeconds} seconds (${percent}%) — noticeably more than ${othersPhrase}.`,
            stats: {
              speakerLabel: p.speakerLabel,
              talkTimeSeconds: p.talkTimeSeconds,
              totalTalkTimeSeconds,
              share,
            },
          },
        });
      }
    }
  }
  return deterministicFlags;
}

// ---------------------------------------------------------------------------
// 4. Write results to DB
// ---------------------------------------------------------------------------

export async function finalizeMeeting(
  db: typeof Db,
  params: {
    meetingId: string;
    durationSeconds: number | null;
    mediaUrl: string;
    isVideo: boolean;
    participantDrafts: ParticipantDraft[];
    utteranceDrafts: UtteranceDraft[];
    analysis: Analysis;
  },
): Promise<{
  participantCount: number;
  utteranceCount: number;
  chapterCount: number;
  actionItemCount: number;
  flagCount: number;
}> {
  const { meetingId, durationSeconds, mediaUrl, isVideo, participantDrafts, utteranceDrafts, analysis } =
    params;
  const deterministicFlags = computeTalkTimeImbalanceFlags(participantDrafts);

  return db.transaction(async (tx) => {
    await tx
      .update(meetings)
      .set({
        status: "ready",
        durationSeconds,
        videoUrl: isVideo ? mediaUrl : null,
        audioUrl: isVideo ? null : mediaUrl,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));

    const insertedParticipants = participantDrafts.length
      ? await tx
          .insert(participants)
          .values(
            participantDrafts.map((p) => ({
              meetingId,
              name: p.name,
              speakerLabel: p.speakerLabel,
              talkTimeSeconds: p.talkTimeSeconds,
            })),
          )
          .returning()
      : [];

    const participantIdByLabel = new Map(insertedParticipants.map((p) => [p.speakerLabel!, p.id]));

    const insertedUtterances = utteranceDrafts.length
      ? await tx
          .insert(utterances)
          .values(
            utteranceDrafts.map((u) => ({
              meetingId,
              participantId: participantIdByLabel.get(u.speakerLabel) ?? null,
              sequence: u.sequence,
              startMs: u.startMs,
              endMs: u.endMs,
              text: u.text,
            })),
          )
          .returning({ id: utterances.id })
      : [];

    await tx.insert(summaries).values([
      { meetingId, template: "general", content: analysis.summaries.general },
      { meetingId, template: "sales", content: analysis.summaries.sales },
      { meetingId, template: "one_on_one", content: analysis.summaries.one_on_one },
    ]);

    const insertedChapters = analysis.chapters.length
      ? await tx
          .insert(chapters)
          .values(
            analysis.chapters.map((c, index) => ({
              meetingId,
              sequence: index,
              title: c.title,
              summary: c.summary,
              startMs: c.startMs,
              endMs: c.endMs,
            })),
          )
          .returning({ id: chapters.id })
      : [];

    const insertedActionItems = analysis.actionItems.length
      ? await tx
          .insert(actionItems)
          .values(
            analysis.actionItems.map((a) => ({
              meetingId,
              text: a.text,
              ownerParticipantId: a.ownerSpeakerLabel
                ? (participantIdByLabel.get(a.ownerSpeakerLabel) ?? null)
                : null,
              ownerName: a.ownerName,
              sourceTimestampMs: a.sourceTimestampMs,
              isLowConfidence: a.isLowConfidence,
            })),
          )
          .returning({ id: actionItems.id })
      : [];

    const allFlags = [
      ...analysis.coachingFlags.map((f) => ({
        meetingId,
        kind: f.kind,
        timestampMs: f.timestampMs,
        label: f.label,
        metadata: { detail: f.detail },
      })),
      ...deterministicFlags.map((f) => ({
        meetingId,
        kind: f.kind,
        timestampMs: f.timestampMs,
        label: f.label,
        metadata: f.metadata,
      })),
    ];
    const insertedFlags = allFlags.length
      ? await tx.insert(coachingFlags).values(allFlags).returning({ id: coachingFlags.id })
      : [];

    return {
      participantCount: insertedParticipants.length,
      utteranceCount: insertedUtterances.length,
      chapterCount: insertedChapters.length,
      actionItemCount: insertedActionItems.length,
      flagCount: insertedFlags.length,
    };
  });
}

export async function markMeetingFailed(db: typeof Db, meetingId: string): Promise<void> {
  await db
    .update(meetings)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(meetings.id, meetingId));
}

// ---------------------------------------------------------------------------
// 5. Duration probing (cheap, header-only — used to reject over-long uploads
//    server-side without downloading the whole file)
// ---------------------------------------------------------------------------

export async function probeMediaDurationSeconds(mediaUrl: string): Promise<number | null> {
  const { makeTokenizer } = await import("@tokenizer/http");
  const { parseFromTokenizer } = await import("music-metadata");
  const tokenizer = await makeTokenizer(mediaUrl);
  try {
    const metadata = await parseFromTokenizer(tokenizer);
    return metadata.format.duration ?? null;
  } finally {
    await tokenizer.close();
  }
}

// ---------------------------------------------------------------------------
// 6. End-to-end pipeline (transcribe -> analyze -> write), given media
//    already sitting in Storage at `mediaUrl` and a meeting row already
//    created with status "processing".
// ---------------------------------------------------------------------------

export async function runIngestionPipeline(
  db: typeof Db,
  params: { meetingId: string; mediaUrl: string; isVideo: boolean },
): Promise<void> {
  const assemblyai = createAssemblyAIClient();
  const gemini = createGeminiClient();

  const { transcriptForPrompt, speakerOrder, participantDrafts, utteranceDrafts, durationSeconds } =
    await transcribeAndDiarize(assemblyai, params.mediaUrl);

  const { analysis } = await analyzeTranscript(gemini, transcriptForPrompt, speakerOrder);

  await finalizeMeeting(db, {
    meetingId: params.meetingId,
    durationSeconds,
    mediaUrl: params.mediaUrl,
    isVideo: params.isVideo,
    participantDrafts,
    utteranceDrafts,
    analysis,
  });
}
