import { db } from "@/db";
import { dayBucketLabel, formatDate, formatDuration, truncate } from "@/lib/format";
import { SiteHeader } from "@/components/site-header";
import { MeetingsBrowser, type MeetingListItem } from "@/components/meetings-browser";

// The list reads live DB state (new uploads, processing status) and computes
// relative day labels, so it must not be prerendered at build time.
export const dynamic = "force-dynamic";

type GeneralSummaryContent = {
  purpose?: string;
  takeaways?: string[];
};

export default async function Home() {
  const rows = await db.query.meetings.findMany({
    orderBy: (meetingsTable, { desc }) => [desc(meetingsTable.recordedAt)],
    with: {
      participants: true,
      summaries: {
        where: (summariesTable, { eq }) => eq(summariesTable.template, "general"),
      },
      actionItems: {
        columns: { id: true, text: true, ownerName: true, isLowConfidence: true },
      },
    },
  });

  const now = new Date();
  const meetings: MeetingListItem[] = rows.map((meeting) => {
    const general = meeting.summaries[0]?.content as GeneralSummaryContent | undefined;
    return {
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      groupLabel: dayBucketLabel(meeting.recordedAt, now),
      dateLabel: formatDate(meeting.recordedAt),
      durationLabel: formatDuration(meeting.durationSeconds),
      speakers: meeting.participants.map((p, index) => ({
        name: p.name,
        initial: p.speakerLabel ?? p.name.charAt(0).toUpperCase(),
        colorIndex: index,
        talkTimeSeconds: p.talkTimeSeconds,
      })),
      snippet: general?.purpose ? truncate(general.purpose, 110) : null,
      purpose: general?.purpose ?? null,
      takeaways: general?.takeaways ?? [],
      actionItems: [...meeting.actionItems]
        .sort((a, b) => Number(a.isLowConfidence) - Number(b.isLowConfidence))
        .map((item) => ({
          id: item.id,
          text: item.text,
          ownerName: item.ownerName ?? "Unassigned",
          isLowConfidence: item.isLowConfidence,
        })),
    };
  });

  const totalSeconds = rows.reduce((sum, m) => sum + (m.durationSeconds ?? 0), 0);

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <SiteHeader />
      <MeetingsBrowser meetings={meetings} totalRecordedLabel={formatDuration(totalSeconds)} />
    </div>
  );
}
