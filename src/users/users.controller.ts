import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('contacts')
  async getContacts(@CurrentUser('id') userId: number) {
    return this.usersService.getContacts(userId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('fcm-token')
  async updateFcmToken(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateFcmTokenDto,
  ) {
    return this.usersService.updateFcmToken(userId, dto.fcmToken);
  }
}
