"use client";

import { cn } from "cn";
import { Clock, ListChecks, User } from "lucide-react";
import { formatTimestamp } from "@/lib/format";

export type ActionItemData = {
  id: string;
  text: string;
  ownerName: string;
  sourceTimestampMs: number;
  isLowConfidence: boolean;
};

export function ActionItemsPanel({
  items,
  onSeek,
}: {
  items: ActionItemData[];
  onSeek: (ms: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-foreground">Action items</h2>
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <ListChecks className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No action items detected for this meeting.
          </p>
        </div>
      </div>
    );
  }

  const confirmed = items.filter((item) => !item.isLowConfidence);
  const suggested = items.filter((item) => item.isLowConfidence);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">Action items</h2>

      {confirmed.length > 0 && (
        <div className="flex flex-col gap-2">
          {confirmed.map((item) => (
            <ActionItemRow key={item.id} item={item} onSeek={onSeek} />
          ))}
        </div>
      )}

      {suggested.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {confirmed.length > 0
              ? "Suggested — low confidence"
              : "No confirmed action items yet. Here are a few candidates worth reviewing:"}
          </p>
          {suggested.map((item) => (
            <ActionItemRow key={item.id} item={item} onSeek={onSeek} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionItemRow({
  item,
  onSeek,
}: {
  item: ActionItemData;
  onSeek: (ms: number) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        item.isLowConfidence ? "border-dashed border-border bg-muted/30" : "border-border bg-card",
      )}
    >
      <p className="text-sm leading-snug text-foreground">{item.text}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <User className="size-3 shrink-0" />
          <span className="truncate">{item.ownerName}</span>
        </span>
        <button
          type="button"
          onClick={() => onSeek(item.sourceTimestampMs)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums text-brand transition-colors hover:bg-brand-soft"
        >
          <Clock className="size-3" />
          {formatTimestamp(item.sourceTimestampMs)}
        </button>
      </div>
    </div>
  );
}
