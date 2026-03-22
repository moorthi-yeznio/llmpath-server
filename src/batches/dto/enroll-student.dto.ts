import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class EnrollStudentDto {
  @ApiProperty({ description: 'Student user UUID' })
  @IsUUID()
  student_id!: string;
}
