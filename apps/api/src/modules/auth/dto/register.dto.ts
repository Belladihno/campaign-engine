import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  // Collected by the register form; the row is created in the same
  // transaction as the user.
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  workspaceName: string;
}
