"use client";

import { cn } from "cn";
import { Circle, CircleDashed, Clock, ListChecks } from "lucide-react";
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
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-5 py-5 text-sm text-muted-foreground">
        <ListChecks className="size-4 shrink-0" />
        No action items detected for this meeting.
      </div>
    );
  }

  const confirmed = items.filter((item) => !item.isLowConfidence);
  const suggested = items.filter((item) => item.isLowConfidence);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {confirmed.length > 0 && (
        <ul className="divide-y divide-border/70">
          {confirmed.map((item) => (
            <ActionItemRow key={item.id} item={item} onSeek={onSeek} />
          ))}
        </ul>
      )}
      {suggested.length > 0 && (
        <div className={cn(confirmed.length > 0 && "border-t border-border")}>
          <p className="bg-muted/40 px-5 py-2 text-xs font-medium text-muted-foreground">
            {confirmed.length > 0
              ? "Suggested — low confidence"
              : "No explicit commitments. Suggested follow-ups worth reviewing:"}
          </p>
          <ul className="divide-y divide-border/70">
            {suggested.map((item) => (
              <ActionItemRow key={item.id} item={item} onSeek={onSeek} />
            ))}
          </ul>
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
  const Icon = item.isLowConfidence ? CircleDashed : Circle;
  return (
    <li className="flex gap-3 px-5 py-3.5">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          item.isLowConfidence ? "text-muted-foreground" : "text-brand",
        )}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug",
            item.isLowConfidence ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {item.text}
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate font-medium">{item.ownerName}</span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => onSeek(item.sourceTimestampMs)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 font-medium tabular-nums text-brand transition-colors hover:bg-brand-soft"
          >
            <Clock className="size-3" />
            {formatTimestamp(item.sourceTimestampMs)}
          </button>
        </div>
      </div>
    </li>
  );
}
