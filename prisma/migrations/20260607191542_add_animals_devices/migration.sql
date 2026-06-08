-- CreateEnum
CREATE TYPE "Breed" AS ENUM ('BRAHMAN', 'HOLSTEIN', 'ANGUS', 'SIMMENTAL', 'CEBUINO', 'OTRO');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "AnimalStatus" AS ENUM ('ACTIVE', 'SOLD', 'DECEASED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'SICK', 'RECOVERING', 'UNDER_OBSERVATION', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReproductiveStatus" AS ENUM ('OPEN', 'PREGNANT', 'LACTATING', 'DRY', 'CULLED');

-- CreateTable
CREATE TABLE "animals" (
    "id" VARCHAR(30) NOT NULL,
    "farm_id" VARCHAR(30) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100),
    "breed" "Breed" NOT NULL,
    "sex" "Sex" NOT NULL,
    "birth_date" TIMESTAMPTZ,
    "weight_kg" DECIMAL(6,2),
    "photo_url" TEXT,
    "arete_number" VARCHAR(30),
    "status" "AnimalStatus" NOT NULL DEFAULT 'ACTIVE',
    "health_status" "HealthStatus" NOT NULL DEFAULT 'HEALTHY',
    "reproductive_status" "ReproductiveStatus",
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "animals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "farm_id" VARCHAR(30) NOT NULL,
    "animal_id" VARCHAR(30),
    "serial_number" VARCHAR(50) NOT NULL,
    "firmware_version" VARCHAR(20) NOT NULL,
    "cert_fingerprint" TEXT,
    "cert_expires_at" TIMESTAMPTZ,
    "battery_pct" INTEGER,
    "last_seen_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "animals_farm_id_idx" ON "animals"("farm_id");

-- CreateIndex
CREATE INDEX "animals_farm_id_deleted_at_idx" ON "animals"("farm_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "animals_farm_id_code_key" ON "animals"("farm_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "devices_animal_id_key" ON "devices"("animal_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_serial_number_key" ON "devices"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "devices_cert_fingerprint_key" ON "devices"("cert_fingerprint");

-- CreateIndex
CREATE INDEX "devices_farm_id_idx" ON "devices"("farm_id");

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
