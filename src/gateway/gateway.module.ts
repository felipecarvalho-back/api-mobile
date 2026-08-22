import { Module, forwardRef } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    forwardRef(() => MessagesModule),
  ],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class GatewayModule {}
