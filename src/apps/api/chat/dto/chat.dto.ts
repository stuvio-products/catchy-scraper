import { IsString, IsNotEmpty } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  text: string;
}

export class ChatStateDto {
  chatId: string;
  currentQuery: string;
  filters: any;
}
