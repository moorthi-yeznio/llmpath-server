import { Controller, Get, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { MeResponseDto } from './dto/index.js';
import type { AppUser } from './types/app-user.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
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
          tenant_id: m.tenantId,
          role: m.role,
        })),
        profile: user.profile,
      },
    };
  }
}
