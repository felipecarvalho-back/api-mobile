# Especificação Técnica e Arquitetura: Backend NestJS (Chat API)

Este documento define a especificação completa do backend em **NestJS** para suportar o aplicativo mobile de chat em tempo real desenvolvido em **NativePHP Mobile v4**.

---

## 1. Stack Tecnológica

- **Framework:** NestJS (Node.js / TypeScript)
- **ORM & Banco de Dados:** Prisma ORM com SQLite (ambiente dev) ou PostgreSQL (produção)
- **Autenticação:** JWT (JSON Web Tokens) com `@nestjs/jwt` e `@nestjs/passport`
- **Tempo Real:** `@nestjs/websockets` + `@nestjs/platform-socket.io` / `ws`
- **Notificações Push:** `firebase-admin` (Firebase Cloud Messaging - FCM)
- **Validação de Dados:** `class-validator` + `class-transformer`

---

## 2. Estrutura de Diretórios Recomendada

```
backend-nestjs/
├── prisma/
│   ├── schema.prisma            # Modelagem do banco de dados
│   └── migrations/              # Histórico de migrações
├── src/
│   ├── auth/                    # Módulo de Autenticação (JWT, Login, Register)
│   │   ├── dto/
│   │   ├── guards/
│   │   ├── strategies/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   ├── users/                   # Módulo de Usuários e Contatos
│   │   ├── dto/
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   ├── conversations/           # Módulo de Conversas (Criação e Listagem)
│   │   ├── dto/
│   │   ├── conversations.controller.ts
│   │   ├── conversations.service.ts
│   │   └── conversations.module.ts
│   ├── messages/                # Módulo de Mensagens (Envio, Histórico, Status)
│   │   ├── dto/
│   │   ├── messages.controller.ts
│   │   ├── messages.service.ts
│   │   └── messages.module.ts
│   ├── gateway/                 # Gateway de WebSockets para Tempo Real
│   │   ├── chat.gateway.ts
│   │   ├── ws-jwt.guard.ts
│   │   └── gateway.module.ts
│   ├── notifications/           # Serviço de Push Notification (Firebase FCM)
│   │   ├── fcm.service.ts
│   │   └── notifications.module.ts
│   ├── prisma/                  # Serviço de conexão do Prisma
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   ├── app.module.ts
│   └── main.ts
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 3. Modelagem de Dados (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "sqlite" // Trocar para "postgresql" em produção
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum MessageType {
  TEXT
  IMAGE
  AUDIO
}

enum MessageStatus {
  SENT
  DELIVERED
  READ
}

model User {
  id           Int       @id @default(autoincrement())
  name         String
  email        String    @unique
  passwordHash String
  avatarUrl    String?
  fcmToken     String?   // Token do dispositivo para notificações push
  lastSeenAt   DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  messagesSent             Message[]                 @relation("SentMessages")
  conversationParticipants ConversationParticipant[]

  @@map("users")
}

model Conversation {
  id           Int       @id @default(autoincrement())
  isGroup      Boolean   @default(false)
  title        String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  participants ConversationParticipant[]
  messages     Message[]

  @@map("conversations")
}

model ConversationParticipant {
  id             Int          @id @default(autoincrement())
  conversationId Int
  userId         Int
  lastReadAt     DateTime?
  joinedAt       DateTime     @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@map("conversation_participants")
}

model Message {
  id             Int           @id @default(autoincrement())
  tempId         String?       // ID temporário gerado no cliente mobile para envio otimista
  conversationId Int
  senderId       Int
  content        String
  type           MessageType   @default(TEXT)
  status         MessageStatus @default(SENT)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  conversation   Conversation  @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender         User          @relation("SentMessages", fields: [senderId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("messages")
}
```

---

## 4. Endpoints da API REST (HTTP)

Todos os endpoints protegidos exigem o cabeçalho: `Authorization: Bearer <JWT_TOKEN>`.

### 4.1. Autenticação (`/api/auth`)

#### `POST /api/auth/register`
- **Body:**
  ```json
  {
    "name": "Carlos Silva",
    "email": "carlos@example.com",
    "password": "senhaSegura123"
  }
  ```
- **Response (201):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "name": "Carlos Silva",
      "email": "carlos@example.com",
      "avatarUrl": null
    }
  }
  ```

#### `POST /api/auth/login`
- **Body:**
  ```json
  {
    "email": "carlos@example.com",
    "password": "senhaSegura123"
  }
  ```
- **Response (200):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "name": "Carlos Silva",
      "email": "carlos@example.com",
      "avatarUrl": null
    }
  }
  ```

---

### 4.2. Usuários e Contatos (`/api/users`)

#### `GET /api/users/contacts`
- **Descrição:** Retorna a lista de usuários cadastrados para iniciar conversas.
- **Response (200):**
  ```json
  [
    {
      "id": 2,
      "name": "Mariana Souza",
      "email": "mariana@example.com",
      "avatarUrl": null,
      "lastSeenAt": "2026-08-20T01:30:00.000Z"
    }
  ]
  ```

#### `POST /api/users/fcm-token`
- **Descrição:** Registra ou atualiza o token do dispositivo móvel para receber Push Notifications via Firebase.
- **Body:**
  ```json
  {
    "fcmToken": "cKj8f_d9A...device_push_token"
  }
  ```
- **Response (200):**
  ```json
  { "success": true }
  ```

---

### 4.3. Conversas (`/api/conversations`)

#### `GET /api/conversations`
- **Descrição:** Lista as conversas do usuário com última mensagem e contador de não lidas.
- **Response (200):**
  ```json
  [
    {
      "id": 10,
      "isGroup": false,
      "contact": {
        "id": 2,
        "name": "Mariana Souza",
        "email": "mariana@example.com",
        "avatarUrl": null
      },
      "lastMessage": {
        "id": 45,
        "content": "Olá, tudo bem?",
        "senderId": 2,
        "status": "DELIVERED",
        "createdAt": "2026-08-20T02:00:00.000Z"
      },
      "unreadCount": 1,
      "updatedAt": "2026-08-20T02:00:00.000Z"
    }
  ]
  ```

#### `POST /api/conversations`
- **Descrição:** Cria uma conversa direta ou retorna a existente com um determinado usuário.
- **Body:**
  ```json
  {
    "recipientUserId": 2
  }
  ```
- **Response (200/201):**
  ```json
  {
    "id": 10,
    "contact": {
      "id": 2,
      "name": "Mariana Souza"
    }
  }
  ```

---

### 4.4. Mensagens (`/api/conversations/:id/messages`)

#### `GET /api/conversations/:conversationId/messages`
- **Query Params:** `since_id` (opcional), `limit` (padrão: 50)
- **Response (200):**
  ```json
  [
    {
      "id": 44,
      "tempId": "tmp_1724110001",
      "conversationId": 10,
      "senderId": 1,
      "content": "Oi Mariana!",
      "type": "TEXT",
      "status": "READ",
      "createdAt": "2026-08-20T01:59:00.000Z"
    },
    {
      "id": 45,
      "tempId": null,
      "conversationId": 10,
      "senderId": 2,
      "content": "Olá, tudo bem?",
      "type": "TEXT",
      "status": "DELIVERED",
      "createdAt": "2026-08-20T02:00:00.000Z"
    }
  ]
  ```

#### `POST /api/conversations/:conversationId/messages`
- **Descrição:** Envio de mensagem via HTTP (para sincronização direta e fallback de WebSocket).
- **Body:**
  ```json
  {
    "tempId": "tmp_1724110002",
    "content": "Tudo ótimo por aqui!",
    "type": "TEXT"
  }
  ```
- **Response (201):**
  ```json
  {
    "id": 46,
    "tempId": "tmp_1724110002",
    "conversationId": 10,
    "senderId": 1,
    "content": "Tudo ótimo por aqui!",
    "type": "TEXT",
    "status": "SENT",
    "createdAt": "2026-08-20T02:05:00.000Z"
  }
  ```

#### `PATCH /api/messages/:id/status`
- **Body:**
  ```json
  {
    "status": "READ"
  }
  ```

---

## 5. WebSockets Gateway (`src/gateway/chat.gateway.ts`)

O gateway gerencia as conexões ativas e faz o broadcast instantâneo de mensagens para os participantes online.

### 5.1. Autenticação de Conexão
O token JWT é enviado no handshake:
```javascript
const socket = io('https://api.seuchat.com', {
  auth: { token: 'Bearer eyJhbGciOi...' }
});
```

### 5.2. Eventos Suportados

| Evento | Direção | Payload | Descrição |
| :--- | :--- | :--- | :--- |
| `join_room` | Cliente $\rightarrow$ Servidor | `{ conversationId: 10 }` | Entra na sala da conversa |
| `leave_room` | Cliente $\rightarrow$ Servidor | `{ conversationId: 10 }` | Sai da sala da conversa |
| `send_message` | Cliente $\rightarrow$ Servidor | `{ conversationId: 10, tempId: "...", content: "..." }` | Envia mensagem em tempo real |
| `new_message` | Servidor $\rightarrow$ Cliente | `{ id, tempId, conversationId, senderId, content, createdAt }` | Notifica nova mensagem |
| `message_status` | Servidor $\rightarrow$ Cliente | `{ messageId, status: 'DELIVERED' \| 'READ' }` | Atualiza status de entrega/leitura |
| `typing` | Cliente $\rightarrow$ Servidor | `{ conversationId: 10, isTyping: true }` | Avisa que o usuário está digitando |
| `user_typing` | Servidor $\rightarrow$ Cliente | `{ conversationId: 10, userId: 1, isTyping: true }` | Notifica status "digitando..." |

---

## 6. Notificações Push em Segundo Plano (FCM)

Quando uma nova mensagem é criada:
1. O backend verifica se o destinatário está com conexão de WebSocket ativa na sala da conversa.
2. Se o destinatário **NÃO estiver ativo na sala**:
   - O `FcmService` busca o `fcmToken` do usuário no banco.
   - Envia um push notification via Firebase Admin:
   ```typescript
   await admin.messaging().send({
     token: recipient.fcmToken,
     notification: {
       title: sender.name,
       body: message.content,
     },
     data: {
       conversationId: String(message.conversationId),
       messageId: String(message.id),
     },
     android: {
       priority: 'high',
     },
     apns: {
       payload: {
         aps: {
           sound: 'default',
         },
       },
     },
   });
   ```

---

## 7. Variáveis de Ambiente (`.env.example`)

```dotenv
PORT=3000
DATABASE_URL="file:./dev.db"
JWT_SECRET="seu_segredo_jwt_super_seguro"
JWT_EXPIRES_IN="30d"

# Firebase Admin SDK (para Push Notifications)
FIREBASE_PROJECT_ID="seu-projeto-firebase"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxx@seu-projeto.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgk...-----END PRIVATE KEY-----\n"
```

---

## 8. Guia Rápido de Execução

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env

# 3. Executar migrações do banco
npx prisma migrate dev --name init

# 4. Iniciar servidor em modo desenvolvimento
npm run start:dev
```
