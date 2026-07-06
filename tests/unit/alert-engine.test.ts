import { describe, it, expect } from 'vitest';

import { AlertEngine } from '@alerts/alert-engine';
import {
  DEFAULT_THRESHOLDS,
  type AlertContext,
  type AlertResult,
  type IAlertRule,
} from '@alerts/alerts.types';

function baseCtx(): AlertContext {
  return {
    animalId: 'a1', farmId: 'f1', deviceId: 'd1',
    gps: { lat: 5, lng: 5, speedKmh: 0 },
    vitals: { tempC: 38.5, heartBpm: 70, activity: 50, batteryPct: 80 },
    geofences: [], thresholds: DEFAULT_THRESHOLDS,
    now: new Date('2026-07-05T12:00:00Z'), localHour: 12,
  };
}

function fixedRule(ruleId: string, result: AlertResult | null): IAlertRule {
  return { ruleId, priority: 'WARNING', evaluate: () => result };
}

describe('AlertEngine', () => {
  it('recolecta solo los resultados no nulos de las reglas', () => {
    const fire: AlertResult = { ruleId: 'R1', priority: 'CRITICAL', title: 't', description: 'd' };
    const engine = new AlertEngine([
      fixedRule('R1', fire),
      fixedRule('R2', null),
    ]);

    const results = engine.evaluate(baseCtx());
    expect(results).toHaveLength(1);
    expect(results[0]?.ruleId).toBe('R1');
  });

  it('devuelve todos los disparos cuando varias reglas se cumplen', () => {
    const engine = new AlertEngine([
      fixedRule('R1', { ruleId: 'R1', priority: 'WARNING', title: 'a', description: 'a' }),
      fixedRule('R2', { ruleId: 'R2', priority: 'INFO',    title: 'b', description: 'b' }),
    ]);
    expect(engine.evaluate(baseCtx())).toHaveLength(2);
  });

  it('una regla que lanza no aborta la evaluación del resto', () => {
    const throwing: IAlertRule = {
      ruleId: 'BOOM', priority: 'WARNING',
      evaluate: () => { throw new Error('fallo de regla'); },
    };
    const engine = new AlertEngine([
      throwing,
      fixedRule('OK', { ruleId: 'OK', priority: 'WARNING', title: 'ok', description: 'ok' }),
    ]);

    const results = engine.evaluate(baseCtx());
    expect(results).toHaveLength(1);
    expect(results[0]?.ruleId).toBe('OK');
  });

  it('sin disparos devuelve lista vacía', () => {
    const engine = new AlertEngine([fixedRule('R1', null)]);
    expect(engine.evaluate(baseCtx())).toEqual([]);
  });
});
