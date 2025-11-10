# RAG Ingestion Worker Lambda

This Lambda function processes URLs discovered by the Discovery Agent, extracts content, generates embeddings, and stores them in PostgreSQL with pgvector.

## Setup

### 1. Install Dependencies

```bash
cd lambda/rag-ingestion-worker
npm install
```

### 2. Build TypeScript

```bash
npm run build
```

### 3. Generate Prisma Client

```bash
npx prisma generate
```

### 4. Deploy with AWS SAM

First deployment (interactive):
```bash
sam build
sam deploy --guided
```

You'll be prompted for:
- Stack name: `rag-ingestion-worker`
- AWS Region: `us-east-1` (or your preferred region)
- DatabaseUrl: Your Neon PostgreSQL connection string
- OpenAIApiKey: Your OpenAI API key

Subsequent deployments:
```bash
sam build && sam deploy
```

### 5. Update Environment Variables

Add these to your Next.js `.env` file:

```env
# AWS Lambda
IAM_AWS_REGION=us-east-1
IAM_AWS_ACCESS_KEY_ID=your_access_key
IAM_AWS_SECRET_ACCESS_KEY=your_secret_key
```

## How It Works

1. **Receives payload** from Next.js API via async Lambda invoke
2. **Extracts content** from each URL:
   - HTML: Uses Cheerio to extract main content
   - PDF: Uses pdf-parse to extract text
3. **Chunks text** into ~1000 token pieces with 200 token overlap
4. **Generates embeddings** using OpenAI `text-embedding-3-small`
5. **Stores in database** with pgvector for similarity search

## Monitoring

View logs in CloudWatch:
```bash
sam logs -n RagIngestionWorkerFunction --tail
```

## Cost Estimates

- **Lambda**: ~$0.20 per 1000 executions (with 2GB RAM, 30s avg duration)
- **OpenAI Embeddings**: ~$0.02 per 50 chunks (1000 tokens each)
- **Total per project**: ~$0.20-0.30 (assuming 10 URLs, 50 chunks average)

