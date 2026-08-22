import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../gateway/chat.gateway';
import { FcmService } from '../notifications/fcm.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ConversationsService', () => {
  let service: ConversationsService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    message: {
      count: jest.fn(),
    },
    conversationParticipant: {
      findUnique: jest.fn(),
    },
    blockedUser: {
      findFirst: jest.fn(),
    },
  };

  const mockChatGateway = {
    broadcastNewMessageRequest: jest.fn(),
    broadcastConversationAccepted: jest.fn(),
    broadcastConversationRejected: jest.fn(),
  };

  const mockFcmService = {
    sendPushNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ChatGateway, useValue: mockChatGateway },
        { provide: FcmService, useValue: mockFcmService },
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

  it('deve criar solicitação de conversa com mensagem inicial', async () => {
    mockPrismaService.user.findUnique
      .mockResolvedValueOnce({ id: 1, username: 'carlos_dev', name: 'Carlos', avatarUrl: null })
      .mockResolvedValueOnce({ id: 2, username: 'mariana_dev', name: 'Mariana', email: 'm@ex.com', avatarUrl: null, fcmToken: null });
    mockPrismaService.blockedUser.findFirst.mockResolvedValue(null);
    mockPrismaService.conversation.findFirst.mockResolvedValue(null);
    mockPrismaService.conversation.create.mockResolvedValue({
      id: 15,
      status: 'PENDING',
      initiatedById: 1,
      messages: [
        {
          id: 50,
          tempId: 'tmp_1',
          content: 'Olá Mariana!',
          type: 'TEXT',
          status: 'SENT',
          createdAt: new Date(),
        },
      ],
    });

    const result = await service.createConversationRequest(1, {
      recipientUsername: '@mariana_dev',
      content: 'Olá Mariana!',
      tempId: 'tmp_1',
    });

    expect(result.conversationId).toBe(15);
    expect(result.status).toBe('PENDING');
    expect(result.recipient.username).toBe('mariana_dev');
    expect(result.message?.content).toBe('Olá Mariana!');
    expect(mockChatGateway.broadcastNewMessageRequest).toHaveBeenCalledWith(2, expect.objectContaining({ conversationId: 15 }));
  });

  it('deve aceitar uma solicitação de conversa', async () => {
    mockPrismaService.conversation.findUnique.mockResolvedValue({
      id: 15,
      status: 'PENDING',
      participants: [
        { userId: 1, user: { id: 1, username: 'carlos_dev', name: 'Carlos' } },
        { userId: 2, user: { id: 2, username: 'mariana_dev', name: 'Mariana' } },
      ],
    });
    mockPrismaService.conversation.update.mockResolvedValue({
      id: 15,
      status: 'ACCEPTED',
    });

    const result = await service.acceptConversation(15, 2);
    expect(result.success).toBe(true);
    expect(result.status).toBe('ACCEPTED');
    expect(mockChatGateway.broadcastConversationAccepted).toHaveBeenCalledWith(15, 1, expect.objectContaining({ conversationId: 15 }));
  });

  it('deve recusar uma solicitação de conversa', async () => {
    mockPrismaService.conversation.findUnique.mockResolvedValue({
      id: 15,
      status: 'PENDING',
      participants: [{ userId: 1 }, { userId: 2 }],
    });
    mockPrismaService.conversation.update.mockResolvedValue({
      id: 15,
      status: 'REJECTED',
    });

    const result = await service.rejectConversation(15, 2);
    expect(result.success).toBe(true);
    expect(result.status).toBe('REJECTED');
    expect(mockChatGateway.broadcastConversationRejected).toHaveBeenCalledWith(15, 1, expect.objectContaining({ conversationId: 15 }));
  });

  it('deve listar solicitações pendentes recebidas', async () => {
    mockPrismaService.conversation.findMany.mockResolvedValue([
      {
        id: 15,
        status: 'PENDING',
        initiatedById: 1,
        initiatedBy: { id: 1, username: 'carlos_dev', name: 'Carlos', avatarUrl: null },
        messages: [{ id: 50, content: 'Oi!', type: 'TEXT', status: 'SENT', createdAt: new Date() }],
        createdAt: new Date(),
      },
    ]);

    const result = await service.getPendingRequests(2);
    expect(result.totalPending).toBe(1);
    expect(result.requests[0].sender.username).toBe('carlos_dev');
  });

  it('deve impedir criação de conversa consigo mesmo', async () => {
    await expect(service.findOrCreateDirectConversation(1, 1)).rejects.toThrow(BadRequestException);
  });

  it('deve lançar NotFoundException se destinatário não existir', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);
    await expect(service.findOrCreateDirectConversation(1, 99)).rejects.toThrow(NotFoundException);
  });
});

