-- AlterTable: Add new columns to products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "material" TEXT[] DEFAULT '{}';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "fit" TEXT[] DEFAULT '{}';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "popularity" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "rating" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tsv" tsvector;

-- Change embedding dimension: 1536 -> 768
-- Drop old embedding data (incompatible dimensions)
ALTER TABLE "products" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "products" ADD COLUMN "embedding" vector(768);

ALTER TABLE "chat_state" DROP COLUMN IF EXISTS "last_embedding";
ALTER TABLE "chat_state" ADD COLUMN "last_embedding" vector(768);

-- tsvector weighted construction trigger
-- A: title, category (identity signals)
-- B: brand, color, gender, material, fit, style_tags (attribute signals)
-- C: description
CREATE OR REPLACE FUNCTION products_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.tsv :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.category, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.brand, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.gender, '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(NEW.color, ' ')), 'B') ||
    setweight(to_tsvector('english', array_to_string(NEW.material, ' ')), 'B') ||
    setweight(to_tsvector('english', array_to_string(NEW.fit, ' ')), 'B') ||
    setweight(to_tsvector('english', array_to_string(NEW.style_tags, ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_tsv_update ON products;
CREATE TRIGGER products_tsv_update
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_tsv_trigger();

-- Backfill existing rows
UPDATE products SET tsv =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(category, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(brand, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(gender, '')), 'B') ||
  setweight(to_tsvector('english', array_to_string(color, ' ')), 'B') ||
  setweight(to_tsvector('english', array_to_string(material, ' ')), 'B') ||
  setweight(to_tsvector('english', array_to_string(fit, ' ')), 'B') ||
  setweight(to_tsvector('english', array_to_string(style_tags, ' ')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'C');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_tsv ON products USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_products_embedding_cosine ON products USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_products_gender ON products (gender);
CREATE INDEX IF NOT EXISTS idx_products_cat_gender ON products (category, gender);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products (brand);
CREATE INDEX IF NOT EXISTS idx_products_price ON products (price);
CREATE INDEX IF NOT EXISTS idx_products_popularity ON products (popularity DESC);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);
