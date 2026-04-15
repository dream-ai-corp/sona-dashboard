-- Finance projection engine: capital accounts, recurring series, scheduled tx

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('REALIZED', 'SCHEDULED');

-- AlterTable
ALTER TABLE "finance_categories" ADD COLUMN "is_fixed_charge" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "finance_transactions"
    ADD COLUMN "account_id" TEXT,
    ADD COLUMN "status" "TransactionStatus" NOT NULL DEFAULT 'REALIZED',
    ADD COLUMN "series_id" TEXT;

-- CreateIndex
CREATE INDEX "finance_transactions_user_id_status_date_idx" ON "finance_transactions"("user_id", "status", "date");

-- CreateTable
CREATE TABLE "capital_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "starting_balance" DECIMAL(14,2) NOT NULL,
    "reference_date" DATE NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capital_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "capital_accounts_user_id_idx" ON "capital_accounts"("user_id");

-- CreateTable
CREATE TABLE "finance_recurring_series" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "account_id" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "life_area" "LifeArea" NOT NULL,
    "recurrence_type" "RecurrenceType" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "days_of_week" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "day_of_month" INTEGER,
    "month_of_year" INTEGER,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_recurring_series_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "finance_recurring_series_user_id_idx" ON "finance_recurring_series"("user_id");

-- FKs
ALTER TABLE "capital_accounts" ADD CONSTRAINT "capital_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finance_recurring_series" ADD CONSTRAINT "finance_recurring_series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_recurring_series" ADD CONSTRAINT "finance_recurring_series_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_recurring_series" ADD CONSTRAINT "finance_recurring_series_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "capital_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "capital_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "finance_recurring_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
