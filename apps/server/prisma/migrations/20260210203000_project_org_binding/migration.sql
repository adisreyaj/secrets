-- AlterTable
ALTER TABLE `projects`
ADD COLUMN `organization_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `projects_organization_id_idx` ON `projects`(`organization_id`);

-- AddForeignKey
ALTER TABLE `projects`
ADD CONSTRAINT `projects_organization_id_fkey`
FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
