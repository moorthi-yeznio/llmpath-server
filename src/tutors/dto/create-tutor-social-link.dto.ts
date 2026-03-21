import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUrl } from 'class-validator';

export const SOCIAL_PLATFORMS = [
  'linkedin',
  'website',
  'twitter',
  'github',
  'youtube',
  'other',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export class CreateTutorSocialLinkDto {
  @ApiProperty({ enum: SOCIAL_PLATFORMS })
  @IsEnum(SOCIAL_PLATFORMS)
  platform!: SocialPlatform;

  @ApiProperty({ description: 'Profile URL' })
  @IsUrl()
  url!: string;
}
