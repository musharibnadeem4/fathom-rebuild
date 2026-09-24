import { NextResponse } from "next/server";
import { db } from "@/db";

// Polled every few seconds by the meeting detail page while a meeting is
// "processing" — kept intentionally cheap (no joins) so polling doesn't add
// real load.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const meeting = await db.query.meetings.findFirst({
    where: (meetingsTable, { eq }) => eq(meetingsTable.id, id),
    columns: { status: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }
  return NextResponse.json({ status: meeting.status });
}
