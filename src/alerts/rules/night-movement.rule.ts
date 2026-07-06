import { AlertPriority } from '@prisma/client';
import { isInsideAny } from '@geofence/geofence.geometry';
import type { AlertContext, AlertResult, IAlertRule } from '@alerts/alerts.types';

/**
 * NIGHT_MOVEMENT — Movimiento nocturno anómalo (SDD §3.4.2).
 *
 * Dispara CRITICAL cuando, en la ventana nocturna (por defecto 22:00–05:00 hora
 * local de la finca), el animal se desplaza a > 15 km/h y está FUERA de sus
 * geocercas activas. Señal típica de robo o estampida.
 *
 * Si hay geocercas activas y el animal está dentro, no dispara. Si no hay geocercas,
 * el movimiento nocturno rápido por sí solo es suficiente (no hay zona segura).
 */
export class NightMovementRule implements IAlertRule {
  readonly ruleId = 'NIGHT_MOVEMENT';
  readonly priority = AlertPriority.CRITICAL;

  evaluate(ctx: AlertContext): AlertResult | null {
    const speed = ctx.gps.speedKmh ?? 0;
    const { nightSpeedKmh, nightStartHour, nightEndHour } = ctx.thresholds;

    if (!this.isNightHour(ctx.localHour, nightStartHour, nightEndHour)) return null;
    if (speed <= nightSpeedKmh) return null;

    // "fuera de geocerca": si hay geocercas, debe estar fuera de todas.
    const point = { lat: ctx.gps.lat, lng: ctx.gps.lng };
    const insideSomeZone = ctx.geofences.length > 0 &&
      isInsideAny(point, ctx.geofences.map((g) => g.polygon));
    if (insideSomeZone) return null;

    return {
      ruleId:      this.ruleId,
      priority:    AlertPriority.CRITICAL,
      title:       'Movimiento nocturno anómalo',
      description: `Desplazamiento a ${speed.toFixed(1)} km/h durante la noche (${ctx.localHour}:00 h) fuera de geocerca. Posible robo o estampida.`,
      metadata:    { speedKmh: speed, localHour: ctx.localHour, lat: point.lat, lng: point.lng },
    };
  }

  /**
   * Ventana horaria que puede cruzar la medianoche. Con start=22, end=5, la ventana
   * activa es [22,23] ∪ [0,5). Con start<=end sería un rango normal.
   */
  private isNightHour(hour: number, start: number, end: number): boolean {
    if (start <= end) return hour >= start && hour < end;
    return hour >= start || hour < end;
  }
}
