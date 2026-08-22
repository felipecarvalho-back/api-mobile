import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  async getUserConversations(@CurrentUser('id') userId: number) {
    return this.conversationsService.getUserConversations(userId);
  }

  @Post()
  async createConversation(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.findOrCreateDirectConversation(
      userId,
      dto.recipientUserId,
    );
  }
}
