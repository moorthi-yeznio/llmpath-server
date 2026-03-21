import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'URL-safe unique slug' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}
