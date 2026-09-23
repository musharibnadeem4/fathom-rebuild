import { relations } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const meetingStatusEnum = pgEnum("meeting_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const summaryTemplateEnum = pgEnum("summary_template", [
  "general",
  "sales",
  "one_on_one",
]);

export const coachingFlagKindEnum = pgEnum("coaching_flag_kind", [
  "talk_time_imbalance",
  "unanswered_question",
  "objection_detected",
  "follow_up_opportunity",
]);

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  status: meetingStatusEnum("status").notNull().default("pending"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  durationSeconds: integer("duration_seconds"),
  videoUrl: text("video_url"),
  audioUrl: text("audio_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const meetingsRelations = relations(meetings, ({ many }) => ({
  participants: many(participants),
  utterances: many(utterances),
  summaries: many(summaries),
  chapters: many(chapters),
  actionItems: many(actionItems),
  coachingFlags: many(coachingFlags),
  highlights: many(highlights),
  shares: many(shares),
}));

// ---------------------------------------------------------------------------
// Participants (speakers)
// ---------------------------------------------------------------------------

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    // Raw diarization label from AssemblyAI (e.g. "A", "B") before it's
    // resolved to a real name.
    speakerLabel: text("speaker_label"),
    isHost: boolean("is_host").notNull().default(false),
    // Denormalized aggregate, computed once at ingestion time from the
    // utterances that belong to this speaker, so talk-time queries don't
    // need to scan/sum the transcript on every page load.
    talkTimeSeconds: integer("talk_time_seconds").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("participants_meeting_id_idx").on(table.meetingId)],
);

export const participantsRelations = relations(
  participants,
  ({ one, many }) => ({
    meeting: one(meetings, {
      fields: [participants.meetingId],
      references: [meetings.id],
    }),
    utterances: many(utterances),
    actionItems: many(actionItems),
  }),
);

// ---------------------------------------------------------------------------
// Utterances (transcript segments)
// ---------------------------------------------------------------------------

export const utterances = pgTable(
  "utterances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").references(() => participants.id, {
      onDelete: "cascade",
    }),
    // Explicit order index — kept separate from startMs so transcript order
    // stays stable even if two utterances share (or overlap on) a timestamp.
    sequence: integer("sequence").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Render-in-order and paginate.
    index("utterances_meeting_sequence_idx").on(
      table.meetingId,
      table.sequence,
    ),
    // Seek-by-timestamp (video scrubbing / "jump to transcript position").
    index("utterances_meeting_start_ms_idx").on(table.meetingId, table.startMs),
    index("utterances_participant_id_idx").on(table.participantId),
  ],
);

export const utterancesRelations = relations(utterances, ({ one }) => ({
  meeting: one(meetings, {
    fields: [utterances.meetingId],
    references: [meetings.id],
  }),
  participant: one(participants, {
    fields: [utterances.participantId],
    references: [participants.id],
  }),
}));

// ---------------------------------------------------------------------------
// Summaries (one per meeting per template)
// ---------------------------------------------------------------------------

export const summaries = pgTable(
  "summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    template: summaryTemplateEnum("template").notNull(),
    // Structured, template-shaped output (headline, bullet sections, etc.)
    content: jsonb("content").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("summaries_meeting_template_idx").on(
      table.meetingId,
      table.template,
    ),
  ],
);

export const summariesRelations = relations(summaries, ({ one }) => ({
  meeting: one(meetings, {
    fields: [summaries.meetingId],
    references: [meetings.id],
  }),
}));

// ---------------------------------------------------------------------------
// Chapters (topic segments)
// ---------------------------------------------------------------------------

export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chapters_meeting_sequence_idx").on(table.meetingId, table.sequence),
    index("chapters_meeting_start_ms_idx").on(table.meetingId, table.startMs),
  ],
);

export const chaptersRelations = relations(chapters, ({ one }) => ({
  meeting: one(meetings, {
    fields: [chapters.meetingId],
    references: [meetings.id],
  }),
}));

// ---------------------------------------------------------------------------
// Action items
// ---------------------------------------------------------------------------

export const actionItems = pgTable(
  "action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    // Resolved participant when the AI's owner guess matches a known
    // speaker; ownerName is kept as freeform fallback either way.
    ownerParticipantId: uuid("owner_participant_id").references(
      () => participants.id,
      { onDelete: "set null" },
    ),
    ownerName: text("owner_name"),
    sourceTimestampMs: integer("source_timestamp_ms").notNull(),
    // true = AI-suggested, not yet confirmed. false = confirmed.
    isLowConfidence: boolean("is_low_confidence").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("action_items_meeting_id_idx").on(table.meetingId),
    index("action_items_owner_participant_id_idx").on(
      table.ownerParticipantId,
    ),
  ],
);

export const actionItemsRelations = relations(actionItems, ({ one }) => ({
  meeting: one(meetings, {
    fields: [actionItems.meetingId],
    references: [meetings.id],
  }),
  ownerParticipant: one(participants, {
    fields: [actionItems.ownerParticipantId],
    references: [participants.id],
  }),
}));

// ---------------------------------------------------------------------------
// Coaching flags (post-hoc analysis markers)
// ---------------------------------------------------------------------------

export const coachingFlags = pgTable(
  "coaching_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    kind: coachingFlagKindEnum("kind").notNull(),
    timestampMs: integer("timestamp_ms").notNull(),
    label: text("label").notNull(),
    // Free-form extra context (e.g. participant ids involved, imbalance
    // ratio) that varies by kind — kept schemaless rather than one nullable
    // column per kind.
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("coaching_flags_meeting_id_idx").on(table.meetingId),
    index("coaching_flags_meeting_kind_idx").on(table.meetingId, table.kind),
  ],
);

export const coachingFlagsRelations = relations(coachingFlags, ({ one }) => ({
  meeting: one(meetings, {
    fields: [coachingFlags.meetingId],
    references: [meetings.id],
  }),
}));

// ---------------------------------------------------------------------------
// Highlights (clip ranges, optionally promoted to a public share)
// ---------------------------------------------------------------------------

export const highlights = pgTable(
  "highlights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    title: text("title"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    isPublic: boolean("is_public").notNull().default(false),
    // Short id used in the public clip URL once promoted; null until then.
    publicSlug: text("public_slug"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("highlights_meeting_id_idx").on(table.meetingId),
    uniqueIndex("highlights_public_slug_idx").on(table.publicSlug),
  ],
);

export const highlightsRelations = relations(highlights, ({ one }) => ({
  meeting: one(meetings, {
    fields: [highlights.meetingId],
    references: [meetings.id],
  }),
}));

// ---------------------------------------------------------------------------
// Shares (named-recipient shares, separate from the meeting's public link)
// ---------------------------------------------------------------------------

export const shares = pgTable(
  "shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    recipientName: text("recipient_name").notNull(),
    recipientEmail: text("recipient_email"),
    // Opaque token used in the recipient-specific share URL.
    accessToken: text("access_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("shares_meeting_id_idx").on(table.meetingId),
    uniqueIndex("shares_access_token_idx").on(table.accessToken),
  ],
);

export const sharesRelations = relations(shares, ({ one }) => ({
  meeting: one(meetings, {
    fields: [shares.meetingId],
    references: [meetings.id],
  }),
}));
