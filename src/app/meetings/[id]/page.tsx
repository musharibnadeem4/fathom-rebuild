import { notFound } from "next/navigation";
import { db } from "@/db";
import { SiteHeader } from "@/components/site-header";
import { MeetingWorkspace } from "@/components/meeting/meeting-workspace";
import type { TranscriptLine } from "@/components/meeting/transcript-panel";
import type { SummaryData } from "@/components/meeting/summary-panel";
import type { ActionItemData } from "@/components/meeting/action-items-panel";
import type { ChapterMarker, CoachingFlagMarker } from "@/components/meeting/media-player";
import { ShareDialog } from "@/components/meeting/share-dialog";
import { MeetingProcessingState } from "@/components/meeting/processing-state";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MeetingPage({ params }: PageProps) {
  const { id } = await params;

  const meeting = await db.query.meetings.findFirst({
    where: (meetingsTable, { eq }) => eq(meetingsTable.id, id),
    with: {
      participants: true,
      utterances: {
        orderBy: (utterancesTable, { asc }) => [asc(utterancesTable.sequence)],
      },
      summaries: true,
      actionItems: true,
      chapters: {
        orderBy: (chaptersTable, { asc }) => [asc(chaptersTable.sequence)],
      },
      coachingFlags: {
        orderBy: (flagsTable, { asc }) => [asc(flagsTable.timestampMs)],
      },
    },
  });

  if (!meeting) {
    notFound();
  }

  if (meeting.status !== "ready") {
    return (
      <div className="flex min-h-screen flex-1 flex-col bg-background">
        <SiteHeader />
        <div className="border-b border-border/70 px-6 py-5">
          <div className="mx-auto max-w-6xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {meeting.title}
            </h1>
          </div>
        </div>
        <main className="flex-1">
          <MeetingProcessingState
            meetingId={meeting.id}
            initialStatus={meeting.status as "pending" | "processing" | "failed"}
          />
        </main>
      </div>
    );
  }

  const mediaSrc = meeting.videoUrl ?? meeting.audioUrl;
  if (!mediaSrc) {
    notFound();
  }
  const mediaKind: "audio" | "video" = meeting.videoUrl ? "video" : "audio";

  const participantIndexById = new Map(
    meeting.participants.map((participant, index) => [participant.id, index]),
  );
  const participantById = new Map(meeting.participants.map((p) => [p.id, p]));

  const transcript: TranscriptLine[] = meeting.utterances.map((utterance) => {
    const participant = utterance.participantId
      ? participantById.get(utterance.participantId)
      : undefined;
    return {
      id: utterance.id,
      startMs: utterance.startMs,
      endMs: utterance.endMs,
      text: utterance.text,
      speakerName: participant?.name ?? "Unknown speaker",
      speakerInitial:
        participant?.speakerLabel ?? participant?.name.charAt(0).toUpperCase() ?? "?",
      speakerColorIndex: utterance.participantId
        ? (participantIndexById.get(utterance.participantId) ?? 0)
        : 0,
    };
  });

  const summaries: SummaryData = {};
  for (const summary of meeting.summaries) {
    if (summary.template === "general" || summary.template === "sales" || summary.template === "one_on_one") {
      summaries[summary.template] = summary.content as SummaryData[typeof summary.template];
    }
  }

  const actionItems: ActionItemData[] = meeting.actionItems.map((item) => ({
    id: item.id,
    text: item.text,
    ownerName: item.ownerName ?? "Unassigned",
    sourceTimestampMs: item.sourceTimestampMs,
    isLowConfidence: item.isLowConfidence,
  }));

  const chapters: ChapterMarker[] = meeting.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    startMs: chapter.startMs,
    endMs: chapter.endMs,
  }));

  const coachingFlags: CoachingFlagMarker[] = meeting.coachingFlags.map((flag) => {
    const metadata = flag.metadata as { detail?: string } | null;
    return {
      id: flag.id,
      kind: flag.kind,
      label: flag.label,
      detail: metadata?.detail ?? "No further detail available.",
      timestampMs: flag.timestampMs,
    };
  });

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <SiteHeader />
      <div className="border-b border-border/70 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {meeting.title}
          </h1>
          <ShareDialog meetingId={meeting.id} />
        </div>
      </div>
      <MeetingWorkspace
        meetingId={meeting.id}
        mediaKind={mediaKind}
        mediaSrc={mediaSrc}
        transcript={transcript}
        summaries={summaries}
        actionItems={actionItems}
        chapters={chapters}
        coachingFlags={coachingFlags}
      />
    </div>
  );
}
