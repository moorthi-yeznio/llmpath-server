import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { MeResponseDto, UpdateProfileDto } from './dto/index.js';
import type { AppUser } from './types/app-user.js';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
