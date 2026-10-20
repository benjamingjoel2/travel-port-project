import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ---------- enums ---------- */

export const memberRoleEnum = pgEnum("member_role", ["owner", "editor", "viewer"]);
export const priorityEnum = pgEnum("priority", ["high", "medium", "low"]);
export const designReferenceEnum = pgEnum("design_reference", ["atlas", "vita", "other"]);
export const phaseStatusEnum = pgEnum("phase_status", ["not_started", "in_progress", "done"]);
export const waitingOnEnum = pgEnum("waiting_on", ["me", "team", "claude_code", "third_party"]);
export const brandTypeEnum = pgEnum("brand_type", ["country", "region", "niche"]);

export type MemberRole = (typeof memberRoleEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];
export type DesignReference = (typeof designReferenceEnum.enumValues)[number];
export type PhaseStatus = (typeof phaseStatusEnum.enumValues)[number];
export type WaitingOn = (typeof waitingOnEnum.enumValues)[number];
export type BrandType = (typeof brandTypeEnum.enumValues)[number];

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/* ---------- reference data (editable in Settings) ---------- */

export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  color: text("color").notNull().default("#9ca3af"),
  /** Counts toward "N / 100 brands live". */
  countsAsLive: boolean("counts_as_live").notNull().default(false),
  /** Brands can't enter this stage until every required checklist item is done. */
  requiresChecklist: boolean("requires_checklist").notNull().default(false),
  /** Paused / Dropped: shown separately, not part of the main flow. */
  isTerminal: boolean("is_terminal").notNull().default(false),
  ...timestamps,
});

export const regions = pgTable("regions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const teamMembers = pgTable("team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").unique(),
  role: memberRoleEnum("role").notNull().default("editor"),
  active: boolean("active").notNull().default(true),
  /** Everything in the notification bell before this time counts as read. */
  notificationsSeenAt: timestamp("notifications_seen_at", { withTimezone: true }),
  ...timestamps,
});

/** Optional personal logins, kept apart from team_members so the hash is never loaded with a member. */
export const memberLogins = pgTable("member_logins", {
  memberId: uuid("member_id")
    .primaryKey()
    .references(() => teamMembers.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  ...timestamps,
});

export const checklistTemplateItems = pgTable("checklist_template_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  description: text("description"),
  required: boolean("required").notNull().default(true),
  /** When set, the per-brand item gets a free-text field with this label (e.g. "Registry"). */
  detailLabel: text("detail_label"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const promptTemplates = pgTable("prompt_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  body: text("body").notNull().default(""),
  ...timestamps,
});

/* ---------- brands ---------- */

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    /** Country brand (one country), Region brand (several countries) or Niche brand (an activity). */
    brandType: brandTypeEnum("brand_type").notNull().default("country"),
    /** Country name for country brands; region name ("Arab world") or niche ("Golf safaris") otherwise. */
    country: text("country").notNull(),
    /** Countries covered (country and region brands) or activities (niche brands). */
    marketsCovered: jsonb("markets_covered").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** ISO 3166-1 alpha-2, e.g. "ID". Drives the world map. */
    countryCode: text("country_code"),
    regionId: uuid("region_id").references(() => regions.id, { onDelete: "set null" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStages.id, { onDelete: "restrict" }),
    logoUrl: text("logo_url"),
    /** Small uploaded logo stored inline as a data URL (max ~300 KB). */
    logoData: text("logo_data"),
    designReference: designReferenceEnum("design_reference").notNull().default("atlas"),
    designReferenceUrl: text("design_reference_url"),
    contentReferenceUrls: jsonb("content_reference_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    brandStory: text("brand_story"),
    paletteNotes: text("palette_notes"),
    ownerId: uuid("owner_id").references(() => teamMembers.id, { onDelete: "set null" }),
    priority: priorityEnum("priority").notNull().default("medium"),
    targetLaunchDate: date("target_launch_date"),
    repoUrl: text("repo_url"),
    vercelProjectUrl: text("vercel_project_url"),
    stagingUrl: text("staging_url"),
    productionDomain: text("production_domain"),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    /** Vercel project id, set by auto-sync. */
    vercelProjectId: text("vercel_project_id").unique(),
    /** "owner/repo" (lowercase), set by auto-sync. */
    githubRepo: text("github_repo").unique(),
    /** manual | vercel | github | csv */
    source: text("source").notNull().default("manual"),
    ...timestamps,
  },
  (t) => [index("brands_stage_idx").on(t.stageId), index("brands_region_idx").on(t.regionId)],
);

export const buildPhases = pgTable(
  "build_phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    phaseNumber: integer("phase_number").notNull(),
    name: text("name").notNull(),
    status: phaseStatusEnum("status").notNull().default("not_started"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("build_phases_brand_phase_idx").on(t.brandId, t.phaseNumber)],
);

export const brandChecklistItems = pgTable(
  "brand_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    templateItemId: uuid("template_item_id").references(() => checklistTemplateItems.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    required: boolean("required").notNull().default(true),
    detailLabel: text("detail_label"),
    detail: text("detail"),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("brand_checklist_brand_idx").on(t.brandId)],
);

export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    changeNotes: text("change_notes"),
    templateId: uuid("template_id").references(() => promptTemplates.id, { onDelete: "set null" }),
    variables: jsonb("variables").$type<Record<string, string>>(),
    createdById: uuid("created_by_id").references(() => teamMembers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("prompts_brand_version_idx").on(t.brandId, t.version)],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => teamMembers.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    /** Set when the text is changed after posting. */
    editedAt: timestamp("edited_at", { withTimezone: true }),
    /** Comments are open until someone marks them done. */
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneById: uuid("done_by_id").references(() => teamMembers.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("notes_brand_idx").on(t.brandId)],
);

/** Replies under a comment (one level, oldest first). */
export const noteReplies = pgTable(
  "note_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => teamMembers.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("note_replies_note_idx").on(t.noteId)],
);

export const blockers = pgTable(
  "blockers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    waitingOn: waitingOnEnum("waiting_on").notNull().default("me"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => teamMembers.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("blockers_brand_idx").on(t.brandId)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => teamMembers.id, { onDelete: "set null" }),
    /** Snapshot of the actor's name so history survives member changes. */
    actorName: text("actor_name"),
    /** e.g. status_changed, phase_updated, checklist_ticked, note_added, blocker_opened */
    action: text("action").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_brand_idx").on(t.brandId), index("activity_created_idx").on(t.createdAt)],
);

export const integrationSnapshots = pgTable(
  "integration_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    /** vercel | github | uptime | pagespeed */
    kind: text("kind").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("integration_brand_kind_idx").on(t.brandId, t.kind)],
);

/**
 * Everything auto-sync has seen on Vercel and GitHub. Doubles as the review
 * queue (status "pending") and the ignore list (status "ignored").
 */
export const syncItems = pgTable("sync_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** "vercel:<projectId>" or "github:<owner/repo>" */
  key: text("key").notNull().unique(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  repo: text("repo"),
  url: text("url"),
  /** pending | ignored | linked */
  status: text("status").notNull().default("pending"),
  detectedCountryCode: text("detected_country_code"),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const plannedStatusEnum = pgEnum("planned_status", ["not_started", "up_next", "skipped"]);
export type PlannedStatus = (typeof plannedStatusEnum.enumValues)[number];

/** Countries the team plans to build a brand for next. Done-ness comes from the brands themselves. */
export const plannedCountries = pgTable("planned_countries", {
  id: uuid("id").primaryKey().defaultRandom(),
  countryCode: text("country_code").notNull().unique(),
  /** Free label when the plan is narrower than the country, e.g. "Scotland". */
  label: text("label"),
  wave: integer("wave").notNull().default(1),
  note: text("note"),
  status: plannedStatusEnum("status").notNull().default("not_started"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/** Small key/value store for app-wide state such as the last sync result. */
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- relations ---------- */

export const brandsRelations = relations(brands, ({ one, many }) => ({
  stage: one(pipelineStages, { fields: [brands.stageId], references: [pipelineStages.id] }),
  region: one(regions, { fields: [brands.regionId], references: [regions.id] }),
  owner: one(teamMembers, { fields: [brands.ownerId], references: [teamMembers.id] }),
  phases: many(buildPhases),
  checklist: many(brandChecklistItems),
  prompts: many(prompts),
  notes: many(notes),
  blockers: many(blockers),
  activity: many(activityLog),
  snapshots: many(integrationSnapshots),
}));

export const integrationSnapshotsRelations = relations(integrationSnapshots, ({ one }) => ({
  brand: one(brands, { fields: [integrationSnapshots.brandId], references: [brands.id] }),
}));

export const buildPhasesRelations = relations(buildPhases, ({ one }) => ({
  brand: one(brands, { fields: [buildPhases.brandId], references: [brands.id] }),
}));
export const brandChecklistItemsRelations = relations(brandChecklistItems, ({ one }) => ({
  brand: one(brands, { fields: [brandChecklistItems.brandId], references: [brands.id] }),
}));
export const promptsRelations = relations(prompts, ({ one }) => ({
  brand: one(brands, { fields: [prompts.brandId], references: [brands.id] }),
  template: one(promptTemplates, { fields: [prompts.templateId], references: [promptTemplates.id] }),
  createdBy: one(teamMembers, { fields: [prompts.createdById], references: [teamMembers.id] }),
}));
export const notesRelations = relations(notes, ({ one, many }) => ({
  brand: one(brands, { fields: [notes.brandId], references: [brands.id] }),
  author: one(teamMembers, { fields: [notes.authorId], references: [teamMembers.id] }),
  doneBy: one(teamMembers, { fields: [notes.doneById], references: [teamMembers.id] }),
  replies: many(noteReplies),
}));
export const noteRepliesRelations = relations(noteReplies, ({ one }) => ({
  note: one(notes, { fields: [noteReplies.noteId], references: [notes.id] }),
  author: one(teamMembers, { fields: [noteReplies.authorId], references: [teamMembers.id] }),
}));
export const blockersRelations = relations(blockers, ({ one }) => ({
  brand: one(brands, { fields: [blockers.brandId], references: [brands.id] }),
}));
export const activityLogRelations = relations(activityLog, ({ one }) => ({
  brand: one(brands, { fields: [activityLog.brandId], references: [brands.id] }),
  actor: one(teamMembers, { fields: [activityLog.actorId], references: [teamMembers.id] }),
}));

/* ---------- row types ---------- */

export type PipelineStage = typeof pipelineStages.$inferSelect;
export type Region = typeof regions.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type ChecklistTemplateItem = typeof checklistTemplateItems.$inferSelect;
export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;
export type BuildPhase = typeof buildPhases.$inferSelect;
export type BrandChecklistItem = typeof brandChecklistItems.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type NoteReply = typeof noteReplies.$inferSelect;
export type PlannedCountry = typeof plannedCountries.$inferSelect;
export type Blocker = typeof blockers.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;
export type IntegrationSnapshot = typeof integrationSnapshots.$inferSelect;
export type SyncItem = typeof syncItems.$inferSelect;
