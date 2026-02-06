import { IsString, IsUrl, IsOptional, IsObject } from 'class-validator';

export class CreateScrapeJobDto {
  @IsUrl({}, { message: 'url must be a valid URL' })
  url: string;

  @IsString()
  domain: string;

  @IsOptional()
  @IsObject()
  options?: {
    waitForSelector?: string;
    timeout?: number;
    screenshot?: boolean;
    userAgent?: string;
  };
}
