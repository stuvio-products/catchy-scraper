/*
  Warnings:

  - You are about to drop the column `basic_scraped` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `full_scraped` on the `products` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ScrapStatus" AS ENUM ('basic', 'detailed');

-- CreateEnum
CREATE TYPE "ScrapeState" AS ENUM ('idle', 'in_progress', 'failed');

-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('idle', 'in_progress', 'completed', 'failed');

-- DropIndex
DROP INDEX "products_basic_scraped_idx";

-- DropIndex
DROP INDEX "products_full_scraped_idx";

-- AlterTable
ALTER TABLE "chat_state" ADD COLUMN     "intent_confidence" JSONB,
ADD COLUMN     "last_cursor_score" DOUBLE PRECISION,
ADD COLUMN     "mode" TEXT DEFAULT 'SEARCH';

-- AlterTable
ALTER TABLE "products" DROP COLUMN "basic_scraped",
DROP COLUMN "full_scraped",
ADD COLUMN     "fit" TEXT[],
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "last_detailed_scraped_at" TIMESTAMP(3),
ADD COLUMN     "last_scrape_attempt_at" TIMESTAMP(3),
ADD COLUMN     "material" TEXT[],
ADD COLUMN     "popularity" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "rating" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "scrap_status" "ScrapStatus" NOT NULL DEFAULT 'basic',
ADD COLUMN     "scrape_state" "ScrapeState" NOT NULL DEFAULT 'idle',
ADD COLUMN     "tsv" tsvector;

-- CreateTable
CREATE TABLE "crawl_progress" (
    "id" UUID NOT NULL,
    "retailer" TEXT NOT NULL,
    "normalized_query" TEXT NOT NULL,
    "query_hash" TEXT NOT NULL,
    "last_page" INTEGER NOT NULL DEFAULT 0,
    "scroll_offset" INTEGER NOT NULL DEFAULT 0,
    "cursor_token" TEXT,
    "status" "CrawlStatus" NOT NULL DEFAULT 'idle',
    "total_products" INTEGER NOT NULL DEFAULT 0,
    "exhausted" BOOLEAN NOT NULL DEFAULT false,
    "last_crawled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crawl_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_cursors" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "query_hash" TEXT NOT NULL,
    "retailer" TEXT NOT NULL,
    "offset" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_queries" (
    "product_id" UUID NOT NULL,
    "query_hash" TEXT NOT NULL,
    "retailer" TEXT NOT NULL,
    "page_found" INTEGER NOT NULL DEFAULT 1,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_queries_pkey" PRIMARY KEY ("product_id","query_hash","retailer")
);

-- CreateIndex
CREATE INDEX "crawl_progress_query_hash_idx" ON "crawl_progress"("query_hash");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_progress_retailer_query_hash_key" ON "crawl_progress"("retailer", "query_hash");

-- CreateIndex
CREATE INDEX "chat_cursors_chat_id_idx" ON "chat_cursors"("chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_cursors_chat_id_query_hash_retailer_key" ON "chat_cursors"("chat_id", "query_hash", "retailer");

-- CreateIndex
CREATE INDEX "product_queries_query_hash_retailer_idx" ON "product_queries"("query_hash", "retailer");

-- CreateIndex
CREATE INDEX "products_scrap_status_idx" ON "products"("scrap_status");

-- CreateIndex
CREATE INDEX "products_gender_idx" ON "products"("gender");

-- CreateIndex
CREATE INDEX "products_category_gender_idx" ON "products"("category", "gender");

-- AddForeignKey
ALTER TABLE "chat_cursors" ADD CONSTRAINT "chat_cursors_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_queries" ADD CONSTRAINT "product_queries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
