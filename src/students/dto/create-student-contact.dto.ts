import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateStudentContactDto {
  @ApiProperty({
    description: 'Full name of the emergency contact',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  contact_name: string;

  @ApiPropertyOptional({
    description: 'Relationship to student (e.g. Parent, Guardian)',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  relationship?: string;

  @ApiProperty({ description: 'Contact phone number', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  phone: string;

  @ApiPropertyOptional({ description: 'Contact email address' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
