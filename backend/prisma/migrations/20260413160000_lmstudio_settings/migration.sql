-- Add local-LLM (LM Studio / OpenAI-compatible) fields to user settings.
ALTER TABLE "user_settings"
    ADD COLUMN "lmstudio_base_url" TEXT,
    ADD COLUMN "lmstudio_model" TEXT,
    ADD COLUMN "lmstudio_api_key" TEXT;
