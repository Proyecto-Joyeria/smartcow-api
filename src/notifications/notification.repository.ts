import { prisma } from '@prisma/prisma.service';
import type { Recipient } from '@notifications/notification.types';

class NotificationRepository {

  /**
   * Usuarios activos de la finca que deben recibir notificaciones de alertas.
   * Se notifica a todos los miembros activos de la finca (ADMIN, VET, OPERATOR);
   * el filtrado por prioridad ocurre por canal, no por usuario.
   */
  async getFarmRecipients(farmId: string): Promise<Recipient[]> {
    const userFarms = await prisma.userFarm.findMany({
      where:  { farmId, user: { active: true } },
      select: { user: { select: { id: true, email: true, phone: true } } },
    });

    return userFarms.map((uf) => ({
      userId: uf.user.id,
      email:  uf.user.email,
      phone:  uf.user.phone,
    }));
  }
}

export const notificationRepository = new NotificationRepository();
