# Backend NestJS - Chat API em Tempo Real

API REST e Gateway WebSockets para aplicativo mobile de chat em tempo real (NativePHP Mobile v4).

---

## 🛠️ Stack Tecnológica

- **Framework:** NestJS 11
- **Banco de Dados & ORM:** Prisma ORM com SQLite (`dev.db`)
- **Autenticação:** JWT (`@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcryptjs`)
- **WebSockets / Tempo Real:** Socket.IO (`@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`)
- **Push Notifications:** Firebase Cloud Messaging (`firebase-admin`)
- **Validação:** `class-validator` + `class-transformer`

---

## 🚀 Como Executar o Projeto

### 1. Instalar Dependências
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```

### 3. Sincronizar o Banco de Dados (Prisma)
```bash
npm run prisma:generate; npm run prisma:push
```

### 4. Iniciar o Servidor
```bash
# Modo de desenvolvimento com hot-reload
npm run start:dev

# Modo de produção
npm run build; npm run start:prod
```

O servidor estará disponível em: `http://localhost:3000/api`

---

## 🧪 Executar Testes

```bash
# Testes unitários
npm run test

# Testes E2E (Fluxo completo da API)
npm run test:e2e
```

---

## 📡 Endpoints da API REST

Prefixo global: `/api`

### Autenticação
- `POST /api/auth/register` - Cadastro de usuário (`name`, `email`, `password`)
- `POST /api/auth/login` - Login (`email`, `password`)

### Usuários & Contatos (Exige `Authorization: Bearer <token>`)
- `GET /api/users/contacts` - Lista contatos disponíveis
- `POST /api/users/fcm-token` - Registra token FCM do dispositivo (`fcmToken`)

### Conversas (Exige `Authorization: Bearer <token>`)
- `GET /api/conversations` - Lista conversas com última mensagem e contador de não lidas
- `POST /api/conversations` - Cria ou recupera conversa direta (`recipientUserId`)

### Mensagens (Exige `Authorization: Bearer <token>`)
- `GET /api/conversations/:conversationId/messages` - Histórico de mensagens (`since_id`, `limit`)
- `POST /api/conversations/:conversationId/messages` - Envio de mensagem (`tempId`, `content`, `type`)
- `PATCH /api/messages/:id/status` - Atualização de status da mensagem (`status`: `SENT` | `DELIVERED` | `READ`)

---

## 🔌 Eventos WebSocket (Socket.IO)

- Autenticação no handshake com `auth: { token: "Bearer <token>" }`
- **`join_room`** / **`leave_room`**: Entrada e saída de salas (`{ conversationId }`)
- **`send_message`**: Envio de mensagem em tempo real (`{ conversationId, tempId, content, type }`)
- **`new_message`**: Broadcast de nova mensagem para participantes
- **`message_status`**: Atualização e notificação de status de leitura/entrega
- **`typing`** / **`user_typing`**: Indicador de digitação em tempo real
