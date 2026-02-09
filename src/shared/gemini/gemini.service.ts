import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class GeminiService implements OnModuleInit {
  private readonly logger = new Logger(GeminiService.name);
  private client: GoogleGenAI;
  // Using gemini-embedding-001 with 1536 dimensions to match DB schema
  private readonly embeddingModel = 'gemini-embedding-001';
  private readonly outputDimensionality = 1536;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not configured');
      return;
    }
    this.client = new GoogleGenAI({ apiKey });
    this.logger.log(
      `Gemini client initialized with ${this.embeddingModel} (${this.outputDimensionality} dimensions)`,
    );
  }

  /**
   * Generate embedding vector for the given text using Gemini
   * @param text - The text to generate embedding for
   * @returns The embedding vector as an array of numbers (1536 dimensions)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.client) {
      throw new Error(
        'Gemini client is not initialized. Check GEMINI_API_KEY configuration.',
      );
    }

    try {
      const result = await this.client.models.embedContent({
        model: this.embeddingModel,
        contents: [
          {
            parts: [{ text }],
          },
        ],
        config: {
          outputDimensionality: this.outputDimensionality,
        },
      });

      const embedding = result.embeddings?.[0]?.values;

      if (!embedding || embedding.length === 0) {
        throw new Error('No embedding returned from Gemini API');
      }

      this.logger.debug(
        `Generated embedding with ${embedding.length} dimensions for: "${text.substring(0, 50)}..."`,
      );

      return embedding;
    } catch (error) {
      this.logger.error(
        `Failed to generate embedding: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get the dimensionality of embeddings produced by this service
   */
  getDimensionality(): number {
    return this.outputDimensionality;
  }

  /**
   * Generate text content using Gemini (for intent extraction)
   * @param prompt - The prompt to send to the model
   * @param jsonMode - Whether to force JSON output
   * @returns Generated text or JSON string
   */
  async generateText(
    prompt: string,
    jsonMode: boolean = false,
  ): Promise<string> {
    if (!this.client) {
      throw new Error('Gemini client is not initialized.');
    }

    try {
      const result = await this.client.models.generateContent({
        model: 'gemini-2.0-flash', // fast model for intent extraction
        contents: prompt,
        config: jsonMode
          ? {
              responseMimeType: 'application/json',
            }
          : undefined,
      });

      // Accessing text from the first candidate
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('No text returned from Gemini API');
      }

      return text;
    } catch (error) {
      this.logger.error(
        `Failed to generate text: ${error.message}`,
        error.stack,
      );
      // Fallback or rethrow
      throw error;
    }
  }
}
