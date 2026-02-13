import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GeminiService } from '@/shared/gemini/gemini.service';
import {
  IntentType,
  IntentAttributes,
  StructuredIntent,
  StageResult,
} from './intent-types';

// ============================================================================
// INTENT CLUSTER DEFINITIONS
// ============================================================================

interface IntentCluster {
  name: string;
  /** Representative phrase used to generate the cluster embedding */
  phrase: string;
  type: IntentType;
  attributes: Partial<IntentAttributes>;
  embedding?: number[];
}

const INTENT_CLUSTERS: IntentCluster[] = [
  {
    name: 'casual',
    phrase: 'casual everyday comfortable relaxed outfit clothing',
    type: IntentType.CONTEXTUAL,
    attributes: { style: 'casual' },
  },
  {
    name: 'formal',
    phrase: 'formal professional business suit office wear',
    type: IntentType.CONTEXTUAL,
    attributes: { style: 'formal' },
  },
  {
    name: 'office',
    phrase: 'office work meeting professional smart clothing',
    type: IntentType.OCCASION,
    attributes: { occasion: 'office', style: 'formal' },
  },
  {
    name: 'date',
    phrase: 'date night romantic evening dinner outfit stylish',
    type: IntentType.OCCASION,
    attributes: { occasion: 'date', style: 'smart casual' },
  },
  {
    name: 'party',
    phrase: 'party nightclub celebration festive fun outfit',
    type: IntentType.OCCASION,
    attributes: { occasion: 'party', style: 'trendy' },
  },
  {
    name: 'gym',
    phrase: 'gym workout fitness sportswear activewear training',
    type: IntentType.OCCASION,
    attributes: { occasion: 'gym', style: 'sporty' },
  },
  {
    name: 'summer',
    phrase: 'summer hot weather light breathable cotton linen',
    type: IntentType.CONTEXTUAL,
    attributes: { season: 'summer' },
  },
  {
    name: 'winter',
    phrase: 'winter cold weather warm cozy layered wool jacket',
    type: IntentType.CONTEXTUAL,
    attributes: { season: 'winter' },
  },
];

const CLUSTER_CONFIDENCE_THRESHOLD = 0.65;

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class EmbeddingIntentService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingIntentService.name);
  private clusters: IntentCluster[] = [];
  private initialized = false;

  constructor(private readonly geminiService: GeminiService) {}

  async onModuleInit() {
    // Generate cluster embeddings at startup (fire-and-forget, non-blocking)
    this.initClusters().catch((err) => {
      this.logger.error(`Failed to initialize intent clusters: ${err.message}`);
    });
  }

  private async initClusters(): Promise<void> {
    this.logger.log('Generating intent cluster embeddings...');
    const results = await Promise.allSettled(
      INTENT_CLUSTERS.map(async (cluster) => {
        const embedding = await this.geminiService.generateEmbedding(
          cluster.phrase,
        );
        return { ...cluster, embedding };
      }),
    );

    this.clusters = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<IntentCluster>).value);

    this.initialized = this.clusters.length > 0;
    this.logger.log(
      `Initialized ${this.clusters.length}/${INTENT_CLUSTERS.length} intent clusters`,
    );
  }

  /**
   * Stage B: Embedding-based intent classification.
   * Embeds query and matches against predefined intent clusters.
   *
   * SAFETY: If ruleAttributes contains an explicit category, this stage
   * MUST NOT override it. The category from the rule layer always wins.
   *
   * @param query - raw user query
   * @param ruleAttributes - attributes already detected by Stage A (may be partial)
   */
  async classify(
    query: string,
    ruleAttributes?: Partial<IntentAttributes>,
  ): Promise<StageResult> {
    if (!this.initialized || this.clusters.length === 0) {
      this.logger.debug(
        'Embedding intent clusters not initialized, skipping Stage B',
      );
      return null;
    }

    try {
      const queryEmbedding = await this.geminiService.generateEmbedding(query);

      let bestCluster: IntentCluster | null = null;
      let bestSimilarity = -1;

      for (const cluster of this.clusters) {
        if (!cluster.embedding) continue;
        const sim = this.cosineSimilarity(queryEmbedding, cluster.embedding);
        if (sim > bestSimilarity) {
          bestSimilarity = sim;
          bestCluster = cluster;
        }
      }

      if (!bestCluster || bestSimilarity < CLUSTER_CONFIDENCE_THRESHOLD) {
        this.logger.debug(
          `No cluster match for "${query}" (best: ${bestSimilarity.toFixed(3)})`,
        );
        return null;
      }

      this.logger.log(
        `Cluster match: "${query}" → ${bestCluster.name} (${bestSimilarity.toFixed(3)})`,
      );

      // SAFETY RULE: Do NOT override explicit category from rule layer
      const mergedAttributes: IntentAttributes = {
        ...bestCluster.attributes,
        ...(ruleAttributes || {}), // Rule layer attributes take precedence
      };

      // If rule layer found a category, keep the rule layer's intent type too
      if (ruleAttributes?.category) {
        return {
          type: IntentType.PRODUCT,
          confidence: bestSimilarity,
          attributes: mergedAttributes,
          resolvedBy: 'embedding',
          normalizedQuery: query.toLowerCase().trim(),
          rawQuery: query,
        };
      }

      return {
        type: bestCluster.type,
        confidence: bestSimilarity,
        attributes: mergedAttributes,
        resolvedBy: 'embedding',
        normalizedQuery: query.toLowerCase().trim(),
        rawQuery: query,
      };
    } catch (err) {
      this.logger.error(`Stage B classification failed: ${err.message}`);
      return null;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}
