import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export interface SendPushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private firebaseApp: App | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    let rawPrivateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (
      projectId &&
      clientEmail &&
      rawPrivateKey &&
      !projectId.includes('seu-projeto') &&
      !rawPrivateKey.includes('seu_segredo')
    ) {
      try {
        let privateKey = rawPrivateKey.trim();

        // Remove aspas externas se houver
        if (
          (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
          (privateKey.startsWith("'") && privateKey.endsWith("'"))
        ) {
          privateKey = privateKey.slice(1, -1);
        }

        // Converte caracteres \n escapados para quebras de linha reais
        privateKey = privateKey.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
        privateKey = privateKey.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        this.firebaseApp = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        this.logger.log('Firebase Admin SDK inicializado com sucesso.');
      } catch (error) {
        this.logger.warn(`Erro ao inicializar Firebase Admin SDK: ${error.message}`);
      }
    } else {
      this.logger.warn(
        'Firebase Admin SDK não configurado ou com credenciais padrão. Notificações push serão simuladas em modo log.',
      );
    }
  }

  async sendPushNotification(fcmToken: string, payload: SendPushPayload): Promise<boolean> {
    if (!fcmToken) {
      return false;
    }

    if (!this.firebaseApp) {
      this.logger.debug(
        `[MOCK PUSH] Para token "${fcmToken.slice(0, 15)}...": Title="${payload.title}", Body="${payload.body}", Data=${JSON.stringify(payload.data)}`,
      );
      return true;
    }

    try {
      const messageId = await getMessaging(this.firebaseApp).send({
        token: fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            priority: 'high',
            channelId: 'chat_messages',
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      });
      this.logger.log(`Push notification enviado com sucesso (${messageId}) para ${fcmToken.slice(0, 15)}...`);
      return true;
    } catch (error) {
      this.logger.error(`Falha ao enviar push notification: ${error.message}`);
      return false;
    }
  }
}
