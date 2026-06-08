/**
 * Seed de base de datos — SOLO para entornos de desarrollo.
 * NUNCA ejecutar en producción.
 *
 * Ejecutar con: npm run prisma:seed
 *
 * Crea:
 *   - 1 finca "Finca El Roble"
 *   - 3 usuarios (ADMIN, VET, OPERATOR) con contraseñas hasheadas bcrypt factor 12
 *   - 10 animales con distintas razas y estados
 *   - 2 devices asignados a los 2 primeros animales
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import {
  PrismaClient,
  UserRole,
  Breed,
  Sex,
  AnimalStatus,
  HealthStatus,
  ReproductiveStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const FARM_ID       = 'seed-farm-el-roble-001';

// ── Datos de prueba ────────────────────────────────────────────────────────────

const FARM = {
  name:        'Finca El Roble',
  description: 'Finca ganadera de prueba — 247 animales, zona Cundinamarca',
  timezone:    'America/Bogota',
};

const USERS: {
  email:     string;
  password:  string;
  firstName: string;
  lastName:  string;
  phone:     string;
  role:      UserRole;
}[] = [
  {
    email:     'admin@smartcow.app',
    password:  'Admin123!',
    firstName: 'Carlos',
    lastName:  'Rodríguez',
    phone:     '+573001234567',
    role:      UserRole.ADMIN,
  },
  {
    email:     'vet@smartcow.app',
    password:  'Vet123!',
    firstName: 'María',
    lastName:  'González',
    phone:     '+573009876543',
    role:      UserRole.VET,
  },
  {
    email:     'operator@smartcow.app',
    password:  'Operator123!',
    firstName: 'Juan',
    lastName:  'Martínez',
    phone:     '+573005551234',
    role:      UserRole.OPERATOR,
  },
];

const ANIMALS: {
  id:                 string;
  code:               string;
  name:               string;
  breed:              Breed;
  sex:                Sex;
  birthDate:          Date;
  weightKg:           number;
  areteNumber:        string;
  status:             AnimalStatus;
  healthStatus:       HealthStatus;
  reproductiveStatus?: ReproductiveStatus;
  notes?:             string;
}[] = [
  {
    id:                 'seed-animal-001',
    code:               'BOV-001',
    name:               'Estrella',
    breed:              Breed.BRAHMAN,
    sex:                Sex.F,
    birthDate:          new Date('2020-03-15'),
    weightKg:           480,
    areteNumber:        'AR-0001',
    status:             AnimalStatus.ACTIVE,
    healthStatus:       HealthStatus.HEALTHY,
    reproductiveStatus: ReproductiveStatus.LACTATING,
  },
  {
    id:                 'seed-animal-002',
    code:               'BOV-002',
    name:               'Tormenta',
    breed:              Breed.HOLSTEIN,
    sex:                Sex.F,
    birthDate:          new Date('2019-07-20'),
    weightKg:           520,
    areteNumber:        'AR-0002',
    status:             AnimalStatus.ACTIVE,
    healthStatus:       HealthStatus.HEALTHY,
    reproductiveStatus: ReproductiveStatus.PREGNANT,
  },
  {
    id:        'seed-animal-003',
    code:      'BOV-003',
    name:      'Robusto',
    breed:     Breed.ANGUS,
    sex:       Sex.M,
    birthDate: new Date('2021-01-10'),
    weightKg:  650,
    areteNumber: 'AR-0003',
    status:    AnimalStatus.ACTIVE,
    healthStatus: HealthStatus.HEALTHY,
  },
  {
    id:                 'seed-animal-004',
    code:               'BOV-004',
    name:               'Paloma',
    breed:              Breed.SIMMENTAL,
    sex:                Sex.F,
    birthDate:          new Date('2020-11-05'),
    weightKg:           460,
    areteNumber:        'AR-0004',
    status:             AnimalStatus.ACTIVE,
    healthStatus:       HealthStatus.SICK,
    reproductiveStatus: ReproductiveStatus.OPEN,
    notes:              'En tratamiento antibiótico por mastitis',
  },
  {
    id:        'seed-animal-005',
    code:      'BOV-005',
    name:      'Centauro',
    breed:     Breed.CEBUINO,
    sex:       Sex.M,
    birthDate: new Date('2022-04-18'),
    weightKg:  380,
    areteNumber: 'AR-0005',
    status:    AnimalStatus.ACTIVE,
    healthStatus: HealthStatus.HEALTHY,
  },
  {
    id:                 'seed-animal-006',
    code:               'BOV-006',
    name:               'Luna',
    breed:              Breed.BRAHMAN,
    sex:                Sex.F,
    birthDate:          new Date('2018-09-30'),
    weightKg:           500,
    areteNumber:        'AR-0006',
    status:             AnimalStatus.ACTIVE,
    healthStatus:       HealthStatus.RECOVERING,
    reproductiveStatus: ReproductiveStatus.DRY,
    notes:              'Recuperación post-parto',
  },
  {
    id:        'seed-animal-007',
    code:      'BOV-007',
    name:      'Trueno',
    breed:     Breed.ANGUS,
    sex:       Sex.M,
    birthDate: new Date('2019-02-14'),
    weightKg:  720,
    areteNumber: 'AR-0007',
    status:    AnimalStatus.ACTIVE,
    healthStatus: HealthStatus.HEALTHY,
  },
  {
    id:                 'seed-animal-008',
    code:               'BOV-008',
    name:               'Canela',
    breed:              Breed.HOLSTEIN,
    sex:                Sex.F,
    birthDate:          new Date('2021-06-22'),
    weightKg:           440,
    areteNumber:        'AR-0008',
    status:             AnimalStatus.ACTIVE,
    healthStatus:       HealthStatus.UNDER_OBSERVATION,
    reproductiveStatus: ReproductiveStatus.OPEN,
  },
  {
    id:        'seed-animal-009',
    code:      'BOV-009',
    name:      'Mango',
    breed:     Breed.CEBUINO,
    sex:       Sex.M,
    birthDate: new Date('2023-01-05'),
    weightKg:  290,
    areteNumber: 'AR-0009',
    status:    AnimalStatus.ACTIVE,
    healthStatus: HealthStatus.HEALTHY,
  },
  {
    id:                 'seed-animal-010',
    code:               'BOV-010',
    name:               'Violeta',
    breed:              Breed.SIMMENTAL,
    sex:                Sex.F,
    birthDate:          new Date('2020-08-12'),
    weightKg:           510,
    areteNumber:        'AR-0010',
    status:             AnimalStatus.SOLD,
    healthStatus:       HealthStatus.HEALTHY,
    reproductiveStatus: ReproductiveStatus.OPEN,
    notes:              'Vendida a Finca La Esperanza el 2024-03-01',
  },
];

const DEVICES = [
  {
    id:              'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    animalSeedId:    'seed-animal-001',
    serialNumber:    'SC-COL-2024-001',
    firmwareVersion: '1.2.0',
    batteryPct:      87,
  },
  {
    id:              'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    animalSeedId:    'seed-animal-002',
    serialNumber:    'SC-COL-2024-002',
    firmwareVersion: '1.2.0',
    batteryPct:      64,
  },
];

// ── Seed principal ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Iniciando seed...\n');

  // ── Finca ──────────────────────────────────────────────────────────────────
  const farm = await prisma.farm.upsert({
    where:  { id: FARM_ID },
    update: {},
    create: {
      id:          FARM_ID,
      name:        FARM.name,
      description: FARM.description,
      timezone:    FARM.timezone,
    },
  });
  console.log(`✅ Finca: "${farm.name}" (${farm.id})`);

  // ── Usuarios ───────────────────────────────────────────────────────────────
  for (const userData of USERS) {
    const passwordHash = await bcrypt.hash(userData.password, BCRYPT_ROUNDS);
    const userId       = `seed-user-${userData.role.toLowerCase()}-001`;

    const user = await prisma.user.upsert({
      where:  { email: userData.email },
      update: {},
      create: {
        id:           userId,
        email:        userData.email,
        passwordHash,
        firstName:    userData.firstName,
        lastName:     userData.lastName,
        phone:        userData.phone,
      },
    });

    await prisma.userFarm.upsert({
      where:  { userId_farmId: { userId: user.id, farmId: farm.id } },
      update: {},
      create: { userId: user.id, farmId: farm.id, role: userData.role },
    });

    console.log(`✅ Usuario: ${userData.email} | ${userData.role}`);
  }

  // ── Animales ───────────────────────────────────────────────────────────────
  for (const animalData of ANIMALS) {
    await prisma.animal.upsert({
      where:  { id: animalData.id },
      update: {},
      create: {
        id:                 animalData.id,
        farmId:             FARM_ID,
        code:               animalData.code,
        name:               animalData.name,
        breed:              animalData.breed,
        sex:                animalData.sex,
        birthDate:          animalData.birthDate,
        weightKg:           animalData.weightKg,
        areteNumber:        animalData.areteNumber,
        status:             animalData.status,
        healthStatus:       animalData.healthStatus,
        reproductiveStatus: animalData.reproductiveStatus,
        notes:              animalData.notes,
      },
    });
    console.log(`✅ Animal: ${animalData.code} — ${animalData.name} (${animalData.breed})`);
  }

  // ── Devices ────────────────────────────────────────────────────────────────
  for (const deviceData of DEVICES) {
    await prisma.device.upsert({
      where:  { id: deviceData.id },
      update: {},
      create: {
        id:              deviceData.id,
        farmId:          FARM_ID,
        animalId:        deviceData.animalSeedId,
        serialNumber:    deviceData.serialNumber,
        firmwareVersion: deviceData.firmwareVersion,
        batteryPct:      deviceData.batteryPct,
        isActive:        true,
      },
    });
    console.log(`✅ Device: ${deviceData.serialNumber} → animal ${deviceData.animalSeedId}`);
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log('\n📋 Credenciales de acceso:');
  console.log('─'.repeat(55));
  for (const u of USERS) {
    console.log(`  ${u.role.padEnd(10)} → ${u.email} / ${u.password}`);
  }
  console.log('─'.repeat(55));
  console.log('\n🚀 Seed completado exitosamente.\n');
}

main()
  .catch((err: unknown) => {
    console.error('❌ Error en seed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
