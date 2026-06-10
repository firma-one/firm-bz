/*
  Warnings:

  - You are about to drop the column `clientId` on the `brands` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "platform"."clients" DROP CONSTRAINT "clients_connectorId_fkey";

-- DropIndex
DROP INDEX "platform"."connectors_type_userId_key";

-- AlterTable
ALTER TABLE "platform"."brands" DROP COLUMN "clientId";

-- AddForeignKey
ALTER TABLE "platform"."clients" ADD CONSTRAINT "clients_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "platform"."connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
