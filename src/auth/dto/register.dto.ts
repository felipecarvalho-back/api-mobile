import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @IsString({ message: 'O nome deve ser uma string' })
  name: string;

  @IsNotEmpty({ message: 'O email é obrigatório' })
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @IsNotEmpty({ message: 'A senha é obrigatória' })
  @IsString({ message: 'A senha deve ser uma string' })
  @MinLength(6, { message: 'A senha deve conter no mínimo 6 caracteres' })
  password: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
