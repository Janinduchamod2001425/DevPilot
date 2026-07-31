-- CreateTable
CREATE TABLE "GitHubWebhookDelivery" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "projectId" TEXT,
    "deploymentId" TEXT,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubWebhookDelivery_deliveryId_key" ON "GitHubWebhookDelivery"("deliveryId");

-- CreateIndex
CREATE INDEX "GitHubWebhookDelivery_repositoryId_idx" ON "GitHubWebhookDelivery"("repositoryId");

-- CreateIndex
CREATE INDEX "GitHubWebhookDelivery_projectId_idx" ON "GitHubWebhookDelivery"("projectId");

-- CreateIndex
CREATE INDEX "GitHubWebhookDelivery_deploymentId_idx" ON "GitHubWebhookDelivery"("deploymentId");

-- CreateIndex
CREATE INDEX "GitHubWebhookDelivery_createdAt_idx" ON "GitHubWebhookDelivery"("createdAt");
