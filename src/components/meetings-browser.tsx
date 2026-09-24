"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Loader2, Plus, Search, TriangleAlert, Users, Video } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDuration } from "@/lib/format";

export type MeetingCardData = {
  id: string;
  title: string;
  status: "pending" | "processing" | "ready" | "failed";
  dateLabel: string;
  durationLabel: string;
  participantInitials: string[];
  snippet: string;
};

export type MeetingStats = {
  totalMeetings: number;
  totalParticipants: number;
  totalSeconds: number;
};

export function MeetingsBrowser({
  meetings,
  stats,
}: {
  meetings: MeetingCardData[];
  stats: MeetingStats;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return meetings;
    return meetings.filter((meeting) => meeting.title.toLowerCase().includes(q));
  }, [meetings, query]);

  return (
    <main className="flex-1">
      {/* Hero band — carries real weight even with a small dataset: eyebrow,
          heading, live stats, and search, on a subtly textured backdrop. */}
      <div className="relative overflow-hidden border-b border-border/70">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_30%,transparent_100%)]"
        />
        <div
          aria-hidden
          className="absolute -top-24 left-1/2 -z-10 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-brand/15 blur-3xl"
        />

        <div className="mx-auto max-w-6xl px-6 pb-8 pt-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">
            Meeting workspace
          </p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                Meetings
              </h1>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                Every call transcribed, summarized, and ready to search — the
                moment it&apos;s processed.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search meetings by title…"
                  className="h-11 rounded-xl pl-9 text-sm shadow-sm"
                />
              </div>
              <Button
                size="lg"
                className="h-11 shrink-0 rounded-xl px-4"
                nativeButton={false}
                render={<Link href="/meetings/new" />}
              >
                <Plus className="size-4" />
                Add recording
              </Button>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-3 sm:max-w-xl">
            <StatTile
              icon={<Video className="size-4" />}
              value={stats.totalMeetings}
              label={stats.totalMeetings === 1 ? "Meeting" : "Meetings"}
            />
            <StatTile
              icon={<Users className="size-4" />}
              value={stats.totalParticipants}
              label="Participants"
            />
            <StatTile
              icon={<Clock className="size-4" />}
              value={formatDuration(stats.totalSeconds)}
              label="Recorded"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {meetings.length === 0 ? (
          <EmptyState kind="no-meetings" />
        ) : filtered.length === 0 ? (
          <EmptyState kind="no-results" query={query} onClear={() => setQuery("")} />
        ) : (
          <div className="flex flex-wrap gap-4">
            {filtered.map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-brand">{icon}</div>
      <p className="mt-2 text-xl font-semibold leading-none tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: MeetingCardData }) {
  const visibleInitials = meeting.participantInitials.slice(0, 4);
  const overflowCount = meeting.participantInitials.length - visibleInitials.length;
  const isProcessing = meeting.status === "pending" || meeting.status === "processing";
  const isFailed = meeting.status === "failed";

  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="group block w-full focus:outline-none sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]"
    >
      <Card className="relative h-full gap-3 overflow-hidden border-border/80 py-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg hover:shadow-brand/5 focus-visible:ring-2 focus-visible:ring-ring">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1 bg-brand opacity-0 transition-opacity group-hover:opacity-100"
        />
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2 text-[15px] font-semibold leading-snug">
              {meeting.title}
            </CardTitle>
            {isProcessing ? (
              <Badge className="shrink-0 gap-1 bg-brand-soft font-medium text-brand-soft-foreground">
                <Loader2 className="size-3 animate-spin" />
                Processing
              </Badge>
            ) : isFailed ? (
              <Badge className="shrink-0 gap-1 bg-destructive/10 font-medium text-destructive">
                <TriangleAlert className="size-3" />
                Failed
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="shrink-0 bg-muted font-medium text-muted-foreground"
              >
                {meeting.durationLabel}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{meeting.dateLabel}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 border-t border-border/70 pt-3">
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {isProcessing
              ? "Transcribing and analyzing this recording…"
              : isFailed
                ? "Processing didn't complete for this recording."
                : meeting.snippet}
          </p>
          {visibleInitials.length > 0 && (
            <div className="flex items-center">
              <div className="flex -space-x-2">
                {visibleInitials.map((initial, index) => (
                  <span
                    key={`${initial}-${index}`}
                    className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-brand-soft text-[10px] font-semibold text-brand-soft-foreground"
                  >
                    {initial}
                  </span>
                ))}
                {overflowCount > 0 && (
                  <span className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground">
                    +{overflowCount}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
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
