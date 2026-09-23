"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, Clock, Search, Users, Video } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type MeetingCardData = {
  id: string;
  title: string;
  dateLabel: string;
  durationLabel: string;
  participantCount: number;
  snippet: string;
};

export function MeetingsBrowser({ meetings }: { meetings: MeetingCardData[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return meetings;
    return meetings.filter((meeting) => meeting.title.toLowerCase().includes(q));
  }, [meetings, query]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Meetings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meetings.length} {meetings.length === 1 ? "meeting" : "meetings"} recorded
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search meetings by title…"
            className="h-10 pl-8"
          />
        </div>
      </div>

      {meetings.length === 0 ? (
        <EmptyState kind="no-meetings" />
      ) : filtered.length === 0 ? (
        <EmptyState kind="no-results" query={query} onClear={() => setQuery("")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: MeetingCardData }) {
  return (
    <Link href={`/meetings/${meeting.id}`} className="group block focus:outline-none">
      <Card className="h-full transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-ring">
        <CardHeader>
          <CardTitle className="line-clamp-2 text-base">{meeting.title}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" />
              {meeting.dateLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {meeting.durationLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" />
              {meeting.participantCount}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-3 text-sm text-muted-foreground">{meeting.snippet}</p>
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
        <div className="flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
          <Video className="size-6" />
        </div>
        <h2 className="text-lg font-medium text-foreground">No meetings yet</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Meetings you record will show up here once they&apos;ve been processed.
          Seed one with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            npx tsx scripts/seed.ts
          </code>
          .
        </p>
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
