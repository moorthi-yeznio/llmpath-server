import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import type { AppConfig } from '../config/index.js';
import { MeetingsService } from './meetings.service.js';

@ApiExcludeController()
@Controller('webhooks/livekit')
export class LiveKitWebhooksController {
  private readonly logger = new Logger(LiveKitWebhooksController.name);
  private readonly receiver: WebhookReceiver;

  constructor(
    private readonly meetings: MeetingsService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.receiver = new WebhookReceiver(
      config.get('livekitApiKey', { infer: true }),
      config.get('livekitApiSecret', { infer: true }),
    );
  }

  @Post()
  @HttpCode(200)
  @Public()
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authorization: string,
  ) {
    const body = req.rawBody;
    if (!body) {
      throw new BadRequestException('Missing raw body');
    }

    let event: Awaited<ReturnType<WebhookReceiver['receive']>>;
    try {
      event = await this.receiver.receive(body.toString(), authorization);
    } catch (err) {
      this.logger.warn(`Webhook signature verification failed: ${String(err)}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.debug(`LiveKit webhook: ${event.event}`);

    switch (event.event) {
      case 'egress_started':
      case 'egress_updated':
      case 'egress_ended':
        if (event.egressInfo) {
          await this.meetings.handleEgressEvent(event.egressInfo);
        }
        break;

      case 'room_finished':
        if (event.room?.name) {
          await this.meetings.handleRoomFinished(event.room.name);
        }
        break;

      default:
        break;
    }

    return { ok: true };
  }
}
