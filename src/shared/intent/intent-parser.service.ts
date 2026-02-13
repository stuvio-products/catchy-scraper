import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '@/shared/gemini/gemini.service';
import {
  IntentType,
  StructuredIntent,
  IntentAttributes,
  OutfitSlots,
} from './intent-types';

// ============================================================================
// Legacy types (kept for backward compatibility with SearchService)
// ============================================================================

export interface IntentFilters {
  priceMin?: number;
  priceMax?: number;
  color?: string;
  category?: string;
  brand?: string;
  retailer?: string;
}

export interface IntentConfidence {
  price?: number;
  color?: number;
  category?: number;
  brand?: number;
  overall: number;
}

export interface SearchIntent {
  rawQuery: string;
  normalizedQuery: string;
  filters: IntentFilters;
  confidence: IntentConfidence;
}

// ============================================================================
// LRU Cache for LLM responses (Stage C)
// ============================================================================

interface CacheEntry {
  result: StructuredIntent;
  timestamp: number;
}

const LLM_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const LLM_CACHE_MAX_SIZE = 200;

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class IntentParserService {
  private readonly logger = new Logger(IntentParserService.name);
  private readonly llmCache = new Map<string, CacheEntry>();

  constructor(private readonly geminiService: GeminiService) {}

  /**
   * Stage C: LLM-based intent classification (fallback).
   * Converts natural language → StructuredIntent with slots.
   * Results are cached by normalized query.
   */
  async classifyAsStructuredIntent(query: string): Promise<StructuredIntent> {
    const cacheKey = query.toLowerCase().trim();
    const now = Date.now();

    // Check cache
    const cached = this.llmCache.get(cacheKey);
    if (cached && now - cached.timestamp < LLM_CACHE_TTL_MS) {
      this.logger.debug(`LLM intent cache hit for: "${query}"`);
      return cached.result;
    }

    const prompt = `
    You are a precise search intent parser for an Indian e-commerce fashion search engine.
    Analyze the query: "${query}"

    Return JSON with this exact structure:
    {
      "type": "product|filtered|occasion|contextual|exploratory",
      "confidence": 0.0-1.0,
      "normalizedQuery": "cleaned search terms (strip price syntax, keep colors/materials/styles)",
      "attributes": {
        "category": "optional string (shirt, dress, shoes, etc.)",
        "style": "optional string (casual, formal, sporty, etc.)",
        "occasion": "optional string (date, interview, party, gym, etc.)",
        "gender": "optional string (men, women, unisex)",
        "color": "optional string",
        "material": "optional string (cotton, silk, polyester, etc.)",
        "fit": "optional string (slim, regular, oversized, etc.)",
        "season": "optional string (summer, winter, monsoon, etc.)",
        "priceMin": "optional number",
        "priceMax": "optional number",
        "brand": "optional string"
      },
      "slots": {
        "topwear": "optional search query for top",
        "bottomwear": "optional search query for bottom",
        "footwear": "optional search query for shoes",
        "accessories": "optional search query for accessories"
      }
    }

    Rules:
    - For occasion queries like "I am going on a date", populate slots with specific product queries
    - For direct product queries like "red shirt", set type to "product" and populate attributes
    - normalizedQuery must be usable as a direct retailer search query
    - Only populate slots when the query implies an outfit need (occasion/contextual)
    - Confidence should reflect how certain you are about the classification

    Example:
    Query: "I am going on a date"
    Result: {
      "type": "occasion",
      "confidence": 0.85,
      "normalizedQuery": "date night outfit",
      "attributes": { "occasion": "date", "style": "smart casual" },
      "slots": {
        "topwear": "slim fit shirt",
        "bottomwear": "chinos",
        "footwear": "casual shoes"
      }
    }
    `;

    try {
      const response = await this.geminiService.generateText(prompt, true);
      const cleanJson = response.replace(/```json\n|\n```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      const result: StructuredIntent = {
        type: this.mapIntentType(parsed.type),
        confidence: parsed.confidence ?? 0.5,
        attributes: this.sanitizeAttributes(parsed.attributes || {}),
        slots: this.sanitizeSlots(parsed.slots),
        resolvedBy: 'llm',
        normalizedQuery: parsed.normalizedQuery || query,
        rawQuery: query,
      };

      // Cache it
      this.evictStaleCache();
      this.llmCache.set(cacheKey, { result, timestamp: now });

      return result;
    } catch (e) {
      this.logger.error(
        `LLM intent parsing failed for "${query}": ${e.message}`,
      );
      return {
        type: IntentType.EXPLORATORY,
        confidence: 0.3,
        attributes: {},
        resolvedBy: 'llm',
        normalizedQuery: query,
        rawQuery: query,
      };
    }
  }

  /**
   * Legacy method — kept for backward compatibility.
   * Used by existing SearchService.searchWithIntent (until refactored).
   */
  async parseSearchIntent(query: string): Promise<SearchIntent> {
    const structured = await this.classifyAsStructuredIntent(query);
    return {
      rawQuery: query,
      normalizedQuery: structured.normalizedQuery,
      filters: {
        priceMin: structured.attributes.priceMin,
        priceMax: structured.attributes.priceMax,
        color: structured.attributes.color,
        category: structured.attributes.category,
        brand: structured.attributes.brand,
      },
      confidence: {
        overall: structured.confidence,
      },
    };
  }

  // --- Private helpers ---

  private mapIntentType(type: string): IntentType {
    const map: Record<string, IntentType> = {
      product: IntentType.PRODUCT,
      filtered: IntentType.FILTERED,
      occasion: IntentType.OCCASION,
      contextual: IntentType.CONTEXTUAL,
      exploratory: IntentType.EXPLORATORY,
    };
    return map[type?.toLowerCase()] || IntentType.EXPLORATORY;
  }

  private sanitizeAttributes(attrs: any): IntentAttributes {
    const result: IntentAttributes = {};
    if (attrs.category) result.category = String(attrs.category);
    if (attrs.style) result.style = String(attrs.style);
    if (attrs.occasion) result.occasion = String(attrs.occasion);
    if (attrs.gender) result.gender = String(attrs.gender);
    if (attrs.color) result.color = String(attrs.color);
    if (attrs.material) result.material = String(attrs.material);
    if (attrs.fit) result.fit = String(attrs.fit);
    if (attrs.season) result.season = String(attrs.season);
    if (attrs.brand) result.brand = String(attrs.brand);
    if (attrs.priceMin != null && !isNaN(Number(attrs.priceMin)))
      result.priceMin = Number(attrs.priceMin);
    if (attrs.priceMax != null && !isNaN(Number(attrs.priceMax)))
      result.priceMax = Number(attrs.priceMax);
    return result;
  }

  private sanitizeSlots(slots: any): OutfitSlots | undefined {
    if (!slots) return undefined;
    const result: OutfitSlots = {};
    let hasAny = false;
    if (slots.topwear) {
      result.topwear = String(slots.topwear);
      hasAny = true;
    }
    if (slots.bottomwear) {
      result.bottomwear = String(slots.bottomwear);
      hasAny = true;
    }
    if (slots.footwear) {
      result.footwear = String(slots.footwear);
      hasAny = true;
    }
    if (slots.accessories) {
      result.accessories = String(slots.accessories);
      hasAny = true;
    }
    return hasAny ? result : undefined;
  }

  private evictStaleCache(): void {
    if (this.llmCache.size < LLM_CACHE_MAX_SIZE) return;
    const now = Date.now();
    for (const [key, entry] of this.llmCache) {
      if (now - entry.timestamp > LLM_CACHE_TTL_MS) {
        this.llmCache.delete(key);
      }
    }
    // If still over limit, remove oldest
    if (this.llmCache.size >= LLM_CACHE_MAX_SIZE) {
      const firstKey = this.llmCache.keys().next().value;
      if (firstKey) this.llmCache.delete(firstKey);
    }
  }
}
