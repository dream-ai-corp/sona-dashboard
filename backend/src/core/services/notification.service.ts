import { prisma } from '../../config/database';

export class NotificationService {
  async schedule(params: {
    userId: string;
    title: string;
    body: string;
    scheduledAt: Date;
    moduleSource: string;
    referenceId: string;
  }) {
    return prisma.notification.create({
      data: params,
    });
  }

  async getPending() {
    return prisma.notification.findMany({
      where: {
        sentAt: null,
        scheduledAt: { lte: new Date() },
      },
      include: { user: true },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    });
  }

  async markSent(id: string) {
    return prisma.notification.update({
      where: { id },
      data: { sentAt: new Date() },
    });
  }

  // TODO: Integrate Firebase Admin SDK to send FCM push notifications
  async sendPush(fcmToken: string, title: string, body: string, data?: Record<string, string>) {
    console.log(`[FCM] Would send to ${fcmToken}: ${title} - ${body}`, data);
    // Will be implemented when Firebase is configured
  }
}

export const notificationService = new NotificationService();
