-- Drop existing foreign key constraints
ALTER TABLE "Analysis" DROP CONSTRAINT IF EXISTS "Analysis_projectId_fkey";
ALTER TABLE "DiscoveryJob" DROP CONSTRAINT IF EXISTS "DiscoveryJob_projectId_fkey";
ALTER TABLE "DocumentChunk" DROP CONSTRAINT IF EXISTS "DocumentChunk_projectId_fkey";

-- Re-add foreign key constraints with CASCADE delete
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscoveryJob" ADD CONSTRAINT "DiscoveryJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;