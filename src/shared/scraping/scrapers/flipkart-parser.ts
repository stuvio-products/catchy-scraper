import * as cheerio from 'cheerio';

export interface FlipkartSearchResult {
  product_name: string;
  product_link: string;
  thumbnail: string;
  current_price?: number;
  original_price?: number;
}

export class FlipkartParser {
  static parse(htmlContent: string): FlipkartSearchResult[] {
    const $ = cheerio.load(htmlContent);
    const results: FlipkartSearchResult[] = [];

    // Rust: .select(div_selector).filter(|div| div.value().attr("data-id").is_some())
    $('div[data-id]').each((_, element) => {
      const productDiv = $(element);

      // Rust: let mut link_iter = product.select(link_selector); let mut link_elem = link_iter.next()?;
      const links = productDiv.find('a');
      let linkElem = links.first();

      if (links.length === 0) return;

      // Check if we need to skip sponsored? Rust logic handles it in name selection.
      // Let's try to follow the structure.

      // Link
      let href = linkElem.attr('href');
      if (!href) return;

      if (href.startsWith('/')) {
        href = `https://www.flipkart.com${href}`;
      }

      // Thumbnail
      // Rust: link_elem.select(img_selector).next().and_then(|img| img.value().attr("src"))
      const thumbnail = linkElem.find('img').first().attr('src');
      if (!thumbnail) return;

      // Name
      // Rust uses complex class selector logic from last child.
      // Usually Flipkart product names are in a div with specific classes like "KzDlHZ" (for grid) or "wjcEIp" (list).
      // But the Rust code tries to be dynamic: "link_elem.last_child()?.value().as_element()?.classes()"
      // Let's try to grab the title from the image alt or text.

      let name = '';

      // Try finding the name element based on the Rust logic implies finding a specific class.
      // Simpler approach for now:
      // 1. Try img alt
      // 2. Try the text of the link container minus price info.
      // 3. Or look for common class names if generic approach fails.

      // Rust logic:
      // let name_section = link_elem.last_child()...classes();
      // let name = link_elem.select(class_selector).next()...

      // Let's try getting the text from the link element directly as a fallback,
      // or look for the specific name class usually found in `div` or `a` inside the product card.

      // In Flipkart, structure varies by category (Grid vs List view).
      // Common Grid: a > div > div > img (image), a (name), a > div > div (price)
      // Actually often:
      // div[data-id]
      //   > div > a (Image)
      //   > div > a (Name)
      //   > div > a (Price)

      // But the Rust code uses `link_elem` which seems to be the FIRST A tag.
      // "let mut link_elem = link_iter.next()?;"
      // If the first A tag contains the image AND the name, it's a specific layout.

      // Let's stick to a robust selector strategy that mirrors the Intent:
      // "Find the Name".
      // Usually checking `img alt` is a very good proxy for Name on Flipkart.
      name = linkElem.find('img').first().attr('alt') || '';

      if (!name) {
        // Fallback to text
        name = linkElem.text();
      }

      // Price
      // Rust loops through divs and looks for '₹'.
      let current_price: number | undefined;
      let original_price: number | undefined;

      productDiv.find('div').each((_, div) => {
        const text = $(div).text();
        if (text.includes('₹')) {
          // Check if it's the price
          // Rust: strip prefix '₹', check if it doesn't contain another '₹' (range?), replace ',', parse.

          // Simple regex to find prices
          // The first one is usually the selling price. The second (if strikethrough) is MRP.
          // But strict Rust port:
          if (text.startsWith('₹')) {
            const cleanText = text.substring(1).replace(/,/g, '');
            if (!cleanText.includes('₹')) {
              // Ensure it was just one price
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

      // If we couldn't find price in divs starting with ₹, try regex on the whole block
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
        product_name: name,
        product_link: href,
        thumbnail: thumbnail,
        current_price,
        original_price,
      });
    });

    return results;
  }
}
