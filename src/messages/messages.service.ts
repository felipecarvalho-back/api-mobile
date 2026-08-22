import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { MessageStatus, MessageType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatGateway } from '../gateway/chat.gateway';
import { FcmService } from '../notifications/fcm.service';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    private readonly fcmService: FcmService,
  ) {}

  async getMessages(
    conversationId: number,
    userId: number,
    sinceId?: number,
    limit = 50,
  ) {
    const isParticipant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!isParticipant) {
      throw new ForbiddenException('Você não participa desta conversa');
    }

    // Atualiza o lastReadAt do usuário na conversa
    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: {
        lastReadAt: new Date(),
      },
    });

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(sinceId ? { id: { gt: sinceId } } : {}),
      },
      take: limit,
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        tempId: true,
        conversationId: true,
        senderId: true,
        content: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    return messages;
  }

  async sendMessage(
    conversationId: number,
    senderId: number,
    dto: SendMessageDto,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                fcmToken: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada');
    }

    if (conversation.status === 'REJECTED') {
      throw new ForbiddenException('Esta conversa foi recusada');
    }

    if (
      conversation.status === 'PENDING' &&
      conversation.initiatedById !== senderId
    ) {
      throw new ForbiddenException(
        'Você precisa aceitar a solicitação antes de enviar mensagens',
      );
    }

    const senderParticipant = conversation.participants.find(
      (p) => p.userId === senderId,
    );

    if (!senderParticipant) {
      throw new ForbiddenException('Você não participa desta conversa');
    }

    // Verificar se algum participante bloqueou o remetente
    const otherParticipant = conversation.participants.find(
      (p) => p.userId !== senderId,
    );
    if (otherParticipant) {
      const isBlocked = await this.prisma.blockedUser.findFirst({
        where: {
          OR: [
            { userId: senderId, blockedId: otherParticipant.userId },
            { userId: otherParticipant.userId, blockedId: senderId },
          ],
        },
      });

      if (isBlocked) {
        throw new ForbiddenException(
          'Não é possível enviar mensagem para este usuário',
        );
      }
    }


    const createdMessage = await this.prisma.message.create({
      data: {
        tempId: dto.tempId || null,
        conversationId,
        senderId,
        content: dto.content,
        type: dto.type || MessageType.TEXT,
        status: MessageStatus.SENT,
      },
    });

    // Atualizar data de atualização da conversa
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    const messageResponse = {
      id: createdMessage.id,
      tempId: createdMessage.tempId,
      conversationId: createdMessage.conversationId,
      senderId: createdMessage.senderId,
      content: createdMessage.content,
      type: createdMessage.type,
      status: createdMessage.status,
      createdAt: createdMessage.createdAt,
    };

    // Emitir via WebSocket para a sala
    this.chatGateway.broadcastNewMessage(conversationId, messageResponse);

    // Processar notificações push para destinatários offline
    const sender = senderParticipant.user;
    for (const participant of conversation.participants) {
      if (participant.userId === senderId) continue;

      const isOnlineInRoom = this.chatGateway.isUserActiveInRoom(
        conversationId,
        participant.userId,
      );

      if (!isOnlineInRoom && participant.user.fcmToken) {
        this.fcmService.sendPushNotification(participant.user.fcmToken, {
          title: sender.name,
          body: createdMessage.content,
          data: {
            conversationId: String(conversationId),
            messageId: String(createdMessage.id),
          },
        });
      }
    }

    return messageResponse;
  }

  async updateMessageStatus(
    messageId: number,
    status: MessageStatus,
    userId: number,
  ) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Mensagem não encontrada');
    }

    const isParticipant = message.conversation.participants.some(
      (p) => p.userId === userId,
    );

    if (!isParticipant) {
      throw new ForbiddenException('Você não tem permissão para alterar esta mensagem');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { status },
      select: {
        id: true,
        tempId: true,
        conversationId: true,
        senderId: true,
        content: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Notificar via WebSocket
    this.chatGateway.broadcastMessageStatus(
      message.conversationId,
      message.id,
      status,
    );

    return updated;
  }
}
