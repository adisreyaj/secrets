-- AlterTable
ALTER TABLE `approval_requests` MODIFY `payload_iv` LONGBLOB NULL,
    MODIFY `payload_tag` LONGBLOB NULL;
