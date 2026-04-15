-- Routine steps: a Routine is now a named container with ordered steps.
-- Enables SAVERS-style multi-phase routines with per-step media links.

CREATE TYPE "RoutineStepKind" AS ENUM (
    'SILENCE', 'AFFIRMATIONS', 'VISUALIZATION', 'EXERCISE', 'READING',
    'SCRIBING', 'MEDITATION', 'WORKOUT', 'BREATHING', 'STRETCHING', 'CUSTOM'
);

CREATE TYPE "RoutineStepMediaKind" AS ENUM ('VIDEO', 'AUDIO', 'DOCUMENT', 'LINK');

-- Drop atomic columns on routines; steps own them now.
-- Dev DB — any existing rows lose their single-task media/duration, which
-- is acceptable because the schema fundamentally changes shape.
ALTER TABLE "routines"
    ADD COLUMN "description" TEXT,
    ALTER COLUMN "time_of_day" DROP NOT NULL,
    DROP COLUMN "duration_minutes",
    DROP COLUMN "media_url",
    DROP COLUMN "media_autoplay";

CREATE TABLE "routine_steps" (
    "id" TEXT NOT NULL,
    "routine_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "RoutineStepKind" NOT NULL DEFAULT 'CUSTOM',
    "duration_minutes" INTEGER NOT NULL,
    "media_url" TEXT,
    "media_kind" "RoutineStepMediaKind",
    "media_autoplay" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routine_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "routine_steps_routine_id_idx" ON "routine_steps"("routine_id");
ALTER TABLE "routine_steps" ADD CONSTRAINT "routine_steps_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
