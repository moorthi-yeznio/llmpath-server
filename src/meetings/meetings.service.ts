import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { access, mkdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EgressInfo, EncodedFileOutput } from '@livekit/protocol';
import {
  AccessToken,
  EncodedFileType,
  EncodingOptionsPreset,
  EgressStatus,
  type RoomCompositeOptions,
  TwirpError,
} from 'livekit-server-sdk';
import type { AppConfig } from '../config/index.js';
import { DRIZZLE } from '../db/drizzle.constants.js';
import * as schema from '../db/schema.js';
import type { AdmitParticipantDto } from './dto/admit-participant.dto.js';
import type { CreateMeetingDto } from './dto/create-meeting.dto.js';
import type { MintMeetingTokenDto } from './dto/mint-meeting-token.dto.js';
import type { MuteParticipantTrackDto } from './dto/mute-participant-track.dto.js';
import type { RemoveParticipantDto } from './dto/remove-participant.dto.js';
import { LiveKitAdminService } from './livekit-admin.service.js';

function participantIdentityForUser(userId: string): string {
  return `u_${userId}`;
}

function isTerminalEgressStatus(status: EgressStatus): boolean {
  return (
    status === EgressStatus.EGRESS_COMPLETE ||
    status === EgressStatus.EGRESS_FAILED ||
    status === EgressStatus.EGRESS_ABORTED
  );
}

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly livekit: LiveKitAdminService,
  ) {}

  private recordingsDir(): string {
    return this.config.get('livekitRecordingsDir', { infer: true });
  }

  private egressFilePrefix(): string {
    return this.config
      .get('livekitEgressFilePrefix', { infer: true })
      .replace(/\/$/, '');
  }

  private async loadMeeting(meetingId: string, organisationId: string) {
    const [row] = await this.db
      .select()
      .from(schema.liveMeetings)
      .where(
        and(
          eq(schema.liveMeetings.id, meetingId),
          eq(schema.liveMeetings.organisationId, organisationId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private assertHost(
    meeting: typeof schema.liveMeetings.$inferSelect,
    userId: string,
  ): void {
    if (meeting.hostUserId !== userId) {
      throw new ForbiddenException(
        'Only the meeting host can perform this action',
      );
    }
  }

  private resolveRecordingFile(relativeFilePath: string): string {
    const root = resolve(this.recordingsDir());
    const full = resolve(join(root, relativeFilePath));
    const rel = relative(root, full);
    if (rel.startsWith('..') || rel.includes('..')) {
      throw new BadRequestException('Invalid recording path');
    }
    return full;
  }

  /**
   * LiveKit may report the final path in file_results; map container path (/out/...) to relative path under LIVEKIT_RECORDINGS_DIR.
   */
  private relativePathFromCompletedEgress(
    info: EgressInfo,
  ): string | undefined {
    const prefix = this.egressFilePrefix().replace(/\/$/, '');
    const normalize = (s: string) =>
      s
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^file:\/\//, '');

    const stripContainerPrefix = (raw: string): string | undefined => {
      const norm = normalize(raw);
      if (!norm) {
        return undefined;
      }
      if (norm === prefix || norm === `${prefix}/`) {
        return '';
      }
      if (norm.startsWith(`${prefix}/`)) {
        return norm.slice(prefix.length + 1);
      }
      if (!norm.startsWith('/')) {
        return norm;
      }
      return undefined;
    };

    const first = info.fileResults?.[0];
    if (first) {
      const raw = first.location || first.filename;
      if (raw) {
        const rel = stripContainerPrefix(raw);
        if (rel !== undefined) {
          return rel || undefined;
        }
      }
    }

    if (info.result?.case === 'file' && info.result.value) {
      const legacy = info.result.value;
      const raw = legacy.location || legacy.filename;
      if (raw) {
        const rel = stripContainerPrefix(raw);
        if (rel !== undefined) {
          return rel || undefined;
        }
      }
    }

    return undefined;
  }

  async createMeeting(
    organisationId: string,
    hostUserId: string,
    dto: CreateMeetingDto,
  ) {
    const livekitRoomName = randomUUID();
    const [created] = await this.db
      .insert(schema.liveMeetings)
      .values({
        hostUserId,
        organisationId,
        livekitRoomName,
        title: dto.title ?? null,
        status: 'active',
      })
      .returning();

    try {
      await this.livekit.room.createRoom({
        name: livekitRoomName,
        emptyTimeout: 300,
        maxParticipants: 100,
      });
    } catch (err) {
      this.logger.warn(
        `LiveKit createRoom failed (room may be created on first join): ${String(err)}`,
      );
    }

    return {
      meeting: {
        id: created.id,
        livekit_room_name: created.livekitRoomName,
        title: created.title,
        status: created.status,
        host_user_id: created.hostUserId,
        created_at: created.createdAt,
      },
    };
  }

  async listMyMeetings(
    organisationId: string,
    hostUserId: string,
    limit = 20,
    cursor?: string, // ISO timestamp — return meetings older than this
  ) {
    const conditions = [
      eq(schema.liveMeetings.organisationId, organisationId),
      eq(schema.liveMeetings.hostUserId, hostUserId),
    ];

    if (cursor) {
      conditions.push(lt(schema.liveMeetings.createdAt, new Date(cursor)));
    }

    const rows = await this.db
      .select()
      .from(schema.liveMeetings)
      .where(and(...conditions))
      .orderBy(desc(schema.liveMeetings.createdAt))
      .limit(limit);

    const nextCursor =
      rows.length === limit
        ? rows[rows.length - 1]?.createdAt?.toISOString()
        : null;

    return {
      meetings: rows.map((m) => ({
        id: m.id,
        livekit_room_name: m.livekitRoomName,
        title: m.title,
        status: m.status,
        created_at: m.createdAt,
      })),
      next_cursor: nextCursor,
    };
  }

  async getMeeting(organisationId: string, meetingId: string, userId: string) {
    const meeting = await this.loadMeeting(meetingId, organisationId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    return {
      meeting: {
        id: meeting.id,
        livekit_room_name: meeting.livekitRoomName,
        title: meeting.title,
        status: meeting.status,
        host_user_id: meeting.hostUserId,
        created_at: meeting.createdAt,
      },
      is_host: meeting.hostUserId === userId,
    };
  }

  async mintAccessToken(
    organisationId: string,
    meetingId: string,
    userId: string,
    dto: MintMeetingTokenDto,
  ) {
    const meeting = await this.loadMeeting(meetingId, organisationId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    if (meeting.status !== 'active') {
      throw new BadRequestException('Meeting has ended');
    }

    const identity = participantIdentityForUser(userId);
    const isHost = meeting.hostUserId === userId;
    const useWaiting = !isHost && dto.use_waiting_room !== false;

    const key = this.config.get('livekitApiKey', { infer: true });
    const secret = this.config.get('livekitApiSecret', { infer: true });

    const metadata = JSON.stringify({
      role: isHost ? 'host' : 'participant',
      meeting_id: meetingId,
    });

    const token = new AccessToken(key, secret, {
      identity,
      name: dto.display_name,
      ttl: '2h',
      metadata,
    });

    token.addGrant({
      roomJoin: true,
      room: meeting.livekitRoomName,
      canSubscribe: true,
      canPublish: !useWaiting,
      canPublishData: true,
    });

    const jwt = await token.toJwt();
    return {
      token: jwt,
      participant_identity: identity,
      livekit_room_name: meeting.livekitRoomName,
    };
  }

  async listParticipants(
    organisationId: string,
    meetingId: string,
    userId: string,
  ) {
    const meeting = await this.loadMeeting(meetingId, organisationId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    this.assertHost(meeting, userId);

    const participants = await this.livekit.room.listParticipants(
      meeting.livekitRoomName,
    );

    return {
      participants: participants.map((p) => ({
        identity: p.identity,
        name: p.name,
        state: p.state,
        metadata: p.metadata,
        tracks: (p.tracks ?? []).map((t) => ({
          sid: t.sid,
          type: t.type,
          muted: t.muted,
        })),
      })),
    };
  }

  async admitParticipant(
    organisationId: string,
    meetingId: string,
    userId: string,
    dto: AdmitParticipantDto,
  ) {
    const meeting = await this.loadMeeting(meetingId, organisationId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    this.assertHost(meeting, userId);

    await this.livekit.room.updateParticipant(
      meeting.livekitRoomName,
      dto.participant_identity,
      {
        permission: {
          canSubscribe: true,
          canPublish: true,
          canPublishData: true,
        },
      },
    );

    return { admitted: true as const };
  }

  async admitAll(organisationId: string, meetingId: string, userId: string) {
    const meeting = await this.loadMeeting(meetingId, organisationId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    this.assertHost(meeting, userId);

    const participants = await this.livekit.room.listParticipants(
      meeting.livekitRoomName,
    );
    const waiting = participants.filter(
      (p) => p.permission && !p.permission.canPublish,
    );

    await Promise.all(
      waiting.map((p) =>
        this.livekit.room.updateParticipant(
          meeting.livekitRoomName,
          p.identity,
          {
            permission: {
              canSubscribe: true,
              canPublish: true,
              canPublishData: true,
            },
          },
        ),
      ),
    );

    return { admitted_count: waiting.length };
  }

  async muteParticipantTrack(
    organisationId: string,
    meetingId: string,
    userId: string,
    dto: MuteParticipantTrackDto,
  ) {
    const meeting = await this.loadMeeting(meetingId, organisationId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    this.assertHost(meeting, userId);

    await this.livekit.room.mutePublishedTrack(
      meeting.livekitRoomName,
      dto.participant_identity,
      dto.track_sid,
      dto.muted,
    );

    return { ok: true as const };
  }

  async removeParticipantFromRoom(
    organisationId: string,
    meetingId: string,
    userId: string,
    dto: RemoveParticipantDto,
  ) {
    const meeting = await this.loadMeeting(meetingId, organisationId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    this.assertHost(meeting, userId);

    await this.livekit.room.removeParticipant(
      meeting.livekitRoomName,
      dto.participant_identity,
    );

    return { ok: true as const };
  }

  private mapEgressStatus(
    status: EgressStatus,
  ): 'starting' | 'active' | 'completed' | 'failed' | 'aborted' {
    switch (status) {
      case EgressStatus.EGRESS_STARTING:
        return 'starting';
      case EgressStatus.EGRESS_ACTIVE:
      case EgressStatus.EGRESS_ENDING:
        return 'active';
      case EgressStatus.EGRESS_COMPLETE:
        return 'completed';
      case EgressStatus.EGRESS_FAILED:
        return 'failed';
      case EgressStatus.EGRESS_ABORTED:
        return 'aborted';
      default:
        return 'active';
    }
  }

  async syncRecordingRow(
    row: typeof schema.liveMeetingRecordings.$inferSelect,
    relativePath: string,
  ) {
    const [info] = await this.livekit.egress.listEgress({
      egressId: row.egressId,
    });
    if (!info) {
      return row;
    }

    const mapped = this.mapEgressStatus(info.status);
    const errorMessage = info.error || null;

    let nextStatus = mapped;
    let nextRel = row.relativeFilePath;
    let nextError: string | null = row.errorMessage;

    if (mapped === 'failed' || mapped === 'aborted') {
      nextError = errorMessage;
    } else if (mapped === 'completed') {
      nextRel = this.relativePathFromCompletedEgress(info) ?? relativePath;
      try {
        await access(this.resolveRecordingFile(nextRel));
        nextError = null;
      } catch {
        nextStatus = 'failed';
        nextError =
          'Recording file is missing on the API host. Room composite egress needs Chrome: add `cap_add: [SYS_ADMIN]` to the egress service in docker-compose, then `docker compose ... up -d` again. See https://docs.livekit.io/home/self-hosting/egress/';
        this.logger.warn(
          `Egress ${row.egressId} completed in LiveKit but MP4 missing at ${this.resolveRecordingFile(nextRel)}`,
        );
      }
    }

    await this.db
      .update(schema.liveMeetingRecordings)
      .set({
        status: nextStatus,
        relativeFilePath: nextRel,
        errorMessage: nextError,
        completedAt:
          nextStatus === 'completed' ||
          nextStatus === 'failed' ||
          nextStatus === 'aborted'
            ? (row.completedAt ?? new Date())
            : row.completedAt,
      })
      .where(eq(schema.liveMeetingRecordings.id, row.id));

    const [updated] = await this.db
      .select()
      .from(schema.liveMeetingRecordings)
      .where(eq(schema.liveMeetingRecordings.id, row.id))
      .limit(1);

    return updated ?? row;
  }

  async startRecording(
    organisationId: string,
    meetingId: string,
    userId: string,
  ) {
    const meeting = await this.loadMeeting(meetingId, organisationId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    this.assertHost(meeting, userId);
    if (meeting.status !== 'active') {
      throw new BadRequestException('Meeting has ended');
    }

    const [activeRec] = await this.db
      .select({ id: schema.liveMeetingRecordings.id })
      .from(schema.liveMeetingRecordings)
      .where(
        and(
          eq(schema.liveMeetingRecordings.meetingId, meetingId),
          inArray(schema.liveMeetingRecordings.status, ['starting', 'active']),
        ),
      )
      .limit(1);

    if (activeRec) {
      throw new ConflictException(
        'A recording is already in progress for this meeting',
      );
    }

    const recordingId = randomUUID();
    const relativePath = `${meetingId}/${recordingId}.mp4`;
    const egressPath = `${this.egressFilePrefix()}/${relativePath}`;

    await mkdir(join(this.recordingsDir(), meetingId), { recursive: true });

    const fileOut = new EncodedFileOutput({
      filepath: egressPath,
      fileType: EncodedFileType.MP4,
    });

    const compositeOpts: RoomCompositeOptions = {
      layout: this.config.get('livekitRecordingLayout', { infer: true }),
      encodingOptions: EncodingOptionsPreset.H264_720P_30,
    };
    const customTemplate = this.config.get('livekitEgressCustomBaseUrl', {
      infer: true,
    });
    if (customTemplate) {
      compositeOpts.customBaseUrl = customTemplate;
    }

    const egressInfo = await this.livekit.egress.startRoomCompositeEgress(
      meeting.livekitRoomName,
      fileOut,
      compositeOpts,
    );

    await this.db.insert(schema.liveMeetingRecordings).values({
      id: recordingId,
      meetingId,
      egressId: egressInfo.egressId,
      relativeFilePath: relativePath,
      status: 'starting',
    });

    return {
      recording: {
        id: recordingId,
        egress_id: egressInfo.egressId,
        status: 'starting',
        relative_file_path: relativePath,
      },
    };
  }

  async stopRecording(
    organisationId: string,
    meetingId: string,
    userId: string,
    egressId: string,
  ) {
    const meeting = await this.loadMeeting(meetingId, organisationId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    this.assertHost(meeting, userId);

    const [row] = await this.db
      .select()
      .from(schema.liveMeetingRecordings)
      .where(
        and(
          eq(schema.liveMeetingRecordings.meetingId, meetingId),
          eq(schema.liveMeetingRecordings.egressId, egressId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException('Recording not found');
    }

    const [egressInfo] = await this.livekit.egress.listEgress({ egressId });
    const alreadyTerminal =
      egressInfo !== undefined && isTerminalEgressStatus(egressInfo.status);

    if (!alreadyTerminal) {
      try {
        await this.livekit.egress.stopEgress(egressId);
      } catch (err) {
        const isAlreadyTerminal =
          err instanceof TwirpError &&
          err.status === 412 &&
          err.code === 'failed_precondition';
        if (!isAlreadyTerminal) {
          throw err;
        }
        this.logger.debug(`stopEgress no-op (already terminal): ${egressId}`);
      }
    }

    const relativePath = row.relativeFilePath ?? `${meetingId}/${row.id}.mp4`;
    const synced = await this.syncRecordingRow(row, relativePath);

    return {
      recording: {
        id: synced.id,
        egress_id: synced.egressId,
        status: synced.status,
        relative_file_path: synced.relativeFilePath,
        error_message: synced.errorMessage,
      },
    };
  }

  async listRecordings(
    organisationId: string,
    meetingId: string,
    userId: string,
  ) {
    const meeting = await this.loadMeeting(meetingId, organisationId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    this.assertHost(meeting, userId);

    const rows = await this.db
      .select()
      .from(schema.liveMeetingRecordings)
      .where(eq(schema.liveMeetingRecordings.meetingId, meetingId))
      .orderBy(desc(schema.liveMeetingRecordings.createdAt));

    return {
      recordings: rows.map((r) => ({
        id: r.id,
        egress_id: r.egressId,
        status: r.status,
        relative_file_path: r.relativeFilePath,
        error_message: r.errorMessage,
        created_at: r.createdAt,
        completed_at: r.completedAt,
      })),
    };
  }

  async getRecordingAbsolutePathForDownload(
    organisationId: string,
    meetingId: string,
    userId: string,
    recordingId: string,
  ): Promise<string> {
    const meeting = await this.loadMeeting(meetingId, organisationId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    this.assertHost(meeting, userId);

    const [initial] = await this.db
      .select()
      .from(schema.liveMeetingRecordings)
      .where(
        and(
          eq(schema.liveMeetingRecordings.id, recordingId),
          eq(schema.liveMeetingRecordings.meetingId, meetingId),
        ),
      )
      .limit(1);

    if (!initial) {
      throw new NotFoundException('Recording not found');
    }

    const fallbackRel = `${meetingId}/${initial.id}.mp4`;
    const rel = initial.relativeFilePath ?? fallbackRel;
    const row = await this.syncRecordingRow(initial, rel);

    if (row.status !== 'completed' || !row.relativeFilePath) {
      throw new BadRequestException('Recording is not ready for download');
    }

    const absolute = this.resolveRecordingFile(row.relativeFilePath);
    try {
      await access(absolute);
    } catch {
      this.logger.warn(
        `Recording MP4 missing at ${absolute} (LIVEKIT_RECORDINGS_DIR=${this.recordingsDir()})`,
      );
      throw new NotFoundException(
        'Recording file is not on this server. Set LIVEKIT_RECORDINGS_DIR to the same host folder ' +
          'that is mounted into the egress container as /out (see docker-compose.livekit.yml and .env.example).',
      );
    }

    return absolute;
  }

  async endMeeting(organisationId: string, meetingId: string, userId: string) {
    const meeting = await this.loadMeeting(meetingId, organisationId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    this.assertHost(meeting, userId);

    try {
      await this.livekit.room.deleteRoom(meeting.livekitRoomName);
    } catch (err) {
      this.logger.warn(`deleteRoom: ${String(err)}`);
    }

    await this.db
      .update(schema.liveMeetings)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(eq(schema.liveMeetings.id, meetingId));

    return { ended: true as const };
  }

  async handleEgressEvent(info: EgressInfo) {
    const [row] = await this.db
      .select()
      .from(schema.liveMeetingRecordings)
      .where(eq(schema.liveMeetingRecordings.egressId, info.egressId))
      .limit(1);

    if (!row) return;

    const mapped = this.mapEgressStatus(info.status);
    const errorMessage = info.error || null;

    let nextStatus = mapped;
    let nextRel = row.relativeFilePath;
    let nextError: string | null = row.errorMessage;

    if (mapped === 'failed' || mapped === 'aborted') {
      nextError = errorMessage;
    } else if (mapped === 'completed') {
      nextRel = this.relativePathFromCompletedEgress(info) ?? nextRel;
      if (nextRel) {
        try {
          await access(this.resolveRecordingFile(nextRel));
          nextError = null;
        } catch {
          nextStatus = 'failed';
          nextError =
            'Recording file missing on API host. Ensure livekit-recordings volume is mounted identically in egress and API containers.';
          this.logger.warn(
            `Egress ${info.egressId} completed but MP4 missing at ${nextRel}`,
          );
        }
      }
    }

    const isTerminal = ['completed', 'failed', 'aborted'].includes(nextStatus);
    await this.db
      .update(schema.liveMeetingRecordings)
      .set({
        status: nextStatus,
        relativeFilePath: nextRel,
        errorMessage: nextError,
        completedAt: isTerminal
          ? (row.completedAt ?? new Date())
          : row.completedAt,
      })
      .where(eq(schema.liveMeetingRecordings.id, row.id));
  }

  async handleRoomFinished(roomName: string) {
    const [meeting] = await this.db
      .select()
      .from(schema.liveMeetings)
      .where(eq(schema.liveMeetings.livekitRoomName, roomName))
      .limit(1);

    if (!meeting || meeting.status === 'ended') return;

    // End active recordings first
    await this.db
      .update(schema.liveMeetingRecordings)
      .set({ status: 'aborted', completedAt: new Date() })
      .where(
        and(
          eq(schema.liveMeetingRecordings.meetingId, meeting.id),
          inArray(schema.liveMeetingRecordings.status, ['starting', 'active']),
        ),
      );

    await this.db
      .update(schema.liveMeetings)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(eq(schema.liveMeetings.id, meeting.id));

    this.logger.log(
      `Meeting ${meeting.id} auto-ended via RoomFinished webhook`,
    );
  }
}
