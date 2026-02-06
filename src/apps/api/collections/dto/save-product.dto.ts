import { IsNotEmpty, IsUUID } from 'class-validator';

export class SaveProductDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;
}
