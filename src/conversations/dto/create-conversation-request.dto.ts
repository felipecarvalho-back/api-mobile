import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateConversationRequestDto {
  @IsNotEmpty({ message: 'O username do destinatário é obrigatório' })
  @IsString({ message: 'recipientUsername deve ser uma string' })
  recipientUsername: string;

  @IsNotEmpty({ message: 'A mensagem inicial é obrigatória' })
  @IsString({ message: 'content deve ser uma string' })
  content: string;

  @IsOptional()
  @IsString()
  tempId?: string;
}
