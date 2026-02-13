// ============================================================================
// Intent Types — Shared type definitions for 3-stage intent pipeline
// ============================================================================

/**
 * Intent types for fashion search queries
 */
export enum IntentType {
  /** Direct product search: "red shirt", "nike shoes" */
  PRODUCT = 'product',
  /** Filtered search: brand/color/price constraints */
  FILTERED = 'filtered',
  /** Occasion-driven: "date night", "interview outfit" */
  OCCASION = 'occasion',
  /** Seasonal/style context: "summer casual", "winter formal" */
  CONTEXTUAL = 'contextual',
  /** Open-ended: "show me something", "explore" */
  EXPLORATORY = 'exploratory',
}

/**
 * Structured attributes extracted from intent parsing
 */
export interface IntentAttributes {
  category?: string;
  style?: string;
  occasion?: string;
  gender?: string;
  color?: string;
  material?: string;
  fit?: string;
  season?: string;
  priceMin?: number;
  priceMax?: number;
  brand?: string;
}

/**
 * Outfit slots for multi-query retrieval (occasion/contextual intents)
 */
export interface OutfitSlots {
  topwear?: string;
  bottomwear?: string;
  footwear?: string;
  accessories?: string;
}

/**
 * Structured intent result from any stage of the pipeline
 */
export interface StructuredIntent {
  type: IntentType;
  confidence: number; // 0.0 - 1.0
  attributes: IntentAttributes;
  slots?: OutfitSlots;
  /** The detection stage that resolved this intent */
  resolvedBy: 'rule' | 'embedding' | 'llm';
  /** Normalized search query (stripped of filter syntax) */
  normalizedQuery: string;
  /** Original raw user query */
  rawQuery: string;
}

/**
 * Result from a single stage — null means "not confident, pass to next stage"
 */
export type StageResult = StructuredIntent | null;
