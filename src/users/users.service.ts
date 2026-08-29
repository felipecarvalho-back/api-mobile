import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async searchUsers(query: string, currentUserId: number) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const cleanQuery = query.replace(/^@/, '').toLowerCase().trim();

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          { username: { contains: cleanQuery } },
          { name: { contains: cleanQuery } },
          { email: { contains: cleanQuery } },
        ],
      },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        avatarUrl: true,
        lastSeenAt: true,
      },
      take: 20,
    });

    const result = await Promise.all(
      users.map(async (user) => {
        const relationship = await this.getRelationship(currentUserId, user.id);
        return {
          ...user,
          relationship,
        };
      }),
    );

    return result;
  }

  async findByUsername(username: string, currentUserId: number) {
    const cleanUsername = username.replace(/^@/, '').toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { username: cleanUsername },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        avatarUrl: true,
        lastSeenAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const relationship = await this.getRelationship(currentUserId, user.id);

    return {
      ...user,
      relationship,
    };
  }

  async getRelationship(currentUserId: number, targetUserId: number) {
    // Verificar se há bloqueio (em qualquer direção)
    const isBlockedByMe = await this.prisma.blockedUser.findUnique({
      where: {
        userId_blockedId: {
          userId: currentUserId,
          blockedId: targetUserId,
        },
      },
    });

    const isBlockedByThem = await this.prisma.blockedUser.findUnique({
      where: {
        userId_blockedId: {
          userId: targetUserId,
          blockedId: currentUserId,
        },
      },
    });

    if (isBlockedByMe || isBlockedByThem) {
      return {
        status: 'BLOCKED',
        conversationId: null,
        blockedByMe: !!isBlockedByMe,
      };
    }

    // Verificar conversa direta
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: currentUserId } } },
          { participants: { some: { userId: targetUserId } } },
        ],
      },
      select: {
        id: true,
        status: true,
        initiatedById: true,
      },
    });

    if (!conversation) {
      return {
        status: 'NONE',
        conversationId: null,
      };
    }

    if (conversation.status === 'ACCEPTED') {
      return {
        status: 'ACCEPTED',
        conversationId: conversation.id,
      };
    }

    if (conversation.status === 'PENDING') {
      return {
        status:
          conversation.initiatedById === currentUserId
            ? 'PENDING_SENT'
            : 'PENDING_RECEIVED',
        conversationId: conversation.id,
      };
    }

    return {
      status: 'REJECTED',
      conversationId: conversation.id,
    };
  }

  async blockUser(currentUserId: number, targetUserId: number) {
    if (currentUserId === targetUserId) {
      throw new BadRequestException('Não é possível bloquear a si mesmo');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('Usuário não encontrado');
    }

    await this.prisma.blockedUser.upsert({
      where: {
        userId_blockedId: {
          userId: currentUserId,
          blockedId: targetUserId,
        },
      },
      create: {
        userId: currentUserId,
        blockedId: targetUserId,
      },
      update: {},
    });

    return { success: true, message: 'Usuário bloqueado com sucesso' };
  }

  async unblockUser(currentUserId: number, targetUserId: number) {
    await this.prisma.blockedUser.deleteMany({
      where: {
        userId: currentUserId,
        blockedId: targetUserId,
      },
    });

    return { success: true, message: 'Usuário desbloqueado com sucesso' };
  }

  async getBlockedUsers(currentUserId: number) {
    const blockedList = await this.prisma.blockedUser.findMany({
      where: { userId: currentUserId },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return blockedList.map((item) => item.blocked);
  }

  async getContacts(currentUserId: number) {
    // Retorna contatos com os quais o usuário tem conversas aceitas
    const acceptedConversations = await this.prisma.conversation.findMany({
      where: {
        status: 'ACCEPTED',
        participants: {
          some: { userId: currentUserId },
        },
      },
      include: {
        participants: {
          where: {
            userId: { not: currentUserId },
          },
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
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const contacts = acceptedConversations
      .map((conv) => conv.participants[0]?.user)
      .filter(Boolean);

    return contacts;
  }

  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        avatarUrl: true,
        lastSeenAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  async updateLastSeen(userId: number) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
      });
    } catch {
      return null;
    }
  }
}

