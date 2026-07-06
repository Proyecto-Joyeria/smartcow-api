// ═══════════════════════════════════════════════════════════════════════════════
// Geometría de geocercas — Sprint 4
//
// Algoritmo Point-in-Polygon por Ray Casting (ray-crossing / even-odd rule).
// Se ejecuta en la capa de aplicación (no PostGIS) por decisión del DevPlan:
// el polígono vive como JSON en la BD y en la cache Redis, y esta función lo
// evalúa en cada lectura de telemetría dentro del AlertEngine.
//
// Complejidad O(n) sobre los vértices (máx. 50 por geocerca).
// ═══════════════════════════════════════════════════════════════════════════════

/** Coordenada geográfica WGS84. lng = eje X, lat = eje Y. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Determina si un punto está DENTRO de un polígono mediante ray casting.
 *
 * Traza un rayo horizontal hacia el este (+lng) desde el punto y cuenta cuántas
 * aristas del polígono cruza: impar = dentro, par = fuera. El polígono se asume
 * cerrado implícitamente (el último vértice se une con el primero); no hace falta
 * repetir el primer vértice al final.
 *
 * Casos borde:
 *   - Menos de 3 vértices → no es un polígono → siempre `false`.
 *   - Un punto exactamente sobre una arista es indeterminado por naturaleza del
 *     algoritmo; para el dominio (un animal físico) esa precisión es irrelevante.
 *
 * @param point   Punto a evaluar (posición GPS del animal).
 * @param polygon Vértices del polígono en orden (horario o antihorario, indistinto).
 */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;

  const { lat: y, lng: x } = point;
  let inside = false;

  // Recorre cada arista (j → i), con j el vértice previo a i (cierre implícito).
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = polygon[i]!;
    const vj = polygon[j]!;
    const xi = vi.lng, yi = vi.lat;
    const xj = vj.lng, yj = vj.lat;

    // ¿La arista cruza la línea horizontal y = point.lat?
    const straddles = (yi > y) !== (yj > y);
    if (!straddles) continue;

    // Longitud del cruce de la arista a la altura y; si está a la derecha del
    // punto (> x), el rayo la atraviesa → alterna el estado.
    const intersectX = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (x < intersectX) inside = !inside;
  }

  return inside;
}

/**
 * Evalúa si un punto está FUERA de todas las geocercas dadas.
 * Devuelve la primera geocerca de la que el punto está fuera y dentro de la cual
 * DEBERÍA estar. Semántica del dominio: un animal debe permanecer dentro de sus
 * geocercas activas; salir de cualquiera dispara GEOFENCE_EXIT.
 *
 * Nota: la política "dentro de al menos una" vs "dentro de todas" la decide el
 * llamador. Esta función solo expone el chequeo puntual; la regla de negocio vive
 * en GeofenceExitRule.
 */
export function isInsideAny(point: LatLng, polygons: LatLng[][]): boolean {
  return polygons.some((poly) => pointInPolygon(point, poly));
}
