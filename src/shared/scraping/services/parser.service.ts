import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { ParsedProduct } from '../interfaces/parsed-product.interface';
import { Retailer } from '../types/retailer.type';

@Injectable()
export class ParserService {
  private readonly logger = new Logger(ParserService.name);

  /**
   * Parse Myntra individual product detail page
   */
  parseMyntraDetail(htmlContent: string): ParsedProduct | null {
    const startPattern = 'window.__myx = ';
    const startIndex = htmlContent.indexOf(startPattern);

    if (startIndex === -1) {
      this.logger.warn('window.__myx not found in Myntra detail response');
      return null;
    }

    try {
      // Find the end of JSON object (brace counting)
      const jsonStart = startIndex + startPattern.length;
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      let endIndex = jsonStart;

      for (let i = jsonStart; i < htmlContent.length; i++) {
        const char = htmlContent[i];
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
          if (braceCount === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }

      const jsonString = htmlContent.substring(jsonStart, endIndex);
      const jsonObject = JSON.parse(jsonString);

      // Detail page structure often uses pdpData
      const p = jsonObject?.pdpData;
      if (!p) return null;

      return {
        productName: p.name,
        productUrl: `https://www.myntra.com/${p.productUrl}`,
        price: p.price?.discounted || p.price?.mrp,
        images: p.media?.albums?.[0]?.images?.map((img: any) => img.src) || [],
        brand: p.brand?.name,
        category: p.analytics?.articleType,
        description: p.productDetails
          ?.map((d: any) => `${d.title}: ${d.description}`)
          .join('\n'),
        color: p.primaryColour ? [p.primaryColour] : [],
        size: p.sizes?.map((s: any) => s.label) || [],
        inStock: p.inventory?.availableStatus === 'INSTOCK',
        retailer: 'myntra',
      };
    } catch (e) {
      this.logger.error(`Error parsing Myntra Detail JSON: ${e.message}`);
      return null;
    }
  }

  /**
   * Parse Flipkart individual product detail page
   */
  parseFlipkartDetail(htmlContent: string): ParsedProduct | null {
    const $ = cheerio.load(htmlContent);

    try {
      // 1. Title & Brand (New UI selectors + fallbacks)
      const name =
        $('.v1zwn21j.v1zwn27').first().text().trim() ||
        $('span.B_NuE_').text().trim() ||
        $('h1').text().trim();

      const brand =
        name.split(' ')[0] ||
        $('span.G6uB6K').text().trim() ||
        $('span.BYB4H5').text().trim();

      // 2. Price
      const priceText =
        $('.v1zwn21j.v1zwn2c').text() ||
        $('.Nx943j').text() ||
        $('div.ihv79b').text();
      const price = priceText
        ? parseInt(priceText.replace(/[^\d]/g, ''), 10)
        : NaN;

      // 3. Images (Collect high-res versions)
      const images: string[] = [];
      $('img').each((_, el) => {
        const src = $(el).attr('src');
        if (src) {
          if (src.includes('rukminim')) {
            // Transform thumbnail URL to high-res
            images.push(src.replace('/80/80/', '/800/1000/'));
          } else if (src.includes('/image/') && !images.includes(src)) {
            images.push(src);
          }
        }
      });

      // 4. Color & Size extraction
      const color: string[] = [];
      const lowerName = name.toLowerCase();
      const commonColors = [
        'Green',
        'Pink',
        'Black',
        'White',
        'Blue',
        'Red',
        'Yellow',
        'Grey',
        'Brown',
        'Silver',
        'Gold',
      ];
      commonColors.forEach((c) => {
        if (lowerName.includes(c.toLowerCase())) color.push(c);
      });

      const size: string[] = [];
      $('li._3V2wNx, .size-selector-item').each((_, el) => {
        const s = $(el).text().trim();
        if (s) size.push(s);
      });

      // 5. Description
      const description =
        $('.v1zwn257.v1zwn2c').text().trim() ||
        $('.yN\\+eNk').text().trim() ||
        $('.R91_0J').text().trim();

      if (!name) return null;

      return {
        productName: name,
        productUrl: '', // Will be filled by processor
        price: isNaN(price) ? undefined : price,
        images: [...new Set(images)].slice(0, 10),
        brand,
        description,
        color: color.length > 0 ? color : undefined,
        size: size.length > 0 ? size : undefined,
        inStock: !htmlContent.toLowerCase().includes('out of stock'),
        retailer: 'flipkart',
      };
    } catch (e) {
      this.logger.error(`Error parsing Flipkart Detail: ${e.message}`);
      return null;
    }
  }

  /**
   * Parse Meesho individual product detail page
   */
  parseMeeshoDetail(htmlContent: string): ParsedProduct | null {
    // Attempt to extract from __NEXT_DATA__ first (more robust/detailed)
    const startPattern = '<script id="__NEXT_DATA__" type="application/json">';
    const startIndex = htmlContent.indexOf(startPattern);

    if (startIndex !== -1) {
      try {
        const jsonStart = startIndex + startPattern.length;
        let braceCount = 0;
        let inString = false;
        let escapeNext = false;
        let endIndex = jsonStart;

        for (let i = jsonStart; i < htmlContent.length; i++) {
          const char = htmlContent[i];
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          if (char === '"') {
            inString = !inString;
            continue;
          }
          if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
            if (braceCount === 0) {
              endIndex = i + 1;
              break;
            }
          }
        }

        const jsonString = htmlContent.substring(jsonStart, endIndex);
        const jsonObject = JSON.parse(jsonString);

        // Path to product data in Meesho's NEXT_DATA
        const product =
          jsonObject?.props?.pageProps?.initialState?.product?.productDetail;

        if (product) {
          return {
            productName: product.name,
            productUrl: '', // Will be filled by processor
            price: product.price,
            images: product.images || [],
            brand: product.brand_name || 'Meesho',
            description: product.description,
            retailer: 'meesho',
            category: product.category_name,
            color: product.color ? [product.color] : [],
          };
        }
      } catch (e) {
        this.logger.debug(
          `__NEXT_DATA__ parsing failed for Meesho, falling back to Cheerio: ${e.message}`,
        );
      }
    }

    // Fallback to Cheerio parsing
    const $ = cheerio.load(htmlContent);

    try {
      const name =
        $('span.sc-eDvSVe.fIuLid').text().trim() || $('h1').text().trim();
      const priceText = $('h4.sc-eDvSVe').first().text().trim();
      const price = parseInt(priceText.replace(/[₹,]/g, ''), 10);

      const images: string[] = [];
      $('img[src*="meeshosupply"]').each((_, img) => {
        const src = $(img).attr('src');
        if (src && !images.includes(src)) {
          images.push(src);
        }
      });

      const description = $('span.sc-eDvSVe.eqAnpM').text().trim();

      if (!name) return null;

      return {
        productName: name,
        productUrl: '', // Will be filled by processor
        price: isNaN(price) ? undefined : price,
        images: images.slice(0, 10),
        brand: 'Meesho',
        description,
        retailer: 'meesho',
      };
    } catch (e) {
      this.logger.error(`Error parsing Meesho Detail: ${e.message}`);
      return null;
    }
  }

  /**
   * Parse Amazon individual product detail page
   */
  parseAmazonDetail(htmlContent: string): ParsedProduct | null {
    const $ = cheerio.load(htmlContent);

    try {
      const name = $('#productTitle').text().trim();
      const priceText = $('.a-price-whole')
        .first()
        .text()
        .trim()
        .replace(/,/g, '');
      const price = parseInt(priceText, 10);

      const bullets = Array.from($('#feature-bullets li:not(.a-spacing-mini)'))
        .map((li) => $(li).text().trim())
        .filter((t) => t && !t.toLowerCase().includes('visit the'));

      const images: string[] = [];
      $('#altImages img').each((_, img) => {
        const src = $(img)
          .attr('src')
          ?.replace(/\._AC_.*_\./, '.');
        if (src && !src.includes('.gif') && src.includes('media-amazon.com')) {
          images.push(src);
        }
      });

      const colorElements = Array.from($('#variation_color_name li img'));
      const colors = colorElements
        .map((img) => $(img).attr('alt'))
        .filter(Boolean) as string[];

      const sizeElements = Array.from(
        $(
          '#variation_size_name li:not(.swatch-unavailable) span.a-size-base, #native_dropdown_selected_size_name option',
        ),
      );
      const sizes = [
        ...new Set(
          sizeElements
            .map((el) => $(el).text() || ($(el).val() as string))
            .filter((s) => s && !s.includes('Select')),
        ),
      ];

      const brand = $('#bylineInfo')
        .text()
        .replace(/Visit the|Brand:/gi, '')
        .trim();

      if (!name) return null;

      return {
        productName: name,
        productUrl: '', // Will be filled by processor
        price: isNaN(price) ? undefined : price,
        images: [...new Set(images)].slice(0, 10),
        brand,
        description: bullets.join(' '),
        color: colors,
        size: sizes,
        inStock: !$('#availability')
          .text()
          .toLowerCase()
          .includes('currently unavailable'),
        retailer: 'amazon',
      };
    } catch (e) {
      this.logger.error(`Error parsing Amazon Detail: ${e.message}`);
      return null;
    }
  }

  /**
   * Parse detail page for any retailer
   */
  parseDetail(htmlContent: string, retailer: Retailer): ParsedProduct | null {
    if (retailer === 'myntra') {
      return this.parseMyntraDetail(htmlContent);
    } else if (retailer === 'flipkart') {
      return this.parseFlipkartDetail(htmlContent);
    } else if (retailer === 'meesho') {
      return this.parseMeeshoDetail(htmlContent);
    } else if (retailer === 'amazon') {
      return this.parseAmazonDetail(htmlContent);
    }
    return null;
  }

  /**
   * Parse Myntra HTML content to extract product data
   */
  parseMyntra(htmlContent: string): ParsedProduct[] {
    const startPattern = 'window.__myx = ';
    const startIndex = htmlContent.indexOf(startPattern);

    if (startIndex === -1) {
      this.logger.warn('window.__myx not found in Myntra response');
      return [];
    }

    const jsonStart = startIndex + startPattern.length;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let endIndex = jsonStart;

    // Manual JSON extraction based on brace counting
    for (let i = jsonStart; i < htmlContent.length; i++) {
      const char = htmlContent[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;

        if (braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }

    try {
      const jsonString = htmlContent.substring(jsonStart, endIndex);
      const jsonObject = JSON.parse(jsonString);
      const products = jsonObject?.searchData?.results?.products || [];

      return products.map((p: any) => ({
        productName: p.productName,
        productUrl: `https://www.myntra.com/${p.landingPageUrl}`,
        price: p.price,
        images: p.images ? p.images.map((img: any) => img.src) : [],
        brand: p.brand,
        category: p.category,
        description: p.additionalInfo,
        color: p.primaryColour ? [p.primaryColour] : [],
        size: p.sizes ? p.sizes.split(',') : [],
        inStock: p.inventoryInfo
          ? p.inventoryInfo.some((i: any) => i.available)
          : true,
        retailer: 'myntra',
      }));
    } catch (e) {
      this.logger.error(`Error parsing Myntra JSON: ${e.message}`);
      return [];
    }
  }

  /**
   * Parse Flipkart HTML content to extract product data
   */
  parseFlipkart(htmlContent: string): ParsedProduct[] {
    const $ = cheerio.load(htmlContent);
    const results: ParsedProduct[] = [];

    $('div[data-id]').each((_, element) => {
      const productDiv = $(element);

      // Find first link
      const links = productDiv.find('a');
      let linkElem = links.first();

      if (links.length === 0) return;

      // Extract product link
      let href = linkElem.attr('href');
      if (!href) return;

      if (href.startsWith('/')) {
        href = `https://www.flipkart.com${href}`;
      }

      // Extract thumbnail
      const thumbnail = linkElem.find('img').first().attr('src');
      if (!thumbnail) return;

      // Transform thumbnail to high-res if it's from Flipkart CDN
      const highResImage = thumbnail.includes('rukminim')
        ? thumbnail.replace(/\/\d+\/\d+\//, '/800/1000/')
        : thumbnail;

      // Extract product name (from img alt or other a link title)
      let name = linkElem.find('img').first().attr('alt') || '';

      if (!name) {
        // Fallback: look for any 'a' tag with a 'title' attribute in the product div
        const titleLink = productDiv.find('a[title]').first();
        if (titleLink.length > 0) {
          name = titleLink.attr('title') || '';
        }
      }

      if (!name) {
        name = linkElem.text();
      }

      name = name.trim();

      // Extract prices
      let current_price: number | undefined;
      let original_price: number | undefined;

      productDiv.find('div').each((_, div) => {
        const text = $(div).text();
        if (text.includes('₹')) {
          if (text.startsWith('₹')) {
            const cleanText = text.substring(1).replace(/,/g, '');
            if (!cleanText.includes('₹')) {
              const priceVal = parseInt(cleanText, 10);
              if (!isNaN(priceVal)) {
                if (current_price === undefined) {
                  current_price = priceVal;
                } else if (original_price === undefined) {
                  original_price = priceVal;
                  return false; // break
                }
              }
            }
          }
        }
      });

      // Fallback price extraction using regex
      if (current_price === undefined) {
        const priceText = productDiv.text();
        const matches = priceText.match(/₹[\d,]+/g);
        if (matches) {
          current_price = parseInt(matches[0].replace(/[₹,]/g, ''), 10);
          if (matches.length > 1) {
            original_price = parseInt(matches[1].replace(/[₹,]/g, ''), 10);
          }
        }
      }

      results.push({
        productName: name || 'Product',
        productUrl: href,
        price: current_price,
        images: [highResImage],
        retailer: 'flipkart',
      });
    });

    return results;
  }

  /**
   * Parse Meesho HTML content to extract product data
   */
  parseMeesho(htmlContent: string): ParsedProduct[] {
    const $ = cheerio.load(htmlContent);
    const results: ParsedProduct[] = [];
    const seenLinks = new Set<string>();

    // Check for blocked/no results
    if (
      htmlContent.includes('Access Denied') ||
      $('*:contains("no results")').length > 0 ||
      $('*:contains("couldn\'t find")').length > 0
    ) {
      this.logger.warn('Meesho: No results or blocked');
      return [];
    }

    // Find product cards - Meesho uses various selectors
    let productCards = $(
      'div[data-testid="product-card"], div.sc-dkzDqf, a[href*="/product"]',
    );

    // Fallback: find links that match product URL pattern
    if (productCards.length === 0) {
      productCards = $('a').filter((_, el) => {
        const href = $(el).attr('href') || '';
        return /\/[^/]+-[^/]+\/p\//.test(href);
      });
    }

    this.logger.log(`Meesho: Found ${productCards.length} product cards`);

    productCards.each((_, card) => {
      const product = this.extractMeeshoProduct($, card, seenLinks);
      if (product) {
        results.push(product);
      }
    });

    this.logger.log(`Meesho: Parsed ${results.length} products from HTML`);
    return results;
  }

  /**
   * Extract individual Meesho product from card element
   */
  private extractMeeshoProduct(
    $: cheerio.CheerioAPI,
    card: any,
    seenLinks: Set<string>,
  ): ParsedProduct | null {
    const $card = $(card);

    // Get link
    let linkEl = $card;
    if (card.name !== 'a') {
      const foundLink = $card.find('a[href]').first();
      if (foundLink.length > 0) {
        linkEl = foundLink;
      } else {
        return null;
      }
    }

    const href = linkEl.attr('href');
    if (!href || href.startsWith('#')) {
      return null;
    }

    // Build absolute URL
    const productUrl = href.startsWith('http')
      ? href
      : `https://www.meesho.com${href}`;

    // Deduplicate
    const cleanUrl = productUrl.split('?')[0];
    if (seenLinks.has(cleanUrl)) {
      return null;
    }
    seenLinks.add(cleanUrl);

    // Extract name
    let productName = '';
    const nameEl = $card.find('p, h3, h4, span.sc-eDvSVe').first();
    if (nameEl.length > 0) {
      productName = nameEl.text().trim();
    }
    if (!productName) {
      productName = linkEl.attr('title') || 'Meesho Product';
    }

    // Extract image
    const imgEl = $card.find('img').first();
    const image = imgEl.attr('src') || imgEl.attr('data-src') || '';

    if (!image || !image.startsWith('http')) {
      return null;
    }

    // Extract price
    let price: number | undefined;
    $card.find('span, p').each((_, priceEl) => {
      const text = $(priceEl).text().trim();
      if (text.includes('₹')) {
        const match = text.match(/[\d,]+/);
        if (match) {
          try {
            price = parseInt(match[0].replace(/,/g, ''), 10);
            return false; // break
          } catch (e) {
            // continue
          }
        }
      }
    });

    return {
      productName: productName.substring(0, 100),
      productUrl,
      price,
      images: [image],
      brand: 'Meesho',
      retailer: 'meesho',
    };
  }

  /**
   * Parse Amazon HTML search results content to extract product data
   */
  parseAmazon(htmlContent: string): ParsedProduct[] {
    const $ = cheerio.load(htmlContent);
    const results: ParsedProduct[] = [];

    $("[data-component-type='s-search-result']").each((_, element) => {
      const item = $(element);

      const titleEl = item.find('h2') || item.find('h2 a span');
      const title = titleEl?.text()?.trim();

      let link = item.find("a[href*='/dp/']").first().attr('href');
      if (link && link.startsWith('/')) {
        link = `https://www.amazon.in${link}`;
      }

      const priceStr = item
        .find('.a-price-whole')
        .first()
        .text()
        .trim()
        .replace(/,/g, '');
      const price = priceStr ? parseInt(priceStr, 10) : undefined;

      const image = item.find('img.s-image').first().attr('src');

      if (title && link) {
        results.push({
          productName: title,
          productUrl: link,
          price: isNaN(price as number) ? undefined : price,
          images: image ? [image] : [],
          retailer: 'amazon',
        });
      }
    });

    return results;
  }

  /**
   * Generic parse method that routes to appropriate parser based on retailer
   */
  parse(htmlContent: string, retailer: Retailer): ParsedProduct[] {
    if (retailer === 'myntra') {
      return this.parseMyntra(htmlContent);
    } else if (retailer === 'flipkart') {
      return this.parseFlipkart(htmlContent);
    } else if (retailer === 'meesho') {
      return this.parseMeesho(htmlContent);
    } else if (retailer === 'amazon') {
      return this.parseAmazon(htmlContent);
    }

    this.logger.warn(`Unknown retailer: ${retailer}`);
    return [];
  }
}
