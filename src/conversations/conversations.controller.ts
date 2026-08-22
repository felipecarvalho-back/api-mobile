import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateConversationRequestDto } from './dto/create-conversation-request.dto';
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

  @Get('requests')
  async getPendingRequests(@CurrentUser('id') userId: number) {
    return this.conversationsService.getPendingRequests(userId);
  }

  @Get('requests/sent')
  async getSentRequests(@CurrentUser('id') userId: number) {
    return this.conversationsService.getSentRequests(userId);
  }

  @Post('request')
  async createConversationRequest(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateConversationRequestDto,
  ) {
    return this.conversationsService.createConversationRequest(userId, dto);
  }

  @Patch(':id/accept')
  async acceptConversation(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) conversationId: number,
  ) {
    return this.conversationsService.acceptConversation(conversationId, userId);
  }

  @Patch(':id/reject')
  async rejectConversation(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) conversationId: number,
  ) {
    return this.conversationsService.rejectConversation(conversationId, userId);
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

