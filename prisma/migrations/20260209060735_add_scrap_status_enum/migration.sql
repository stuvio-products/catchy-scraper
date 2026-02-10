/*
  Warnings:

  - You are about to drop the column `basic_scraped` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `full_scraped` on the `products` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ScrapStatus" AS ENUM ('basic', 'detailed');

-- DropIndex
DROP INDEX "products_basic_scraped_idx";

-- DropIndex
DROP INDEX "products_full_scraped_idx";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "basic_scraped",
DROP COLUMN "full_scraped",
ADD COLUMN     "scrap_status" "ScrapStatus" NOT NULL DEFAULT 'basic';

-- CreateIndex
CREATE INDEX "products_scrap_status_idx" ON "products"("scrap_status");
