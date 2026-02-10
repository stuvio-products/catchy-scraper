import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '@/shared/gemini/gemini.service';

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
  normalizedQuery: string;
  filters: IntentFilters;
  confidence: IntentConfidence;
}

@Injectable()
export class IntentParserService {
  private readonly logger = new Logger(IntentParserService.name);

  constructor(private readonly geminiService: GeminiService) {}

  /**
   * Parse user query into structured intent with confidence scores
   */
  async parseSearchIntent(query: string): Promise<SearchIntent> {
    const prompt = `
    You are a precise search intent parser for an e-commerce fashion search engine.
    Analyze the query: "${query}"

    Extract structured filters and assign confidence scores (0.0 - 1.0) based on these rules:
    - Hard numeric constraints (e.g. "under 1000", "over 500") -> Confidence 0.9 - 1.0
    - Explicit attributes (e.g. "white shirt", "nike shoes") -> Confidence 0.7 - 0.9
    - Ambiguous terms (e.g. "cheap", "premium", "party wear") -> Confidence < 0.6
    
    Supported filters:
    - priceMin, priceMax (numbers)
    - color (string)
    - category (string, e.g. "dress", "shoes")
    - brand (string)
    - retailer (string)

    Return JSON strictly matching this structure:
    {
      "normalizedQuery": "string (core search terms without filter words)",
      "filters": { ... },
      "confidence": {
        "price": 0.0-1.0,
        "color": 0.0-1.0,
        "category": 0.0-1.0,
        "brand": 0.0-1.0,
        "overall": 0.0-1.0 (weighted average or minimum valid confidence)
      }
    }

    Example 1:
    Query: "white shirt under 1000"
    Result:
    {
      "normalizedQuery": "shirt",
      "filters": { "color": "white", "priceMax": 1000, "category": "shirt" },
      "confidence": { "price": 0.95, "color": 0.9, "category": 0.9, "overall": 0.92 }
    }

    Example 2:
    Query: "running shoes"
    Result:
    {
      "normalizedQuery": "running shoes",
      "filters": { "category": "shoes" },
      "confidence": { "category": 0.8, "overall": 0.8 }
    }

    Example 3:
    Query: "something nice for party"
    Result:
    {
      "normalizedQuery": "party wear",
      "filters": {},
      "confidence": { "overall": 0.4 }
    }
    `;

    try {
      const response = await this.geminiService.generateText(prompt, true);
      const cleanJson = response.replace(/```json\n|\n```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      return {
        normalizedQuery: parsed.normalizedQuery || query,
        filters: parsed.filters || {},
        confidence: {
          price: parsed.confidence?.price,
          color: parsed.confidence?.color,
          category: parsed.confidence?.category,
          brand: parsed.confidence?.brand,
          overall: parsed.confidence?.overall || 0.5,
        },
      };
    } catch (e) {
      this.logger.error(`Intent parsing failed for "${query}": ${e.message}`);
      // Fallback: raw query, no filters, low confidence
      return {
        normalizedQuery: query,
        filters: {},
        confidence: { overall: 0.5 },
      };
    }
  }
}
