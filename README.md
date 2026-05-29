# 🐄 SmartCow API

Backend principal de **SmartCow Tracker** — Sistema de rastreo y monitoreo en tiempo real de ganado bovino mediante sensores GPS e IoT.

---

## 🧱 Stack Tecnológico

| Categoría | Tecnología | Versión |
|-----------|------------|---------|
| Runtime | Node.js | 20 LTS |
| Framework | Express | 4.x |
| Lenguaje | TypeScript | 5.x |
| ORM | Prisma | 5.x |
| Base de datos | PostgreSQL | 15 |
| Cache / Realtime | Redis | 7.x |
| WebSockets | Socket.IO | 4.x |
| Jobs asíncronos | Bull MQ | 5.x |
| Broker IoT | MQTT.js | 5.x |
| Autenticación | JWT RS256 + 2FA TOTP | — |
| Validación | Zod | 3.x |
| Tests | Vitest | 2.x |

---

## 📁 Estructura del Proyecto

```
smartcow-api/
├── src/
│   ├── auth/           # Autenticación JWT, 2FA, RBAC
│   ├── animals/        # CRUD ganado, importación CSV
│   ├── gps/            # Pipeline telemetría IoT
│   ├── geofence/       # Geocercas, Point-in-Polygon
│   ├── alerts/         # Motor de reglas y alertas
│   ├── realtime/       # WebSocket Gateway (Socket.IO)
│   ├── notifications/  # Email (SendGrid) + SMS (Twilio)
│   ├── reports/        # Generación PDF/XLSX
│   ├── ai/             # Cliente servicio ML Python
│   ├── prisma/         # Cliente PostgreSQL (Prisma)
│   ├── redis/          # Cache + pub/sub
│   ├── workers/        # Jobs asíncronos (Bull MQ)
│   ├── common/         # Middlewares, guards, utils
│   └── app.ts          # Entry point
├── prisma/
│   ├── schema.prisma   # Esquema de base de datos
│   ├── migrations/     # Historial de migraciones
│   └── seed.ts         # Datos iniciales
├── tests/
│   ├── unit/
│   └── integration/
├── Dockerfile
├── .env.example
└── docker-compose.yml
```

---

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js >= 20
- PostgreSQL 15
- Redis 7
- Docker (opcional)

### 1. Clonar e instalar

```bash
git clone https://github.com/tu-usuario/smartcow-api.git
cd smartcow-api
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 3. Base de datos

```bash
npx prisma migrate dev
npx prisma db seed
```

### 4. Levantar en desarrollo

```bash
# Servidor API
npm run dev

# Worker de jobs en otra terminal
npm run dev:worker
```

El servidor corre en `http://localhost:4000`.

### 5. Con Docker Compose

```bash
docker compose up -d
```

---

## 🔑 Variables de Entorno

```env
# Base de datos
DATABASE_URL=postgresql://user:password@localhost:5432/smartcow_db

# Redis
REDIS_URL=redis://localhost:6379

# JWT (RS256 — generar con openssl)
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."

# 2FA
TWO_FACTOR_ENCRYPTION_KEY=your-32-char-hex-key

# MQTT Broker
MQTT_BROKER_URL=mqtts://localhost:8883

# Notificaciones
SENDGRID_API_KEY=SG.xxxxx
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx

# IA Service
AI_SERVICE_URL=http://localhost:8000

# Storage
STORAGE_BUCKET=smartcow-media

# App
PORT=4000
NODE_ENV=development
```

---

## 📡 API REST

Base URL: `http://localhost:4000/api/v1`

| Módulo | Prefijo | Descripción |
|--------|---------|-------------|
| Auth | `/auth` | Login, logout, refresh, 2FA |
| Ganado | `/animals` | CRUD + importación CSV |
| GPS | `/animals/:id/location` | Posición actual e historial |
| Geocercas | `/geofences` | CRUD de perímetros |
| Alertas | `/alerts` | Gestión del ciclo de vida |
| Analytics | `/analytics` | Reportes y estadísticas |
| Admin | `/admin` | Usuarios, dispositivos IoT |

La documentación completa de la API está disponible en `/api/docs` (Swagger UI) en entornos de desarrollo.

---

## ⚡ WebSocket

Conexión: `ws://localhost:4000`
Namespace: `/farms/{farmId}`

Eventos principales emitidos por el servidor:

| Evento | Descripción |
|--------|-------------|
| `animal:position` | Nueva posición GPS en tiempo real |
| `animal:vitals` | Actualización de signos vitales |
| `alert:new` | Nueva alerta generada |
| `sensor:offline` | Sensor sin señal > 5 minutos |

---

## 🧪 Tests

```bash
# Todos los tests
npm test

# Con cobertura
npm run test:coverage

# Solo integración
npm run test:integration

# Modo watch
npm run test:watch
```

---

## 🐳 Docker

```bash
# Build de la imagen
docker build -t smartcow-api .

# Ejecutar contenedor
docker run -p 4000:4000 --env-file .env smartcow-api
```

---

## 📋 Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor en modo desarrollo con hot reload |
| `npm run dev:worker` | Worker de jobs en modo desarrollo |
| `npm run build` | Compilar TypeScript a JavaScript |
| `npm start` | Ejecutar build de producción |
| `npm run prisma:migrate` | Aplicar migraciones de BD |
| `npm run prisma:studio` | Abrir Prisma Studio |
| `npm run lint` | Lint del código fuente |
| `npm run format` | Formatear con Prettier |

---

## 🏗️ Arquitectura

Este servicio implementa una **arquitectura monolítica modular** (ADR-001) con separación estricta de responsabilidades en 4 capas:

```
Presentación    →  Routes / Controllers
Aplicación      →  Services
Dominio         →  Entities / Domain Services
Infraestructura →  Repositories / Adapters
```

Cada módulo expone únicamente sus interfaces públicas. Ningún módulo importa directamente los internos de otro.

---

## 📄 Documentación Técnica

La documentación completa del proyecto se encuentra en el repositorio [`smartcow-infra`](https://github.com/tu-usuario/smartcow-infra):

- `SRS v1.0.0` — Especificación de Requisitos de Software
- `SAD v1.0.0` — Documento de Arquitectura de Software
- `SDD v1.0.0` — Documento de Diseño de Software
- `ADR v1.0.0` — Architecture Decision Records
- `IDD v1.0.0` — Documento de Diseño de Interfaces
- `Modelo de Datos v1.0.0` — Esquema completo de Base de Datos

---

## 🤝 Contribución

1. Crea una rama desde `develop`: `git checkout -b feature/nombre-feature`
2. Haz tus cambios y escribe los tests correspondientes
3. Asegúrate de pasar lint y tests: `npm run lint && npm test`
4. Abre un Pull Request hacia `develop`

---

## 📝 Licencia

Proyecto — SmartCow Tracker © 2026
