-- CreateTable
CREATE TABLE "life_area_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "life_area" "LifeArea" NOT NULL,
    "label" TEXT,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "life_area_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "life_area_preferences_user_id_life_area_key" ON "life_area_preferences"("user_id", "life_area");

-- AddForeignKey
ALTER TABLE "life_area_preferences" ADD CONSTRAINT "life_area_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
