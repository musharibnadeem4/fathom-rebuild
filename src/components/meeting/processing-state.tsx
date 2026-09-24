"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 4000;

export function MeetingProcessingState({
  meetingId,
  initialStatus,
}: {
  meetingId: string;
  initialStatus: "pending" | "processing" | "failed";
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    if (status === "failed") return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/status`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: { status?: string } = await res.json();
        if (cancelled) return;
        if (data.status === "ready") {
          router.refresh();
        } else if (data.status === "failed") {
          setStatus("failed");
        }
      } catch {
        // transient network hiccup — the next poll will retry
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [status, meetingId, router]);

  if (status === "failed") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" />
        </div>
        <h2 className="text-lg font-medium text-foreground">Processing failed</h2>
        <p className="text-sm text-muted-foreground">
          Something went wrong while transcribing or analyzing this recording. This can
          happen with corrupt files, unsupported audio, or a transient API error.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          render={<Link href="/meetings/new">Try uploading again</Link>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
      <h2 className="text-lg font-medium text-foreground">Processing your recording</h2>
      <p className="text-sm text-muted-foreground">
        Transcribing, identifying speakers, and generating summaries — this usually takes
        a couple of minutes. This page will update automatically.
      </p>
    </div>
  );
}
