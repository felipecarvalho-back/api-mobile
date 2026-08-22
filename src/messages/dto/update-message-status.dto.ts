import { IsEnum, IsNotEmpty } from 'class-validator';
import { MessageStatus } from '@prisma/client';

export class UpdateMessageStatusDto {
  @IsNotEmpty({ message: 'status é obrigatório' })
  @IsEnum(MessageStatus, {
    message: 'Status inválido. Permitidos: SENT, DELIVERED, READ',
  })
  status: MessageStatus;
}
