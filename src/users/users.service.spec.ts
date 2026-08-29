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
    conversation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    blockedUser: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
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

  it('deve buscar usuários por query e retornar status de relacionamento', async () => {
    mockPrismaService.user.findMany.mockResolvedValue([
      {
        id: 2,
        username: 'mariana_silva',
        name: 'Mariana Souza',
        email: 'mariana@example.com',
        avatarUrl: null,
        lastSeenAt: new Date(),
      },
    ]);
    mockPrismaService.blockedUser.findUnique.mockResolvedValue(null);
    mockPrismaService.conversation.findFirst.mockResolvedValue(null);

    const result = await service.searchUsers('mariana', 1);
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe('mariana_silva');
    expect(result[0].relationship.status).toBe('NONE');
  });

  it('deve buscar usuário por username exato', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 2,
      username: 'mariana_silva',
      name: 'Mariana Souza',
      email: 'mariana@example.com',
      avatarUrl: null,
      lastSeenAt: new Date(),
    });
    mockPrismaService.blockedUser.findUnique.mockResolvedValue(null);
    mockPrismaService.conversation.findFirst.mockResolvedValue({
      id: 10,
      status: 'ACCEPTED',
      initiatedById: 1,
    });

    const result = await service.findByUsername('@mariana_silva', 1);
    expect(result.username).toBe('mariana_silva');
    expect(result.relationship.status).toBe('ACCEPTED');
    expect(result.relationship.conversationId).toBe(10);
  });

  it('deve listar contatos de conversas aceitas', async () => {
    mockPrismaService.conversation.findMany.mockResolvedValue([
      {
        id: 10,
        participants: [
          {
            user: {
              id: 2,
              username: 'mariana_silva',
              name: 'Mariana Souza',
              email: 'mariana@example.com',
              avatarUrl: null,
              lastSeenAt: new Date(),
            },
          },
        ],
      },
    ]);

    const result = await service.getContacts(1);
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe('mariana_silva');
  });

  it('deve bloquear usuário com sucesso', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 2 });
    mockPrismaService.blockedUser.upsert.mockResolvedValue({});

    const result = await service.blockUser(1, 2);
    expect(result).toEqual({ success: true, message: 'Usuário bloqueado com sucesso' });
    expect(mockPrismaService.blockedUser.upsert).toHaveBeenCalled();
  });
});

