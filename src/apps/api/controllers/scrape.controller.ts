import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Logger,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  QUEUE_CONFIG,
} from '../../../shared/queue/queue.constants';
import { ScrapeJob } from '../../../shared/queue/interfaces/scrape-job.interface';
import { CreateScrapeJobDto } from '../dto/create-scrape-job.dto';
import { v4 as uuidv4 } from 'uuid';

@Controller('scrape')
export class ScrapeController {
  private readonly logger = new Logger(ScrapeController.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCRAPE_QUEUE)
    private readonly scrapeQueue: Queue,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async createScrapeJob(@Body() createJobDto: CreateScrapeJobDto) {
    const jobId = uuidv4();

    const jobData: ScrapeJob = {
      jobId,
      url: createJobDto.url,
      domain: createJobDto.domain,
      options: createJobDto.options,
      createdAt: new Date(),
    };

    this.logger.log(
      `Enqueueing scrape job ${jobId} for ${createJobDto.domain}`,
    );

    await this.scrapeQueue.add('scrape', jobData, {
      jobId,
      ...QUEUE_CONFIG,
    });

    return {
      jobId,
      status: 'queued',
      message: 'Scrape job enqueued successfully',
    };
  }

  @Get(':jobId')
  async getJobStatus(@Param('jobId') jobId: string) {
    this.logger.debug(`Fetching status for job ${jobId}`);

    const job = await this.scrapeQueue.getJob(jobId);

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const state = await job.getState();
    const progress = job.progress;
    const returnValue = job.returnvalue;
    const failedReason = job.failedReason;

    return {
      jobId,
      status: state,
      progress,
      result: returnValue,
      error: failedReason,
      createdAt: new Date(job.timestamp),
      processedOn: job.processedOn ? new Date(job.processedOn) : null,
      finishedOn: job.finishedOn ? new Date(job.finishedOn) : null,
    };
  }
}
