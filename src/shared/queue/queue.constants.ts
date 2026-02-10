export const QUEUE_NAMES = {
  SCRAPE_QUEUE: 'scrape-queue',
  PRODUCT_DETAIL_QUEUE: 'product-detail-queue',
} as const;

export const QUEUE_CONFIG = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: false,
  removeOnFail: false,
};

/**
 * Per-retailer concurrency limits for scrape workers.
 * Lower values = more conservative to avoid rate limiting.
 */
export const RETAILER_CONCURRENCY = {
  'amazon.in': 2,
  'flipkart.com': 5,
  'myntra.com': 5,
  'meesho.com': 3,
} as const;

/**
 * BullMQ job priorities (lower number = higher priority).
 */
export const JOB_PRIORITIES = {
  PREFETCH_PAGE: 1,
  LAZY_DETAIL: 3,
  REFRESH_STALE: 5,
} as const;
