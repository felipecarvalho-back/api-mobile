import { Test, TestingModule } from '@nestjs/testing';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../gateway/chat.gateway';
import { FcmService } from '../notifications/fcm.service';
import { MessageStatus, MessageType } from '../generated/prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('MessagesService', () => {
  let service: MessagesService;

  const mockPrismaService = {
    conversationParticipant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    blockedUser: {
      findFirst: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockChatGateway = {
    broadcastNewMessage: jest.fn(),
    broadcastMessageStatus: jest.fn(),
    isUserActiveInRoom: jest.fn(),
  };

  const mockFcmService = {
    sendPushNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ChatGateway, useValue: mockChatGateway },
        { provide: FcmService, useValue: mockFcmService },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    jest.clearAllMocks();
  });

  it('deve buscar mensagens de uma conversa quando o usuário for participante', async () => {
    mockPrismaService.conversationParticipant.findUnique.mockResolvedValue({
      id: 1,
      conversationId: 10,
      userId: 1,
    });
    const mockMessages = [
      {
        id: 1,
        tempId: 'tmp_1',
        conversationId: 10,
        senderId: 1,
        content: 'Olá',
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        createdAt: new Date(),
      },
    ];
    mockPrismaService.message.findMany.mockResolvedValue(mockMessages);

    const result = await service.getMessages(10, 1);
    expect(result).toEqual(mockMessages);
    expect(mockPrismaService.conversationParticipant.update).toHaveBeenCalled();
  });

  it('deve recusar busca de mensagens se o usuário não for participante', async () => {
    mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(null);

    await expect(service.getMessages(10, 99)).rejects.toThrow(ForbiddenException);
  });

  it('deve enviar mensagem, emitir WebSocket e disparar Push FCM se destinatário estiver offline', async () => {
    mockPrismaService.conversation.findUnique.mockResolvedValue({
      id: 10,
      status: 'ACCEPTED',
      participants: [
        { userId: 1, user: { id: 1, name: 'Carlos', fcmToken: null } },
        { userId: 2, user: { id: 2, name: 'Mariana', fcmToken: 'fcm_token_mariana' } },
      ],
    });
    mockPrismaService.blockedUser.findFirst.mockResolvedValue(null);


    const createdMsg = {
      id: 100,
      tempId: 'tmp_100',
      conversationId: 10,
      senderId: 1,
      content: 'Mensagem de teste',
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      createdAt: new Date(),
    };
    mockPrismaService.message.create.mockResolvedValue(createdMsg);
    mockPrismaService.conversation.update.mockResolvedValue({});
    mockChatGateway.isUserActiveInRoom.mockReturnValue(false); // Mariana offline

    const result = await service.sendMessage(10, 1, {
      tempId: 'tmp_100',
      content: 'Mensagem de teste',
    });

    expect(result.id).toBe(100);
    expect(mockChatGateway.broadcastNewMessage).toHaveBeenCalledWith(10, expect.objectContaining({ id: 100 }));
    expect(mockFcmService.sendPushNotification).toHaveBeenCalledWith('fcm_token_mariana', {
      title: 'Carlos',
      body: 'Mensagem de teste',
      data: {
        conversationId: '10',
        messageId: '100',
      },
    });
  });

  it('deve atualizar status da mensagem e emitir evento no WebSocket', async () => {
    mockPrismaService.message.findUnique.mockResolvedValue({
      id: 100,
      conversationId: 10,
      conversation: {
        participants: [{ userId: 1 }, { userId: 2 }],
      },
    });
    mockPrismaService.message.update.mockResolvedValue({
      id: 100,
      status: MessageStatus.READ,
    });

    const result = await service.updateMessageStatus(100, MessageStatus.READ, 1);
    expect(result.status).toBe(MessageStatus.READ);
    expect(mockChatGateway.broadcastMessageStatus).toHaveBeenCalledWith(10, 100, MessageStatus.READ);
  });
});
