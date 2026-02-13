CREATE TABLE IF NOT EXISTS "eval_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"need_id" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"messages" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eval_needs_need_id_unique" UNIQUE("need_id")
);
