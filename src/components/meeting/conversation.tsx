"use client";

import { cn } from "cn";
import { ChevronDown, Play } from "lucide-react";
import { formatTimestamp } from "@/lib/format";
import { speakerColor } from "@/components/meeting/speaker-colors";
import {
  FLAG_KIND_META,
  type ChapterMarker,
  type CoachingFlagMarker,
} from "@/components/meeting/docked-player";

export type TranscriptLine = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerName: string;
  speakerInitial: string;
  speakerColorIndex: number;
};

export type ConversationGroup = {
  key: number;
  chapter: ChapterMarker | null;
  lines: { line: TranscriptLine; index: number }[];
  flags: CoachingFlagMarker[];
};

export function ConversationSection({
  groups,
  expandedKeys,
  activeGroupKey,
  activeLineIndex,
  onToggleGroup,
  onJump,
  onSeekLine,
  registerLine,
}: {
  groups: ConversationGroup[];
  expandedKeys: Set<number>;
  activeGroupKey: number | null;
  activeLineIndex: number;
  onToggleGroup: (key: number) => void;
  onJump: (ms: number) => void;
  onSeekLine: (ms: number) => void;
  registerLine: (index: number, el: HTMLDivElement | null) => void;
}) {
  if (groups.every((group) => group.lines.length === 0)) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
        No transcript available for this meeting.
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {groups.map((group) => {
        const expanded = expandedKeys.has(group.key);
        const isActive = group.key === activeGroupKey;
        const chapter = group.chapter;
        return (
          <li
            key={group.key}
            id={chapter ? `chapter-${chapter.id}` : "chapter-intro"}
            className={cn(
              "scroll-mt-24 rounded-2xl border bg-card transition-colors",
              isActive ? "border-brand/40 ring-1 ring-brand/15" : "border-border",
            )}
          >
            <div className="flex gap-4 p-5">
              <button
                type="button"
                onClick={() => onJump(chapter?.startMs ?? group.lines[0]?.line.startMs ?? 0)}
                aria-label={`Play from ${formatTimestamp(chapter?.startMs ?? 0)}`}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium tabular-nums transition-colors",
                  isActive
                    ? "bg-brand text-brand-foreground"
                    : "bg-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-soft-foreground",
                )}
              >
                <Play className="size-3 fill-current" />
                {formatTimestamp(chapter?.startMs ?? group.lines[0]?.line.startMs ?? 0)}
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold leading-snug text-foreground">
                  {chapter?.title ?? "Opening"}
                </h3>
                {chapter?.summary && (
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {chapter.summary}
                  </p>
                )}

                {group.flags.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {group.flags.map((flag) => {
                      const meta = FLAG_KIND_META[flag.kind];
                      const Icon = meta.icon;
                      return (
                        <li key={flag.id}>
                          <button
                            type="button"
                            onClick={() => onJump(flag.timestampMs)}
                            title={flag.detail}
                            className="flex w-full items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-left text-xs text-amber-900 transition-colors hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/15"
                          >
                            <Icon className="mt-px size-3.5 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="font-semibold">{meta.label}:</span> {flag.label}
                            </span>
                            <span className="shrink-0 tabular-nums opacity-70">
                              {formatTimestamp(flag.timestampMs)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {group.lines.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group.key)}
                    aria-expanded={expanded}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                  >
                    <ChevronDown
                      className={cn("size-4 transition-transform", expanded && "rotate-180")}
                    />
                    {expanded
                      ? "Hide transcript"
                      : `Read transcript · ${group.lines.length} ${group.lines.length === 1 ? "line" : "lines"}`}
                  </button>
                )}
              </div>
            </div>

            {expanded && (
              <div className="border-t border-border/70 px-3 py-3 sm:px-4">
                {group.lines.map(({ line, index }) => (
                  <TranscriptRow
                    key={line.id}
                    line={line}
                    active={index === activeLineIndex}
                    onSeek={onSeekLine}
                    registerRef={(el) => registerLine(index, el)}
                  />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TranscriptRow({
  line,
  active,
  onSeek,
  registerRef,
}: {
  line: TranscriptLine;
  active: boolean;
  onSeek: (ms: number) => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={registerRef}
      role="button"
      tabIndex={0}
      onClick={() => onSeek(line.startMs)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSeek(line.startMs);
        }
      }}
      className={cn(
        "grid cursor-pointer grid-cols-[3rem_minmax(0,1fr)] gap-3 rounded-lg px-2 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-brand-soft/70" : "hover:bg-muted/70",
      )}
    >
      <span
        className={cn(
          "pt-0.5 text-xs tabular-nums",
          active ? "font-medium text-brand-soft-foreground" : "text-muted-foreground",
        )}
      >
        {formatTimestamp(line.startMs)}
      </span>
      <div className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <span
            aria-hidden
            className={cn("size-2 rounded-full", speakerColor(line.speakerColorIndex).solid)}
          />
          {line.speakerName}
        </span>
        <p className="mt-0.5 text-[15px] leading-relaxed text-foreground/90">{line.text}</p>
      </div>
    </div>
  );
}
