"use client";

import type { RefObject } from "react";

export function MediaPlayer({
  kind,
  src,
  mediaRef,
}: {
  kind: "audio" | "video";
  src: string;
  mediaRef: RefObject<HTMLMediaElement | null>;
}) {
  if (kind === "video") {
    return (
      <video
        ref={mediaRef as RefObject<HTMLVideoElement>}
        src={src}
        controls
        className="aspect-video w-full rounded-xl bg-black"
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-8">
      <div className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
        <SoundWaveIcon />
      </div>
      <audio
        ref={mediaRef as RefObject<HTMLAudioElement>}
        src={src}
        controls
        className="w-full"
      />
    </div>
  );
}

function SoundWaveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-6"
      aria-hidden
    >
      <path d="M4 10v4M8 6v12M12 3v18M16 6v12M20 10v4" />
    </svg>
  );
}
