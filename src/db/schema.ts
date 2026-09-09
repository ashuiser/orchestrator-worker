import {
	bigint,
	boolean,
	date,
	foreignKey,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	timestamp,
	unique,
	varchar,
} from "drizzle-orm/pg-core";

export const mediaStatusEnum = pgEnum("media_status", [
	"UPLOADING",
	"PROCESSING",
	"READY",
	"FAILED",
]);

export const supportedImageType = [
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/gif",
	"image/webp",
] as const;

export const supportedVideoType = [
	"video/mp4",
	"video/mkv",
	"video/webm",
] as const;

export const fileTypeEnum = pgEnum("file_type", [
	...supportedImageType,
	...supportedVideoType,
]);

export const sharedStatusEnum = pgEnum("shared_status", ["PRIVATE", "SHARED"]);

export const memberRoleEnum = pgEnum("member_role", [
	"OWNER",
	"EDITOR",
	"VIEWER",
]);

//Users Table
export const usersTable = pgTable("users", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	name: varchar({ length: 150 }).notNull(),
	user_name: varchar({ length: 15 }).unique().notNull(),
	verified: boolean().default(false).notNull(),
	age: date({ mode: "date" }),
	avatar_key: varchar({ length: 255 }),
	email: varchar({ length: 255 }).unique().notNull(),
	password_hash: varchar({ length: 255 }).notNull(),
	allocated_space: bigint({ mode: "number" })
		.default(1 * 1024 * 1024 * 1024)
		.notNull(), //1GB in bytes
	created_at: timestamp({ mode: "date", withTimezone: true })
		.defaultNow()
		.notNull(),
	updated_at: timestamp({ mode: "date", withTimezone: true })
		.defaultNow()
		.notNull(),
});

//Media Table
export const mediaTable = pgTable(
	"media",
	{
		id: varchar({ length: 26 }).primaryKey(),
		name: varchar({ length: 500 }).notNull(),
		owner_id: integer()
			.notNull()
			.references(() => usersTable.id, { onDelete: "cascade" }),
		status: mediaStatusEnum().notNull(),
		file_size: bigint({ mode: "number" }).notNull(),
		file_type: fileTypeEnum().notNull(),
		file_checksum: varchar({ length: 128 }).notNull(),
		height: integer().notNull(),
		width: integer().notNull(),
		duration: integer().notNull().default(0), //in ms if video else 0
		src_key: varchar({ length: 536 }).notNull(), //original file
		thumb_key: varchar({ length: 536 }), //thumbnail image
		stream_key: varchar({ length: 536 }), //for adaptive streaming, key of master.mpd
		shared_status: sharedStatusEnum().notNull().default("PRIVATE"),
		created_at: timestamp({ mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
		updated_at: timestamp({ mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [unique().on(table.id, table.owner_id)],
);

// Upload Session Table
export const uploadSessionTable = pgTable("upload_session", {
	media_id: varchar({ length: 26 })
		.primaryKey()
		.references(() => mediaTable.id, { onDelete: "cascade" }),
	upload_id: varchar({ length: 1500 }).notNull(),
	total_parts: integer().notNull(),
	expires_at: timestamp({ mode: "date", withTimezone: true }).notNull(),
	created_at: timestamp({ mode: "date", withTimezone: true })
		.defaultNow()
		.notNull(),
});

// Album Table
export const albumTable = pgTable("album", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	name: varchar({ length: 100 }).notNull(),
	// can identify owner from albumMember Table so no need to store here
	thumb_media_id: varchar({ length: 26 }).references(() => mediaTable.id, {
		onDelete: "set null",
	}),
	image_count: integer().default(0).notNull(),
	video_count: integer().default(0).notNull(),
	created_at: timestamp({ mode: "date", withTimezone: true })
		.defaultNow()
		.notNull(),
	updated_at: timestamp({ mode: "date", withTimezone: true })
		.defaultNow()
		.notNull(),
});

// Album Member Table
export const albumMemberTable = pgTable(
	"album_member",
	{
		album_id: integer()
			.notNull()
			.references(() => albumTable.id, { onDelete: "cascade" }),
		user_id: integer()
			.notNull()
			.references(() => usersTable.id, { onDelete: "cascade" }),
		role: memberRoleEnum().notNull(),
		joined_at: timestamp({ mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [primaryKey({ columns: [table.album_id, table.user_id] })],
);

// Album Media Table
export const albumMediaTable = pgTable(
	"album_media",
	{
		album_id: integer().notNull(),
		media_id: varchar({ length: 26 }).notNull(),
		added_by: integer().notNull(),
		added_at: timestamp({ mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.album_id, table.media_id] }),
		foreignKey({
			columns: [table.album_id, table.added_by],
			foreignColumns: [albumMemberTable.album_id, albumMemberTable.user_id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.media_id, table.added_by],
			foreignColumns: [mediaTable.id, mediaTable.owner_id],
		}).onDelete("cascade"),
	],
);

export const transcodeTrackerHeadTable = pgTable("transcode_tracker_head", {
	media_id: varchar({ length: 26 })
		.primaryKey()
		.references(() => mediaTable.id, {
			onDelete: "cascade",
		}),
	total_chunks: integer().notNull(),
	created_at: timestamp({ mode: "date", withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const transcodeTrackerChunksTable = pgTable(
	"transcode_tracker_chunks",
	{
		media_id: varchar({ length: 26 }).references(() => mediaTable.id, {
			onDelete: "cascade",
		}),
		chunk_idx: integer().notNull(),
		codec: varchar({ length: 5 }).notNull(),
		resolution: integer().notNull(),
		status: boolean().default(false).notNull(),
		created_at: timestamp({ mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
		updated_at: timestamp({ mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.media_id, table.chunk_idx, table.codec, table.resolution],
		}),
	],
);
