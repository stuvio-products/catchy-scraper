import { Injectable, Logger } from '@nestjs/common';

interface DomainMetrics {
  success: number;
  failure: number;
  lastReset: number;
}

@Injectable()
export class ScraperTelemetryService {
  private readonly logger = new Logger(ScraperTelemetryService.name);

  private readonly metrics = new Map<string, DomainMetrics>();

  // Reset counters every 5 minutes
  private readonly RESET_INTERVAL_MS = 5 * 60 * 1000;
  // Back off if failure rate exceeds this threshold
  private readonly BACKOFF_THRESHOLD = 0.5;

  private getOrCreateMetrics(domain: string): DomainMetrics {
    const now = Date.now();
    let m = this.metrics.get(domain);

    if (!m || now - m.lastReset > this.RESET_INTERVAL_MS) {
      m = { success: 0, failure: 0, lastReset: now };
      this.metrics.set(domain, m);
    }

    return m;
  }

  recordSuccess(domain: string): void {
    const m = this.getOrCreateMetrics(domain);
    m.success++;
  }

  recordFailure(domain: string): void {
    const m = this.getOrCreateMetrics(domain);
    m.failure++;
    this.logger.warn(
      `Failure recorded for ${domain} — success: ${m.success}, failure: ${m.failure}`,
    );
  }

  getFailureRate(domain: string): number {
    const m = this.metrics.get(domain);
    if (!m) return 0;

    const total = m.success + m.failure;
    if (total === 0) return 0;

    return m.failure / total;
  }

  shouldBackOff(domain: string): boolean {
    const m = this.metrics.get(domain);
    if (!m) return false;

    const total = m.success + m.failure;
    // Need at least 4 data points before making a backoff decision
    if (total < 4) return false;

    const rate = this.getFailureRate(domain);
    if (rate > this.BACKOFF_THRESHOLD) {
      this.logger.warn(
        `Backing off ${domain} — failure rate: ${(rate * 100).toFixed(1)}% (${m.failure}/${total})`,
      );
      return true;
    }

    return false;
  }

  getStats(): Record<
    string,
    { success: number; failure: number; failureRate: string }
  > {
    const stats: Record<string, any> = {};
    for (const [domain, m] of this.metrics.entries()) {
      const total = m.success + m.failure;
      stats[domain] = {
        success: m.success,
        failure: m.failure,
        failureRate:
          total > 0 ? `${((m.failure / total) * 100).toFixed(1)}%` : '0%',
      };
    }
    return stats;
  }
}
