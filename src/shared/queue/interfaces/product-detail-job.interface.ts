import { Retailer } from '@/shared/scraping/types/retailer.type';

export interface ProductDetailJob {
  jobId: string;
  products: {
    url: string;
    domain: string;
    retailer: Retailer;
  }[];
  createdAt: Date;
  attempts?: number;
}
