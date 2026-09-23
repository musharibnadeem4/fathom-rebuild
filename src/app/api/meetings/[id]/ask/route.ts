import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { db } from "@/db";

/**
 * Live Gemini call, unlike every other AI-derived field on the meeting page
 * (which is precomputed once at seed time). Runs on each request: pulls the
 * full transcript, asks Gemini to answer strictly from it, and requires
 * citation markers of the exact form [[startMs]] — one of the transcript
 * line timestamps below — so the client can render clickable, exact seeks
 * instead of parsing mm:ss prose.
 */

const CITATION_MARKER_INSTRUCTIONS = `Whenever your answer relies on something said at a specific point in the transcript, immediately follow that claim with a citation marker in the exact form [[startMs]], where startMs is the bare integer copied from one of the "[N ms]" line timestamps in the transcript below — digits only, no "ms" suffix and no other text inside the brackets. Example: a transcript line "[135052ms] ..." is cited as [[135052]], never as [[135052ms]]. Use as many citations as are needed to support the answer. Do not invent a timestamp that doesn't appear in the transcript.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    answerable: {
      type: Type.BOOLEAN,
      description:
        "false if the transcript does not contain enough information to answer the question, true otherwise.",
    },
    answer: {
      type: Type.STRING,
      description: `The answer, formatted as markdown (use **bold**, bullet lists, etc. where it helps readability). ${CITATION_MARKER_INSTRUCTIONS} If answerable is false, this should instead be a short, honest note that the meeting doesn't seem to cover it — do not guess or fabricate an answer.`,
    },
  },
  required: ["answerable", "answer"],
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let question: string;
  try {
    const body = await request.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }

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
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }
  if (meeting.utterances.length === 0) {
    return NextResponse.json(
      { error: "This meeting has no transcript to search yet." },
      { status: 422 },
    );
  }

  const participantById = new Map(meeting.participants.map((p) => [p.id, p]));
  const transcriptForPrompt = meeting.utterances
    .map((u) => {
      const speakerName = u.participantId
        ? (participantById.get(u.participantId)?.name ?? "Unknown speaker")
        : "Unknown speaker";
      return `[${u.startMs}ms] ${speakerName}: ${u.text}`;
    })
    .join("\n");

  const prompt = `You are answering a question about a specific meeting, using ONLY the transcript below. Do not use outside knowledge and do not make anything up beyond what's stated.

Question: ${question}

Transcript:
${transcriptForPrompt}`;

  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  let geminiResponse;
  try {
    geminiResponse = await gemini.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema,
      },
    });
  } catch (err) {
    console.error("Ask this meeting: Gemini request failed", err);
    return NextResponse.json(
      { error: "The question couldn't be answered right now. Try again." },
      { status: 502 },
    );
  }

  const rawText = geminiResponse.text;
  if (!rawText) {
    return NextResponse.json(
      { error: "The question couldn't be answered right now. Try again." },
      { status: 502 },
    );
  }

  let parsed: { answerable: boolean; answer: string };
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    console.error("Ask this meeting: Gemini response was not valid JSON", err, rawText);
    return NextResponse.json(
      { error: "The question couldn't be answered right now. Try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    answerable: parsed.answerable,
    answer: parsed.answer,
  });
}
