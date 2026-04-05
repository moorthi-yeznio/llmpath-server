import { Module } from '@nestjs/common';
import { LiveKitAdminService } from './livekit-admin.service.js';
import { MeetingsController } from './meetings.controller.js';
import { MeetingsService } from './meetings.service.js';
import { LiveKitWebhooksController } from './webhooks.controller.js';

@Module({
  controllers: [MeetingsController, LiveKitWebhooksController],
  providers: [MeetingsService, LiveKitAdminService],
})
export class MeetingsModule {}
