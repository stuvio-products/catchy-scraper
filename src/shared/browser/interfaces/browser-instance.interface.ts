import { Browser } from 'playwright';
import { Proxy } from '@/shared/proxy/interfaces/proxy.interface';

export type BrowserHealthStatus = 'healthy' | 'unhealthy' | 'dead';

export interface BrowserInstance {
  id: string;
  browser: Browser;
  proxy: Proxy;
  healthStatus: BrowserHealthStatus;
  lastHealthCheck: Date;
  failureCount: number;
  createdAt: Date;
  domain?: string; // For sticky sessions
}

export interface BrowserPoolStats {
  total: number;
  healthy: number;
  unhealthy: number;
  dead: number;
}
