#!/bin/bash
set -e

echo "📥 Downloading Prisma Linux binary for Lambda..."

cd rag-ingestion-worker

# Get Prisma version
PRISMA_VERSION=$(node -p "require('@prisma/engines-version/package.json').version")
echo "Prisma version: $PRISMA_VERSION"

# Create engines directory if it doesn't exist
mkdir -p node_modules/@prisma/engines

# Download Linux binary for Lambda (rhel-openssl-3.0.x)
BINARY_NAME="libquery_engine-rhel-openssl-3.0.x.so.node"
BINARY_PATH="node_modules/@prisma/engines/$BINARY_NAME"

if [ ! -f "$BINARY_PATH" ]; then
  echo "Downloading query engine binary for rhel-openssl-3.0.x..."
  BINARY_URL="https://binaries.prisma.sh/all_commits/${PRISMA_VERSION}/rhel-openssl-3.0.x/query-engine.gz"
  
  if curl -L "$BINARY_URL" -o query-engine.gz 2>/dev/null; then
    gunzip -f query-engine.gz
    mv query-engine "$BINARY_PATH"
    chmod +x "$BINARY_PATH"
    echo "✅ Linux binary downloaded: $BINARY_PATH"
  else
    echo "⚠️  Failed to download binary, but continuing..."
  fi
else
  echo "✅ Linux binary already exists: $BINARY_PATH"
fi

cd ..

