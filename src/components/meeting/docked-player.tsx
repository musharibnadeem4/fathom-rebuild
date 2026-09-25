"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "cn";
import {
  AlertTriangle,
  ArrowUpRight,
  HelpCircle,
  History,
  LocateFixed,
  Maximize2,
  Pause,
  Play,
  Scale,
  Sparkles,
  X,
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
  summary: string | null;
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

export const FLAG_KIND_META: Record<CoachingFlagKind, { label: string; icon: typeof Scale }> = {
  talk_time_imbalance: { label: "Talk-time imbalance", icon: Scale },
  unanswered_question: { label: "Unanswered question", icon: HelpCircle },
  objection_detected: { label: "Objection detected", icon: AlertTriangle },
  follow_up_opportunity: { label: "Follow-up opportunity", icon: ArrowUpRight },
};

function percentOf(ms: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, (ms / 1000 / durationSeconds) * 100));
}

// Flags closer than this on the rendered track would stack on top of each
// other (hiding all but one), so they're merged into a single cluster marker.
const MIN_MARKER_GAP_PX = 14;

function clusterFlags(
  flags: CoachingFlagMarker[],
  durationSeconds: number,
  trackWidthPx: number,
): { flags: CoachingFlagMarker[]; leftPercent: number }[] {
  const sorted = [...flags].sort((a, b) => a.timestampMs - b.timestampMs);
  const clusters: { flags: CoachingFlagMarker[]; lastPercent: number }[] = [];
  for (const flag of sorted) {
    const percent = percentOf(flag.timestampMs, durationSeconds);
    const last = clusters[clusters.length - 1];
    if (last && ((percent - last.lastPercent) / 100) * trackWidthPx < MIN_MARKER_GAP_PX) {
      last.flags.push(flag);
      last.lastPercent = percent;
    } else {
      clusters.push({ flags: [flag], lastPercent: percent });
    }
  }
  return clusters.map((cluster) => ({
    flags: cluster.flags,
    leftPercent:
      cluster.flags.reduce((sum, f) => sum + percentOf(f.timestampMs, durationSeconds), 0) /
      cluster.flags.length,
  }));
}

export function DockedPlayer({
  kind,
  src,
  mediaRef,
  containerRef,
  dockHeight,
  chapters,
  flags,
  follow,
  onToggleFollow,
  onOpenAsk,
  onJump,
}: {
  kind: "audio" | "video";
  src: string;
  mediaRef: RefObject<HTMLMediaElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  dockHeight: number;
  chapters: ChapterMarker[];
  flags: CoachingFlagMarker[];
  follow: boolean;
  onToggleFollow: () => void;
  onOpenAsk: () => void;
  onJump: (ms: number) => void;
}) {
  const [duration, setDuration] = useState(0);
  const [activeChapterIndex, setActiveChapterIndex] = useState(-1);
  const [expanded, setExpanded] = useState(false);
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

  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(() => setTrackWidth(track.getBoundingClientRect().width));
    observer.observe(track);
    return () => observer.disconnect();
  }, []);
  const flagClusters = clusterFlags(flags, duration, trackWidth);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const handleLoadedMetadata = () => setDuration(media.duration || 0);
    media.addEventListener("loadedmetadata", handleLoadedMetadata);
    if (media.readyState >= 1 && media.duration) setDuration(media.duration);
    return () => media.removeEventListener("loadedmetadata", handleLoadedMetadata);
  }, [mediaRef]);

  useEffect(() => {
    if (!expanded) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [expanded]);

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

  const activeChapter = activeChapterIndex >= 0 ? chapters[activeChapterIndex] : null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background shadow-[0_-8px_24px_-12px_var(--elevation)]"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        {kind === "video" ? (
          // The <video> element is never remounted: expanding just re-positions
          // its wrapper as a fixed overlay above the dock, so playback state
          // survives toggling. (The dock deliberately has no backdrop-filter or
          // transform, which would otherwise trap `fixed` children.)
          <div className="relative h-10 w-16 shrink-0">
            <div
              onClick={() => setExpanded((prev) => !prev)}
              className={cn(
                expanded
                  ? "fixed inset-x-0 top-0 z-40 flex items-center justify-center bg-black/85 p-4 sm:p-10"
                  : "group absolute inset-0 cursor-pointer overflow-hidden rounded-md bg-black ring-1 ring-border",
              )}
              style={expanded ? { bottom: dockHeight } : undefined}
            >
              <video
                ref={mediaRef as RefObject<HTMLVideoElement>}
                src={src}
                onClick={(event) => {
                  if (expanded) {
                    event.stopPropagation();
                    togglePlay();
                  }
                }}
                className={cn(
                  expanded ? "max-h-full max-w-full rounded-lg shadow-2xl" : "size-full object-cover",
                )}
              />
              {expanded ? (
                <button
                  type="button"
                  aria-label="Close enlarged video"
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpanded(false);
                  }}
                  className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Maximize2 className="size-3.5" />
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-soft-foreground">
            <SoundWaveIcon />
            <audio ref={mediaRef as RefObject<HTMLAudioElement>} src={src} className="hidden" />
          </div>
        )}

        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground transition-colors hover:bg-brand-hover"
        >
          {isPlaying ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="ml-0.5 size-4 fill-current" />
          )}
        </button>

        <div className="min-w-0 flex-1 md:w-52 md:flex-none">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {isPlaying ? "Now playing" : "Paused"}
          </p>
          <p className="truncate text-sm font-medium text-foreground">
            {activeChapter?.title ?? "Start of recording"}
          </p>
        </div>

        <div className="order-last flex w-full items-center gap-3 md:order-none md:w-auto md:flex-1">
          <span
            ref={currentTimeRef}
            className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            0:00
          </span>
          <div className="relative flex-1">
            <div
              ref={trackRef}
              onClick={handleTrackClick}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={0}
              className="relative h-1.5 cursor-pointer rounded-full bg-border"
            >
              <div
                ref={fillRef}
                className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-brand"
                style={{ width: "0%" }}
              />
              {chapters
                .filter((chapter) => chapter.startMs > 0)
                .map((chapter) => (
                  <div
                    key={chapter.id}
                    aria-hidden
                    title={chapter.title}
                    className="pointer-events-none absolute -inset-y-1 w-px -translate-x-1/2 bg-foreground/40"
                    style={{ left: `${percentOf(chapter.startMs, duration)}%` }}
                  />
                ))}
            </div>
            {/* Markers live in a sibling layer, not inside the track: React
                bubbles events through portals along the component tree, so a
                popover rendered from inside the track would feed every click
                in it (including "Jump to") to the track's seek-to-cursor
                handler. */}
            <div className="pointer-events-none absolute inset-0">
              {flagClusters.map((cluster) => (
                <FlagMarker
                  key={cluster.flags.map((f) => f.id).join("-")}
                  flags={cluster.flags}
                  leftPercent={cluster.leftPercent}
                  onJump={onJump}
                />
              ))}
            </div>
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {duration ? formatTimestamp(duration * 1000) : "0:00"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleFollow}
            aria-pressed={follow}
            title="Keep the transcript scrolled to what's playing"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
              follow
                ? "bg-brand-soft text-brand-soft-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <LocateFixed className="size-4" />
            <span className="hidden sm:inline">Follow</span>
          </button>
          <button
            type="button"
            onClick={onOpenAsk}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Sparkles className="size-4" />
            <span className="hidden sm:inline">Ask</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function FlagMarker({
  flags,
  leftPercent,
  onJump,
}: {
  flags: CoachingFlagMarker[];
  leftPercent: number;
  onJump: (ms: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const single = flags.length === 1 ? flags[0] : null;
  const ariaLabel = single
    ? `${FLAG_KIND_META[single.kind].label}: ${single.label}`
    : `${flags.length} coaching flags: ${flags.map((f) => f.label).join("; ")}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={ariaLabel}
            className={cn(
              "pointer-events-auto absolute z-10 flex -translate-x-1/2 items-center justify-center rounded-full bg-flag ring-2 ring-background transition-transform hover:scale-125",
              single ? "-top-1 size-2.5" : "-top-[5px] size-4 text-[9px] font-bold text-flag-foreground",
            )}
            style={{ left: `${leftPercent}%` }}
          >
            {single ? null : flags.length}
          </button>
        }
      />
      <DialogContent className="max-h-[calc(100vh-10rem)] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <History className="size-3" />
            Post-call analysis
          </div>
          <DialogTitle className="text-base font-semibold">
            {single ? single.label : `${flags.length} flags close together`}
          </DialogTitle>
        </DialogHeader>
        <ul className="flex flex-col gap-4">
          {flags.map((flag) => {
            const meta = FLAG_KIND_META[flag.kind];
            const Icon = meta.icon;
            return (
              <li key={flag.id} className="flex gap-2">
                <Icon className="mt-0.5 size-4 shrink-0 text-flag" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{meta.label}</p>
                  {!single && (
                    <p className="text-sm font-semibold text-foreground">{flag.label}</p>
                  )}
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {flag.detail}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onJump(flag.timestampMs);
                      setOpen(false);
                    }}
                    className="mt-1.5 text-sm font-medium text-brand hover:underline"
                  >
                    Jump to {formatTimestamp(flag.timestampMs)}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
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
      className="size-5"
      aria-hidden
    >
      <path d="M4 10v4M8 6v12M12 3v18M16 6v12M20 10v4" />
    </svg>
  );
}
