import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

@Injectable()
export class CollectionsService {
  constructor(private prisma: PrismaService) {}

  async saveToDefault(userId: string, productId: string) {
    // 1. Check if "All Saves" collection exists for user
    let defaultCollection = await this.prisma.client.collection.findFirst({
      where: {
        userId,
        name: 'All Saves', // Magic string as requested
      },
    });

    // 2. If not, create it
    if (!defaultCollection) {
      defaultCollection = await this.prisma.client.collection.create({
        data: {
          userId,
          name: 'All Saves',
          description: 'Default collection for saved items',
        },
      });
    }

    try {
      return await this.prisma.client.savedProduct.create({
        data: {
          userId,
          productId,
          collectionId: defaultCollection.id,
        },
      });
    } catch (error: any) {
      // If already saved in this specific collection, return existing or ignore
      if (error.code === 'P2002') {
        return this.prisma.client.savedProduct.findUnique({
             where: { userId_productId_collectionId: { userId, productId, collectionId: defaultCollection.id } },
        });
      }
      if (error.code === 'P2003') {
           throw new NotFoundException('Product not found');
      }
      throw error;
    }
  }

  async unsaveFromDefault(userId: string, productId: string) {
    const defaultCollection = await this.prisma.client.collection.findFirst({
      where: { userId, name: 'All Saves' },
    });

    if (!defaultCollection) {
        throw new NotFoundException('Default collection not found');
    }

    try {
      return await this.prisma.client.savedProduct.delete({
        where: {
          userId_productId_collectionId: {
            userId,
            productId,
            collectionId: defaultCollection.id,
          },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException('Product not found in default collection');
      }
      throw error;
    }
  }

  async saveToCollection(userId: string, collectionId: string, productId: string) {
    const collection = await this.prisma.client.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection || collection.userId !== userId) {
      throw new NotFoundException('Collection not found');
    }

    try {
      return await this.prisma.client.savedProduct.create({
        data: {
            userId,
            productId,
            collectionId,
        },
      });
    } catch (error: any) {
        if (error.code === 'P2002') {
             // Already in this collection, return it
             return this.prisma.client.savedProduct.findUnique({
                 where: { userId_productId_collectionId: { userId, productId, collectionId } },
             });
        }
      if (error.code === 'P2003') {
        throw new NotFoundException('Product not found');
      }
      throw error;
    }
  }

  async unsaveFromCollection(userId: string, collectionId: string, productId: string) {
    // Ideally we verify collection ownership first, but the delete where clause implicitly handles it
    // because we need userId match. However, to return "Collection not found" specifically if the ID is wrong:
    const collection = await this.prisma.client.collection.findUnique({
        where: { id: collectionId },
    });
    if (!collection || collection.userId !== userId) {
        throw new NotFoundException('Collection not found');
    }

    try {
      return await this.prisma.client.savedProduct.delete({
        where: {
          userId_productId_collectionId: {
            userId,
            productId,
            collectionId,
          },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException('Product not found in this collection');
      }
      throw error;
    }
  }

  async createCollection(userId: string, dto: CreateCollectionDto) {
    return this.prisma.client.collection.create({
      data: {
        userId,
        ...dto,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.client.collection.findMany({
      where: { userId },
      include: {
        _count: {
          select: { savedProducts: true },
        },
        // Optionally include some preview images from products
        savedProducts: {
            take: 3,
            include: {
                product: {
                    select: { images: true }
                }
            },
            orderBy: { savedAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, collectionId: string) {
    const collection = await this.prisma.client.collection.findUnique({
      where: { id: collectionId },
      include: {
        savedProducts: {
          include: {
            product: true,
          },
          orderBy: { savedAt: 'desc' },
        },
      },
    });

    if (!collection || collection.userId !== userId) {
      throw new NotFoundException('Collection not found');
    }

    return collection;
  }

  async updateCollection(userId: string, collectionId: string, dto: UpdateCollectionDto) {
    const collection = await this.prisma.client.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection || collection.userId !== userId) {
      throw new NotFoundException('Collection not found');
    }

    return this.prisma.client.collection.update({
      where: { id: collectionId },
      data: dto,
    });
  }

  async deleteCollection(userId: string, collectionId: string) {
    const collection = await this.prisma.client.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection || collection.userId !== userId) {
      throw new NotFoundException('Collection not found');
    }

    // Cascade delete is configured in schema for savedProducts
    return this.prisma.client.collection.delete({
      where: { id: collectionId },
    });
  }
}
