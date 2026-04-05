import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AppUser } from '../auth/types/app-user.js';
import { TenantMemberGuard } from '../auth/guards/tenant-member.guard.js';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { AdmitParticipantDto } from './dto/admit-participant.dto.js';
import { CreateMeetingDto } from './dto/create-meeting.dto.js';
import { MintMeetingTokenDto } from './dto/mint-meeting-token.dto.js';
import { MuteParticipantTrackDto } from './dto/mute-participant-track.dto.js';
import { RemoveParticipantDto } from './dto/remove-participant.dto.js';
import { StopRecordingDto } from './dto/stop-recording.dto.js';
import { MeetingsService } from './meetings.service.js';

@ApiTags('meetings')
@ApiBearerAuth()
@UseGuards(TenantMemberGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Create an ad-hoc live meeting (you become the host)',
  })
  create(
    @TenantId() organisationId: string,
    @Body() dto: CreateMeetingDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.meetings.createMeeting(organisationId, req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List meetings you host' })
  listMine(
    @TenantId() organisationId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.meetings.listMyMeetings(organisationId, req.user.id);
  }

  @Get(':meetingId')
  @ApiOperation({
    summary: 'Get meeting details (any authenticated member can join)',
  })
  get(
    @TenantId() organisationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.meetings.getMeeting(organisationId, meetingId, req.user.id);
  }

  @Post(':meetingId/token')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Mint a LiveKit access token for this meeting' })
  mintToken(
    @TenantId() organisationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: MintMeetingTokenDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.meetings.mintAccessToken(
      organisationId,
      meetingId,
      req.user.id,
      dto,
    );
  }

  @Get(':meetingId/participants')
  @ApiOperation({ summary: 'List room participants (host only)' })
  listParticipants(
    @TenantId() organisationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.meetings.listParticipants(
      organisationId,
      meetingId,
      req.user.id,
    );
  }

  @Post(':meetingId/admit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Admit a waiting participant (enable publish)' })
  admit(
    @TenantId() organisationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: AdmitParticipantDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.meetings.admitParticipant(
      organisationId,
      meetingId,
      req.user.id,
      dto,
    );
  }

  @Post(':meetingId/participants/mute-track')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mute or unmute a participant track (host only)' })
  muteTrack(
    @TenantId() organisationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: MuteParticipantTrackDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.meetings.muteParticipantTrack(
      organisationId,
      meetingId,
      req.user.id,
      dto,
    );
  }

  @Post(':meetingId/participants/remove')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a participant from the room (host only)' })
  removeParticipant(
    @TenantId() organisationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: RemoveParticipantDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.meetings.removeParticipantFromRoom(
      organisationId,
      meetingId,
      req.user.id,
      dto,
    );
  }

  @Post(':meetingId/recording/start')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Start room composite recording to local disk (host only)',
  })
  startRecording(
    @TenantId() organisationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.meetings.startRecording(organisationId, meetingId, req.user.id);
  }

  @Post(':meetingId/recording/stop')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stop an active egress recording (host only)' })
  stopRecording(
    @TenantId() organisationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: StopRecordingDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.meetings.stopRecording(
      organisationId,
      meetingId,
      req.user.id,
      dto.egress_id,
    );
  }

  @Get(':meetingId/recordings')
  @ApiOperation({ summary: 'List recordings for this meeting (host only)' })
  listRecordings(
    @TenantId() organisationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.meetings.listRecordings(organisationId, meetingId, req.user.id);
  }

  @Get(':meetingId/recordings/:recordingId/file')
  @ApiOperation({ summary: 'Download a completed recording (host only)' })
  @ApiProduces('video/mp4')
  @ApiResponse({ status: 200, description: 'MP4 stream' })
  @Header('Content-Type', 'video/mp4')
  async downloadRecording(
    @TenantId() organisationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('recordingId', ParseUUIDPipe) recordingId: string,
    @Req() req: Request & { user: AppUser },
  ): Promise<StreamableFile> {
    const absolutePath =
      await this.meetings.getRecordingAbsolutePathForDownload(
        organisationId,
        meetingId,
        req.user.id,
        recordingId,
      );
    const stream = createReadStream(absolutePath);
    return new StreamableFile(stream, {
      type: 'video/mp4',
      disposition: `attachment; filename="meeting-${meetingId}-${recordingId}.mp4"`,
    });
  }

  @Post(':meetingId/end')
  @HttpCode(200)
  @ApiOperation({ summary: 'End meeting and delete LiveKit room (host only)' })
  end(
    @TenantId() organisationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.meetings.endMeeting(organisationId, meetingId, req.user.id);
  }
}
