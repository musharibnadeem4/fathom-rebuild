import { db } from "@/db";
import { formatDuration, formatDate, truncate } from "@/lib/format";
import { SiteHeader } from "@/components/site-header";
import {
  MeetingsBrowser,
  type MeetingCardData,
  type MeetingStats,
} from "@/components/meetings-browser";

type GeneralSummaryContent = {
  purpose?: string;
};

export default async function Home() {
  const rows = await db.query.meetings.findMany({
    orderBy: (meetingsTable, { desc }) => [desc(meetingsTable.recordedAt)],
    with: {
      participants: true,
      summaries: {
        where: (summariesTable, { eq }) => eq(summariesTable.template, "general"),
      },
    },
  });

  const meetings: MeetingCardData[] = rows.map((meeting) => {
    const generalSummary = meeting.summaries[0]?.content as
      | GeneralSummaryContent
      | undefined;

    return {
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      dateLabel: formatDate(meeting.recordedAt),
      durationLabel: formatDuration(meeting.durationSeconds),
      participantInitials: meeting.participants.map(
        (p) => p.speakerLabel ?? p.name.charAt(0).toUpperCase(),
      ),
      snippet: generalSummary?.purpose
        ? truncate(generalSummary.purpose, 140)
        : "No summary available yet.",
    };
  });

  const stats: MeetingStats = {
    totalMeetings: rows.length,
    totalParticipants: rows.reduce((sum, m) => sum + m.participants.length, 0),
    totalSeconds: rows.reduce((sum, m) => sum + (m.durationSeconds ?? 0), 0),
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <SiteHeader />
      <MeetingsBrowser meetings={meetings} stats={stats} />
    </div>
  );
}
