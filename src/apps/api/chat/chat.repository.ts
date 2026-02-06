import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { Chat, Message, MessageRole, ChatState } from '@prisma/client';

export interface CreateChatData {
  userId: string;
  initialQuery: string;
  initialFilters?: any;
}

export interface UpdateStateData {
  currentQuery: string;
  filters: any;
}

@Injectable()
export class ChatRepository {
  private readonly logger = new Logger(ChatRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async createChat(data: CreateChatData): Promise<Chat> {
    return this.prisma.client.chat.create({
      data: {
        title: data.initialQuery.substring(0, 50),
        userId: data.userId,
        messages: {
          create: {
            role: MessageRole.USER,
            content: data.initialQuery,
          },
        },
        state: {
          create: {
            currentQuery: data.initialQuery,
            filters: data.initialFilters ?? {},
          },
        },
      },
      include: {
        state: true,
      },
    });
  }

  async findChatById(chatId: string): Promise<Chat & { messages: Message[], state: ChatState }> {
    const chat = await this.prisma.client.chat.findUniqueOrThrow({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        state: true,
      },
    });

    if (!chat.state) {
      throw new Error('Chat state not found');
    }

    return chat as Chat & { messages: Message[], state: ChatState };
  }

  async findChatsByUserId(userId: string): Promise<Chat[]> {
    return this.prisma.client.chat.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        state: true,
      },
    });
  }

  async addMessage(chatId: string, role: MessageRole, content: string): Promise<Message> {
    return this.prisma.client.message.create({
      data: {
        chatId,
        role,
        content,
      },
    });
  }

  async updateChatState(chatId: string, data: UpdateStateData): Promise<ChatState> {
    return this.prisma.client.chatState.update({
      where: { chatId },
      data: {
        currentQuery: data.currentQuery,
        filters: data.filters,
      },
    });
  }

  async findChatState(chatId: string): Promise<ChatState> {
    return this.prisma.client.chatState.findUniqueOrThrow({ where: { chatId } });
  }

  async updateChatStateEmbedding(chatId: string, embedding: number[]): Promise<void> {
    const vectorString = `[${embedding.join(',')}]`;
    
    await this.prisma.client.$executeRaw`
      UPDATE chat_state
      SET last_embedding = ${vectorString}::vector
      WHERE chat_id = ${chatId}::uuid
    `;
  }
}
