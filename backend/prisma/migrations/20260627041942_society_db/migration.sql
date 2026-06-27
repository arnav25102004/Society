-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('rent', 'lease', 'leave_license');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('draft', 'finalized');

-- CreateTable
CREATE TABLE "knowledge_entries" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "topic" VARCHAR(200) NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "answer" TEXT NOT NULL,
    "keywords" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "AgreementType" NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'draft',
    "flatNumber" VARCHAR(20) NOT NULL,
    "inputs" JSONB NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_entries_societyId_idx" ON "knowledge_entries"("societyId");

-- CreateIndex
CREATE INDEX "agreements_societyId_idx" ON "agreements"("societyId");

-- AddForeignKey
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "societies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "societies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
