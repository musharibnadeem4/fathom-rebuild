// Shared between the server-side ingestion pipeline and the client-side
// upload form — kept dependency-free so it's safe to import from either.

export const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
};

// Live uploads have no background job queue behind them — the whole pipeline
// (transcription + analysis) has to fit inside one Vercel function
// invocation, so we cap how much media it can be asked to chew through.
export const MAX_UPLOAD_DURATION_SECONDS = 12 * 60;

export function contentTypeForExt(ext: string): string | null {
  return CONTENT_TYPES[ext.toLowerCase()] ?? null;
}

export function isVideoContentType(contentType: string): boolean {
  return contentType.startsWith("video/");
}

export const ACCEPTED_FILE_EXTENSIONS = Object.keys(CONTENT_TYPES);
