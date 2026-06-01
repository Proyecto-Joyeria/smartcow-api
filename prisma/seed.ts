/**
 * Seed de base de datos — SOLO para entornos de desarrollo.
 * NUNCA ejecutar en producción.
 *
 * Ejecutar con: npm run prisma:seed
 *
 * Crea:
 *   - 1 finca "Finca El Roble"
 *   - 3 usuarios (ADMIN, VET, OPERATOR) con contraseñas hasheadas bcrypt factor 12
 *   - Relaciones UserFarm correspondientes
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

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

// ── Seed principal ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Iniciando seed...\n');

  // Crear finca (upsert — idempotente si se ejecuta varias veces)
  const farm = await prisma.farm.upsert({
    where:  { id: 'seed-farm-el-roble-001' },
    update: {},
    create: {
      id:          'seed-farm-el-roble-001',
      name:        FARM.name,
      description: FARM.description,
      timezone:    FARM.timezone,
    },
  });

  console.log(`✅ Finca creada: "${farm.name}" (${farm.id})`);

  // Crear usuarios con contraseñas hasheadas
  for (const userData of USERS) {
    const passwordHash = await bcrypt.hash(userData.password, BCRYPT_ROUNDS);

    const userId = `seed-user-${userData.role.toLowerCase()}-001`;

    // Upsert usuario
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

    // Upsert relación UserFarm con el rol correspondiente
    await prisma.userFarm.upsert({
      where: {
        userId_farmId: {
          userId: user.id,
          farmId: farm.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        farmId: farm.id,
        role:   userData.role,
      },
    });

    console.log(
      `✅ Usuario creado: ${userData.email} | rol: ${userData.role} | pass: ${userData.password}`,
    );
  }

  console.log('\n📋 Resumen de credenciales de acceso:');
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
