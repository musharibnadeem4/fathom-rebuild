"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileVideo, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { ACCEPTED_FILE_EXTENSIONS, MAX_UPLOAD_DURATION_SECONDS, contentTypeForExt } from "@/lib/media-types";

type Status = "idle" | "reading-duration" | "creating" | "uploading" | "starting" | "error";

const ACCEPT_ATTR = ACCEPTED_FILE_EXTENSIONS.join(",");
const MAX_MINUTES = Math.round(MAX_UPLOAD_DURATION_SECONDS / 60);

function extOf(filename: string): string {
  return filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
}

function formatMinutesSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Cheap client-side duration read: load the file into a hidden <video>
// element and wait for metadata (no full decode/upload needed).
function readMediaDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    const objectUrl = URL.createObjectURL(file);
    el.src = objectUrl;
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    el.onloadedmetadata = () => {
      const duration = Number.isFinite(el.duration) ? el.duration : null;
      cleanup();
      resolve(duration);
    };
    el.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

export function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = status !== "idle" && status !== "error";

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setError(null);
    setFile(selected);
    setDurationSeconds(null);
    if (!selected) return;

    const ext = extOf(selected.name);
    if (!contentTypeForExt(ext)) {
      setError(`Unsupported file type "${ext || selected.name}". Use audio or video: ${ACCEPTED_FILE_EXTENSIONS.join(", ")}.`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setStatus("reading-duration");
    const duration = await readMediaDurationSeconds(selected);
    setStatus("idle");
    setDurationSeconds(duration);
    if (duration != null && duration > MAX_UPLOAD_DURATION_SECONDS) {
      setError(
        `This recording is ${formatMinutesSeconds(duration)}, longer than the ${MAX_MINUTES}-minute limit for live uploads. For longer recordings, run it through scripts/seed.ts locally instead.`,
      );
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || busy) return;
    if (!title.trim()) {
      setError("Give the meeting a title.");
      return;
    }
    if (durationSeconds != null && durationSeconds > MAX_UPLOAD_DURATION_SECONDS) {
      setError(
        `This recording is ${formatMinutesSeconds(durationSeconds)}, longer than the ${MAX_MINUTES}-minute limit for live uploads.`,
      );
      return;
    }

    setError(null);
    try {
      setStatus("creating");
      const createRes = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          filename: file.name,
          clientDurationSeconds: durationSeconds,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        throw new Error(created.error ?? "Couldn't start the upload.");
      }
      const { meetingId, storageKey, token, contentType, isVideo } = created as {
        meetingId: string;
        storageKey: string;
        token: string;
        contentType: string;
        isVideo: boolean;
      };

      setStatus("uploading");
      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from("meeting-media")
        .uploadToSignedUrl(storageKey, token, file, { contentType });
      if (uploadError) {
        throw new Error(`Upload to storage failed: ${uploadError.message}`);
      }

      setStatus("starting");
      const ingestRes = await fetch(`/api/meetings/${meetingId}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey, contentType, isVideo }),
      });
      const ingestBody = await ingestRes.json().catch(() => ({}));
      if (!ingestRes.ok) {
        throw new Error(ingestBody.error ?? "Couldn't start processing.");
      }

      router.push(`/meetings/${meetingId}`);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  };

  const statusLabel: Record<Exclude<Status, "idle" | "error">, string> = {
    "reading-duration": "Checking recording length…",
    creating: "Preparing upload…",
    uploading: "Uploading media…",
    starting: "Starting transcription…",
  };

  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label htmlFor="title" className="text-sm font-medium text-foreground">
              Title
            </label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Weekly sync with the design team"
              className="mt-1.5 h-10"
              disabled={busy}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Recording</label>
            <label
              htmlFor="media-file"
              className="mt-1.5 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center transition-colors hover:border-brand/50 hover:bg-brand-soft/40 has-disabled:cursor-not-allowed has-disabled:opacity-60"
            >
              {file ? (
                <FileVideo className="size-6 text-brand" />
              ) : (
                <UploadCloud className="size-6 text-muted-foreground" />
              )}
              <span className="text-sm font-medium text-foreground">
                {file ? file.name : "Choose an audio or video file"}
              </span>
              <span className="text-xs text-muted-foreground">
                {durationSeconds != null
                  ? `${formatMinutesSeconds(durationSeconds)} — up to ${MAX_MINUTES} min supported`
                  : `mp4, mov, webm, mkv, mp3, wav, m4a, ogg — up to ${MAX_MINUTES} min`}
              </span>
              <input
                ref={fileInputRef}
                id="media-file"
                type="file"
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={handleFileChange}
                disabled={busy}
                required
              />
            </label>
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" disabled={!file || busy} className="h-10 self-start px-4">
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? statusLabel[status as Exclude<Status, "idle" | "error">] : "Upload and process"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
