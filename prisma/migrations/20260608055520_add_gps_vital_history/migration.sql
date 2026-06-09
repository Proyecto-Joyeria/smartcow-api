-- CreateTable
CREATE TABLE "gps_history" (
    "id" BIGSERIAL NOT NULL,
    "animal_id" VARCHAR(30) NOT NULL,
    "farm_id" VARCHAR(30) NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "alt" DECIMAL(7,2),
    "accuracy" DECIMAL(6,2),
    "speed_kmh" DECIMAL(6,2),
    "recorded_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "gps_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vital_history" (
    "id" BIGSERIAL NOT NULL,
    "animal_id" VARCHAR(30) NOT NULL,
    "farm_id" VARCHAR(30) NOT NULL,
    "temp_c" DECIMAL(4,1) NOT NULL,
    "heart_bpm" INTEGER NOT NULL,
    "activity" INTEGER NOT NULL,
    "battery_pct" INTEGER NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vital_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gps_history_animal_id_recorded_at_idx" ON "gps_history"("animal_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "gps_history_farm_id_recorded_at_idx" ON "gps_history"("farm_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "vital_history_animal_id_recorded_at_idx" ON "vital_history"("animal_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "vital_history_farm_id_recorded_at_idx" ON "vital_history"("farm_id", "recorded_at" DESC);
