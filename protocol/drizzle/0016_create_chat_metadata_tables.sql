CREATE TABLE "chat_message_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"trace_events" jsonb,
	"debug_meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_session_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_message_metadata" ADD CONSTRAINT "chat_message_metadata_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_session_metadata" ADD CONSTRAINT "chat_session_metadata_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_metadata_message_id_unique" ON "chat_message_metadata" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_session_metadata_session_id_unique" ON "chat_session_metadata" USING btree ("session_id");