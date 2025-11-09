-- Add default value for updatedAt to ensure it's always set
-- Prisma's @updatedAt should handle this, but this is a safety net for the database constraint
ALTER TABLE "UsageMeter" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

