import { describe, it, expect } from 'vitest';

import { pointInPolygon, isInsideAny, type LatLng } from '@geofence/geofence.geometry';

// ── Polígonos de referencia ──────────────────────────────────────────────────

/** Cuadrado eje-alineado: lat ∈ (0,10), lng ∈ (0,10). */
const SQUARE: LatLng[] = [
  { lat: 0,  lng: 0 },
  { lat: 0,  lng: 10 },
  { lat: 10, lng: 10 },
  { lat: 10, lng: 0 },
];

/** Polígono cóncavo en forma de "C" (flecha) para probar el ray casting real. */
const CONCAVE: LatLng[] = [
  { lat: 0,  lng: 0 },
  { lat: 10, lng: 0 },
  { lat: 10, lng: 10 },
  { lat: 6,  lng: 10 },
  { lat: 6,  lng: 4 },
  { lat: 4,  lng: 4 },
  { lat: 4,  lng: 10 },
  { lat: 0,  lng: 10 },
];

describe('pointInPolygon — casos conocidos', () => {
  it('un punto claramente dentro del cuadrado → true', () => {
    expect(pointInPolygon({ lat: 5, lng: 5 }, SQUARE)).toBe(true);
  });

  it('un punto fuera del cuadrado → false', () => {
    expect(pointInPolygon({ lat: 15, lng: 5 }, SQUARE)).toBe(false);
    expect(pointInPolygon({ lat: 5, lng: -3 }, SQUARE)).toBe(false);
  });

  it('menos de 3 vértices nunca es un polígono → false', () => {
    expect(pointInPolygon({ lat: 5, lng: 5 }, [{ lat: 0, lng: 0 }, { lat: 10, lng: 10 }])).toBe(false);
  });

  it('respeta la concavidad: el hueco de la "C" queda fuera', () => {
    // (5, 7) cae en la muesca cóncava → fuera
    expect(pointInPolygon({ lat: 5, lng: 7 }, CONCAVE)).toBe(false);
    // (2, 5) está en el cuerpo del polígono → dentro
    expect(pointInPolygon({ lat: 2, lng: 5 }, CONCAVE)).toBe(true);
  });
});

describe('pointInPolygon — 100 casos aleatorios contra un cuadrado eje-alineado', () => {
  it('coincide con el chequeo de límites en 100 puntos aleatorios', () => {
    let checked = 0;
    for (let i = 0; i < 100; i++) {
      // Puntos en [-5, 15) para cubrir dentro y fuera con margen.
      const lat = Math.random() * 20 - 5;
      const lng = Math.random() * 20 - 5;

      // Verdad de referencia para un cuadrado (0,10)x(0,10). Se evita el borde
      // exacto (indeterminado por naturaleza del ray casting) con un epsilon.
      const eps = 1e-9;
      const nearEdge =
        Math.abs(lat - 0) < eps || Math.abs(lat - 10) < eps ||
        Math.abs(lng - 0) < eps || Math.abs(lng - 10) < eps;
      if (nearEdge) continue;

      const expected = lat > 0 && lat < 10 && lng > 0 && lng < 10;
      expect(pointInPolygon({ lat, lng }, SQUARE)).toBe(expected);
      checked++;
    }
    expect(checked).toBeGreaterThan(90); // casi todos los 100 evaluados
  });
});

describe('isInsideAny', () => {
  const FAR_SQUARE: LatLng[] = [
    { lat: 100, lng: 100 },
    { lat: 100, lng: 110 },
    { lat: 110, lng: 110 },
    { lat: 110, lng: 100 },
  ];

  it('true si el punto está dentro de al menos un polígono', () => {
    expect(isInsideAny({ lat: 5, lng: 5 }, [SQUARE, FAR_SQUARE])).toBe(true);
    expect(isInsideAny({ lat: 105, lng: 105 }, [SQUARE, FAR_SQUARE])).toBe(true);
  });

  it('false si el punto está fuera de todos los polígonos', () => {
    expect(isInsideAny({ lat: 50, lng: 50 }, [SQUARE, FAR_SQUARE])).toBe(false);
  });

  it('false con lista vacía de polígonos', () => {
    expect(isInsideAny({ lat: 5, lng: 5 }, [])).toBe(false);
  });
});
