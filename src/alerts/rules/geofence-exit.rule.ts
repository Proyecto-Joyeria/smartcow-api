import { AlertPriority } from '@prisma/client';
import { isInsideAny } from '@geofence/geofence.geometry';
import type { AlertContext, AlertResult, IAlertRule } from '@alerts/alerts.types';

/**
 * GEOFENCE_EXIT — El animal salió de sus geocercas (SDD §3.4.2).
 *
 * Política del dominio: un animal debe permanecer DENTRO de al menos una geocerca
 * activa de la finca. Si hay geocercas activas y su posición GPS no cae dentro de
 * NINGUNA, se dispara una alerta CRITICAL.
 *
 * Si la finca no tiene geocercas activas, la regla no aplica (retorna null): no hay
 * límite que cruzar.
 */
export class GeofenceExitRule implements IAlertRule {
  readonly ruleId = 'GEOFENCE_EXIT';
  readonly priority = AlertPriority.CRITICAL;

  evaluate(ctx: AlertContext): AlertResult | null {
    const { geofences } = ctx;
    if (geofences.length === 0) return null;

    const point = { lat: ctx.gps.lat, lng: ctx.gps.lng };
    const inside = isInsideAny(point, geofences.map((g) => g.polygon));
    if (inside) return null;

    // Fuera de todas: se referencia la primera geocerca como zona de la que salió.
    const zone = geofences[0]!;
    return {
      ruleId:      this.ruleId,
      priority:    AlertPriority.CRITICAL,
      title:       'Animal fuera de geocerca',
      description: `El animal cruzó el límite de la(s) geocerca(s) activa(s). Posición actual: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}.`,
      geofenceId:  zone.id,
      metadata:    {
        lat:       point.lat,
        lng:       point.lng,
        type:      'EXIT',
        geofences: geofences.map((g) => ({ id: g.id, name: g.name })),
      },
    };
  }
}
