import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateUserStyleProfileDto {
  @IsOptional()
  @IsString()
  @IsEnum(['men', 'women', 'both'])
  genderPreference?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  styleVibe?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  favoriteColorsHex?: string[];

  @IsOptional()
  @IsString()
  topSize?: string;

  @IsOptional()
  @IsString()
  bottomSize?: string;

  @IsOptional()
  @IsString()
  shoeSize?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  favoriteBrands?: string[];
}
