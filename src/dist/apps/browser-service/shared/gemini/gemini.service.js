"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var GeminiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const genai_1 = require("@google/genai");
let GeminiService = GeminiService_1 = class GeminiService {
    configService;
    logger = new common_1.Logger(GeminiService_1.name);
    client;
    embeddingModel = 'gemini-embedding-001';
    outputDimensionality = 1536;
    constructor(configService) {
        this.configService = configService;
    }
    onModuleInit() {
        const apiKey = this.configService.get('GEMINI_API_KEY');
        if (!apiKey) {
            this.logger.warn('GEMINI_API_KEY is not configured');
            return;
        }
        this.client = new genai_1.GoogleGenAI({ apiKey });
        this.logger.log(`Gemini client initialized with ${this.embeddingModel} (${this.outputDimensionality} dimensions)`);
    }
    async generateEmbedding(text) {
        if (!this.client) {
            throw new Error('Gemini client is not initialized. Check GEMINI_API_KEY configuration.');
        }
        try {
            const result = await this.client.models.embedContent({
                model: this.embeddingModel,
                contents: text,
                config: {
                    outputDimensionality: this.outputDimensionality,
                },
            });
            const embedding = result.embeddings?.[0]?.values;
            if (!embedding || embedding.length === 0) {
                throw new Error('No embedding returned from Gemini API');
            }
            this.logger.debug(`Generated embedding with ${embedding.length} dimensions for: "${text.substring(0, 50)}..."`);
            return embedding;
        }
        catch (error) {
            this.logger.error(`Failed to generate embedding: ${error.message}`, error.stack);
            throw error;
        }
    }
    getDimensionality() {
        return this.outputDimensionality;
    }
    async generateText(prompt, jsonMode = false) {
        if (!this.client) {
            throw new Error('Gemini client is not initialized.');
        }
        try {
            const result = await this.client.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: prompt,
                config: jsonMode
                    ? {
                        responseMimeType: 'application/json',
                    }
                    : undefined,
            });
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                throw new Error('No text returned from Gemini API');
            }
            return text;
        }
        catch (error) {
            this.logger.error(`Failed to generate text: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.GeminiService = GeminiService;
exports.GeminiService = GeminiService = GeminiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GeminiService);
//# sourceMappingURL=gemini.service.js.map