import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateFcmTokenDto {
  @IsNotEmpty({ message: 'fcmToken é obrigatório' })
  @IsString({ message: 'fcmToken deve ser uma string' })
  fcmToken: string;
}
