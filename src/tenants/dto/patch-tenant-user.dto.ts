import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class PatchTenantUserDto {
  @ApiPropertyOptional({
    description:
      'When true, sets the user account status to disabled (cannot sign in)',
  })
  @IsOptional()
  @IsBoolean()
  banned?: boolean;
}
