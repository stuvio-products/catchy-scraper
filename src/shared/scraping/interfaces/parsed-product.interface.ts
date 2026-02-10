import { Retailer } from '../types/retailer.type';

export interface ParsedProduct {
  productName: string;
  productUrl: string;
  price?: number;
  images: string[];
  brand?: string;
  category?: string;
  description?: string;
  color?: string[];
  size?: string[];
  inStock?: boolean;
  retailer: Retailer | string; // Keep string for flexibility if needed, but prefer Retailer
}
