export interface ScrapeJob {
  jobId: string;
  url: string;
  domain: string;
  options?: Record<string, any>;
  createdAt: Date;
  attempts?: number;
}

export interface JobResult {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  completedAt?: Date;
}
