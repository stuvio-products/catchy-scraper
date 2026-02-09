/*
  Warnings:

  - The `top_size` column on the `user_style_profiles` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `bottom_size` column on the `user_style_profiles` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `shoe_size` column on the `user_style_profiles` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "user_style_profiles" DROP COLUMN "top_size",
ADD COLUMN     "top_size" JSONB,
DROP COLUMN "bottom_size",
ADD COLUMN     "bottom_size" JSONB,
DROP COLUMN "shoe_size",
ADD COLUMN     "shoe_size" JSONB;
