/**
 * Seeds one meeting from a pre-recorded media file: uploads it to Supabase
 * Storage, transcribes + diarizes it with AssemblyAI, runs one combined
 * Gemini analysis pass, and writes everything to the DB.
 *
 * Shares its pipeline (upload, transcribe, analyze, write) with the live
 * /meetings/new upload flow — see src/lib/pipeline.ts.
 *
 * Usage:
 *   npx tsx scripts/seed.ts <path-to-media-file> "<meeting title>"
 */
import { extname } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { config } from "dotenv";

config({ path: ".env.local" });

import { db, client as dbClient } from "../src/db";
import { meetings } from "../src/db/schema";
import {
  analyzeTranscript,
  buildStorageKey,
  contentTypeForExt,
  createAssemblyAIClient,
  createGeminiClient,
  createSupabaseServiceClient,
  finalizeMeeting,
  isVideoContentType,
  markMeetingFailed,
  missingPipelineEnv,
  transcribeAndDiarize,
  uploadMediaBuffer,
} from "../src/lib/pipeline";

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

  const missingEnv = missingPipelineEnv();
  if (missingEnv.length > 0) {
    fail(
      "startup",
      `Missing required env var(s): ${missingEnv.join(", ")}. Add them to .env.local.`,
    );
  }

  const ext = extname(mediaPath).toLowerCase();
  const contentType = contentTypeForExt(ext);
  if (!contentType) {
    fail("startup", `Unrecognized media extension "${ext}".`);
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

  // Create the meeting row up front (matches the live upload flow, and means
  // a mid-pipeline failure leaves a visible "failed" row instead of nothing).
  const [meeting] = await db
    .insert(meetings)
    .values({ title: meetingTitle, status: "processing", recordedAt: new Date() })
    .returning();

  try {
    const supabase = createSupabaseServiceClient();
    const assemblyai = createAssemblyAIClient();
    const gemini = createGeminiClient();
    const isVideo = isVideoContentType(contentType);

    log("uploading", `Reading "${mediaPath}" (${(fileStat.size / 1024 / 1024).toFixed(1)} MB)`);
    const fileBuffer = await readFile(mediaPath);
    const storageKey = buildStorageKey(mediaPath.replace(ext, ""), ext);
    log("uploading", `Uploading to Supabase Storage as "${storageKey}"`);
    const mediaUrl = await uploadMediaBuffer(supabase, storageKey, fileBuffer, contentType);
    log("uploading", `Done. Public URL: ${mediaUrl}`);

    log("transcribing", "Submitting to AssemblyAI (speaker labels + word timestamps)");
    const { transcriptForPrompt, speakerOrder, participantDrafts, utteranceDrafts, durationSeconds } =
      await transcribeAndDiarize(assemblyai, mediaUrl);
    log(
      "transcribing",
      `Done. ${utteranceDrafts.length} utterances, ${durationSeconds ?? "unknown"}s duration, ` +
        `${participantDrafts.length} speakers: ${participantDrafts
          .map((p) => `${p.name} (${p.talkTimeSeconds}s)`)
          .join(", ")}`,
    );

    log("analyzing", "Sending transcript to Gemini for structured analysis");
    const { analysis } = await analyzeTranscript(gemini, transcriptForPrompt, speakerOrder);
    log(
      "analyzing",
      `Done. ${analysis.chapters.length} chapters, ${analysis.actionItems.length} action items, ` +
        `${analysis.coachingFlags.length} LLM coaching flags`,
    );

    log("writing", "Opening DB transaction");
    const result = await finalizeMeeting(db, {
      meetingId: meeting.id,
      durationSeconds,
      mediaUrl,
      isVideo,
      participantDrafts,
      utteranceDrafts,
      analysis,
    });
    log("writing", "Transaction committed");

    console.log("\n--- Seed complete ---");
    console.log(`Meeting ID:     ${meeting.id}`);
    console.log(`Title:          ${meetingTitle}`);
    console.log(`Participants:   ${result.participantCount}`);
    console.log(`Utterances:     ${result.utteranceCount}`);
    console.log(`Chapters:       ${result.chapterCount}`);
    console.log(`Action items:   ${result.actionItemCount}`);
    console.log(`Coaching flags: ${result.flagCount}`);
  } catch (err) {
    await markMeetingFailed(db, meeting.id).catch(() => {});
    fail("pipeline", "Ingestion pipeline failed", err);
  }
}

main()
  .catch((err) => fail("unexpected", "Unhandled error", err))
  .finally(async () => {
    await dbClient.end();
  });
