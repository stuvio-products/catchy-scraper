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
