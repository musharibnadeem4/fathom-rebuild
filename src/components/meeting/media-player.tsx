"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "cn";
import {
  AlertTriangle,
  ArrowUpRight,
  HelpCircle,
  History,
  Pause,
  Play,
  Scale,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatTimestamp } from "@/lib/format";
import { findActiveIndex } from "@/hooks/use-media-sync";
import { useMediaClock } from "@/hooks/use-media-clock";

export type ChapterMarker = {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
};

export type CoachingFlagKind =
  | "talk_time_imbalance"
  | "unanswered_question"
  | "objection_detected"
  | "follow_up_opportunity";

export type CoachingFlagMarker = {
  id: string;
  kind: CoachingFlagKind;
  label: string;
  detail: string;
  timestampMs: number;
};

const FLAG_KIND_META: Record<CoachingFlagKind, { label: string; icon: typeof Scale }> = {
  talk_time_imbalance: { label: "Talk-time imbalance", icon: Scale },
  unanswered_question: { label: "Unanswered question", icon: HelpCircle },
  objection_detected: { label: "Objection detected", icon: AlertTriangle },
  follow_up_opportunity: { label: "Follow-up opportunity", icon: ArrowUpRight },
};

function percentOf(ms: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, (ms / 1000 / durationSeconds) * 100));
}

export function MediaPlayer({
  kind,
  src,
  mediaRef,
  chapters,
  flags,
}: {
  kind: "audio" | "video";
  src: string;
  mediaRef: RefObject<HTMLMediaElement | null>;
  chapters: ChapterMarker[];
  flags: CoachingFlagMarker[];
}) {
  const [duration, setDuration] = useState(0);
  const [activeChapterIndex, setActiveChapterIndex] = useState(-1);
  const fillRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeChapterIndexRef = useRef(-1);

  const handleTick = useCallback(
    (timeMs: number) => {
      if (fillRef.current) {
        fillRef.current.style.width = `${percentOf(timeMs, duration)}%`;
      }
      if (currentTimeRef.current) {
        currentTimeRef.current.textContent = formatTimestamp(timeMs);
      }
      trackRef.current?.setAttribute("aria-valuenow", String(Math.round(timeMs / 1000)));
      const nextChapterIndex = findActiveIndex(chapters, timeMs);
      if (nextChapterIndex !== activeChapterIndexRef.current) {
        activeChapterIndexRef.current = nextChapterIndex;
        setActiveChapterIndex(nextChapterIndex);
      }
    },
    [chapters, duration],
  );

  const { isPlaying, seekTo } = useMediaClock(mediaRef, handleTick);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const handleLoadedMetadata = () => setDuration(media.duration || 0);
    media.addEventListener("loadedmetadata", handleLoadedMetadata);
    if (media.readyState >= 1 && media.duration) setDuration(media.duration);
    return () => media.removeEventListener("loadedmetadata", handleLoadedMetadata);
  }, [mediaRef]);

  const handleTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    seekTo(fraction * duration * 1000);
  };

  const togglePlay = () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) void media.play();
    else media.pause();
  };

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <div>
        {kind === "video" ? (
          <video
            ref={mediaRef as RefObject<HTMLVideoElement>}
            src={src}
            className="mb-3 aspect-video w-full rounded-lg bg-black"
          />
        ) : (
          <div className="mb-3 flex items-center justify-center rounded-lg bg-background/60 py-6">
            <div className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
              <SoundWaveIcon />
            </div>
            <audio ref={mediaRef as RefObject<HTMLAudioElement>} src={src} className="hidden" />
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground transition-colors hover:bg-brand-hover"
          >
            {isPlaying ? (
              <Pause className="size-3.5 fill-current" />
            ) : (
              <Play className="ml-0.5 size-3.5 fill-current" />
            )}
          </button>

          <span
            ref={currentTimeRef}
            className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            0:00
          </span>

          <div
            ref={trackRef}
            onClick={handleTrackClick}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={0}
            className="relative h-2 flex-1 cursor-pointer rounded-full bg-border"
          >
            <div
              ref={fillRef}
              className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-brand"
              style={{ width: "0%" }}
            />

            {/* Chapter dividers — thin notches cut into the track itself.
                Distinct from coaching-flag markers below both in shape
                (line vs. dot) and position (inside the track vs. perched
                above it), so the two marker types never compete visually. */}
            {chapters
              .filter((chapter) => chapter.startMs > 0)
              .map((chapter) => (
                <div
                  key={chapter.id}
                  aria-hidden
                  title={chapter.title}
                  className="pointer-events-none absolute -inset-y-1 w-px -translate-x-1/2 bg-foreground/50"
                  style={{ left: `${percentOf(chapter.startMs, duration)}%` }}
                />
              ))}

            {flags.map((flag) => (
              <FlagMarker
                key={flag.id}
                flag={flag}
                leftPercent={percentOf(flag.timestampMs, duration)}
                onSeek={seekTo}
              />
            ))}
          </div>

          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {duration ? formatTimestamp(duration * 1000) : "0:00"}
          </span>
        </div>
      </div>

      {chapters.length > 0 && (
        <div className="mt-3 flex max-h-36 flex-col gap-0.5 overflow-y-auto">
          <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chapters
          </p>
          {chapters.map((chapter, index) => (
            <button
              key={chapter.id}
              type="button"
              onClick={() => seekTo(chapter.startMs)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                index === activeChapterIndex
                  ? "bg-brand-soft text-brand-soft-foreground"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <span className="truncate">{chapter.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatTimestamp(chapter.startMs)}–{formatTimestamp(chapter.endMs)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FlagMarker({
  flag,
  leftPercent,
  onSeek,
}: {
  flag: CoachingFlagMarker;
  leftPercent: number;
  onSeek: (ms: number) => void;
}) {
  const meta = FLAG_KIND_META[flag.kind];
  const Icon = meta.icon;
  const [open, setOpen] = useState(false);

  // A flag detail popup anchored to this marker has nowhere to go without
  // overlapping the chapters list or transcript — the marker sits in a
  // dense, compact player card with no contiguous empty region big enough
  // for even a small popover (measured: ~120px available vs. the content
  // needing 160px+). A centered Dialog sidesteps that entirely: it's
  // positioned relative to the viewport, not the cramped anchor, so it
  // can't overlap page content regardless of scroll position or marker
  // location.
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={`${meta.label}: ${flag.label}`}
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
            className="absolute -top-1.5 z-10 flex size-3 -translate-x-1/2 items-center justify-center rounded-full bg-amber-500 ring-2 ring-background transition-transform hover:scale-125"
            style={{ left: `${leftPercent}%` }}
          />
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <History className="size-3" />
            Post-call analysis
          </div>
          <DialogTitle className="flex items-start gap-2 text-base font-semibold">
            <Icon className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>{flag.label}</span>
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-muted-foreground">{flag.detail}</p>
        <button
          type="button"
          onClick={() => {
            onSeek(flag.timestampMs);
            setOpen(false);
          }}
          className="self-start text-sm font-medium text-brand hover:underline"
        >
          Jump to {formatTimestamp(flag.timestampMs)}
        </button>
      </DialogContent>
    </Dialog>
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
