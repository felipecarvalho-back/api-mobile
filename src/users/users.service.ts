import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getContacts(currentUserId: number) {
    return this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        lastSeenAt: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async updateFcmToken(userId: number, fcmToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken },
    });

    return { success: true };
  }

  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        fcmToken: true,
        lastSeenAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  async updateLastSeen(userId: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });
  }
}
