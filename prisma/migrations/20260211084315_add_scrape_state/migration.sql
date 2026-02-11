-- CreateEnum
CREATE TYPE "ScrapeState" AS ENUM ('idle', 'in_progress', 'failed');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "last_detailed_scraped_at" TIMESTAMP(3),
ADD COLUMN     "last_scrape_attempt_at" TIMESTAMP(3),
ADD COLUMN     "scrape_state" "ScrapeState" NOT NULL DEFAULT 'idle';
