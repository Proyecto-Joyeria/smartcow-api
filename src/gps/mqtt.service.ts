import mqtt, { type MqttClient } from 'mqtt';

import { logger } from '@common/utils/logger';
import { gpsService } from '@gps/gps.service';
import { gpsRepository } from '@gps/gps.repository';

// ═══════════════════════════════════════════════════════════════════════════════
// MQTT Service — Sprint 3
//
// Singleton que conecta al broker Mosquitto, se suscribe a la telemetría de los
// collares y al estado online/offline de los devices. Cada mensaje de telemetría
// entra al pipeline no bloqueante de gpsService.processTelemetry().
// ═══════════════════════════════════════════════════════════════════════════════

const MQTT_BROKER_URL = process.env['MQTT_BROKER_URL'] ?? process.env['MQTT_URL'] ?? 'mqtt://localhost:1883';
const MQTT_CLIENT_ID  = process.env['MQTT_CLIENT_ID']  ?? `smartcow-api-${process.pid}`;
const MQTT_USERNAME   = process.env['MQTT_USERNAME'];
const MQTT_PASSWORD   = process.env['MQTT_PASSWORD'];

// Topics configurables por entorno (defaults según api-contracts.md)
const TOPIC_TELEMETRY = process.env['MQTT_TOPIC_TELEMETRY'] ?? 'smartcow/farms/+/animals/+/telemetry';
const TOPIC_STATUS    = process.env['MQTT_TOPIC_STATUS']    ?? 'smartcow/devices/+/status';

// Backoff exponencial de reconexión: 2s → 4s → 8s → ... → máx 60s
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS  = 60_000;

interface DeviceStatusPayload {
  status?:     'online' | 'offline';
  ts?:         number;
  batteryPct?: number;
  bt?:         number;
}

class MqttService {
  private client: MqttClient | null = null;
  private reconnectDelayMs = RECONNECT_BASE_MS;

  /** Conecta al broker y registra los handlers del ciclo de vida. */
  connect(): void {
    if (this.client) {
      logger.warn('MQTT: connect() llamado con un cliente ya existente — ignorado');
      return;
    }

    this.client = mqtt.connect(MQTT_BROKER_URL, {
      clientId:        MQTT_CLIENT_ID,
      username:        MQTT_USERNAME,
      password:        MQTT_PASSWORD,
      reconnectPeriod: this.reconnectDelayMs,
      connectTimeout:  10_000,
      clean:           true,
    });

    this.client.on('connect', () => {
      this.reconnectDelayMs = RECONNECT_BASE_MS; // reset del backoff al reconectar
      logger.info('MQTT: conectado al broker', { url: MQTT_BROKER_URL, clientId: MQTT_CLIENT_ID });
      this.subscribeAll();
    });

    this.client.on('message', (topic, payload) => {
      void this.handleMessage(topic, payload);
    });

    this.client.on('reconnect', () => {
      // Incrementa el backoff exponencialmente hasta el tope
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS);
      if (this.client) this.client.options.reconnectPeriod = this.reconnectDelayMs;
      logger.warn('MQTT: reintentando conexión', { nextDelayMs: this.reconnectDelayMs });
    });

    this.client.on('error', (err: Error) => {
      logger.error('MQTT: error de cliente', { message: err.message });
    });

    this.client.on('offline', () => {
      logger.warn('MQTT: cliente offline');
    });

    this.client.on('close', () => {
      logger.warn('MQTT: conexión cerrada');
    });
  }

  private subscribeAll(): void {
    if (!this.client) return;
    for (const topic of [TOPIC_TELEMETRY, TOPIC_STATUS]) {
      this.client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          logger.error('MQTT: error al suscribirse', { topic, message: err.message });
        } else {
          logger.info('MQTT: suscrito al topic', { topic });
        }
      });
    }
  }

  /**
   * Enruta cada mensaje según su topic. Captura cualquier error para que un
   * mensaje corrupto o un payload inválido nunca tumbe la conexión MQTT.
   */
  private async handleMessage(topic: string, payloadBuf: Buffer): Promise<void> {
    logger.debug('MQTT: mensaje recibido', { topic, bytes: payloadBuf.length });

    try {
      const segments = topic.split('/');

      // smartcow/farms/{farmId}/animals/{animalId}/telemetry
      if (segments[1] === 'farms' && segments[5] === 'telemetry') {
        const payload = JSON.parse(payloadBuf.toString('utf8'));
        await gpsService.processTelemetry(payload);
        return;
      }

      // smartcow/devices/{deviceId}/status
      if (segments[1] === 'devices' && segments[3] === 'status') {
        const deviceId = segments[2] ?? '';
        const payload  = JSON.parse(payloadBuf.toString('utf8')) as DeviceStatusPayload;
        await this.handleDeviceStatus(deviceId, payload);
        return;
      }

      logger.warn('MQTT: topic no reconocido', { topic });
    } catch (err) {
      logger.warn('MQTT: error procesando mensaje', {
        topic,
        message: err instanceof Error ? err.message : 'desconocido',
      });
    }
  }

  /** Refresca lastSeenAt (y batería si viene) del device ante un mensaje de status. */
  private async handleDeviceStatus(deviceId: string, payload: DeviceStatusPayload): Promise<void> {
    if (!deviceId) return;
    const batteryPct = payload.batteryPct ?? payload.bt;
    await gpsRepository.updateDeviceState(deviceId, {
      lastSeenAt: new Date(),
      ...(batteryPct !== undefined && { batteryPct }),
    });
    logger.debug('MQTT: estado de device actualizado', { deviceId, status: payload.status });
  }

  /** Cierra la conexión MQTT en el shutdown graceful. */
  async disconnect(): Promise<void> {
    if (!this.client) return;
    await new Promise<void>((resolve) => {
      this.client!.end(false, {}, () => resolve());
    });
    this.client = null;
    logger.info('MQTT: desconectado');
  }
}

export const mqttService = new MqttService();
