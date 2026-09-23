import { db } from "@/db";
import { formatDate, formatDuration, truncate } from "@/lib/format";
import { SiteHeader } from "@/components/site-header";
import { MeetingsBrowser, type MeetingCardData } from "@/components/meetings-browser";

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
      dateLabel: formatDate(meeting.recordedAt),
      durationLabel: formatDuration(meeting.durationSeconds),
      participantCount: meeting.participants.length,
      snippet: generalSummary?.purpose
        ? truncate(generalSummary.purpose, 140)
        : "No summary available yet.",
    };
  });

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <MeetingsBrowser meetings={meetings} />
      </main>
    </div>
  );
}
