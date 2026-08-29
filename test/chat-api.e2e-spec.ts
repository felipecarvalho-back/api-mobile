import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Chat API Full Integration Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let user1Token: string;
  let user2Token: string;
  let user1Id: number;
  let user2Id: number;
  let conversationId: number;
  let messageId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    // Limpar banco de dados de teste
    await prisma.message.deleteMany();
    await prisma.conversationParticipant.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.message.deleteMany();
      await prisma.conversationParticipant.deleteMany();
      await prisma.conversation.deleteMany();
      await prisma.user.deleteMany();
    }
    await app.close();
  });

  it('1. POST /api/auth/register - Registrar Usuário 1 (Carlos)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Carlos Silva',
        email: 'carlos@example.com',
        password: 'senhaSegura123',
      })
      .expect(201);

    expect(response.body).toHaveProperty('token');
    expect(response.body.user).toHaveProperty('id');
    expect(response.body.user.name).toBe('Carlos Silva');
    expect(response.body.user.email).toBe('carlos@example.com');

    user1Token = response.body.token;
    user1Id = response.body.user.id;
  });

  it('2. POST /api/auth/register - Registrar Usuário 2 (Mariana)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Mariana Souza',
        email: 'mariana@example.com',
        password: 'senhaSegura123',
      })
      .expect(201);

    expect(response.body).toHaveProperty('token');
    user2Token = response.body.token;
    user2Id = response.body.user.id;
  });

  it('3. POST /api/auth/login - Login do Usuário 1', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'carlos@example.com',
        password: 'senhaSegura123',
      })
      .expect(200);

    expect(response.body).toHaveProperty('token');
    expect(response.body.user.email).toBe('carlos@example.com');
  });

  it('4. GET /api/users/contacts - Listar contatos', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users/contacts')
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(1);
    expect(response.body[0].email).toBe('mariana@example.com');
  });

  it('6. POST /api/conversations - Criar ou obter conversa com Mariana', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/conversations')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        recipientUserId: user2Id,
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.contact.id).toBe(user2Id);
    conversationId = response.body.id;
  });

  it('7. POST /api/conversations/:id/messages - Enviar mensagem de Carlos para Mariana', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        tempId: 'tmp_1724110001',
        content: 'Olá Mariana!',
        type: 'TEXT',
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.content).toBe('Olá Mariana!');
    expect(response.body.senderId).toBe(user1Id);
    expect(response.body.status).toBe('SENT');
    messageId = response.body.id;
  });

  it('8. GET /api/conversations/:id/messages - Obter mensagens da conversa', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${user2Token}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(1);
    expect(response.body[0].id).toBe(messageId);
    expect(response.body[0].content).toBe('Olá Mariana!');
  });

  it('9. PATCH /api/messages/:id/status - Atualizar status para READ por Mariana', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/messages/${messageId}/status`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({
        status: 'READ',
      })
      .expect(200);

    expect(response.body.id).toBe(messageId);
    expect(response.body.status).toBe('READ');
  });

  it('10. GET /api/conversations - Listar conversas de Carlos', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/conversations')
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(1);
    expect(response.body[0].id).toBe(conversationId);
    expect(response.body[0].contact.name).toBe('Mariana Souza');
    expect(response.body[0].lastMessage.content).toBe('Olá Mariana!');
  });
});
