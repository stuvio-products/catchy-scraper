import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CollectionsService } from '@/apps/api/collections/collections.service';
import { JwtAuthGuard } from '@/apps/api/auth/guards/jwt-auth.guard';
import { CreateCollectionDto } from '@/apps/api/collections/dto/create-collection.dto';
import { UpdateCollectionDto } from '@/apps/api/collections/dto/update-collection.dto';
import { SaveProductDto } from '@/apps/api/collections/dto/save-product.dto';
import { CurrentUser } from '@/apps/api/auth/decorators/current-user.decorator';
import type { RequestUser } from '@/apps/api/auth/entities/auth.entities';

@Controller('collections')
@UseGuards(JwtAuthGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Post('default/save')
  async saveToDefault(
    @CurrentUser() user: RequestUser,
    @Body() body: SaveProductDto,
  ) {
    console.log('saveToDefault body:', body);
    console.log('saveToDefault productId:', body?.productId);
    return this.collectionsService.saveToDefault(user.id, body.productId);
  }

  @Delete('default/products/:productId')
  async unsaveFromDefault(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
  ) {
    return this.collectionsService.unsaveFromDefault(user.id, productId);
  }

  @Post(':id/save')
  async saveToCollection(
    @CurrentUser() user: RequestUser,
    @Param('id') collectionId: string,
    @Body() body: SaveProductDto,
  ) {
    return this.collectionsService.saveToCollection(
      user.id,
      collectionId,
      body.productId,
    );
  }

  @Delete(':id/products/:productId')
  async unsaveFromCollection(
    @CurrentUser() user: RequestUser,
    @Param('id') collectionId: string,
    @Param('productId') productId: string,
  ) {
    return this.collectionsService.unsaveFromCollection(
      user.id,
      collectionId,
      productId,
    );
  }

  @Post()
  async createCollection(
    @CurrentUser() user: RequestUser,
    @Body() body: CreateCollectionDto,
  ) {
    return this.collectionsService.createCollection(user.id, body);
  }

  @Get()
  async findAll(@CurrentUser() user: RequestUser) {
    return this.collectionsService.findAll(user.id);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.collectionsService.findOne(user.id, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: UpdateCollectionDto,
  ) {
    return this.collectionsService.updateCollection(user.id, id, body);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.collectionsService.deleteCollection(user.id, id);
  }
}
