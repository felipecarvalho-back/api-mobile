import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('deve listar contatos excluindo o usuário solicitante', async () => {
    const mockUsers = [
      {
        id: 2,
        name: 'Mariana Souza',
        email: 'mariana@example.com',
        avatarUrl: null,
        lastSeenAt: new Date(),
      },
    ];
    mockPrismaService.user.findMany.mockResolvedValue(mockUsers);

    const result = await service.getContacts(1);
    expect(result).toEqual(mockUsers);
    expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
      where: { id: { not: 1 } },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        lastSeenAt: true,
      },
      orderBy: { name: 'asc' },
    });
  });

  it('deve atualizar o FCM token com sucesso', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });
    mockPrismaService.user.update.mockResolvedValue({ id: 1, fcmToken: 'new_token' });

    const result = await service.updateFcmToken(1, 'new_token');
    expect(result).toEqual({ success: true });
    expect(mockPrismaService.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { fcmToken: 'new_token' },
    });
  });

  it('deve lançar NotFoundException ao atualizar FCM token de usuário inexistente', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    await expect(service.updateFcmToken(999, 'token')).rejects.toThrow(NotFoundException);
  });
});
