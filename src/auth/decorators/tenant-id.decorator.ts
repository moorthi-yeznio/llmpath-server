import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Extracts the organisation/tenant ID from the `x-organisation-id` request header.
 * Throws BadRequestException when the header is absent.
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const id = req.headers['x-organisation-id'];
    if (!id || typeof id !== 'string') {
      throw new BadRequestException('x-organisation-id header is required');
    }
    return id;
  },
);
