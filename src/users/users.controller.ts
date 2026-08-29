import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  async searchUsers(
    @CurrentUser('id') currentUserId: number,
    @Query('q') query: string,
  ) {
    return this.usersService.searchUsers(query, currentUserId);
  }

  @Get('by-username/:username')
  async findByUsername(
    @CurrentUser('id') currentUserId: number,
    @Param('username') username: string,
  ) {
    return this.usersService.findByUsername(username, currentUserId);
  }

  @Get('contacts')
  async getContacts(@CurrentUser('id') userId: number) {
    return this.usersService.getContacts(userId);
  }

  @Get('blocked')
  async getBlockedUsers(@CurrentUser('id') userId: number) {
    return this.usersService.getBlockedUsers(userId);
  }

  @Post(':id/block')
  async blockUser(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) targetUserId: number,
  ) {
    return this.usersService.blockUser(userId, targetUserId);
  }

  @Delete(':id/unblock')
  async unblockUser(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) targetUserId: number,
  ) {
    return this.usersService.unblockUser(userId, targetUserId);
  }
}

