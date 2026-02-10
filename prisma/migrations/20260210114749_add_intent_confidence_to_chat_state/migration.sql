-- AlterTable
ALTER TABLE "chat_state" ADD COLUMN     "intent_confidence" JSONB,
ADD COLUMN     "last_cursor_score" DOUBLE PRECISION,
ADD COLUMN     "mode" TEXT DEFAULT 'SEARCH';
