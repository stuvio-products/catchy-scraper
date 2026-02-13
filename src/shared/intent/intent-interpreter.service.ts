import { Injectable, Logger } from '@nestjs/common';
import { RuleIntentService } from './rule-intent.service';
import { EmbeddingIntentService } from './embedding-intent.service';
import { IntentParserService } from './intent-parser.service';
import { StructuredIntent, IntentType } from './intent-types';

// ============================================================================
// 3-STAGE INTENT INTERPRETER ORCHESTRATOR
//
// Stage A → Rule Layer (deterministic, <5ms)
// Stage B → Embedding Classifier (secondary, ~50ms)
// Stage C → LLM Fallback (rare, ~300ms, cached)
// ============================================================================

@Injectable()
export class IntentInterpreterService {
  private readonly logger = new Logger(IntentInterpreterService.name);

  constructor(
    private readonly ruleIntent: RuleIntentService,
    private readonly embeddingIntent: EmbeddingIntentService,
    private readonly llmIntent: IntentParserService,
  ) {}

  /**
   * Interpret a user query through the 3-stage pipeline.
   * Returns a StructuredIntent with type, confidence, attributes, and optional slots.
   */
  async interpret(query: string): Promise<StructuredIntent> {
    const startTime = Date.now();

    // ---- Stage A: Rule Layer (deterministic) ----
    const ruleResult = this.ruleIntent.classify(query);
    if (ruleResult && ruleResult.confidence >= 0.5) {
      this.logger.log(
        `Intent resolved by RULES in ${Date.now() - startTime}ms: ` +
          `type=${ruleResult.type}, confidence=${ruleResult.confidence.toFixed(2)}, ` +
          `attrs=${JSON.stringify(ruleResult.attributes)}`,
      );
      return ruleResult;
    }

    // Partial attributes from rules (even if not confident enough)
    const ruleAttributes = ruleResult?.attributes;

    // ---- Stage B: Embedding Classifier ----
    try {
      const embeddingResult = await this.embeddingIntent.classify(
        query,
        ruleAttributes,
      );
      if (embeddingResult && embeddingResult.confidence >= 0.65) {
        this.logger.log(
          `Intent resolved by EMBEDDING in ${Date.now() - startTime}ms: ` +
            `type=${embeddingResult.type}, confidence=${embeddingResult.confidence.toFixed(2)}, ` +
            `cluster attrs=${JSON.stringify(embeddingResult.attributes)}`,
        );
        return embeddingResult;
      }
    } catch (err) {
      this.logger.error(
        `Stage B failed, falling through to LLM: ${err.message}`,
      );
    }

    // ---- Stage C: LLM Fallback ----
    try {
      const llmResult = await this.llmIntent.classifyAsStructuredIntent(query);
      this.logger.log(
        `Intent resolved by LLM in ${Date.now() - startTime}ms: ` +
          `type=${llmResult.type}, confidence=${llmResult.confidence.toFixed(2)}`,
      );
      return llmResult;
    } catch (err) {
      this.logger.error(`Stage C (LLM) also failed: ${err.message}`);
    }

    // ---- Ultimate fallback ----
    this.logger.warn(
      `All intent stages failed for "${query}", returning EXPLORATORY fallback`,
    );
    return {
      type: IntentType.EXPLORATORY,
      confidence: 0.3,
      attributes: {},
      resolvedBy: 'rule',
      normalizedQuery: query.toLowerCase().trim(),
      rawQuery: query,
    };
  }
}
