import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { MeResponseDto, UpdateProfileDto } from './dto/index.js';
import { AcceptInviteDto } from './dto/accept-invite.dto.js';
import type { AppUser } from './types/app-user.js';
import { AuthService } from './auth.service.js';
import { Public } from '../common/decorators/public.decorator.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('invite')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiQuery({ name: 'token', required: true })
  @ApiOperation({ summary: 'Preview invite details (no auth required)' })
  getInvitePreview(@Query('token') token: string) {
    return this.authService.getInvitePreview(token);
  }

  @Post('accept-invite')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Accept an invite and create/join the organisation (no auth required)',
  })
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.authService.acceptInvite(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Current authenticated user, roles, and tenant memberships',
    description:
      'Login, logout, and token refresh are handled by Supabase Auth on the client. ' +
      'Send the Supabase access_token as a Bearer token to this endpoint.',
  })
  @ApiResponse({ status: 200, type: MeResponseDto })
  me(@Req() req: Request & { user: AppUser }): MeResponseDto {
    const user = req.user;
    return {
      user: {
        id: user.id,
        email: user.email,
        is_platform_admin: user.isPlatformAdmin,
        memberships: user.memberships.map((m) => ({
          organisation_id: m.organisationId,
          role: m.role,
        })),
        profile: user.profile,
      },
    };
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update the authenticated user's profile" })
  @ApiResponse({ status: 200, type: MeResponseDto })
  async updateMe(
    @Body() dto: UpdateProfileDto,
    @Req() req: Request & { user: AppUser },
  ): Promise<MeResponseDto> {
    await this.authService.updateProfile(req.user.id, dto);
    const updated = await this.authService.loadAppUserById(
      req.user.id,
      req.user.email,
    );
    return {
      user: {
        id: updated.id,
        email: updated.email,
        is_platform_admin: updated.isPlatformAdmin,
        memberships: updated.memberships.map((m) => ({
          organisation_id: m.organisationId,
          role: m.role,
        })),
        profile: updated.profile,
      },
    };
  }
}
