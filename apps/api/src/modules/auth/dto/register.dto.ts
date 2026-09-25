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

  // Frontend register form collects this (TRD §13 Step 8); the workspace
  // row is created in the same transaction as the user (TRD §7.1).
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  workspaceName: string;
}
