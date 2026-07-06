import { describe, it, expect } from 'vitest';

import {
  GeofenceExitRule,
  HighTemperatureRule,
  AbnormalHeartRateRule,
  NightMovementRule,
  LowBatteryRule,
  SensorOfflineRule,
  ProlongedImmobilityRule,
} from '@alerts/rules';
import {
  DEFAULT_THRESHOLDS,
  type AlertContext,
  type PeriodicAnimalState,
} from '@alerts/alerts.types';
import type { ActiveGeofence } from '@geofence/geofence.types';

// Geocerca cuadrada lat/lng (0,10)x(0,10)
const SQUARE: ActiveGeofence = {
  id: 'gf-1', name: 'Potrero', color: '#1a7a4a',
  polygon: [
    { lat: 0, lng: 0 }, { lat: 0, lng: 10 }, { lat: 10, lng: 10 }, { lat: 10, lng: 0 },
  ],
};

function ctx(overrides: Partial<AlertContext> = {}): AlertContext {
  return {
    animalId: 'a1',
    farmId:   'f1',
    deviceId: 'd1',
    gps:      { lat: 5, lng: 5, speedKmh: 0 },
    vitals:   { tempC: 38.5, heartBpm: 70, activity: 50, batteryPct: 80 },
    geofences: [],
    thresholds: DEFAULT_THRESHOLDS,
    now:       new Date('2026-07-05T12:00:00Z'),
    localHour: 12,
    ...overrides,
  };
}

// ── HighTemperatureRule ────────────────────────────────────────────────────────

describe('HighTemperatureRule', () => {
  const rule = new HighTemperatureRule();

  it('TEST-ALERT-001: 40.6°C → CRITICAL', () => {
    const r = rule.evaluate(ctx({ vitals: { tempC: 40.6, heartBpm: 70, activity: 50, batteryPct: 80 } }));
    expect(r?.priority).toBe('CRITICAL');
    expect(r?.ruleId).toBe('HIGH_TEMP');
  });

  it('39.6°C → WARNING', () => {
    const r = rule.evaluate(ctx({ vitals: { tempC: 39.6, heartBpm: 70, activity: 50, batteryPct: 80 } }));
    expect(r?.priority).toBe('WARNING');
  });

  it('TEST-ALERT-002: 38.2°C → null (sin alerta)', () => {
    const r = rule.evaluate(ctx({ vitals: { tempC: 38.2, heartBpm: 70, activity: 50, batteryPct: 80 } }));
    expect(r).toBeNull();
  });
});

// ── AbnormalHeartRateRule ──────────────────────────────────────────────────────

describe('AbnormalHeartRateRule', () => {
  const rule = new AbnormalHeartRateRule();
  const v = (heartBpm: number) => ({ tempC: 38.5, heartBpm, activity: 50, batteryPct: 80 });

  it('25 bpm → CRITICAL (< 30)', () => {
    expect(rule.evaluate(ctx({ vitals: v(25) }))?.priority).toBe('CRITICAL');
  });
  it('130 bpm → CRITICAL (> 120)', () => {
    expect(rule.evaluate(ctx({ vitals: v(130) }))?.priority).toBe('CRITICAL');
  });
  it('35 bpm → WARNING (< 40)', () => {
    expect(rule.evaluate(ctx({ vitals: v(35) }))?.priority).toBe('WARNING');
  });
  it('110 bpm → WARNING (> 100)', () => {
    expect(rule.evaluate(ctx({ vitals: v(110) }))?.priority).toBe('WARNING');
  });
  it('70 bpm → null (normal)', () => {
    expect(rule.evaluate(ctx({ vitals: v(70) }))).toBeNull();
  });
});

// ── LowBatteryRule ─────────────────────────────────────────────────────────────

describe('LowBatteryRule', () => {
  const rule = new LowBatteryRule();
  it('10% → INFO', () => {
    const r = rule.evaluate(ctx({ vitals: { tempC: 38.5, heartBpm: 70, activity: 50, batteryPct: 10 } }));
    expect(r?.priority).toBe('INFO');
  });
  it('20% → null', () => {
    expect(rule.evaluate(ctx({ vitals: { tempC: 38.5, heartBpm: 70, activity: 50, batteryPct: 20 } }))).toBeNull();
  });
});

// ── GeofenceExitRule ───────────────────────────────────────────────────────────

describe('GeofenceExitRule', () => {
  const rule = new GeofenceExitRule();

  it('sin geocercas activas → null (no hay límite)', () => {
    expect(rule.evaluate(ctx({ geofences: [] }))).toBeNull();
  });

  it('dentro de la geocerca → null', () => {
    expect(rule.evaluate(ctx({ geofences: [SQUARE], gps: { lat: 5, lng: 5, speedKmh: 0 } }))).toBeNull();
  });

  it('fuera de todas las geocercas → CRITICAL con geofenceId', () => {
    const r = rule.evaluate(ctx({ geofences: [SQUARE], gps: { lat: 50, lng: 50, speedKmh: 0 } }));
    expect(r?.priority).toBe('CRITICAL');
    expect(r?.geofenceId).toBe('gf-1');
  });
});

// ── NightMovementRule ──────────────────────────────────────────────────────────

describe('NightMovementRule', () => {
  const rule = new NightMovementRule();

  it('noche (23h) + velocidad 20 + fuera de geocerca → CRITICAL', () => {
    const r = rule.evaluate(ctx({ localHour: 23, gps: { lat: 50, lng: 50, speedKmh: 20 }, geofences: [SQUARE] }));
    expect(r?.priority).toBe('CRITICAL');
  });

  it('de día (12h) aunque haya velocidad alta → null', () => {
    expect(rule.evaluate(ctx({ localHour: 12, gps: { lat: 50, lng: 50, speedKmh: 20 }, geofences: [SQUARE] }))).toBeNull();
  });

  it('noche pero velocidad baja → null', () => {
    expect(rule.evaluate(ctx({ localHour: 2, gps: { lat: 50, lng: 50, speedKmh: 5 }, geofences: [SQUARE] }))).toBeNull();
  });

  it('noche + rápido pero DENTRO de geocerca → null', () => {
    expect(rule.evaluate(ctx({ localHour: 2, gps: { lat: 5, lng: 5, speedKmh: 20 }, geofences: [SQUARE] }))).toBeNull();
  });
});

// ── SensorOfflineRule (periódica) ──────────────────────────────────────────────

describe('SensorOfflineRule', () => {
  const rule = new SensorOfflineRule();
  const now = new Date('2026-07-05T12:00:00Z');

  function state(overrides: Partial<PeriodicAnimalState> = {}): PeriodicAnimalState {
    return {
      animalId: 'a1', farmId: 'f1', deviceId: 'd1',
      lastSeenAt: new Date('2026-07-05T11:59:00Z'), // 1 min atrás
      maxActivityInWindow: 50, vitalSamplesInWindow: 10,
      ...overrides,
    };
  }

  it('última señal hace 1 min → null', () => {
    expect(rule.evaluate(state(), DEFAULT_THRESHOLDS, now)).toBeNull();
  });

  it('última señal hace 10 min → WARNING', () => {
    const r = rule.evaluate(state({ lastSeenAt: new Date('2026-07-05T11:50:00Z') }), DEFAULT_THRESHOLDS, now);
    expect(r?.priority).toBe('WARNING');
    expect(r?.ruleId).toBe('SENSOR_OFFLINE');
  });

  it('sin device → null', () => {
    expect(rule.evaluate(state({ deviceId: null }), DEFAULT_THRESHOLDS, now)).toBeNull();
  });

  it('nunca reportó (lastSeenAt null) → null', () => {
    expect(rule.evaluate(state({ lastSeenAt: null }), DEFAULT_THRESHOLDS, now)).toBeNull();
  });
});

// ── ProlongedImmobilityRule (periódica) ────────────────────────────────────────

describe('ProlongedImmobilityRule', () => {
  const rule = new ProlongedImmobilityRule();

  function state(overrides: Partial<PeriodicAnimalState> = {}): PeriodicAnimalState {
    return {
      animalId: 'a1', farmId: 'f1', deviceId: 'd1', lastSeenAt: new Date(),
      maxActivityInWindow: 2, vitalSamplesInWindow: 20,
      ...overrides,
    };
  }

  it('actividad máx 2 (< 5) con muestras → WARNING', () => {
    const r = rule.evaluate(state(), DEFAULT_THRESHOLDS);
    expect(r?.priority).toBe('WARNING');
    expect(r?.ruleId).toBe('PROLONGED_IMMOBILITY');
  });

  it('actividad máx 30 → null', () => {
    expect(rule.evaluate(state({ maxActivityInWindow: 30 }), DEFAULT_THRESHOLDS)).toBeNull();
  });

  it('sin muestras en la ventana → null (evita falso positivo)', () => {
    expect(rule.evaluate(state({ vitalSamplesInWindow: 0, maxActivityInWindow: null }), DEFAULT_THRESHOLDS)).toBeNull();
  });
});
