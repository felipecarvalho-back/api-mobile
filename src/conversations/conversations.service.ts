import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreateDirectConversation(userId: number, recipientUserId: number) {
    if (userId === recipientUserId) {
      throw new BadRequestException('Não é possível criar uma conversa consigo mesmo');
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
        contact: contact || {
          id: recipient.id,
          name: recipient.name,
          email: recipient.email,
          avatarUrl: recipient.avatarUrl,
        },
      };
    }

    const newConversation = await this.prisma.conversation.create({
      data: {
        isGroup: false,
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
      contact: contact || {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        avatarUrl: recipient.avatarUrl,
      },
    };
  }

  async getUserConversations(userId: number) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
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
                name: true,
                email: true,
                avatarUrl: true,
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
        const otherParticipant = conv.participants.find((p) => p.userId !== userId);
        const myParticipant = conv.participants.find((p) => p.userId === userId);

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
          contact: otherParticipant ? otherParticipant.user : null,
          lastMessage,
          unreadCount,
          updatedAt: conv.updatedAt,
        };
      }),
    );

    return result;
  }

  async isParticipant(conversationId: number, userId: number): Promise<boolean> {
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
