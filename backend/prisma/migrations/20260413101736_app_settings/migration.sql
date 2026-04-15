-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "google_client_id" TEXT,
    "google_client_secret" TEXT,
    "google_redirect_uri" TEXT,
    "openrouter_api_key" TEXT,
    "openrouter_model" TEXT,
    "fcm_server_key" TEXT,
    "firebase_project_id" TEXT,
    "firebase_client_email" TEXT,
    "firebase_private_key" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);
