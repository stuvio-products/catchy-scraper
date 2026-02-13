import { Injectable } from '@nestjs/common';
import {
  IntentType,
  IntentAttributes,
  OutfitSlots,
  StructuredIntent,
  StageResult,
} from './intent-types';

// ============================================================================
// TOKEN DICTIONARIES
// ============================================================================

const OCCASION_TOKENS: Record<string, string> = {
  date: 'date',
  'date night': 'date',
  interview: 'interview',
  'job interview': 'interview',
  wedding: 'wedding',
  funeral: 'funeral',
  party: 'party',
  clubbing: 'party',
  gym: 'gym',
  workout: 'gym',
  brunch: 'brunch',
  beach: 'beach',
  office: 'office',
  work: 'office',
  meeting: 'office',
  prom: 'prom',
  graduation: 'graduation',
  travel: 'travel',
  vacation: 'travel',
};

const CATEGORY_TOKENS: Record<string, string> = {
  shirt: 'shirt',
  shirts: 'shirt',
  tshirt: 'tshirt',
  't-shirt': 'tshirt',
  tshirts: 'tshirt',
  top: 'top',
  tops: 'top',
  blouse: 'blouse',
  dress: 'dress',
  dresses: 'dress',
  gown: 'gown',
  skirt: 'skirt',
  pants: 'pants',
  trousers: 'pants',
  jeans: 'jeans',
  shorts: 'shorts',
  jacket: 'jacket',
  blazer: 'blazer',
  coat: 'coat',
  hoodie: 'hoodie',
  sweater: 'sweater',
  sweatshirt: 'sweatshirt',
  kurta: 'kurta',
  kurti: 'kurti',
  saree: 'saree',
  sari: 'saree',
  lehenga: 'lehenga',
  sherwani: 'sherwani',
  shoes: 'shoes',
  shoe: 'shoes',
  sneakers: 'sneakers',
  boots: 'boots',
  heels: 'heels',
  sandals: 'sandals',
  flats: 'flats',
  loafers: 'loafers',
  watch: 'watch',
  watches: 'watch',
  bag: 'bag',
  bags: 'bag',
  backpack: 'backpack',
  wallet: 'wallet',
  sunglasses: 'sunglasses',
  belt: 'belt',
  scarf: 'scarf',
  tie: 'tie',
  chinos: 'chinos',
  joggers: 'joggers',
  leggings: 'leggings',
  swimwear: 'swimwear',
  lingerie: 'lingerie',
  underwear: 'underwear',
  socks: 'socks',
};

const COLOR_TOKENS = new Set([
  'red',
  'blue',
  'green',
  'yellow',
  'black',
  'white',
  'pink',
  'purple',
  'orange',
  'brown',
  'grey',
  'gray',
  'navy',
  'maroon',
  'beige',
  'cream',
  'teal',
  'coral',
  'olive',
  'burgundy',
  'lavender',
  'turquoise',
  'gold',
  'silver',
  'ivory',
  'khaki',
  'peach',
  'mint',
  'rust',
  'tan',
  'wine',
  'charcoal',
  'indigo',
  'magenta',
  'aqua',
  'mauve',
  'plum',
  'lemon',
  'nude',
  'off-white',
  'multicolor',
]);

const BRAND_TOKENS = new Set([
  'nike',
  'adidas',
  'puma',
  'reebok',
  'zara',
  'h&m',
  'uniqlo',
  'levis',
  "levi's",
  'gucci',
  'prada',
  'mango',
  'gap',
  'forever21',
  'tommy',
  'tommy hilfiger',
  'calvin klein',
  'armani',
  'ralph lauren',
  'lacoste',
  'fila',
  'vans',
  'converse',
  'new balance',
  'skechers',
  'woodland',
  'bata',
  'roadster',
  'hrx',
  'wrogn',
  'allen solly',
  'peter england',
  'van heusen',
  'fabindia',
  'biba',
  'w',
  'global desi',
  'aurelia',
  'libas',
  'anouk',
]);

const GENDER_TOKENS: Record<string, string> = {
  men: 'men',
  man: 'men',
  male: 'men',
  "men's": 'men',
  mens: 'men',
  women: 'women',
  woman: 'women',
  female: 'women',
  "women's": 'women',
  womens: 'women',
  ladies: 'women',
  boys: 'boys',
  boy: 'boys',
  girls: 'girls',
  girl: 'girls',
  kids: 'kids',
  unisex: 'unisex',
};

const STYLE_TOKENS: Record<string, string> = {
  casual: 'casual',
  formal: 'formal',
  streetwear: 'streetwear',
  street: 'streetwear',
  bohemian: 'bohemian',
  boho: 'bohemian',
  minimalist: 'minimalist',
  minimal: 'minimalist',
  sporty: 'sporty',
  athletic: 'sporty',
  vintage: 'vintage',
  retro: 'vintage',
  classic: 'classic',
  elegant: 'elegant',
  chic: 'chic',
  trendy: 'trendy',
  edgy: 'edgy',
  grunge: 'grunge',
  preppy: 'preppy',
  'smart casual': 'smart casual',
  ethnic: 'ethnic',
  traditional: 'traditional',
  western: 'western',
  indo: 'indo-western',
  'indo-western': 'indo-western',
};

const CONTEXTUAL_TOKENS: Record<string, string> = {
  summer: 'summer',
  winter: 'winter',
  monsoon: 'monsoon',
  rainy: 'monsoon',
  spring: 'spring',
  autumn: 'autumn',
  fall: 'autumn',
  festive: 'festive',
  festival: 'festive',
  diwali: 'festive',
  christmas: 'festive',
  holi: 'festive',
  eid: 'festive',
  'new year': 'festive',
};

const PRICE_REGEX =
  /(?:under|below|less than|cheaper than)\s*(?:rs\.?|₹|inr)?\s*(\d+)/i;
const PRICE_MIN_REGEX =
  /(?:above|over|more than|starting)\s*(?:rs\.?|₹|inr)?\s*(\d+)/i;
const PRICE_RANGE_REGEX =
  /(?:between|from)\s*(?:rs\.?|₹|inr)?\s*(\d+)\s*(?:to|and|-)\s*(?:rs\.?|₹|inr)?\s*(\d+)/i;

// Occasion → outfit slot mappings
const OCCASION_SLOTS: Record<string, OutfitSlots> = {
  date: {
    topwear: 'slim fit shirt',
    bottomwear: 'chinos',
    footwear: 'casual shoes',
  },
  interview: {
    topwear: 'formal shirt',
    bottomwear: 'formal trousers',
    footwear: 'formal shoes',
  },
  wedding: {
    topwear: 'sherwani',
    bottomwear: 'churidar',
    footwear: 'mojari',
  },
  party: {
    topwear: 'party wear shirt',
    bottomwear: 'slim fit jeans',
    footwear: 'sneakers',
  },
  gym: {
    topwear: 'gym tshirt',
    bottomwear: 'track pants',
    footwear: 'sports shoes',
  },
  office: {
    topwear: 'formal shirt',
    bottomwear: 'formal trousers',
    footwear: 'oxford shoes',
  },
  beach: {
    topwear: 'casual tshirt',
    bottomwear: 'shorts',
    footwear: 'sandals',
  },
};

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class RuleIntentService {
  /**
   * Stage A: Deterministic rule-based intent classification.
   * Must run <5ms. No AI calls.
   *
   * Returns StructuredIntent if confident, null if uncertain.
   */
  classify(query: string): StageResult {
    const lower = query.toLowerCase().trim();
    const tokens = this.tokenize(lower);
    const attributes: IntentAttributes = {};

    // --- Extract attributes ---
    const category = this.matchCategory(tokens);
    if (category) attributes.category = category;

    const color = this.matchColor(tokens);
    if (color) attributes.color = color;

    const brand = this.matchBrand(lower, tokens);
    if (brand) attributes.brand = brand;

    const gender = this.matchGender(tokens);
    if (gender) attributes.gender = gender;

    const style = this.matchStyle(lower, tokens);
    if (style) attributes.style = style;

    const season = this.matchContextual(lower, tokens);
    if (season) attributes.season = season;

    const occasion = this.matchOccasion(lower, tokens);
    if (occasion) attributes.occasion = occasion;

    // --- Extract price ---
    const priceInfo = this.extractPrice(lower);
    if (priceInfo.priceMin != null) attributes.priceMin = priceInfo.priceMin;
    if (priceInfo.priceMax != null) attributes.priceMax = priceInfo.priceMax;

    // --- Determine intent type ---
    const type = this.resolveIntentType(attributes, occasion);
    const confidence = this.computeConfidence(attributes, type);

    // If confidence is too low, pass to next stage
    if (confidence < 0.5) return null;

    // Build normalized query (strip price syntax)
    const normalizedQuery = this.buildNormalizedQuery(lower);

    // Determine slots for occasion intents
    let slots: OutfitSlots | undefined;
    if (type === IntentType.OCCASION && occasion) {
      slots = OCCASION_SLOTS[occasion];
    }

    return {
      type,
      confidence,
      attributes,
      slots,
      resolvedBy: 'rule',
      normalizedQuery,
      rawQuery: query,
    };
  }

  // --- Private helpers ---

  private tokenize(query: string): string[] {
    return query
      .replace(/[^\w\s'-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  private matchCategory(tokens: string[]): string | undefined {
    for (const token of tokens) {
      if (CATEGORY_TOKENS[token]) return CATEGORY_TOKENS[token];
    }
    return undefined;
  }

  private matchColor(tokens: string[]): string | undefined {
    for (const token of tokens) {
      if (COLOR_TOKENS.has(token)) return token;
    }
    return undefined;
  }

  private matchBrand(lower: string, tokens: string[]): string | undefined {
    // Check multi-word brands first
    for (const brand of BRAND_TOKENS) {
      if (brand.includes(' ') && lower.includes(brand)) return brand;
    }
    for (const token of tokens) {
      if (BRAND_TOKENS.has(token)) return token;
    }
    return undefined;
  }

  private matchGender(tokens: string[]): string | undefined {
    for (const token of tokens) {
      if (GENDER_TOKENS[token]) return GENDER_TOKENS[token];
    }
    return undefined;
  }

  private matchStyle(lower: string, tokens: string[]): string | undefined {
    // Check multi-word styles first
    for (const [key, value] of Object.entries(STYLE_TOKENS)) {
      if (key.includes(' ') && lower.includes(key)) return value;
    }
    for (const token of tokens) {
      if (STYLE_TOKENS[token]) return STYLE_TOKENS[token];
    }
    return undefined;
  }

  private matchContextual(lower: string, tokens: string[]): string | undefined {
    for (const [key, value] of Object.entries(CONTEXTUAL_TOKENS)) {
      if (key.includes(' ') && lower.includes(key)) return value;
    }
    for (const token of tokens) {
      if (CONTEXTUAL_TOKENS[token]) return CONTEXTUAL_TOKENS[token];
    }
    return undefined;
  }

  private matchOccasion(lower: string, tokens: string[]): string | undefined {
    // Check multi-word occasions first
    for (const [key, value] of Object.entries(OCCASION_TOKENS)) {
      if (key.includes(' ') && lower.includes(key)) return value;
    }
    for (const token of tokens) {
      if (OCCASION_TOKENS[token]) return OCCASION_TOKENS[token];
    }
    return undefined;
  }

  private extractPrice(lower: string): {
    priceMin?: number;
    priceMax?: number;
  } {
    const result: { priceMin?: number; priceMax?: number } = {};

    const rangeMatch = lower.match(PRICE_RANGE_REGEX);
    if (rangeMatch) {
      result.priceMin = parseInt(rangeMatch[1], 10);
      result.priceMax = parseInt(rangeMatch[2], 10);
      return result;
    }

    const maxMatch = lower.match(PRICE_REGEX);
    if (maxMatch) result.priceMax = parseInt(maxMatch[1], 10);

    const minMatch = lower.match(PRICE_MIN_REGEX);
    if (minMatch) result.priceMin = parseInt(minMatch[1], 10);

    return result;
  }

  private resolveIntentType(
    attrs: IntentAttributes,
    occasion?: string,
  ): IntentType {
    if (occasion) return IntentType.OCCASION;
    if (attrs.season) return IntentType.CONTEXTUAL;

    const hasPrice = attrs.priceMin != null || attrs.priceMax != null;
    const hasBrand = !!attrs.brand;
    const hasCategory = !!attrs.category;
    const hasColor = !!attrs.color;

    // If we have a category → PRODUCT (with or without filters)
    if (hasCategory && (hasPrice || hasBrand)) return IntentType.FILTERED;
    if (hasCategory || hasColor) return IntentType.PRODUCT;
    if (hasPrice || hasBrand) return IntentType.FILTERED;

    return IntentType.EXPLORATORY;
  }

  private computeConfidence(attrs: IntentAttributes, type: IntentType): number {
    let score = 0;

    if (attrs.category) score += 0.35;
    if (attrs.color) score += 0.15;
    if (attrs.brand) score += 0.15;
    if (attrs.gender) score += 0.1;
    if (attrs.style) score += 0.1;
    if (attrs.occasion) score += 0.3;
    if (attrs.season) score += 0.15;
    if (attrs.priceMin != null || attrs.priceMax != null) score += 0.1;

    // Cap at 1.0
    return Math.min(score, 1.0);
  }

  private buildNormalizedQuery(lower: string): string {
    // Strip price syntax
    return lower
      .replace(PRICE_REGEX, '')
      .replace(PRICE_MIN_REGEX, '')
      .replace(PRICE_RANGE_REGEX, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
