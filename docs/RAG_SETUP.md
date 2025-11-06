# RAG (Retrieval-Augmented Generation) Setup Guide

This guide walks you through setting up the RAG system for enriching business viability analyses with real market data.

## Overview

The RAG system consists of:
1. **Discovery Agent**: Uses GPT-4 + Brave Search to find relevant competitor and market research URLs
2. **Confirmation UI**: Users review and select URLs to ingest
3. **Lambda Ingestion Worker**: Extracts content, generates embeddings, stores in pgvector
4. **Vector Search**: Retrieves relevant context during viability analysis

## Prerequisites

- Neon PostgreSQL database with pgvector extension
- OpenAI API key
- Brave Search API key
- AWS account with Lambda permissions

---

## Step 1: Enable pgvector Extension in Neon

1. Log in to your [Neon Console](https://console.neon.tech)
2. Select your project
3. Go to **SQL Editor**
4. Run the following SQL:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

5. Verify the extension:

```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

---

## Step 2: Run Database Migration

```bash
cd /Users/nathan/projects/biz-viability
npx prisma migrate dev --name add_rag_models
npx prisma generate
```

This will create the `DiscoveryJob` and `DocumentChunk` tables with vector support.

---

## Step 3: Get Brave Search API Key

1. Go to [Brave Search API](https://api.search.brave.com/)
2. Sign up for a free account (2,000 queries/month free)
3. Create an API key
4. Add to your `.env`:

```env
BRAVE_SEARCH_API_KEY=your_brave_api_key_here
```

---

## Step 4: Install Dependencies

```bash
npm install
```

This will install:
- `cheerio` - HTML parsing
- `pdf-parse` - PDF text extraction
- `@aws-sdk/client-lambda` - Lambda invocation

---

## Step 5: Deploy Lambda Function

### 5.1 Install AWS SAM CLI

**macOS:**
```bash
brew install aws-sam-cli
```

**Verify:**
```bash
sam --version
```

### 5.2 Configure AWS Credentials

```bash
aws configure
```

Enter:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (e.g., `us-east-1`)

### 5.3 Build and Deploy Lambda

```bash
cd lambda/rag-ingestion-worker

# Install dependencies
npm install

# Build TypeScript
npm run build

# Generate Prisma client
npx prisma generate

# Deploy with SAM
sam build
sam deploy --guided
```

**Deployment prompts:**
- Stack Name: `rag-ingestion-worker`
- AWS Region: `us-east-1` (or your preferred region)
- Parameter DatabaseUrl: `<your Neon connection string>`
- Parameter OpenAIApiKey: `<your OpenAI API key>`
- Confirm changes: `Y`
- Allow SAM CLI IAM role creation: `Y`
- Save arguments to config file: `Y`

### 5.4 Get Lambda ARN

After deployment, note the Lambda function ARN from the output:

```
RagIngestionWorkerFunction = arn:aws:lambda:us-east-1:123456789:function:rag-ingestion-worker
```

---

## Step 6: Update Next.js Environment Variables

Add these to `/Users/nathan/projects/biz-viability/.env`:

```env
# AWS Lambda
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Brave Search
BRAVE_SEARCH_API_KEY=your_brave_api_key
```

---

## Step 7: Test the RAG System

### 7.1 Start the Development Server

```bash
npm run dev
```

### 7.2 Run Discovery Flow

1. **Sign in** to your app
2. Navigate to `/projects/new` and create a project (or use existing)
3. Go to `/projects/[projectId]/discovery`
4. Enter a business idea (e.g., "subscription box for eco-friendly pet products")
5. Click **"Start Discovery"**
   - GPT-4 generates search queries
   - Brave API searches for each query
   - GPT-4 filters and ranks results
6. Review the discovered URLs and select which to ingest
7. Click **"Ingest Selected URLs"**
   - Lambda is triggered asynchronously
   - Progress is saved in `DiscoveryJob` table

### 7.3 Monitor Lambda Execution

```bash
sam logs -n RagIngestionWorkerFunction --tail
```

Or check CloudWatch Logs in AWS Console.

### 7.4 Run Viability Analysis with RAG

Once ingestion completes:

1. Go to `/projects/new`
2. Enter the same business idea
3. Include `projectId` in the analysis request (modify form or use API directly)
4. The viability analysis will now include context from ingested documents!

**Example API call:**
```javascript
const response = await fetch("/api/viability", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${idToken}`,
  },
  body: JSON.stringify({
    idea: "subscription box for eco-friendly pet products",
    targetMarket: "Pet owners in the US",
    budgetUsd: 50000,
    timelineMonths: 12,
    projectId: "existing_project_id" // Include this for RAG
  }),
});
```

---

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   User      │─────▶│  Discovery   │─────▶│   Brave     │
│   Input     │      │  Agent (GPT) │      │   Search    │
└─────────────┘      └──────────────┘      └─────────────┘
                             │
                             ▼
                     ┌──────────────┐
                     │  Filtered    │
                     │  URL List    │
                     └──────────────┘
                             │
                             ▼
                     ┌──────────────┐
                     │  User        │
                     │  Confirms    │
                     └──────────────┘
                             │
                             ▼
                     ┌──────────────┐
                     │  Lambda      │◀────┐
                     │  Worker      │     │
                     └──────────────┘     │
                             │            │
                   ┌─────────┼─────────┐  │
                   ▼         ▼         ▼  │
              Extract   Chunk    Generate │
              Content   Text    Embeddings│
                   │         │         │  │
                   └─────────┼─────────┘  │
                             ▼            │
                     ┌──────────────┐     │
                     │  PostgreSQL  │     │
                     │  (pgvector)  │─────┘
                     └──────────────┘
                             │
                             ▼
                     ┌──────────────┐
                     │  Viability   │
                     │  Analysis    │
                     │  (with RAG)  │
                     └──────────────┘
```

---

## Costs

### Per Project Discovery + Ingestion

- **Brave Search**: ~$0.025 (5 queries × $0.005)
- **GPT-4 Query Generation**: ~$0.05
- **GPT-4 URL Filtering**: ~$0.05
- **OpenAI Embeddings**: ~$0.02 (50 chunks × $0.0004)
- **Lambda Execution**: ~$0.01
- **Total**: ~$0.16 per project

### Per Viability Analysis (with RAG)

- **OpenAI Embeddings** (query): ~$0.0001
- **GPT-4 Analysis** (with context): ~$0.10
- **Total**: ~$0.10 per analysis

---

## Troubleshooting

### pgvector Extension Not Found

Run in Neon SQL Editor:
```sql
CREATE EXTENSION vector;
```

### Lambda Timeout

Increase timeout in `template.yaml`:
```yaml
Timeout: 900  # 15 minutes
```

### Out of Memory in Lambda

Increase memory in `template.yaml`:
```yaml
MemorySize: 3008  # Up to 10GB available
```

### Embedding Generation Fails

Check Lambda logs for rate limiting errors. Add exponential backoff if needed.

---

## Next Steps

- Add a status page to show ingestion progress
- Implement webhook for Lambda completion notifications
- Add filters for document categories in vector search
- Implement re-ranking for better retrieval quality

