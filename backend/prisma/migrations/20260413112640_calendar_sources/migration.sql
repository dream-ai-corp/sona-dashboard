-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "google_calendar_id" TEXT,
ADD COLUMN     "google_calendar_name" TEXT,
ADD COLUMN     "google_color" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hide_local_calendar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "selected_google_calendar_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
