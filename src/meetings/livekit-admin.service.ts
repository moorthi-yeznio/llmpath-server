import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EgressClient, RoomServiceClient } from 'livekit-server-sdk';
import type { AppConfig } from '../config/index.js';

/**
 * Server-side LiveKit Room Service + Egress clients (API key auth).
 */
@Injectable()
export class LiveKitAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LiveKitAdminService.name);
  readonly room: RoomServiceClient;
  readonly egress: EgressClient;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const host = this.config.get('livekitHttpUrl', { infer: true });
    const key = this.config.get('livekitApiKey', { infer: true });
    const secret = this.config.get('livekitApiSecret', { infer: true });
    this.room = new RoomServiceClient(host, key, secret);
    this.egress = new EgressClient(host, key, secret);
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.room.listRooms();
      this.logger.log('LiveKit connectivity verified');
    } catch (err) {
      this.logger.warn(
        `LiveKit server unreachable at startup (${this.config.get('livekitHttpUrl', { infer: true })}): ${String(err)}. Meetings will fail until LiveKit is available.`,
      );
    }
  }
}
