import { IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';


export class SizePreferenceDto {
  @IsOptional()
  @IsString()
  men?: string;

  @IsOptional()
  @IsString()
  women?: string;
}

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
  @Type(() => SizePreferenceDto)
  @ValidateNested()
  topSize?: SizePreferenceDto;

  @IsOptional()
  @Type(() => SizePreferenceDto)
  @ValidateNested()
  bottomSize?: SizePreferenceDto;

  @IsOptional()
  @Type(() => SizePreferenceDto)
  @ValidateNested()
  shoeSize?: SizePreferenceDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  favoriteBrands?: string[];
}

