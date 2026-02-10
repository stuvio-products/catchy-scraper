import { Module } from '@nestjs/common';
import { IntentParserService } from './intent-parser.service';
import { GeminiModule } from '@/shared/gemini/gemini.module';

@Module({
  imports: [GeminiModule],
  providers: [IntentParserService],
  exports: [IntentParserService],
})
export class IntentModule {}
