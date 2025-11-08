#!/bin/bash
set -e

echo "🐳 Building Lambda function with Docker (for Linux binary support)..."

cd rag-ingestion-worker

# Use Docker to generate Prisma Client with Linux binaries
echo "📦 Generating Prisma Client in Docker container..."
docker run --rm -v "$(pwd):/app" -w /app node:20-alpine sh -c "
  npm install
  npx prisma generate
"

cd ..

# Build with SAM
echo "🏗️  Building with SAM..."
sam build

# Copy Prisma binaries and client to build output
echo "📋 Copying Prisma binaries and client..."
mkdir -p .aws-sam/build/RagIngestionWorkerFunction/node_modules/@prisma
mkdir -p .aws-sam/build/RagIngestionWorkerFunction/node_modules/.prisma

# Copy Prisma Client
if [ -d "rag-ingestion-worker/node_modules/@prisma/client" ]; then
  cp -r rag-ingestion-worker/node_modules/@prisma/client .aws-sam/build/RagIngestionWorkerFunction/node_modules/@prisma/ 2>/dev/null || true
fi

# Copy Prisma binaries
if [ -d "rag-ingestion-worker/node_modules/.prisma" ]; then
  cp -r rag-ingestion-worker/node_modules/.prisma/* .aws-sam/build/RagIngestionWorkerFunction/node_modules/.prisma/ 2>/dev/null || true
fi

# Copy Prisma engine binaries (including Linux binary)
if [ -d "rag-ingestion-worker/node_modules/@prisma/engines" ]; then
  cp -r rag-ingestion-worker/node_modules/@prisma/engines .aws-sam/build/RagIngestionWorkerFunction/node_modules/@prisma/ 2>/dev/null || true
fi

echo "✅ Build complete!"

