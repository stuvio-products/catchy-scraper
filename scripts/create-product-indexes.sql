-- Custom indexes for products table that Prisma can't manage natively
-- Run this after Prisma migrations to ensure indexes exist

-- GIN indexes for efficient array containment queries (@>, &&, <@)
-- These allow fast filtering on color, size, and style_tags arrays
CREATE INDEX IF NOT EXISTS "products_color_gin_idx" ON "products" USING GIN ("color");
CREATE INDEX IF NOT EXISTS "products_size_gin_idx" ON "products" USING GIN ("size");
CREATE INDEX IF NOT EXISTS "products_style_tags_gin_idx" ON "products" USING GIN ("style_tags");

-- HNSW index for fast approximate nearest neighbor search using cosine distance
-- This enables efficient semantic search on product embeddings
CREATE INDEX IF NOT EXISTS "products_embedding_hnsw_idx" ON "products" USING hnsw ("embedding" vector_cosine_ops);
