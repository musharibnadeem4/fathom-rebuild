import { NextResponse } from "next/server";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import {
  buildStorageKey,
  contentTypeForExt,
  createSupabaseServiceClient,
  ensureStorageBucket,
  isVideoContentType,
  missingPipelineEnv,
  MAX_UPLOAD_DURATION_SECONDS,
  STORAGE_BUCKET,
} from "@/lib/pipeline";

/**
 * Step 1 of the live upload flow (see /meetings/new): create the meeting row
 * as "processing" and hand back a signed Supabase Storage upload URL so the
 * browser can PUT the media file directly to Storage. The file never passes
 * through this function — Vercel serverless functions cap request bodies at
 * a few MB, far below a 12-minute video.
 */
export async function POST(request: Request) {
  const missingEnv = missingPipelineEnv();
  if (missingEnv.length > 0) {
    return NextResponse.json(
      { error: `Server is misconfigured: missing ${missingEnv.join(", ")}.` },
      { status: 500 },
    );
  }

  let body: { title?: unknown; filename?: unknown; clientDurationSeconds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const filename = typeof body.filename === "string" ? body.filename : "";
  const clientDurationSeconds =
    typeof body.clientDurationSeconds === "number" && Number.isFinite(body.clientDurationSeconds)
      ? body.clientDurationSeconds
      : null;

  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ error: "Title is too long (200 characters max)." }, { status: 400 });
  }

  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
  const contentType = contentTypeForExt(ext);
  if (!contentType) {
    return NextResponse.json(
      { error: `Unsupported file type "${ext || filename}". Use an audio or video file (mp4, mov, webm, mkv, mp3, wav, m4a, ogg).` },
      { status: 400 },
    );
  }

  if (clientDurationSeconds != null && clientDurationSeconds > MAX_UPLOAD_DURATION_SECONDS + 5) {
    return NextResponse.json(
      {
        error: `This recording is longer than the ${Math.round(MAX_UPLOAD_DURATION_SECONDS / 60)}-minute limit for live uploads. For longer recordings, use scripts/seed.ts locally instead.`,
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceClient();
  await ensureStorageBucket(supabase);

  const storageKey = buildStorageKey(filename.replace(ext, ""), ext);
  const { data: signedUpload, error: signError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storageKey);
  if (signError || !signedUpload) {
    return NextResponse.json(
      { error: `Could not prepare the upload: ${signError?.message ?? "unknown error"}.` },
      { status: 502 },
    );
  }

  const [meeting] = await db
    .insert(meetings)
    .values({
      title,
      status: "processing",
      recordedAt: new Date(),
    })
    .returning({ id: meetings.id });

  return NextResponse.json({
    meetingId: meeting.id,
    storageKey,
    signedUrl: signedUpload.signedUrl,
    token: signedUpload.token,
    contentType,
    isVideo: isVideoContentType(contentType),
  });
}
