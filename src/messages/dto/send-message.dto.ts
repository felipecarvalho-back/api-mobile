import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MessageType } from '../../generated/prisma/client';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  tempId?: string;

  @IsNotEmpty({ message: 'O conteúdo da mensagem é obrigatório' })
  @IsString({ message: 'O conteúdo deve ser uma string' })
  content: string;

  @IsOptional()
  @IsEnum(MessageType, {
    message: 'Tipo de mensagem inválido. Permitidos: TEXT, IMAGE, AUDIO',
  })
  type?: MessageType;
}
