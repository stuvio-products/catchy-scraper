import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createFeedbackDto: CreateFeedbackDto) {
    return this.prisma.client.feedback.create({
      data: {
        rating: createFeedbackDto.rating,
        topic: createFeedbackDto.topic,
        details: createFeedbackDto.details,
        userId: userId,
      },
    });
  }
}
