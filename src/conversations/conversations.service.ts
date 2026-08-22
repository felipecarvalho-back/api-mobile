import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConversationStatus, MessageStatus, MessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationRequestDto } from './dto/create-conversation-request.dto';
import { ChatGateway } from '../gateway/chat.gateway';
import { FcmService } from '../notifications/fcm.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    private readonly fcmService: FcmService,
  ) {}

  async createConversationRequest(
    userId: number,
    dto: CreateConversationRequestDto,
  ) {
    const cleanUsername = dto.recipientUsername
      .replace(/^@/, '')
      .toLowerCase()
      .trim();

    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
      },
    });

    if (!sender) {
      throw new NotFoundException('Usuário remetente não encontrado');
    }

    const recipient = await this.prisma.user.findUnique({
      where: { username: cleanUsername },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        avatarUrl: true,
        fcmToken: true,
      },
    });

    if (!recipient) {
      throw new NotFoundException('Destinatário não encontrado');
    }

    if (recipient.id === userId) {
      throw new BadRequestException(
        'Não é possível enviar solicitação para si mesmo',
      );
    }

    // Verificar se há bloqueio
    const isBlocked = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { userId, blockedId: recipient.id },
          { userId: recipient.id, blockedId: userId },
        ],
      },
    });

    if (isBlocked) {
      throw new ForbiddenException(
        'Não é possível enviar mensagem para este usuário',
      );
    }

    // Verificar se já existe conversa
    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: recipient.id } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (existingConversation) {
      if (existingConversation.status === ConversationStatus.ACCEPTED) {
        throw new BadRequestException('Esta conversa já está ativa');
      }

      if (existingConversation.status === ConversationStatus.PENDING) {
        if (existingConversation.initiatedById === userId) {
          throw new BadRequestException(
            'Você já enviou uma solicitação para este usuário',
          );
        } else {
          // Se o outro usuário já havia mandado uma solicitação, agora ela é aceita
          const accepted = await this.acceptConversation(
            existingConversation.id,
            userId,
          );
          return {
            conversationId: existingConversation.id,
            status: ConversationStatus.ACCEPTED,
            recipient: {
              id: recipient.id,
              username: recipient.username,
              name: recipient.name,
              avatarUrl: recipient.avatarUrl,
            },
            message: null,
          };
        }
      }
    }

    // Criar nova conversa com status PENDING e mensagem inicial
    const conversation = await this.prisma.conversation.create({
      data: {
        isGroup: false,
        status: ConversationStatus.PENDING,
        initiatedById: userId,
        participants: {
          create: [{ userId }, { userId: recipient.id }],
        },
        messages: {
          create: {
            senderId: userId,
            content: dto.content,
            tempId: dto.tempId || null,
            type: MessageType.TEXT,
            status: MessageStatus.SENT,
          },
        },
      },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const initialMessage = conversation.messages[0];

    const responseData = {
      conversationId: conversation.id,
      status: conversation.status,
      recipient: {
        id: recipient.id,
        username: recipient.username,
        name: recipient.name,
        avatarUrl: recipient.avatarUrl,
      },
      message: {
        id: initialMessage.id,
        tempId: initialMessage.tempId,
        conversationId: conversation.id,
        senderId: userId,
        content: initialMessage.content,
        type: initialMessage.type,
        status: initialMessage.status,
        createdAt: initialMessage.createdAt,
      },
    };

    // Notificar via WebSocket o destinatário
    this.chatGateway.broadcastNewMessageRequest(recipient.id, {
      conversationId: conversation.id,
      sender: {
        id: sender.id,
        username: sender.username,
        name: sender.name,
        avatarUrl: sender.avatarUrl,
      },
      message: responseData.message,
    });

    // Enviar push notification se o destinatário tiver token FCM
    if (recipient.fcmToken) {
      this.fcmService.sendPushNotification(recipient.fcmToken, {
        title: `@${sender.username}`,
        body: dto.content,
        data: {
          conversationId: String(conversation.id),
          type: 'NEW_REQUEST',
        },
      });
    }

    return responseData;
  }

  async getUserConversations(userId: number) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        status: ConversationStatus.ACCEPTED,
        participants: {
          some: { userId },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                email: true,
                avatarUrl: true,
                lastSeenAt: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            senderId: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const result = await Promise.all(
      conversations.map(async (conv) => {
        const otherParticipant = conv.participants.find(
          (p) => p.userId !== userId,
        );
        const myParticipant = conv.participants.find(
          (p) => p.userId === userId,
        );

        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            ...(myParticipant?.lastReadAt
              ? { createdAt: { gt: myParticipant.lastReadAt } }
              : { status: { not: 'READ' } }),
          },
        });

        const lastMessage = conv.messages.length > 0 ? conv.messages[0] : null;

        return {
          id: conv.id,
          isGroup: conv.isGroup,
          status: conv.status,
          contact: otherParticipant ? otherParticipant.user : null,
          lastMessage,
          unreadCount,
          updatedAt: conv.updatedAt,
        };
      }),
    );

    return result;
  }

  async getPendingRequests(userId: number) {
    const pendingConversations = await this.prisma.conversation.findMany({
      where: {
        status: ConversationStatus.PENDING,
        initiatedById: { not: userId },
        participants: {
          some: { userId },
        },
      },
      include: {
        initiatedBy: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            id: true,
            content: true,
            type: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const requests = pendingConversations.map((conv) => {
      const otherParticipant = conv.participants?.find(
        (p) => p.userId !== userId,
      );
      const sender =
        conv.initiatedBy ||
        otherParticipant?.user || {
          id: 0,
          username: 'usuario',
          name: 'Usuário',
          avatarUrl: null,
        };

      return {
        id: conv.id,
        sender,
        initialMessage: conv.messages && conv.messages.length > 0 ? conv.messages[0] : null,
        createdAt: conv.createdAt,
      };
    });

    return {
      totalPending: requests.length,
      requests,
    };
  }

  async getSentRequests(userId: number) {
    const sentConversations = await this.prisma.conversation.findMany({
      where: {
        status: ConversationStatus.PENDING,
        initiatedById: userId,
      },
      include: {
        participants: {
          where: {
            userId: { not: userId },
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sentConversations.map((conv) => ({
      id: conv.id,
      recipient: conv.participants[0]?.user || null,
      initialMessage: conv.messages[0] || null,
      createdAt: conv.createdAt,
    }));
  }

  async acceptConversation(conversationId: number, userId: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada');
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId === userId,
    );

    if (!isParticipant) {
      throw new ForbiddenException('Você não participa desta conversa');
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: ConversationStatus.ACCEPTED,
        updatedAt: new Date(),
      },
    });

    const acceptor = conversation.participants.find((p) => p.userId === userId)?.user;
    const otherParticipant = conversation.participants.find((p) => p.userId !== userId);

    if (otherParticipant) {
      this.chatGateway.broadcastConversationAccepted(
        conversationId,
        otherParticipant.userId,
        {
          conversationId,
          acceptedBy: acceptor,
        },
      );
    }

    return {
      success: true,
      conversationId: updated.id,
      status: updated.status,
    };
  }

  async rejectConversation(conversationId: number, userId: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada');
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId === userId,
    );

    if (!isParticipant) {
      throw new ForbiddenException('Você não participa desta conversa');
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: ConversationStatus.REJECTED,
      },
    });

    const otherParticipant = conversation.participants.find((p) => p.userId !== userId);
    if (otherParticipant) {
      this.chatGateway.broadcastConversationRejected(
        conversationId,
        otherParticipant.userId,
        {
          conversationId,
        },
      );
    }

    return {
      success: true,
      conversationId: updated.id,
      status: updated.status,
    };
  }

  async findOrCreateDirectConversation(
    userId: number,
    recipientUserId: number,
  ) {
    if (userId === recipientUserId) {
      throw new BadRequestException(
        'Não é possível criar uma conversa consigo mesmo',
      );
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientUserId },
    });

    if (!recipient) {
      throw new NotFoundException('Destinatário não encontrado');
    }

    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: recipientUserId } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (existingConversation) {
      const contact = existingConversation.participants.find(
        (p) => p.userId === recipientUserId,
      )?.user;

      return {
        id: existingConversation.id,
        status: existingConversation.status,
        contact: contact || {
          id: recipient.id,
          username: recipient.username,
          name: recipient.name,
          email: recipient.email,
          avatarUrl: recipient.avatarUrl,
        },
      };
    }

    const newConversation = await this.prisma.conversation.create({
      data: {
        isGroup: false,
        status: ConversationStatus.ACCEPTED,
        initiatedById: userId,
        participants: {
          create: [{ userId }, { userId: recipientUserId }],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    const contact = newConversation.participants.find(
      (p) => p.userId === recipientUserId,
    )?.user;

    return {
      id: newConversation.id,
      status: newConversation.status,
      contact: contact || {
        id: recipient.id,
        username: recipient.username,
        name: recipient.name,
        email: recipient.email,
        avatarUrl: recipient.avatarUrl,
      },
    };
  }

  async isParticipant(
    conversationId: number,
    userId: number,
  ): Promise<boolean> {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });
    return !!participant;
  }
}

