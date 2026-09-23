"use server";

import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { shares } from "@/db/schema";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createMeetingShare(input: {
  meetingId: string;
  recipientName: string;
  recipientEmail: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const recipientName = input.recipientName.trim();
  const recipientEmail = input.recipientEmail.trim();

  if (!recipientName) {
    return { ok: false, error: "Name is required." };
  }
  if (!recipientEmail || !EMAIL_PATTERN.test(recipientEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  await db.insert(shares).values({
    meetingId: input.meetingId,
    recipientName,
    recipientEmail,
    accessToken: randomUUID(),
  });

  return { ok: true };
}
