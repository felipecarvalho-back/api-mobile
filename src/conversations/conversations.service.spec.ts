import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ConversationsService', () => {
  let service: ConversationsService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    message: {
      count: jest.fn(),
    },
    conversationParticipant: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
    jest.clearAllMocks();
  });

  it('deve retornar conversa existente se já houver conversa direta', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 2, name: 'Mariana Souza' });
    mockPrismaService.conversation.findFirst.mockResolvedValue({
      id: 10,
      isGroup: false,
      participants: [
        { userId: 1, user: { id: 1, name: 'Carlos' } },
        { userId: 2, user: { id: 2, name: 'Mariana Souza', email: 'mariana@example.com', avatarUrl: null } },
      ],
    });

    const result = await service.findOrCreateDirectConversation(1, 2);
    expect(result.id).toBe(10);
    expect(result.contact.id).toBe(2);
    expect(result.contact.name).toBe('Mariana Souza');
  });

  it('deve criar nova conversa se não existir prévia', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 2, name: 'Mariana Souza', email: 'mariana@example.com', avatarUrl: null });
    mockPrismaService.conversation.findFirst.mockResolvedValue(null);
    mockPrismaService.conversation.create.mockResolvedValue({
      id: 11,
      isGroup: false,
      participants: [
        { userId: 1, user: { id: 1, name: 'Carlos' } },
        { userId: 2, user: { id: 2, name: 'Mariana Souza', email: 'mariana@example.com', avatarUrl: null } },
      ],
    });

    const result = await service.findOrCreateDirectConversation(1, 2);
    expect(result.id).toBe(11);
    expect(result.contact.id).toBe(2);
    expect(mockPrismaService.conversation.create).toHaveBeenCalled();
  });

  it('deve impedir criação de conversa consigo mesmo', async () => {
    await expect(service.findOrCreateDirectConversation(1, 1)).rejects.toThrow(BadRequestException);
  });

  it('deve lançar NotFoundException se destinatário não existir', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);
    await expect(service.findOrCreateDirectConversation(1, 99)).rejects.toThrow(NotFoundException);
  });
});
