export const QUEUE_NAMES = {
  SCRAPE_QUEUE: 'scrape-queue',
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
