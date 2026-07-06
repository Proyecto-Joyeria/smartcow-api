-- CreateEnum
CREATE TYPE "AlertPriority" AS ENUM ('CRITICAL', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'CLOSED');

-- CreateTable
CREATE TABLE "geofences" (
    "id" VARCHAR(30) NOT NULL,
    "farm_id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "polygon" JSONB NOT NULL,
    "color" CHAR(7) NOT NULL DEFAULT '#1a7a4a',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" VARCHAR(30) NOT NULL,
    "farm_id" VARCHAR(30) NOT NULL,
    "animal_id" VARCHAR(30) NOT NULL,
    "geofence_id" VARCHAR(30),
    "rule_id" VARCHAR(50) NOT NULL,
    "priority" "AlertPriority" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "assignee_id" VARCHAR(30),
    "resolution" TEXT,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,
    "response_ms" INTEGER,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_actions" (
    "id" BIGSERIAL NOT NULL,
    "alert_id" VARCHAR(30) NOT NULL,
    "user_id" VARCHAR(30),
    "action" VARCHAR(30) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" VARCHAR(30),
    "farm_id" VARCHAR(30),
    "action" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(30),
    "entity_id" VARCHAR(30),
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "geofences_farm_id_active_idx" ON "geofences"("farm_id", "active");

-- CreateIndex
CREATE INDEX "alerts_farm_id_status_priority_idx" ON "alerts"("farm_id", "status", "priority");

-- CreateIndex
CREATE INDEX "alerts_animal_id_opened_at_idx" ON "alerts"("animal_id", "opened_at" DESC);

-- CreateIndex
CREATE INDEX "alerts_farm_id_opened_at_idx" ON "alerts"("farm_id", "opened_at" DESC);

-- CreateIndex
CREATE INDEX "alerts_farm_id_rule_id_opened_at_idx" ON "alerts"("farm_id", "rule_id", "opened_at");

-- CreateIndex
CREATE INDEX "alert_actions_alert_id_idx" ON "alert_actions"("alert_id");

-- CreateIndex
CREATE INDEX "audit_logs_farm_id_idx" ON "audit_logs"("farm_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

-- AddForeignKey
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "geofences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_actions" ADD CONSTRAINT "alert_actions_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_actions" ADD CONSTRAINT "alert_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
