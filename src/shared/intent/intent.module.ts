import { Module } from '@nestjs/common';
import { IntentParserService } from './intent-parser.service';
import { RuleIntentService } from './rule-intent.service';
import { EmbeddingIntentService } from './embedding-intent.service';
import { IntentInterpreterService } from './intent-interpreter.service';
import { GeminiModule } from '@/shared/gemini/gemini.module';

@Module({
  imports: [GeminiModule],
  providers: [
    RuleIntentService,
    EmbeddingIntentService,
    IntentParserService,
    IntentInterpreterService,
  ],
  exports: [
    IntentInterpreterService,
    IntentParserService, // Keep exporting for backward compatibility
  ],
})
export class IntentModule {}
