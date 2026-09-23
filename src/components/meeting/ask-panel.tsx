"use client";

import { Children, Fragment, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "cn";
import { Clock, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTimestamp } from "@/lib/format";

// Matches the citation marker format the API prompt asks Gemini for, e.g.
// "...as discussed[[142500]]." — captures the raw ms timestamp. Tolerates an
// occasional stray "ms" suffix from the model (e.g. "[[142500ms]]") even
// though the prompt asks for digits only.
const CITATION_MARKER_PATTERN = /\[\[(\d+)(?:\s*ms)?\]\]/gi;

type AskEntry = {
  id: string;
  question: string;
  status: "loading" | "done" | "error";
  answer?: string;
  answerable?: boolean;
  error?: string;
};

export function AskPanel({
  meetingId,
  onSeek,
}: {
  meetingId: string;
  onSeek: (ms: number) => void;
}) {
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<AskEntry[]>([]);
  const isBusy = entries.some((entry) => entry.status === "loading");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isBusy) return;

    const id = crypto.randomUUID();
    setEntries((prev) => [{ id, question: trimmed, status: "loading" }, ...prev]);
    setQuestion("");

    try {
      const response = await fetch(`/api/meetings/${meetingId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? { ...entry, status: "done", answer: data.answer, answerable: data.answerable }
            : entry,
        ),
      );
    } catch (err) {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: "error",
                error: err instanceof Error ? err.message : "Something went wrong.",
              }
            : entry,
        ),
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask something about this meeting…"
          disabled={isBusy}
        />
        <Button type="submit" disabled={isBusy || !question.trim()} className="shrink-0">
          {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          Ask
        </Button>
      </form>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
          Ask a question about this meeting — Gemini will answer from the transcript, with
          clickable timestamps you can jump to.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <AskEntryCard key={entry.id} entry={entry} onSeek={onSeek} />
          ))}
        </div>
      )}
    </div>
  );
}

function AskEntryCard({ entry, onSeek }: { entry: AskEntry; onSeek: (ms: number) => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="text-sm font-medium text-foreground">{entry.question}</p>

      {entry.status === "loading" && (
        <div className="mt-2.5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Thinking…
        </div>
      )}

      {entry.status === "error" && (
        <p className="mt-2.5 text-sm text-destructive">{entry.error}</p>
      )}

      {entry.status === "done" && entry.answer && (
        <div
          className={cn(
            "mt-2.5 text-sm leading-relaxed",
            entry.answerable === false ? "text-muted-foreground italic" : "text-foreground",
          )}
        >
          <AnswerMarkdown text={entry.answer} onSeek={onSeek} />
        </div>
      )}
    </div>
  );
}

/**
 * Renders the model's markdown-formatted answer (bold, bullets, etc.) while
 * still turning [[startMs]] citation markers into clickable seek buttons.
 * Markdown parsing happens first, then each resulting text leaf is scanned
 * for citation markers — so formatting and citations compose regardless of
 * which markdown element the marker ends up inside (paragraph, list item,
 * bold span, ...).
 */
function AnswerMarkdown({ text, onSeek }: { text: string; onSeek: (ms: number) => void }) {
  const withCitations = (children: ReactNode, keyPrefix: string) =>
    processChildren(children, onSeek, keyPrefix);

  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => (
          <p className="mb-2 last:mb-0">{withCitations(children, "p")}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
        ),
        li: ({ children }) => <li>{withCitations(children, "li")}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold">{withCitations(children, "strong")}</strong>
        ),
        em: ({ children }) => <em>{withCitations(children, "em")}</em>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function processChildren(
  children: ReactNode,
  onSeek: (ms: number) => void,
  keyPrefix: string,
): ReactNode {
  return Children.map(children, (child, index) =>
    typeof child === "string" ? (
      <Fragment key={`${keyPrefix}-${index}`}>
        {renderTextWithCitations(child, onSeek, `${keyPrefix}-${index}`)}
      </Fragment>
    ) : (
      child
    ),
  );
}

function renderTextWithCitations(
  text: string,
  onSeek: (ms: number) => void,
  keyPrefix: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  CITATION_MARKER_PATTERN.lastIndex = 0;
  while ((match = CITATION_MARKER_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const ms = Number(match[1]);
    nodes.push(
      <button
        key={`${keyPrefix}-citation-${key++}`}
        type="button"
        onClick={() => onSeek(ms)}
        className="mx-0.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 align-middle text-xs font-medium tabular-nums text-brand transition-colors hover:bg-brand-soft"
      >
        <Clock className="size-3" />
        {formatTimestamp(ms)}
      </button>,
    );
    lastIndex = CITATION_MARKER_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}
