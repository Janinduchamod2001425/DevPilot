-- CreateEnum
CREATE TYPE "AiDiagnosisStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "AiDiagnosis" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "status" "AiDiagnosisStatus" NOT NULL DEFAULT 'PENDING',
    "failureSummary" TEXT,
    "likelyRootCause" TEXT,
    "relevantLogLines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendedFixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION,
    "provider" TEXT,
    "model" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiDiagnosis_deploymentId_key" ON "AiDiagnosis"("deploymentId");

-- CreateIndex
CREATE INDEX "AiDiagnosis_status_idx" ON "AiDiagnosis"("status");

-- CreateIndex
CREATE INDEX "AiDiagnosis_createdAt_idx" ON "AiDiagnosis"("createdAt");

-- AddForeignKey
ALTER TABLE "AiDiagnosis" ADD CONSTRAINT "AiDiagnosis_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
