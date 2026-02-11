-- AlterTable
ALTER TABLE `auth_signing_keys` MODIFY `public_key_pem` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `feature_flags` MODIFY `description` VARCHAR(191) NULL;
