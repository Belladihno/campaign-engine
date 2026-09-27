import {
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// E.164: + followed by 8–15 digits. Africa's Talking rejects anything else,
// so fail at the API boundary, not mid-dispatch.
const E164 = /^\+[1-9]\d{7,14}$/;

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  // Single SMS segment (frontend warns at 140, caps at 160).
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  message: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(E164, { each: true })
  contacts: string[];
}
