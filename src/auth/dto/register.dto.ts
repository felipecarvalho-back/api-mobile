import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({ message: 'O username é obrigatório' })
  @IsString({ message: 'O username deve ser uma string' })
  @MinLength(3, { message: 'O username deve conter no mínimo 3 caracteres' })
  @MaxLength(30, { message: 'O username deve conter no máximo 30 caracteres' })
  @Matches(/^[a-z0-9_.]+$/, {
    message: 'Username deve conter apenas letras minúsculas, números, ponto e underline',
  })
  username: string;

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

