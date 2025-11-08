#!/bin/bash
set -e

echo "🔨 Building Lambda function..."

# Navigate to Lambda function directory
cd rag-ingestion-worker

# Generate Prisma Client (will download binaries for all targets in schema)
echo "📦 Generating Prisma Client with Linux binary target..."
npx prisma generate

# Try to download Linux binary if not present
if [ ! -f "node_modules/@prisma/engines/libquery_engine-rhel-openssl-3.0.x.so.node" ]; then
  echo "📥 Attempting to download Linux binary..."
  node download-binary.js || echo "⚠️  Binary download failed, will need Linux environment for build"
fi

# Check for Linux binary
LINUX_BINARY="node_modules/@prisma/engines/libquery_engine-rhel-openssl-3.0.x.so.node"
if [ ! -f "$LINUX_BINARY" ]; then
  echo "⚠️  WARNING: Linux binary not found!"
  echo "   Prisma needs the Linux binary for Lambda. Options:"
  echo "   1. Build in Docker: ./build-docker.sh"
  echo "   2. Build in GitHub Actions (recommended for CI/CD)"
  echo "   3. Use a Linux VM or GitHub Codespaces"
  echo ""
  echo "   For now, the build will continue but Lambda will fail until the binary is included."
  echo "   The binary MUST be in: node_modules/@prisma/engines/libquery_engine-rhel-openssl-3.0.x.so.node"
else
  echo "✅ Linux binary found: $LINUX_BINARY"
fi

# Install dependencies
echo "📥 Installing dependencies..."
npm install

# Go back to lambda directory
cd ..

# Build with SAM
echo "🏗️  Building with SAM..."
sam build

# Copy Prisma binaries to the build output (esbuild doesn't bundle them)
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

# Copy Prisma engine binaries
if [ -d "rag-ingestion-worker/node_modules/@prisma/engines" ]; then
  cp -r rag-ingestion-worker/node_modules/@prisma/engines .aws-sam/build/RagIngestionWorkerFunction/node_modules/@prisma/ 2>/dev/null || true
fi

echo "✅ Build complete!"

