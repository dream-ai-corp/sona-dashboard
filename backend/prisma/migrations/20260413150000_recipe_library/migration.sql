-- Refactor: standalone recipe library + shopping→finance link

-- Drop old joins (dev DB, no prod data)
ALTER TABLE "recipe_ingredients" DROP CONSTRAINT IF EXISTS "recipe_ingredients_recipe_id_fkey";
DROP TABLE IF EXISTS "recipe_ingredients";
ALTER TABLE "menu_recipes" DROP COLUMN IF EXISTS "name";

-- CreateTable: recipes
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "default_servings" INTEGER NOT NULL DEFAULT 1,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recipes_user_id_idx" ON "recipes"("user_id");
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recreate recipe_ingredients with FK to recipes
CREATE TABLE "recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "quantity" DECIMAL(8,3) NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recipe_ingredients_recipe_id_idx" ON "recipe_ingredients"("recipe_id");
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- menu_recipes: drop any rows first (they pointed to the old "self-contained recipe" concept)
DELETE FROM "menu_recipes";
ALTER TABLE "menu_recipes" ADD COLUMN "recipe_id" TEXT NOT NULL;
CREATE INDEX "menu_recipes_menu_id_idx" ON "menu_recipes"("menu_id");
CREATE INDEX "menu_recipes_recipe_id_idx" ON "menu_recipes"("recipe_id");
ALTER TABLE "menu_recipes" ADD CONSTRAINT "menu_recipes_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- shopping_lists: budget fields + link to finance
ALTER TABLE "shopping_lists"
    ADD COLUMN "planned_date" DATE,
    ADD COLUMN "total_estimated_cost" DECIMAL(12,2),
    ADD COLUMN "total_actual_cost" DECIMAL(12,2),
    ADD COLUMN "finance_transaction_id" TEXT;

CREATE UNIQUE INDEX "shopping_lists_finance_transaction_id_key" ON "shopping_lists"("finance_transaction_id");
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_finance_transaction_id_fkey" FOREIGN KEY ("finance_transaction_id") REFERENCES "finance_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
