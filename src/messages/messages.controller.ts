import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageStatusDto } from './dto/update-message-status.dto';
import { GetMessagesQueryDto } from './dto/get-messages-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversations/:conversationId/messages')
  async getMessages(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser('id') userId: number,
    @Query() query: GetMessagesQueryDto,
  ) {
    return this.messagesService.getMessages(
      conversationId,
      userId,
      query.since_id,
      query.limit,
    );
  }

  @Post('conversations/:conversationId/messages')
  async sendMessage(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessage(conversationId, userId, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Patch('messages/:id/status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateMessageStatusDto,
  ) {
    return this.messagesService.updateMessageStatus(id, dto.status, userId);
  }
}
