"use client";

import { useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MediaPlayer } from "@/components/meeting/media-player";
import { TranscriptPanel, type TranscriptLine } from "@/components/meeting/transcript-panel";
import { useMediaSync } from "@/hooks/use-media-sync";
import { useElementSize } from "@/hooks/use-element-size";

// Extra breathing room below the sticky player+tabs block, beyond its
// measured height, before a scrolled-to transcript line starts.
const SCROLL_CLEARANCE_BUFFER_PX = 20;

export function MeetingWorkspace({
  mediaKind,
  mediaSrc,
  transcript,
}: {
  mediaKind: "audio" | "video";
  mediaSrc: string;
  transcript: TranscriptLine[];
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
          <MediaPlayer kind={mediaKind} src={mediaSrc} mediaRef={mediaRef} />

          <TabsList variant="line" className="w-full justify-start border-b border-border">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="ask">Ask This Meeting</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="summary">
          <ComingSoonPanel label="Summary" />
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
          <ComingSoonPanel label="Ask This Meeting" />
        </TabsContent>
      </Tabs>

      <aside className="hidden lg:block">
        <div className="sticky top-16 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Right rail — coming in the next pass.
        </div>
      </aside>
    </div>
  );
}

function ComingSoonPanel({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
      {label} is coming in a later pass.
    </div>
  );
}
