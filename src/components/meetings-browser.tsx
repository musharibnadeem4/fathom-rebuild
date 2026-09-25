"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import {
  ArrowRight,
  Circle,
  CircleDashed,
  Loader2,
  Plus,
  Search,
  TriangleAlert,
  Video,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { speakerColor } from "@/components/meeting/speaker-colors";
import { TalkTimeBar, type SpeakerSummary } from "@/components/meeting/talk-time-bar";

export type MeetingListItem = {
  id: string;
  title: string;
  status: "pending" | "processing" | "ready" | "failed";
  groupLabel: string;
  dateLabel: string;
  durationLabel: string;
  speakers: SpeakerSummary[];
  snippet: string | null;
  purpose: string | null;
  takeaways: string[];
  actionItems: { id: string; text: string; ownerName: string; isLowConfidence: boolean }[];
};

const PREVIEW_MEDIA_QUERY = "(min-width: 1024px)";
const PREVIEW_ACTION_ITEM_LIMIT = 5;

function isInProgress(status: MeetingListItem["status"]) {
  return status === "pending" || status === "processing";
}

export function MeetingsBrowser({
  meetings,
  totalRecordedLabel,
}: {
  meetings: MeetingListItem[];
  totalRecordedLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(meetings[0]?.id ?? null);
  const rowRefs = useRef(new Map<string, HTMLAnchorElement>());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return meetings;
    return meetings.filter((meeting) => meeting.title.toLowerCase().includes(q));
  }, [meetings, query]);

  const groups = useMemo(() => {
    const result: { label: string; items: MeetingListItem[] }[] = [];
    for (const meeting of filtered) {
      const last = result[result.length - 1];
      if (last && last.label === meeting.groupLabel) last.items.push(meeting);
      else result.push({ label: meeting.groupLabel, items: [meeting] });
    }
    return result;
  }, [filtered]);

  const selected = filtered.find((m) => m.id === selectedId) ?? filtered[0] ?? null;

  const moveSelection = (delta: number) => {
    if (!selected) return;
    const index = filtered.findIndex((m) => m.id === selected.id);
    const next = filtered[Math.min(filtered.length - 1, Math.max(0, index + delta))];
    if (!next) return;
    setSelectedId(next.id);
    rowRefs.current.get(next.id)?.focus();
  };

  return (
    <main className="flex-1">
      <div className="border-b border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Meetings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {meetings.length} {meetings.length === 1 ? "meeting" : "meetings"} ·{" "}
              {totalRecordedLabel} recorded
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title…"
                className="h-9 pl-9"
              />
            </div>
            <Button
              size="lg"
              className="h-9 shrink-0 px-3"
              nativeButton={false}
              render={<Link href="/meetings/new" />}
            >
              <Plus className="size-4" />
              Add recording
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {meetings.length === 0 ? (
          <EmptyState kind="no-meetings" />
        ) : filtered.length === 0 ? (
          <EmptyState kind="no-results" query={query} onClear={() => setQuery("")} />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
            <div
              role="listbox"
              aria-label="Meetings"
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveSelection(1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveSelection(-1);
                }
              }}
              className="flex flex-col"
            >
              {groups.map((group) => (
                <div key={group.label} className="mb-3">
                  <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((meeting) => (
                      <MeetingRow
                        key={meeting.id}
                        meeting={meeting}
                        selected={meeting.id === selected?.id}
                        onSelect={() => setSelectedId(meeting.id)}
                        registerRef={(el) => {
                          if (el) rowRefs.current.set(meeting.id, el);
                          else rowRefs.current.delete(meeting.id);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden lg:block">
              {selected && <MeetingPreview meeting={selected} />}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function MeetingRow({
  meeting,
  selected,
  onSelect,
  registerRef,
}: {
  meeting: MeetingListItem;
  selected: boolean;
  onSelect: () => void;
  registerRef: (el: HTMLAnchorElement | null) => void;
}) {
  const inProgress = isInProgress(meeting.status);
  const failed = meeting.status === "failed";

  return (
    <Link
      ref={registerRef}
      href={`/meetings/${meeting.id}`}
      role="option"
      aria-selected={selected}
      // On wide screens the first click previews and clicking the already
      // selected row opens it; below that there's no preview pane, so the
      // row is just a link.
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        if (window.matchMedia(PREVIEW_MEDIA_QUERY).matches && !selected) {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "block rounded-xl px-3 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        "hover:bg-muted",
        selected && "lg:bg-brand-soft/60 lg:ring-1 lg:ring-brand/20 lg:hover:bg-brand-soft/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{meeting.title}</p>
        {inProgress ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand">
            <Loader2 className="size-3 animate-spin" />
            Processing
          </span>
        ) : failed ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-destructive">
            <TriangleAlert className="size-3" />
            Failed
          </span>
        ) : (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {meeting.durationLabel}
          </span>
        )}
      </div>
      {meeting.snippet && (
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{meeting.snippet}</p>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        {meeting.speakers.length > 0 && (
          <div className="flex -space-x-1.5">
            {meeting.speakers.slice(0, 4).map((speaker) => (
              <span
                key={speaker.name}
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border-2 border-background text-[9px] font-semibold",
                  speakerColor(speaker.colorIndex).avatar,
                )}
              >
                {speaker.initial}
              </span>
            ))}
          </div>
        )}
        <span>{meeting.dateLabel}</span>
      </div>
    </Link>
  );
}

function MeetingPreview({ meeting }: { meeting: MeetingListItem }) {
  const inProgress = isInProgress(meeting.status);
  const failed = meeting.status === "failed";
  const visibleItems = meeting.actionItems.slice(0, PREVIEW_ACTION_ITEM_LIMIT);
  const hiddenCount = meeting.actionItems.length - visibleItems.length;

  return (
    <article className="sticky top-24 flex max-h-[calc(100vh-7.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border/70 px-6 py-5">
        <p className="text-xs text-muted-foreground">
          {meeting.dateLabel}
          {!inProgress && !failed && <> · {meeting.durationLabel}</>}
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
          {meeting.title}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {inProgress ? (
          <div className="flex items-center gap-3 rounded-xl bg-brand-soft/60 px-4 py-4 text-sm text-brand-soft-foreground">
            <Loader2 className="size-4 shrink-0 animate-spin" />
            Still transcribing and analyzing — the summary will appear here once it&apos;s ready.
          </div>
        ) : failed ? (
          <div className="flex items-center gap-3 rounded-xl bg-destructive/10 px-4 py-4 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" />
            Processing didn&apos;t complete for this recording.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {meeting.speakers.length > 0 && <TalkTimeBar speakers={meeting.speakers} />}

            {meeting.purpose && (
              <p className="text-[15px] leading-relaxed text-foreground">{meeting.purpose}</p>
            )}

            {meeting.takeaways.length > 0 && (
              <PreviewSection title="Key takeaways">
                <ul className="flex flex-col gap-1.5">
                  {meeting.takeaways.map((takeaway, index) => (
                    <li key={index} className="flex gap-2 text-sm leading-relaxed text-foreground">
                      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand/60" />
                      {takeaway}
                    </li>
                  ))}
                </ul>
              </PreviewSection>
            )}

            <PreviewSection title={`Action items · ${meeting.actionItems.length}`}>
              {visibleItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">None detected.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {visibleItems.map((item) => {
                    const Icon = item.isLowConfidence ? CircleDashed : Circle;
                    return (
                      <li key={item.id} className="flex gap-2.5 text-sm">
                        <Icon
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            item.isLowConfidence ? "text-muted-foreground" : "text-brand",
                          )}
                        />
                        <span className="min-w-0">
                          <span
                            className={
                              item.isLowConfidence ? "text-muted-foreground" : "text-foreground"
                            }
                          >
                            {item.text}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {item.ownerName}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                  {hiddenCount > 0 && (
                    <li className="pl-6.5 text-xs text-muted-foreground">+{hiddenCount} more</li>
                  )}
                </ul>
              )}
            </PreviewSection>
          </div>
        )}
      </div>

      <div className="border-t border-border/70 px-6 py-4">
        <Button
          className="h-9 px-3.5"
          nativeButton={false}
          render={<Link href={`/meetings/${meeting.id}`} />}
        >
          Open meeting
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </article>
  );
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

type EmptyStateProps =
  | { kind: "no-meetings" }
  | { kind: "no-results"; query: string; onClear: () => void };

function EmptyState(props: EmptyStateProps) {
  if (props.kind === "no-meetings") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-24 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
          <Video className="size-6" />
        </div>
        <h2 className="text-lg font-medium text-foreground">No meetings yet</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Upload a recording to get started, or seed one locally with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            npx tsx scripts/seed.ts
          </code>
          .
        </p>
        <Button size="sm" className="mt-1" nativeButton={false} render={<Link href="/meetings/new" />}>
          <Plus className="size-4" />
          Add recording
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Search className="size-6" />
      </div>
      <h2 className="text-lg font-medium text-foreground">
        No matches for &ldquo;{props.query}&rdquo;
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Try a different title, or clear the search to see all meetings.
      </p>
      <Button variant="outline" size="sm" onClick={props.onClear}>
        Clear search
      </Button>
    </div>
  );
}
