# Integração: Confirmação de Leitura e Status de Mensagens (Double Check Azul)

Este documento especifica a implementação do **sistema de confirmação de leitura ("Visualizou a mensagem")** no backend NestJS para integração com o aplicativo mobile **WhatsApp Native**.

---

## 1. Visão Geral do Ciclo de Vida da Mensagem

No aplicativo mobile, as mensagens passam pelos seguintes status visuais:

| Status | Ícone no Mobile | Significado |
|---|---|---|
| `PENDING` | 🕒 Relógio | Mensagem salva localmente no SQLite, aguardando envio à API. |
| `SENT` | ✔️ 1 Check Cinza | Mensagem recebida e gravada com sucesso no servidor NestJS. |
| `DELIVERED` | ✔️✔️ 2 Checks Cinzas | Mensagem entregue ao dispositivo do destinatário (ou recebida pelo app). |
| `READ` | ✔️✔️ 2 Checks Azuis (`#34B7F1`) | O destinatário abriu a conversa e visualizou as mensagens. |

---

## 2. Endpoints Necessários no NestJS

### 2.1. Marcar Conversa como Lida (Leitura em Lote)

Quando o usuário entra na tela de chat de uma conversa, o aplicativo mobile chama este endpoint para marcar todas as mensagens recebidas como lidas e zerar o contador de não lidas.

- **Método**: `PATCH`
- **Rota**: `/conversations/:id/read`
- **Autenticação**: `Bearer <JWT_TOKEN>` (usuário logado que está lendo)
- **Parâmetros de URL**: `id` (ID da conversa no backend)
- **Comportamento Esperado**:
  1. Identificar o usuário autenticado (`req.user.id`).
  2. Atualizar todas as mensagens da conversa onde `senderId != req.user.id` e `status != 'READ'` para `status = 'READ'`.
  3. Resetar o contador `unreadCount` desse usuário na conversa para `0`.
  4. (Opcional se houver WebSocket): Notificar o remetente em tempo real via evento `messages.read`.

#### Exemplo de Resposta de Sucesso:
```json
{
  "success": true,
  "conversationId": 10,
  "markedCount": 4,
  "status": "READ"
}
```

---

### 2.2. Atualizar Status de Mensagem Individual

Permite atualizar o status de uma mensagem específica (por exemplo, de `SENT` para `DELIVERED` ou `READ`).

- **Método**: `PATCH`
- **Rota**: `/messages/:id/status`
- **Autenticação**: `Bearer <JWT_TOKEN>`
- **Body**:
```json
{
  "status": "READ"
}
```
- **Valores válidos para `status`**: `"DELIVERED"`, `"READ"`.

#### Exemplo de Resposta de Sucesso:
```json
{
  "id": 102,
  "conversationId": 10,
  "status": "READ",
  "updatedAt": "2026-08-29T00:30:00.000Z"
}
```

---

### 2.3. Obter Mensagens da Conversa com o Status

No endpoint existente de listagem de mensagens, certifique-se de retornar o campo `status` atualizado para cada mensagem.

- **Método**: `GET`
- **Rota**: `/conversations/:id/messages`
- **Autenticação**: `Bearer <JWT_TOKEN>`

#### Exemplo de Resposta:
```json
[
  {
    "id": 101,
    "tempId": "tmp_abc123",
    "conversationId": 10,
    "senderId": 1,
    "content": "Olá, tudo bem?",
    "type": "TEXT",
    "status": "READ",
    "createdAt": "2026-08-29T00:20:00.000Z"
  },
  {
    "id": 102,
    "tempId": null,
    "conversationId": 10,
    "senderId": 2,
    "content": "Tudo ótimo por aqui!",
    "type": "TEXT",
    "status": "READ",
    "createdAt": "2026-08-29T00:21:00.000Z"
  }
]
```

---

### 2.4. Listagem de Conversas com Contador de Não Lidas

No endpoint `GET /conversations`, retornar o `unreadCount` e o status da última mensagem:

- **Método**: `GET`
- **Rota**: `/conversations`

#### Exemplo de Resposta:
```json
[
  {
    "id": 10,
    "isGroup": false,
    "contact": {
      "id": 2,
      "name": "Mariana Souza",
      "username": "mariana_souza",
      "email": "mariana@example.com",
      "avatarUrl": null
    },
    "lastMessage": {
      "id": 102,
      "content": "Tudo ótimo por aqui!",
      "senderId": 2,
      "status": "READ",
      "createdAt": "2026-08-29T00:21:00.000Z"
    },
    "unreadCount": 0,
    "status": "ACCEPTED",
    "updatedAt": "2026-08-29T00:21:00.000Z"
  }
]
```

---

## 3. Exemplo de Código no NestJS (Controller & Service)

### `conversations.controller.ts`
```typescript
import { Controller, Patch, Param, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationsService } from './conversations.service';

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Patch(':id/read')
  async markAsRead(
    @Param('id', ParseIntPipe) conversationId: number,
    @Request() req,
  ) {
    const userId = req.user.id;
    return this.conversationsService.markConversationAsRead(conversationId, userId);
  }
}
```

### `conversations.service.ts` (Exemplo com Prisma / TypeORM)
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async markConversationAsRead(conversationId: number, userId: number) {
    // 1. Atualiza mensagens recebidas que ainda não foram lidas
    const result = await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        status: { not: 'READ' },
      },
      data: {
        status: 'READ',
      },
    });

    // 2. Zera o contador de não lidas da conversa para o usuário
    await this.prisma.conversationMember.updateMany({
      where: {
        conversationId,
        userId,
      },
      data: {
        unreadCount: 0,
      },
    });

    return {
      success: true,
      conversationId,
      markedCount: result.count,
      status: 'READ',
    };
  }
}
```

---

## 4. Como Testar a Integração com o App Mobile

1. **Envio da Mensagem**:
   - O Usuário A envia uma mensagem para o Usuário B. A mensagem é gravada no banco com `status = 'SENT'`. No app do Usuário A, aparece **1 check cinza**.
2. **Entrega**:
   - Quando o app do Usuário B faz polling ou recebe a mensagem, o status passa para `DELIVERED`. No app do Usuário A, aparecem **2 checks cinzas**.
3. **Visualização**:
   - O Usuário B abre a tela de conversa.
   - O app do Usuário B chama `PATCH /conversations/:id/read`.
   - O NestJS atualiza todas as mensagens recebidas para `status = 'READ'`.
   - No próximo polling do Usuário A (a cada 2.5s), as mensagens retornam com `status = 'READ'` e os **checks ficam azuis** instantaneamente!
