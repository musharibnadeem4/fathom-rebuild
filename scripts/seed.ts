/**
 * Seeds one meeting from a pre-recorded media file: uploads it to Supabase
 * Storage, transcribes + diarizes it with AssemblyAI, runs one combined
 * Gemini analysis pass, and writes everything to the DB in a single
 * transaction.
 *
 * Usage:
 *   npx tsx scripts/seed.ts <path-to-media-file> "<meeting title>"
 */
import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { AssemblyAI } from "assemblyai";
import { GoogleGenAI, Type } from "@google/genai";
import { db, client as dbClient } from "../src/db";
import {
  meetings,
  participants,
  utterances,
  summaries,
  chapters,
  actionItems,
  coachingFlags,
} from "../src/db/schema";

// ---------------------------------------------------------------------------
// Setup / validation
// ---------------------------------------------------------------------------

const REQUIRED_ENV = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ASSEMBLYAI_API_KEY",
  "GEMINI_API_KEY",
] as const;

const STORAGE_BUCKET = "meeting-media";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
};

// A speaker is flagged as dominating the conversation once their share of
// total talk time crosses this. Purely deterministic — no LLM involved.
const TALK_TIME_IMBALANCE_THRESHOLD = 0.65;
const TALK_TIME_IMBALANCE_MIN_PARTICIPANTS = 2;

function fail(stage: string, message: string, cause?: unknown): never {
  console.error(`\n[FAILED at ${stage}] ${message}`);
  if (cause instanceof Error) {
    console.error(cause.stack ?? cause.message);
  } else if (cause !== undefined) {
    console.error(cause);
  }
  process.exit(1);
}

function log(stage: string, message: string) {
  console.log(`[${stage}] ${message}`);
}

async function main() {
  const [, , mediaPath, meetingTitle] = process.argv;

  if (!mediaPath || !meetingTitle) {
    console.error(
      'Usage: npx tsx scripts/seed.ts <path-to-media-file> "<meeting title>"',
    );
    process.exit(1);
  }

  const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missingEnv.length > 0) {
    fail(
      "startup",
      `Missing required env var(s): ${missingEnv.join(", ")}. Add them to .env.local.`,
    );
  }

  const ext = extname(mediaPath).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    fail(
      "startup",
      `Unrecognized media extension "${ext}". Supported: ${Object.keys(CONTENT_TYPES).join(", ")}`,
    );
  }

  let fileStat;
  try {
    fileStat = await stat(mediaPath);
  } catch (err) {
    fail("startup", `Cannot read media file at "${mediaPath}"`, err);
  }
  if (!fileStat.isFile()) {
    fail("startup", `"${mediaPath}" is not a file`);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    // This script only uses Storage, but the client's constructor always
    // spins up a Realtime client, which needs a WebSocket implementation.
    // Node 20 has no native `WebSocket` global (Node 22+ does).
    { realtime: { transport: ws as never } },
  );
  const assemblyai = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! });
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // -------------------------------------------------------------------------
  // 1. Upload to Supabase Storage
  // -------------------------------------------------------------------------
  log("uploading", `Reading "${mediaPath}" (${(fileStat.size / 1024 / 1024).toFixed(1)} MB)`);
  const fileBuffer = await readFile(mediaPath);
  // Supabase Storage keys reject many non-ASCII/punctuation characters, and
  // source filenames (e.g. downloaded video titles) are unpredictable, so
  // don't depend on them beyond the extension.
  const sanitizedBasename = basename(mediaPath, ext)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const storageKey = `${randomUUID()}${sanitizedBasename ? `-${sanitizedBasename}` : ""}${ext}`;

  const { data: existingBucket } = await supabase.storage.getBucket(STORAGE_BUCKET);
  if (!existingBucket) {
    log("uploading", `Bucket "${STORAGE_BUCKET}" not found, creating it as public`);
    const { error: createBucketError } = await supabase.storage.createBucket(
      STORAGE_BUCKET,
      { public: true },
    );
    if (createBucketError) {
      fail("uploading", "Failed to create storage bucket", createBucketError);
    }
  }

  log("uploading", `Uploading to Supabase Storage as "${storageKey}"`);
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storageKey, fileBuffer, { contentType, upsert: false });
  if (uploadError) {
    fail("uploading", "Supabase Storage upload failed", uploadError);
  }

  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storageKey);
  const mediaUrl = publicUrlData.publicUrl;
  log("uploading", `Done. Public URL: ${mediaUrl}`);

  const isVideo = contentType.startsWith("video/");

  // -------------------------------------------------------------------------
  // 2. Transcribe + diarize with AssemblyAI
  // -------------------------------------------------------------------------
  log("transcribing", "Submitting to AssemblyAI (speaker labels + word timestamps)");
  const transcript = await assemblyai.transcripts
    .transcribe({ audio: mediaUrl, speaker_labels: true })
    .catch((err) => fail("transcribing", "AssemblyAI request failed", err));

  if (transcript.status === "error") {
    fail("transcribing", `AssemblyAI transcription failed: ${transcript.error}`);
  }
  if (!transcript.utterances || transcript.utterances.length === 0) {
    fail("transcribing", "AssemblyAI returned no utterances (silent file or diarization failure?)");
  }
  const durationSeconds = transcript.audio_duration
    ? Math.round(transcript.audio_duration)
    : null;
  log(
    "transcribing",
    `Done. ${transcript.utterances.length} utterances, ${durationSeconds ?? "unknown"}s duration`,
  );

  // -------------------------------------------------------------------------
  // 3. Build participants + utterances from diarization
  // -------------------------------------------------------------------------
  const speakerOrder: string[] = [];
  const talkTimeMsBySpeaker = new Map<string, number>();
  for (const u of transcript.utterances) {
    if (!talkTimeMsBySpeaker.has(u.speaker)) {
      speakerOrder.push(u.speaker);
      talkTimeMsBySpeaker.set(u.speaker, 0);
    }
    talkTimeMsBySpeaker.set(
      u.speaker,
      talkTimeMsBySpeaker.get(u.speaker)! + (u.end - u.start),
    );
  }

  const participantDrafts = speakerOrder.map((label) => ({
    speakerLabel: label,
    name: `Speaker ${label}`,
    talkTimeSeconds: Math.round(talkTimeMsBySpeaker.get(label)! / 1000),
  }));

  const utteranceDrafts = transcript.utterances.map((u, index) => ({
    speakerLabel: u.speaker,
    sequence: index,
    startMs: u.start,
    endMs: u.end,
    text: u.text,
  }));

  log(
    "transcribing",
    `Built ${participantDrafts.length} participants: ${participantDrafts
      .map((p) => `${p.name} (${p.talkTimeSeconds}s)`)
      .join(", ")}`,
  );

  // -------------------------------------------------------------------------
  // 4. One combined Gemini pass: summaries, chapters, action items,
  //    unanswered_question / objection_detected / follow_up_opportunity
  //    coaching flags. talk_time_imbalance is computed deterministically
  //    below, not asked of the model.
  // -------------------------------------------------------------------------
  log("analyzing", "Sending transcript to Gemini for structured analysis");

  const transcriptForPrompt = transcript.utterances
    .map((u) => `[${u.start}ms] Speaker ${u.speaker}: ${u.text}`)
    .join("\n");

  const knownSpeakerLabels = speakerOrder;

  const responseSchema = {
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

  const prompt = `You are analyzing a meeting transcript. Speakers are diarized labels (${knownSpeakerLabels.join(", ")}), not real names.

Produce:
- Three summary variants: "general" (plain purpose + takeaways + topics), "sales" (deal/prospect framing: prospect, deal stage, pain points, next steps, risks), and "one_on_one" (check-in framing: check-ins, updates, blockers, growth notes). If a template doesn't fit the content (e.g. no sales content in a 1:1), still fill it out as best effort from what's there — do not invent facts not present in the transcript.
- Chapters: topic segments covering the whole call, each with a title, short summary, and start/end ms timestamps taken from the transcript lines.
- Action items: concrete commitments or follow-up tasks. For each, set isLowConfidence=true if it's an inferred/implicit suggestion rather than an explicit commitment, false if someone explicitly committed to it. Set ownerSpeakerLabel only when you're confident which speaker owns it; otherwise leave it null and just describe the owner in ownerName.
- Coaching flags: only "unanswered_question" (a question raised that nobody answered), "objection_detected" (pushback, hesitation, or a stated concern), and "follow_up_opportunity" (a topic raised but not resolved that warrants a future follow-up). Do NOT produce talk-time flags. If the call doesn't contain a given signal, return an empty array for it rather than inventing one.

All timestamps must be in milliseconds and correspond to actual line timestamps in the transcript below.

Transcript:
${transcriptForPrompt}`;

  const geminiResponse = await gemini.models
    .generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema,
      },
    })
    .catch((err) => fail("analyzing", "Gemini request failed", err));

  const rawText = geminiResponse.text;
  if (!rawText) {
    fail("analyzing", "Gemini returned an empty response");
  }

  let analysis: {
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
  try {
    analysis = JSON.parse(rawText);
  } catch (err) {
    fail("analyzing", "Gemini response was not valid JSON", err);
  }

  log(
    "analyzing",
    `Done. ${analysis.chapters.length} chapters, ${analysis.actionItems.length} action items, ` +
      `${analysis.coachingFlags.length} LLM coaching flags`,
  );

  // Deterministic talk-time imbalance flag(s) — computed from participant
  // numbers, not the model.
  const deterministicFlags: {
    kind: "talk_time_imbalance";
    timestampMs: number;
    label: string;
    metadata: Record<string, unknown>;
  }[] = [];
  const totalTalkTimeSeconds = participantDrafts.reduce(
    (sum, p) => sum + p.talkTimeSeconds,
    0,
  );
  if (
    participantDrafts.length >= TALK_TIME_IMBALANCE_MIN_PARTICIPANTS &&
    totalTalkTimeSeconds > 0
  ) {
    for (const p of participantDrafts) {
      const share = p.talkTimeSeconds / totalTalkTimeSeconds;
      if (share >= TALK_TIME_IMBALANCE_THRESHOLD) {
        const percent = Math.round(share * 100);
        const others = participantDrafts.filter(
          (other) => other.speakerLabel !== p.speakerLabel,
        );
        const othersPhrase =
          others.length === 1
            ? others[0].name
            : `the other ${others.length} participants combined`;
        deterministicFlags.push({
          kind: "talk_time_imbalance",
          timestampMs: 0,
          label: `${p.name} dominated the conversation (${percent}% of talk time)`,
          metadata: {
            // Plain-language sentence for direct display (tooltip, etc).
            detail: `${p.name} spoke for ${p.talkTimeSeconds} of ${totalTalkTimeSeconds} seconds (${percent}%) — noticeably more than ${othersPhrase}.`,
            // Structured numbers kept separately for UI use (e.g. a
            // per-speaker talk-time bar chart), not mixed into `detail`.
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
  log(
    "analyzing",
    `Computed ${deterministicFlags.length} deterministic talk-time-imbalance flag(s)`,
  );

  // -------------------------------------------------------------------------
  // 5. Write everything to the DB in one transaction
  // -------------------------------------------------------------------------
  log("writing", "Opening DB transaction");

  const result = await db.transaction(async (tx) => {
    const [meeting] = await tx
      .insert(meetings)
      .values({
        title: meetingTitle,
        status: "ready",
        recordedAt: new Date(),
        durationSeconds,
        videoUrl: isVideo ? mediaUrl : null,
        audioUrl: isVideo ? null : mediaUrl,
      })
      .returning();

    const insertedParticipants = participantDrafts.length
      ? await tx
          .insert(participants)
          .values(
            participantDrafts.map((p) => ({
              meetingId: meeting.id,
              name: p.name,
              speakerLabel: p.speakerLabel,
              talkTimeSeconds: p.talkTimeSeconds,
            })),
          )
          .returning()
      : [];

    const participantIdByLabel = new Map(
      insertedParticipants.map((p) => [p.speakerLabel!, p.id]),
    );

    const insertedUtterances = utteranceDrafts.length
      ? await tx
          .insert(utterances)
          .values(
            utteranceDrafts.map((u) => ({
              meetingId: meeting.id,
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
      {
        meetingId: meeting.id,
        template: "general",
        content: analysis.summaries.general,
      },
      {
        meetingId: meeting.id,
        template: "sales",
        content: analysis.summaries.sales,
      },
      {
        meetingId: meeting.id,
        template: "one_on_one",
        content: analysis.summaries.one_on_one,
      },
    ]);

    const insertedChapters = analysis.chapters.length
      ? await tx
          .insert(chapters)
          .values(
            analysis.chapters.map((c, index) => ({
              meetingId: meeting.id,
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
              meetingId: meeting.id,
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
        meetingId: meeting.id,
        kind: f.kind,
        timestampMs: f.timestampMs,
        label: f.label,
        metadata: { detail: f.detail },
      })),
      ...deterministicFlags.map((f) => ({
        meetingId: meeting.id,
        kind: f.kind,
        timestampMs: f.timestampMs,
        label: f.label,
        metadata: f.metadata,
      })),
    ];
    const insertedFlags = allFlags.length
      ? await tx
          .insert(coachingFlags)
          .values(allFlags)
          .returning({ id: coachingFlags.id })
      : [];

    return {
      meeting,
      participantCount: insertedParticipants.length,
      utteranceCount: insertedUtterances.length,
      chapterCount: insertedChapters.length,
      actionItemCount: insertedActionItems.length,
      flagCount: insertedFlags.length,
    };
  });

  log("writing", "Transaction committed");

  console.log("\n--- Seed complete ---");
  console.log(`Meeting ID:     ${result.meeting.id}`);
  console.log(`Title:          ${result.meeting.title}`);
  console.log(`Participants:   ${result.participantCount}`);
  console.log(`Utterances:     ${result.utteranceCount}`);
  console.log(`Chapters:       ${result.chapterCount}`);
  console.log(`Action items:   ${result.actionItemCount}`);
  console.log(`Coaching flags: ${result.flagCount}`);
}

main()
  .catch((err) => fail("unexpected", "Unhandled error", err))
  .finally(async () => {
    await dbClient.end();
  });
