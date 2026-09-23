"use client";

import { useEffect, useRef } from "react";
import { cn } from "cn";
import { formatTimestamp } from "@/lib/format";

export type TranscriptLine = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerName: string;
  speakerInitial: string;
  speakerColorIndex: number;
};

const AVATAR_PALETTE = [
  "bg-brand-soft text-brand-soft-foreground",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
];

export function TranscriptPanel({
  lines,
  activeIndex,
  onSeek,
  scrollOffsetTop,
}: {
  lines: TranscriptLine[];
  activeIndex: number;
  onSeek: (ms: number) => void;
  /** Px a scrolled-to line must clear at the top, e.g. a sticky header. */
  scrollOffsetTop: number;
}) {
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (activeIndex < 0) return;
    lineRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [activeIndex]);

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
        No transcript available for this meeting.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {lines.map((line, index) => {
        const isActive = index === activeIndex;
        return (
          <div
            key={line.id}
            ref={(el) => {
              lineRefs.current[index] = el;
            }}
            role="button"
            tabIndex={0}
            onClick={() => onSeek(line.startMs)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSeek(line.startMs);
              }
            }}
            style={{ scrollMarginTop: scrollOffsetTop }}
            className={cn(
              "group flex cursor-pointer scroll-mb-6 gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive ? "bg-brand-soft" : "hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                AVATAR_PALETTE[line.speakerColorIndex % AVATAR_PALETTE.length],
              )}
              aria-hidden
            >
              {line.speakerInitial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-sm font-medium",
                    isActive ? "text-brand-soft-foreground" : "text-foreground",
                  )}
                >
                  {line.speakerName}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatTimestamp(line.startMs)}
                </span>
              </span>
              <span
                className={cn(
                  "mt-0.5 block text-sm leading-relaxed",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {line.text}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
