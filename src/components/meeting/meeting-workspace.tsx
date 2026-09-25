"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackToMeetingsLink } from "@/components/back-to-meetings-link";
import { ShareDialog } from "@/components/meeting/share-dialog";
import {
  DockedPlayer,
  FLAG_KIND_META,
  type ChapterMarker,
  type CoachingFlagMarker,
} from "@/components/meeting/docked-player";
import {
  ConversationSection,
  type ConversationGroup,
  type TranscriptLine,
} from "@/components/meeting/conversation";
import { SummaryPanel, type SummaryData } from "@/components/meeting/summary-panel";
import { ActionItemsPanel, type ActionItemData } from "@/components/meeting/action-items-panel";
import { AskPanel } from "@/components/meeting/ask-panel";
import { TalkTimeBar, type SpeakerSummary } from "@/components/meeting/talk-time-bar";
import { findActiveIndex, useMediaSync } from "@/hooks/use-media-sync";
import { useElementSize } from "@/hooks/use-element-size";
import { formatTimestamp } from "@/lib/format";

// Breathing room between a scrolled-to transcript line and the sticky site
// header above / docked player below.
const SCROLL_CLEARANCE_BUFFER_PX = 20;

// Scrolls `el` into the band of the viewport that's actually visible — below
// the sticky site header and above the fixed dock. Both are measured at call
// time (the dock wraps to two rows on narrow screens, so its height varies),
// rather than trusting scrollIntoView, which knows about neither.
function scrollIntoVisibleBand(el: HTMLElement, dock: HTMLElement | null) {
  const headerBottom =
    document.querySelector("[data-site-header]")?.getBoundingClientRect().bottom ?? 0;
  const dockTop = dock?.getBoundingClientRect().top ?? window.innerHeight;
  const bandTop = headerBottom + SCROLL_CLEARANCE_BUFFER_PX;
  const bandHeight = dockTop - SCROLL_CLEARANCE_BUFFER_PX - bandTop;
  const rect = el.getBoundingClientRect();
  // Center it when it fits; otherwise pin its start so the beginning of a
  // long utterance is what's visible.
  const targetTop = rect.height >= bandHeight ? bandTop : bandTop + (bandHeight - rect.height) / 2;
  window.scrollTo({ top: window.scrollY + rect.top - targetTop, behavior: "smooth" });
}

export function MeetingWorkspace({
  meetingId,
  title,
  dateLabel,
  durationLabel,
  speakers,
  mediaKind,
  mediaSrc,
  transcript,
  summaries,
  actionItems,
  chapters,
  coachingFlags,
}: {
  meetingId: string;
  title: string;
  dateLabel: string;
  durationLabel: string;
  speakers: SpeakerSummary[];
  mediaKind: "audio" | "video";
  mediaSrc: string;
  transcript: TranscriptLine[];
  summaries: SummaryData;
  actionItems: ActionItemData[];
  chapters: ChapterMarker[];
  coachingFlags: CoachingFlagMarker[];
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const { activeIndex, seekTo } = useMediaSync(mediaRef, transcript);
  const [dockRef, dockSize] = useElementSize<HTMLDivElement>();
  const [follow, setFollow] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [reveal, setReveal] = useState<{ index: number; nonce: number } | null>(null);
  const lineRefs = useRef(new Map<number, HTMLDivElement>());

  // Lines are bucketed by the chapter they start in (same "last start that
  // has passed" rule the player uses), so every line lands somewhere even if
  // chapter end timestamps don't tile the call perfectly.
  const { groups, groupKeyOfLine } = useMemo(() => {
    const byKey = new Map<number, ConversationGroup>();
    const keyOf = (ms: number) => (chapters.length === 0 ? 0 : findActiveIndex(chapters, ms));
    const ensure = (key: number) => {
      let group = byKey.get(key);
      if (!group) {
        group = { key, chapter: key >= 0 ? (chapters[key] ?? null) : null, lines: [], flags: [] };
        byKey.set(key, group);
      }
      return group;
    };
    chapters.forEach((_, index) => ensure(index));
    const lineKeys = transcript.map((line, index) => {
      const key = keyOf(line.startMs);
      ensure(key).lines.push({ line, index });
      return key;
    });
    for (const flag of coachingFlags) {
      if (flag.kind === "talk_time_imbalance") continue;
      ensure(keyOf(flag.timestampMs)).flags.push(flag);
    }
    const ordered = [...byKey.values()].sort((a, b) => a.key - b.key);
    return { groups: ordered, groupKeyOfLine: lineKeys };
  }, [chapters, transcript, coachingFlags]);

  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(
    () => new Set(chapters.length === 0 ? [0] : []),
  );

  const expandGroup = useCallback((key: number) => {
    setExpandedKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const toggleGroup = (key: number) => {
    // Collapsing the chapter follow mode is holding open means the reader
    // wants out of follow mode.
    if (follow && key === activeGroupKey) {
      setFollow(false);
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return;
    }
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allExpanded = groups.every((g) => g.lines.length === 0 || expandedKeys.has(g.key));
  const toggleAll = () =>
    setExpandedKeys(allExpanded ? new Set() : new Set(groups.map((g) => g.key)));

  const revealLine = useCallback(
    (index: number) => {
      if (index < 0) return;
      expandGroup(groupKeyOfLine[index]);
      setReveal({ index, nonce: Date.now() });
    },
    [expandGroup, groupKeyOfLine],
  );

  // Any timestamp clicked outside the transcript both plays from there and
  // opens + scrolls to that moment in the transcript, so the reader lands on
  // the context instead of just hearing it.
  const jumpTo = useCallback(
    (ms: number) => {
      seekTo(ms);
      revealLine(findActiveIndex(transcript, ms));
    },
    [seekTo, revealLine, transcript],
  );

  useEffect(() => {
    if (!reveal) return;
    const el = lineRefs.current.get(reveal.index);
    if (el) scrollIntoVisibleBand(el, dockRef.current);
  }, [reveal, dockRef]);

  // Follow mode keeps the playing chapter open by deriving it at render time
  // (see visibleKeys), so this effect only has to scroll.
  useEffect(() => {
    if (!follow || activeIndex < 0) return;
    const el = lineRefs.current.get(activeIndex);
    if (el) scrollIntoVisibleBand(el, dockRef.current);
  }, [follow, activeIndex, dockRef]);

  useEffect(() => {
    if (!askOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAskOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [askOpen]);

  const registerLine = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) lineRefs.current.set(index, el);
    else lineRefs.current.delete(index);
  }, []);

  const activeGroupKey = activeIndex >= 0 ? groupKeyOfLine[activeIndex] : null;
  const visibleKeys =
    follow && activeGroupKey !== null && !expandedKeys.has(activeGroupKey)
      ? new Set(expandedKeys).add(activeGroupKey)
      : expandedKeys;
  const talkTimeFlags = coachingFlags.filter((f) => f.kind === "talk_time_imbalance");
  const confirmedCount = actionItems.filter((item) => !item.isLowConfidence).length;

  return (
    <>
      <header className="border-b border-border/70">
        <div className="mx-auto max-w-6xl px-6 pb-8 pt-6">
          <BackToMeetingsLink />
          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                <span>{dateLabel}</span>
                <span aria-hidden>·</span>
                <span>{durationLabel}</span>
                <span aria-hidden>·</span>
                <span>
                  {speakers.length} {speakers.length === 1 ? "speaker" : "speakers"}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setAskOpen(true)}>
                <Sparkles className="size-3.5" />
                Ask this meeting
              </Button>
              <ShareDialog meetingId={meetingId} />
            </div>
          </div>
        </div>
      </header>

      <div
        className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-12 px-6 pt-10 lg:grid-cols-[180px_minmax(0,1fr)]"
        style={{ paddingBottom: dockSize.height + 64 }}
      >
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-1 text-sm">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              On this page
            </p>
            <OutlineLink href="#overview">Overview</OutlineLink>
            <OutlineLink href="#action-items">
              Action items
              <span className="ml-auto tabular-nums text-muted-foreground">{actionItems.length}</span>
            </OutlineLink>
            <OutlineLink href="#conversation">Conversation</OutlineLink>
            {chapters.length > 0 && (
              <ol className="ml-2 mt-1 flex flex-col border-l border-border">
                {chapters.map((chapter, index) => (
                  <li key={chapter.id}>
                    <a
                      href={`#chapter-${chapter.id}`}
                      className={cn(
                        "-ml-px block border-l-2 py-1 pl-3 pr-1 text-xs leading-snug transition-colors",
                        activeGroupKey === index
                          ? "border-brand font-medium text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className="line-clamp-2">{chapter.title}</span>
                      <span className="mt-0.5 block tabular-nums opacity-70">
                        {formatTimestamp(chapter.startMs)}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </nav>

        <main className="flex min-w-0 max-w-3xl flex-col gap-14">
          <section id="overview" className="scroll-mt-24">
            <SectionHeading>Overview</SectionHeading>
            {speakers.length > 0 && (
              <div className="mb-8">
                <TalkTimeBar speakers={speakers} />
                {talkTimeFlags.map((flag) => {
                  const Icon = FLAG_KIND_META[flag.kind].icon;
                  return (
                    <p
                      key={flag.id}
                      className="mt-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300"
                    >
                      <Icon className="mt-px size-3.5 shrink-0" />
                      {flag.detail}
                    </p>
                  );
                })}
              </div>
            )}
            <SummaryPanel summaries={summaries} />
          </section>

          <section id="action-items" className="scroll-mt-24">
            <SectionHeading
              aside={
                actionItems.length > 0
                  ? `${confirmedCount} committed · ${actionItems.length - confirmedCount} suggested`
                  : undefined
              }
            >
              Action items
            </SectionHeading>
            <ActionItemsPanel items={actionItems} onSeek={jumpTo} />
          </section>

          <section id="conversation" className="scroll-mt-24">
            <SectionHeading
              aside={
                transcript.length > 0 ? (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    {allExpanded ? "Collapse all" : "Expand full transcript"}
                  </button>
                ) : undefined
              }
            >
              Conversation
            </SectionHeading>
            <ConversationSection
              groups={groups}
              expandedKeys={visibleKeys}
              activeGroupKey={activeGroupKey}
              activeLineIndex={activeIndex}
              onToggleGroup={toggleGroup}
              onJump={jumpTo}
              onSeekLine={seekTo}
              registerLine={registerLine}
            />
          </section>
        </main>
      </div>

      <aside
        aria-label="Ask this meeting"
        aria-hidden={!askOpen}
        inert={!askOpen}
        className={cn(
          "fixed right-0 top-0 z-40 flex w-full flex-col border-l border-border bg-background shadow-2xl transition-[transform,visibility] duration-200 sm:w-[420px]",
          askOpen ? "visible translate-x-0" : "invisible translate-x-full",
        )}
        style={{ bottom: dockSize.height }}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand" />
            <h2 className="text-sm font-semibold text-foreground">Ask this meeting</h2>
          </div>
          <button
            type="button"
            onClick={() => setAskOpen(false)}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <AskPanel meetingId={meetingId} onSeek={jumpTo} />
        </div>
      </aside>

      <DockedPlayer
        kind={mediaKind}
        src={mediaSrc}
        mediaRef={mediaRef}
        containerRef={dockRef}
        dockHeight={dockSize.height}
        chapters={chapters}
        flags={coachingFlags}
        follow={follow}
        onToggleFollow={() => setFollow((prev) => !prev)}
        onOpenAsk={() => setAskOpen(true)}
        onJump={jumpTo}
      />
    </>
  );
}

function SectionHeading({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-border/70 pb-2.5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{children}</h2>
      {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
    </div>
  );
}

function OutlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="flex items-center rounded-md px-2 py-1 font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </a>
  );
}
