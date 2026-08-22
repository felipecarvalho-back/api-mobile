import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetMessagesQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  since_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 50;
}
