export interface Proxy {
  id: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  region?: string;
  costPerMB: number;
  costPerRequest: number;
}

export interface ProxyMetrics {
  failureCount: number;
  successCount: number;
  totalBytesUsed: number;
  lastUsed: Date;
  lastFailure?: Date;
}

export interface IProxyProvider {
  getProxy(domain: string): Promise<Proxy>;
  reportFailure(proxyId: string): Promise<void>;
  reportSuccess(proxyId: string, bytesUsed: number): Promise<void>;
}
