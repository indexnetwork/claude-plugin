-- Rename description -> question
ALTER TABLE "eval_needs" RENAME COLUMN "description" TO "question";

-- Add expectation column (replaces examples)
ALTER TABLE "eval_needs" ADD COLUMN "expectation" text NOT NULL DEFAULT '';

-- Drop removed columns
ALTER TABLE "eval_needs" DROP COLUMN IF EXISTS "examples";
ALTER TABLE "eval_needs" DROP COLUMN IF EXISTS "expected_tools";

-- Drop tools from scenario results
ALTER TABLE "eval_scenario_results" DROP COLUMN IF EXISTS "tools";
