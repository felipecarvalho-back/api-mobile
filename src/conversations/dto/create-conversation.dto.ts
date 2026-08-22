import { IsInt, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateConversationDto {
  @IsNotEmpty({ message: 'recipientUserId é obrigatório' })
  @IsInt({ message: 'recipientUserId deve ser um número inteiro' })
  @Type(() => Number)
  recipientUserId: number;
}
