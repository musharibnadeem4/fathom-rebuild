import { notFound } from "next/navigation";
import { db } from "@/db";
import { SiteHeader } from "@/components/site-header";
import { MeetingWorkspace } from "@/components/meeting/meeting-workspace";
import type { TranscriptLine } from "@/components/meeting/transcript-panel";

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
    },
  });

  if (!meeting) {
    notFound();
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
      <MeetingWorkspace mediaKind={mediaKind} mediaSrc={mediaSrc} transcript={transcript} />
    </div>
  );
}
