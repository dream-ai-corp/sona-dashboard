-- DropTable
DROP TABLE IF EXISTS "app_settings";

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "google_client_id" TEXT,
    "google_client_secret" TEXT,
    "google_redirect_uri" TEXT,
    "openrouter_api_key" TEXT,
    "openrouter_model" TEXT,
    "fcm_server_key" TEXT,
    "firebase_project_id" TEXT,
    "firebase_client_email" TEXT,
    "firebase_private_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
