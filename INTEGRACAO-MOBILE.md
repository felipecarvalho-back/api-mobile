# Guia de Integração da API: Backend NestJS para Mobile

Este documento serve como referência técnica completa para a integração do aplicativo mobile (NativePHP Mobile / React Native / Flutter / etc.) com o backend do Chat.

---

## 1. Conexão, Portas e URLs Base

O servidor NestJS roda por padrão na porta **`3000`** e utiliza o prefixo global **`/api`** para rotas HTTP.

### URLs para Requisições HTTP (REST)
| Ambiente | URL Base HTTP |
| :--- | :--- |
| **Android Emulator** | `http://10.0.2.2:3000/api` |
| **iOS Simulator** | `http://localhost:3000/api` |
| **Aparelho Físico (mesmo Wi-Fi)** | `http://<SEU_IP_LOCAL>:3000/api` *(Ex: `http://192.168.1.15:3000/api`)* |
| **Produção** | `https://api.seudominio.com/api` |

### URLs para WebSockets (Socket.IO)
| Ambiente | URL WebSocket |
| :--- | :--- |
| **Android Emulator** | `http://10.0.2.2:3000` |
| **iOS Simulator** | `http://localhost:3000` |
| **Aparelho Físico (mesmo Wi-Fi)** | `http://<SEU_IP_LOCAL>:3000` |
| **Produção** | `https://api.seudominio.com` |

---

## 2. Autenticação e Cabeçalhos

### Requisições HTTP
Todos os endpoints protegidos exigem o envio do token JWT retornado no login/registro no cabeçalho `Authorization`:
```http
Authorization: Bearer <SEU_TOKEN_JWT>
Content-Type: application/json
```

### Conexão WebSockets (Socket.IO)
Ao iniciar o cliente Socket.IO, envie o token no objeto `auth`:
```javascript
import { io } from 'socket.io-client';

const socket = io('http://10.0.2.2:3000', {
  auth: {
    token: `Bearer ${jwtToken}`
  },
  transports: ['websocket']
});
```

---

## 3. Endpoints da API REST

### 3.1. Autenticação

#### `POST /auth/register`
Cadastra um novo usuário e retorna o token JWT imediato.

- **Requisição:**
  ```json
  {
    "name": "Carlos Silva",
    "email": "carlos@example.com",
    "password": "senhaSegura123",
    "avatarUrl": "https://meu-avatar.com/foto.jpg" // Opcional
  }
  ```
- **Resposta Sucesso (`201 Created`):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "name": "Carlos Silva",
      "email": "carlos@example.com",
      "avatarUrl": "https://meu-avatar.com/foto.jpg"
    }
  }
  ```
- **Erros Comuns:** `400 Bad Request` (validação de campos), `409 Conflict` (email já cadastrado).

---

#### `POST /auth/login`
Autentica o usuário existente por e-mail e senha.

- **Requisição:**
  ```json
  {
    "email": "carlos@example.com",
    "password": "senhaSegura123"
  }
  ```
- **Resposta Sucesso (`200 OK`):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "name": "Carlos Silva",
      "email": "carlos@example.com",
      "avatarUrl": null
    }
  }
  ```
- **Erros Comuns:** `401 Unauthorized` (e-mail ou senha inválidos).

---

### 3.2. Usuários e Contatos

#### `GET /users/contacts`
*Protegido por Bearer Token*  
Retorna a lista de outros usuários cadastrados no app para iniciar conversas.

- **Resposta Sucesso (`200 OK`):**
  ```json
  [
    {
      "id": 2,
      "name": "Mariana Souza",
      "email": "mariana@example.com",
      "avatarUrl": null,
      "lastSeenAt": "2026-08-21T23:00:00.000Z"
    }
  ]
  ```

---

#### `POST /users/fcm-token`
*Protegido por Bearer Token*  
Registra ou atualiza o token do dispositivo móvel para recebimento de Notificações Push via Firebase Cloud Messaging.

- **Requisição:**
  ```json
  {
    "fcmToken": "cKj8f_d9A...seu_token_fcm_mobile"
  }
  ```
- **Resposta Sucesso (`200 OK`):**
  ```json
  {
    "success": true
  }
  ```

---

### 3.3. Conversas

#### `GET /conversations`
*Protegido por Bearer Token*  
Lista todas as conversas do usuário autenticado, com os dados do contato, última mensagem e contador de mensagens não lidas.

- **Resposta Sucesso (`200 OK`):**
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
        "createdAt": "2026-08-21T22:00:00.000Z"
      },
      "unreadCount": 1,
      "updatedAt": "2026-08-21T22:00:00.000Z"
    }
  ]
  ```

---

#### `POST /conversations`
*Protegido por Bearer Token*  
Cria uma nova conversa direta ou retorna a conversa já existente com o usuário especificado.

- **Requisição:**
  ```json
  {
    "recipientUserId": 2
  }
  ```
- **Resposta Sucesso (`201 Created` ou `200 OK`):**
  ```json
  {
    "id": 10,
    "contact": {
      "id": 2,
      "name": "Mariana Souza",
      "email": "mariana@example.com",
      "avatarUrl": null
    }
  }
  ```

---

### 3.4. Mensagens

#### `GET /conversations/:conversationId/messages`
*Protegido por Bearer Token*  
Recupera o histórico de mensagens da conversa em ordem cronológica crescente. Também marca as mensagens como lidas para o usuário que requisitou.

- **Parâmetros de Rota:** `conversationId` (inteiro)
- **Query Params Opcionais:**
  - `since_id`: ID da última mensagem recebida (para sincronização delta / incremental).
  - `limit`: Quantidade máxima de mensagens (padrão: `50`).
- **Exemplo:** `GET /api/conversations/10/messages?limit=30&since_id=15`
- **Resposta Sucesso (`200 OK`):**
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
      "createdAt": "2026-08-21T21:59:00.000Z"
    },
    {
      "id": 45,
      "tempId": null,
      "conversationId": 10,
      "senderId": 2,
      "content": "Olá, tudo bem?",
      "type": "TEXT",
      "status": "DELIVERED",
      "createdAt": "2026-08-21T22:00:00.000Z"
    }
  ]
  ```

---

#### `POST /conversations/:conversationId/messages`
*Protegido por Bearer Token*  
Envia mensagem via HTTP REST (útil para envio direto ou fallback quando a conexão WebSocket estiver reconectando). Automaticamente faz broadcast no WebSocket e dispara Push FCM se o destinatário estiver offline.

- **Parâmetros de Rota:** `conversationId` (inteiro)
- **Requisição:**
  ```json
  {
    "tempId": "tmp_1724110002", // ID gerado no mobile para UI otimista
    "content": "Tudo ótimo por aqui!",
    "type": "TEXT" // Opcional: TEXT | IMAGE | AUDIO (Padrão: TEXT)
  }
  ```
- **Resposta Sucesso (`201 Created`):**
  ```json
  {
    "id": 46,
    "tempId": "tmp_1724110002",
    "conversationId": 10,
    "senderId": 1,
    "content": "Tudo ótimo por aqui!",
    "type": "TEXT",
    "status": "SENT",
    "createdAt": "2026-08-21T22:05:00.000Z"
  }
  ```

---

#### `PATCH /messages/:id/status`
*Protegido por Bearer Token*  
Atualiza o status de entrega ou leitura de uma mensagem. Notifica instantaneamente a sala via WebSocket.

- **Parâmetros de Rota:** `id` (inteiro - ID da mensagem)
- **Requisição:**
  ```json
  {
    "status": "READ" // SENT | DELIVERED | READ
  }
  ```
- **Resposta Sucesso (`200 OK`):**
  ```json
  {
    "id": 46,
    "tempId": "tmp_1724110002",
    "conversationId": 10,
    "senderId": 1,
    "content": "Tudo ótimo por aqui!",
    "type": "TEXT",
    "status": "READ",
    "createdAt": "2026-08-21T22:05:00.000Z",
    "updatedAt": "2026-08-21T22:06:10.000Z"
  }
  ```

---

## 4. WebSockets Gateway (Socket.IO)

O backend utiliza Socket.IO para troca de mensagens e eventos de presença em tempo real.

### Tabela de Eventos

| Evento | Direção | Payload | Descrição / Ação Recomendada no Mobile |
| :--- | :--- | :--- | :--- |
| `join_room` | Mobile $\rightarrow$ Servidor | `{ "conversationId": 10 }` | Chamar ao abrir a tela de conversa no app. |
| `leave_room` | Mobile $\rightarrow$ Servidor | `{ "conversationId": 10 }` | Chamar ao sair/fechar a tela de conversa no app. |
| `send_message` | Mobile $\rightarrow$ Servidor | `{ "conversationId": 10, "tempId": "...", "content": "...", "type": "TEXT" }` | Envia mensagem em tempo real. |
| `new_message` | Servidor $\rightarrow$ Mobile | `{ "id": 46, "tempId": "...", "conversationId": 10, "senderId": 1, "content": "...", "type": "TEXT", "status": "SENT", "createdAt": "..." }` | Recebe mensagem recebida ou confirmação da enviada. |
| `message_status`| Servidor $\rightarrow$ Mobile | `{ "messageId": 46, "status": "READ" }` | Atualiza o ícone de status (✓ para ✓✓) no mobile. |
| `typing` | Mobile $\rightarrow$ Servidor | `{ "conversationId": 10, "isTyping": true }` | Disparar quando o usuário digita ou para de digitar. |
| `user_typing` | Servidor $\rightarrow$ Mobile | `{ "conversationId": 10, "userId": 1, "isTyping": true }` | Exibe "Fulano está digitando..." na barra superior. |

### Exemplo de Uso no Mobile (JavaScript / TypeScript):

```javascript
import { io } from 'socket.io-client';

const socket = io('http://10.0.2.2:3000', {
  auth: { token: `Bearer ${token}` }
});

// 1. Ao entrar na conversa
socket.emit('join_room', { conversationId: 10 });

// 2. Ouvir novas mensagens
socket.on('new_message', (message) => {
  console.log('Nova mensagem recebida:', message);
  // Se message.tempId corresponder a uma mensagem local na fila otimista,
  // apenas atualize com o ID real recebido do servidor.
});

// 3. Ouvir atualizações de status (entregue / lido)
socket.on('message_status', ({ messageId, status }) => {
  console.log(`Mensagem ${messageId} agora está: ${status}`);
});

// 4. Ouvir digitação
socket.on('user_typing', ({ conversationId, userId, isTyping }) => {
  if (isTyping) {
    mostrarIndicadorDigitando(userId);
  } else {
    ocultarIndicadorDigitando(userId);
  }
});

// 5. Ao sair da conversa
socket.emit('leave_room', { conversationId: 10 });
```

---

## 5. Notificações Push (Firebase FCM) & Deep Linking

### Como o Backend se comporta
Quando uma nova mensagem é criada:
1. O backend verifica se o destinatário está ativo na sala WebSocket da conversa.
2. Se o usuário **não estiver na sala** (app em segundo plano ou fechado), o backend envia automaticamente uma notificação push via FCM.

### Estrutura do Payload Enviado pelo FCM
```json
{
  "notification": {
    "title": "Carlos Silva",
    "body": "Tudo ótimo por aqui!"
  },
  "data": {
    "conversationId": "10",
    "messageId": "46"
  }
}
```

### Como tratar no Mobile (Deep-Linking)
Ao receber o toque na notificação:
1. Extraia `data.conversationId`.
2. Navegue o usuário diretamente para a tela de chat correspondente (`/conversations/10`).
3. Ao abrir a tela, chame `GET /api/conversations/10/messages` para sincronizar e emita `join_room` no socket.

---

## 6. Enums e Tipos de Dados

### `MessageType`
- `TEXT`: Mensagem de texto simples.
- `IMAGE`: Mensagem contendo URL de imagem.
- `AUDIO`: Mensagem contendo URL de arquivo de áudio / mensagem de voz.

### `MessageStatus`
- `SENT`: Mensagem salva no servidor (1 tracinho cinza `✓`).
- `DELIVERED`: Mensagem entregue ao dispositivo (2 tracinhos cinzas `✓✓`).
- `READ`: Mensagem lida pelo destinatário (2 tracinhos azuis ou destacados `✓✓`).

---

## 7. Padrão de Resposta de Erros

Quando ocorre um erro de validação ou regra de negócio, a API retorna o formato padrão do NestJS:

```json
{
  "statusCode": 400,
  "message": [
    "O email é obrigatório",
    "A senha deve conter no mínimo 6 caracteres"
  ],
  "error": "Bad Request"
}
```
Ou para erros de autenticação/permissão:
```json
{
  "statusCode": 401,
  "message": "Email ou senha incorretos",
  "error": "Unauthorized"
}
```
