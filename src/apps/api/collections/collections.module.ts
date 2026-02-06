import { Module } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { PrismaModule } from '@/shared/prisma/prisma.module'; // Adjust path if needed

@Module({
  imports: [PrismaModule], // Ensure PrismaModule exports PrismaService
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
