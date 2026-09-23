"use client";

import { useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MediaPlayer,
  type ChapterMarker,
  type CoachingFlagMarker,
} from "@/components/meeting/media-player";
import { TranscriptPanel, type TranscriptLine } from "@/components/meeting/transcript-panel";
import { SummaryPanel, type SummaryData } from "@/components/meeting/summary-panel";
import { ActionItemsPanel, type ActionItemData } from "@/components/meeting/action-items-panel";
import { AskPanel } from "@/components/meeting/ask-panel";
import { useMediaSync } from "@/hooks/use-media-sync";
import { useElementSize } from "@/hooks/use-element-size";

// Extra breathing room below the sticky player+tabs block, beyond its
// measured height, before a scrolled-to transcript line starts.
const SCROLL_CLEARANCE_BUFFER_PX = 20;

export function MeetingWorkspace({
  meetingId,
  mediaKind,
  mediaSrc,
  transcript,
  summaries,
  actionItems,
  chapters,
  coachingFlags,
}: {
  meetingId: string;
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
  const [activeTab, setActiveTab] = useState("transcript");
  const [stickyRef, stickySize] = useElementSize<HTMLDivElement>();
  const scrollOffsetTop = stickySize.top + stickySize.height + SCROLL_CLEARANCE_BUFFER_PX;

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(String(value))}
        className="min-w-0 gap-4"
      >
        <div
          ref={stickyRef}
          className="sticky top-16 z-10 flex flex-col gap-4 bg-background pb-4"
        >
          <MediaPlayer
            kind={mediaKind}
            src={mediaSrc}
            mediaRef={mediaRef}
            chapters={chapters}
            flags={coachingFlags}
          />

          <TabsList variant="line" className="w-full justify-start border-b border-border">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="ask">Ask This Meeting</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="summary">
          <SummaryPanel summaries={summaries} />
        </TabsContent>
        <TabsContent value="transcript">
          <TranscriptPanel
            lines={transcript}
            activeIndex={activeIndex}
            onSeek={seekTo}
            scrollOffsetTop={scrollOffsetTop}
          />
        </TabsContent>
        <TabsContent value="ask">
          <AskPanel meetingId={meetingId} onSeek={seekTo} />
        </TabsContent>
      </Tabs>

      <aside className="hidden lg:block">
        <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-border bg-card p-4">
          <ActionItemsPanel items={actionItems} onSeek={seekTo} />
        </div>
      </aside>
    </div>
  );
}
