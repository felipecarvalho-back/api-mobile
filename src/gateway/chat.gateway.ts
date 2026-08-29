import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, forwardRef, Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { MessagesService } from '../messages/messages.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  // userId -> Set<socketId>
  private userSockets = new Map<number, Set<string>>();
  // socketId -> userId
  private socketUsers = new Map<string, number>();
  // roomName (e.g. 'conversation_10') -> Set<userId>
  private roomUsers = new Map<string, Set<number>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      let token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization ||
        client.handshake.query?.token;

      if (Array.isArray(token)) {
        token = token[0];
      }

      if (token && typeof token === 'string' && token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      if (!token || typeof token !== 'string') {
        this.logger.warn(`Conexão rejeitada para socket ${client.id}: Token não fornecido`);
        client.disconnect();
        return;
      }

      const secret = this.configService.get<string>('JWT_SECRET') || 'default_secret';
      const payload = this.jwtService.verify(token, { secret });

      if (!payload || !payload.sub) {
        this.logger.warn(`Conexão rejeitada para socket ${client.id}: Payload inválido`);
        client.disconnect();
        return;
      }

      const userId = Number(payload.sub);
      client.data.user = { id: userId, email: payload.email };

      // Verificar se o usuário ainda existe no banco de dados
      const user = await this.usersService.findById(userId).catch(() => null);
      if (!user) {
        this.logger.warn(`Conexão rejeitada para socket ${client.id}: Usuário ${userId} não existe no banco`);
        client.disconnect();
        return;
      }

      // Entrar na sala pessoal do usuário para notificações diretas
      client.join(`user_${userId}`);

      // Registrar socket
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      this.socketUsers.set(client.id, userId);

      await this.usersService.updateLastSeen(userId);
      this.logger.log(`Usuário ${userId} (@${user.username}) conectado no socket ${client.id}`);
    } catch (error) {
      this.logger.warn(`Erro na autenticação do socket ${client.id}: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const userId = this.socketUsers.get(client.id);
      if (userId) {
        const userSocketsSet = this.userSockets.get(userId);
        if (userSocketsSet) {
          userSocketsSet.delete(client.id);
          if (userSocketsSet.size === 0) {
            this.userSockets.delete(userId);
            await this.usersService.updateLastSeen(userId);
          }
        }
        this.socketUsers.delete(client.id);

        // Limpar das salas
        for (const [room, users] of this.roomUsers.entries()) {
          if (!this.isUserConnectedToRoom(userId, room)) {
            users.delete(userId);
          }
        }
        this.logger.log(`Usuário ${userId} desconectou o socket ${client.id}`);
      }
    } catch (error) {
      this.logger.warn(`Erro ao processar desconexão do socket ${client.id}: ${error.message}`);
    }
  }

  @SubscribeMessage('join_room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number },
  ) {
    const userId = client.data.user?.id;
    if (!userId || !data?.conversationId) return;

    const roomName = `conversation_${data.conversationId}`;
    client.join(roomName);

    if (!this.roomUsers.has(roomName)) {
      this.roomUsers.set(roomName, new Set());
    }
    this.roomUsers.get(roomName)!.add(userId);

    this.logger.debug(`Usuário ${userId} entrou na sala ${roomName}`);
    return { event: 'joined_room', conversationId: data.conversationId };
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number },
  ) {
    const userId = client.data.user?.id;
    if (!userId || !data?.conversationId) return;

    const roomName = `conversation_${data.conversationId}`;
    client.leave(roomName);

    if (!this.isUserConnectedToRoom(userId, roomName)) {
      this.roomUsers.get(roomName)?.delete(userId);
    }

    this.logger.debug(`Usuário ${userId} saiu da sala ${roomName}`);
    return { event: 'left_room', conversationId: data.conversationId };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: number;
      tempId?: string;
      content: string;
      type?: any;
    },
  ) {
    const userId = client.data.user?.id;
    if (!userId || !data?.conversationId || !data?.content) return;

    return this.messagesService.sendMessage(data.conversationId, userId, {
      tempId: data.tempId,
      content: data.content,
      type: data.type,
    });
  }

  @SubscribeMessage('message_status')
  async handleMessageStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: number; status: 'DELIVERED' | 'READ' },
  ) {
    const userId = client.data.user?.id;
    if (!userId || !data?.messageId || !data?.status) return;

    return this.messagesService.updateMessageStatus(
      data.messageId,
      data.status,
      userId,
    );
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number },
  ) {
    const userId = client.data.user?.id;
    if (!userId || !data?.conversationId) return;

    return this.messagesService.markConversationAsReadDirect(
      data.conversationId,
      userId,
    );
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number; isTyping: boolean },
  ) {
    const userId = client.data.user?.id;
    if (!userId || !data?.conversationId) return;

    const roomName = `conversation_${data.conversationId}`;
    client.to(roomName).emit('user_typing', {
      conversationId: data.conversationId,
      userId,
      isTyping: !!data.isTyping,
    });
  }

  // Métodos auxiliares para disparo de eventos pelo MessagesService e ConversationsService

  emitToUser(userId: number, event: string, payload: any) {
    const roomName = `user_${userId}`;
    this.server?.to(roomName).emit(event, payload);
  }

  broadcastNewMessageRequest(recipientId: number, data: any) {
    this.emitToUser(recipientId, 'new_message_request', data);
  }

  broadcastConversationAccepted(
    conversationId: number,
    initiatorId: number,
    data: any,
  ) {
    this.emitToUser(initiatorId, 'conversation_accepted', data);
    const roomName = `conversation_${conversationId}`;
    this.server?.to(roomName).emit('conversation_accepted', data);
  }

  broadcastConversationRejected(
    conversationId: number,
    initiatorId: number,
    data: any,
  ) {
    this.emitToUser(initiatorId, 'conversation_rejected', data);
    const roomName = `conversation_${conversationId}`;
    this.server?.to(roomName).emit('conversation_rejected', data);
  }

  broadcastNewMessage(conversationId: number, message: any) {
    const roomName = `conversation_${conversationId}`;
    this.server?.to(roomName).emit('new_message', message);
  }

  broadcastMessageStatus(
    conversationId: number,
    messageId: number,
    status: string,
  ) {
    const roomName = `conversation_${conversationId}`;
    this.server?.to(roomName).emit('message_status', {
      messageId,
      status,
    });
  }

  broadcastMessagesRead(
    conversationId: number,
    readerUserId: number,
  ) {
    const roomName = `conversation_${conversationId}`;
    this.server?.to(roomName).emit('messages_read', {
      conversationId,
      readerUserId,
      status: 'READ',
      readAt: new Date(),
    });
  }

  isUserActiveInRoom(conversationId: number, userId: number): boolean {
    const roomName = `conversation_${conversationId}`;
    return this.roomUsers.get(roomName)?.has(userId) || false;
  }

  private isUserConnectedToRoom(userId: number, roomName: string): boolean {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || !this.server) return false;

    for (const socketId of socketIds) {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket && socket.rooms.has(roomName)) {
        return true;
      }
    }
    return false;
  }
}

