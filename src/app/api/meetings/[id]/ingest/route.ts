import { NextResponse, after } from "next/server";
import { db } from "@/db";
import {
  createSupabaseServiceClient,
  markMeetingFailed,
  probeMediaDurationSeconds,
  publicMediaUrl,
  runIngestionPipeline,
  MAX_UPLOAD_DURATION_SECONDS,
} from "@/lib/pipeline";

// Transcription (AssemblyAI) + one Gemini analysis pass for up to ~12 minutes
// of media comfortably fits in a few minutes, but this needs a Vercel plan
// whose function timeout can be raised past the platform default — see
// maxDuration below and the note in /meetings/new's README/PR description.
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Step 2 of the live upload flow: called once the browser has finished
 * PUTting the file straight to Supabase Storage (see POST /api/meetings).
 * Re-validates duration server-side (the client-side check is a UX nicety,
 * not a security boundary), then kicks off transcription + analysis and
 * returns immediately — the pipeline keeps running via `after()` while the
 * client redirects to /meetings/[id] and polls for status.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: meetingId } = await params;

  let body: { storageKey?: unknown; contentType?: unknown; isVideo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const storageKey = typeof body.storageKey === "string" ? body.storageKey : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const isVideo = body.isVideo === true;

  if (!storageKey || !contentType) {
    return NextResponse.json({ error: "Missing storageKey or contentType." }, { status: 400 });
  }

  const meeting = await db.query.meetings.findFirst({
    where: (meetingsTable, { eq }) => eq(meetingsTable.id, meetingId),
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }
  if (meeting.status !== "processing") {
    return NextResponse.json({ error: `Meeting is already "${meeting.status}".` }, { status: 409 });
  }

  const supabase = createSupabaseServiceClient();
  const mediaUrl = publicMediaUrl(supabase, storageKey);

  // Cheap, header-only duration check (reads only the first chunk of the
  // file over HTTP range requests) — catches anyone who bypasses the
  // client-side check and uploads something longer than the live-upload cap.
  let durationSeconds: number | null;
  try {
    durationSeconds = await probeMediaDurationSeconds(mediaUrl);
  } catch (err) {
    console.error("ingest: duration probe failed", err);
    await markMeetingFailed(db, meetingId);
    return NextResponse.json(
      { error: "Couldn't read the uploaded file. It may be corrupt or an unsupported container." },
      { status: 422 },
    );
  }

  if (durationSeconds != null && durationSeconds > MAX_UPLOAD_DURATION_SECONDS + 5) {
    await markMeetingFailed(db, meetingId);
    return NextResponse.json(
      {
        error: `This recording is about ${Math.round(durationSeconds / 60)} minutes, longer than the ${Math.round(MAX_UPLOAD_DURATION_SECONDS / 60)}-minute limit for live uploads. For longer recordings, run it through scripts/seed.ts locally instead.`,
      },
      { status: 422 },
    );
  }

  after(async () => {
    try {
      await runIngestionPipeline(db, { meetingId, mediaUrl, isVideo });
    } catch (err) {
      console.error(`ingest pipeline failed for meeting ${meetingId}`, err);
      await markMeetingFailed(db, meetingId).catch((markErr) =>
        console.error(`failed to mark meeting ${meetingId} as failed`, markErr),
      );
    }
  });

  return NextResponse.json({ status: "processing" }, { status: 202 });
}
