import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTutorCertificationDto {
  @ApiProperty({ description: 'Certification name', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Issuing organisation', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuer?: string;

  @ApiPropertyOptional({ description: 'Issue date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  issued_at?: string;

  @ApiPropertyOptional({ description: 'Expiry date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  expires_at?: string;

  @ApiPropertyOptional({ description: 'URL to verify credential' })
  @IsOptional()
  @IsUrl()
  credential_url?: string;
}
