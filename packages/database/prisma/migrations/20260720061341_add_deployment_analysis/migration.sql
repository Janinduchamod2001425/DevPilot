-- CreateTable
CREATE TABLE "DeploymentAnalysis" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "projectType" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "packageManager" TEXT NOT NULL,
    "installCommand" TEXT NOT NULL,
    "buildCommand" TEXT,
    "startCommand" TEXT,
    "applicationPort" INTEGER,
    "hasDockerfile" BOOLEAN NOT NULL,
    "rootDirectory" TEXT NOT NULL DEFAULT '.',
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentAnalysis_deploymentId_key" ON "DeploymentAnalysis"("deploymentId");

-- AddForeignKey
ALTER TABLE "DeploymentAnalysis" ADD CONSTRAINT "DeploymentAnalysis_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
