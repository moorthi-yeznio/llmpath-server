import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class JoinBatchDto {
  @ApiProperty({ description: '8-char hex join code' })
  @IsString()
  @Length(8, 20)
  join_code!: string;
}
