import { Injectable, Logger } from '@nestjs/common';
import { Chat, Message, MessageRole, ChatState } from '@prisma/client';
import { GeminiService } from '@/shared/gemini/gemini.service';
import { ChatRepository } from './chat.repository';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly geminiService: GeminiService,
  ) {}

  async createChat(
    userId: string,
    initialQuery: string,
    initialFilters: any = {},
    intentConfidence?: any,
    mode: string = 'SEARCH',
  ): Promise<Chat> {
    // Generate initial embedding for the state
    const embedding = await this.geminiService.generateEmbedding(initialQuery);

    const chat = await this.chatRepository.createChat({
      userId,
      initialQuery,
      initialFilters,
      intentConfidence,
      mode,
    });

    await this.chatRepository.updateChatStateEmbedding(chat.id, embedding);

    return chat;
  }

  async getChat(
    chatId: string,
  ): Promise<Chat & { messages: Message[]; state: ChatState }> {
    return this.chatRepository.findChatById(chatId);
  }

  async getUserChats(userId: string): Promise<Chat[]> {
    return this.chatRepository.findChatsByUserId(userId);
  }

  async addMessage(
    chatId: string,
    role: MessageRole,
    content: string,
  ): Promise<Message> {
    return this.chatRepository.addMessage(chatId, role, content);
  }

  async updateStateWithIntent(
    chatId: string,
    userMessage: string,
  ): Promise<ChatState> {
    const chat = await this.getChat(chatId);
    const currentState = chat.state;

    // Construct prompt for LLM
    const prompt = `
    You are a search assistant helper. 
    Current Query: "${currentState.currentQuery}"
    Current Filters: ${JSON.stringify(currentState.filters)}
    
    User just said: "${userMessage}"
    
    Extract the new intent. 
    If the user refines the query (e.g., "actually blue ones"), update the query.
    If the user adds a filter, update the filters.
    If the user clears filters, remove them.
    If the user switches to a completely new topic (e.g. from "water bottle" to "red shirt"), you MUST clear existing filters unless explicitly asked to keep them.
    
    CRITICAL: You must ONLY use the following filter keys:
    - price_min (number)
    - price_max (number)
    - brand (string)
    - retailer (string)
    - material (string)
    
    Do NOT use keys like "below", "under", "cheap", "color" (unless part of query), etc.
    "below 500" -> {"price_max": 500}
    "above 1000" -> {"price_min": 1000}
    
    Return a JSON object with:
    {
      "query": "updated query string (keep content if not changed)",
      "filters": { ...updated filters... }
    }
    
    Example:
    Current: "red dress", {}
    User: "under 1000"
    Result: {"query": "red dress", "filters": {"price_max": 1000}}
    
    Example:
    Current: "water bottle", {}
    User: "below 200"
    Result: {"query": "water bottle", "filters": {"price_max": 200}}

    Example:
    Current: "water bottle", {"price_max": 200}
    User: "red shirt"
    Result: {"query": "red shirt", "filters": {}} 
    
    Example:
    Current: "red dress", {"price_max": 1000}
    User: "make it blue"
    Result: {"query": "blue dress", "filters": {"price_max": 1000}}
    `;

    const response = await this.geminiService.generateText(prompt, true);

    // Parse JSON
    let newIntent;
    try {
      // Clean up markdown code blocks if present
      const cleanJson = response.replace(/```json\n|\n```/g, '').trim();
      newIntent = JSON.parse(cleanJson);
    } catch (e) {
      this.logger.error('Failed to parse intent JSON', e);
      return currentState; // Return old state on failure
    }

    // Update state in DB
    const embedding = await this.geminiService.generateEmbedding(
      newIntent.query,
    );

    await this.chatRepository.updateChatState(chatId, {
      currentQuery: newIntent.query,
      filters: newIntent.filters,
    });

    await this.chatRepository.updateChatStateEmbedding(chatId, embedding);

    return this.chatRepository.findChatState(chatId);
  }
}
