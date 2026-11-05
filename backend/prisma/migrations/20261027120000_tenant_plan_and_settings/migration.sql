-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('BASICO', 'PRO');

-- Plan, configuración y excepciones por restaurante. Los que ya existen quedan en PRO (todo lo que usan hoy).
ALTER TABLE "Restaurant" ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'PRO',
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "featureFlags" JSONB NOT NULL DEFAULT '{}';
