-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('idle', 'in_progress', 'completed', 'failed');

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

-- AddForeignKey
ALTER TABLE "chat_cursors" ADD CONSTRAINT "chat_cursors_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_queries" ADD CONSTRAINT "product_queries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
