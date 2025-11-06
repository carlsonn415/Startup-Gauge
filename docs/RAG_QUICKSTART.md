# RAG Feature Quick Start Guide

Get your RAG (Retrieval-Augmented Generation) system up and running in under 30 minutes.

## Prerequisites

- ✅ Next.js app is running
- ✅ Database has been migrated (DiscoveryJob and DocumentChunk tables exist)
- ✅ pgvector extension is enabled in your Neon database

## Step 1: Get Brave Search API Key (5 minutes)

1. Visit https://brave.com/search/api/
2. Click "Get Started" or "Sign Up"
3. Choose the **FREE** tier (2,000 searches/month)
4. Complete registration
5. Copy your API key (starts with `BSA...`)
6. Add to `.env`:
   ```env
   BRAVE_API_KEY=BSA...your-key-here...
   ```

## Step 2: Set Up AWS Credentials (5 minutes)

### Option A: Use Existing AWS Account

1. Log into AWS Console
2. Go to **IAM** → **Users** → **Add user**
3. User name: `biz-viability-lambda-invoker`
4. Select "Access key - Programmatic access"
5. Click **Next: Permissions**
6. Choose "Attach existing policies directly"
7. Search and select: **AWSLambdaRole**
8. Click through to create user
9. **Copy the Access Key ID and Secret Access Key** (you won't see them again!)
10. Add to `.env`:
    ```env
    AWS_ACCESS_KEY_ID=AKIA...
    AWS_SECRET_ACCESS_KEY=...
    AWS_REGION=us-east-2
    ```

### Option B: Use AWS CLI (if already configured)

If you already have AWS CLI configured, you can use those credentials:

```bash
cat ~/.aws/credentials
```

Copy the `aws_access_key_id` and `aws_secret_access_key` to your `.env`.

## Step 3: Deploy Lambda Function (10 minutes)

### Install AWS SAM CLI (if not already installed)

**macOS:**
```bash
brew install aws-sam-cli
```

**Linux:**
```bash
# Follow: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html
```

**Windows:**
```bash
# Use installer from: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html
```

### Deploy the Lambda

```bash
# From project root
cd lambda/rag-ingestion-worker

# Install dependencies
npm install

# Go back to lambda directory
cd ..

# Build the Lambda
sam build

# Deploy (first time)
sam deploy --guided
```

**Follow the prompts:**

```
Setting default arguments for 'sam deploy'
=========================================
Stack Name [rag-ingestion-stack]: rag-ingestion-stack
AWS Region [us-east-2]: us-east-2
Parameter DatabaseUrl []: postgresql://neondb_owner:...@...neon.tech/neondb?sslmode=require
Parameter OpenAIApiKey []: sk-...your-openai-key...
#Shows you resources changes to be deployed and require a 'Y' to initiate deploy
Confirm changes before deploy [Y/n]: Y
#SAM needs permission to be able to create roles to connect to the resources in your template
Allow SAM CLI IAM role creation [Y/n]: Y
#Preserves the state of previously provisioned resources when an operation fails
Disable rollback [y/N]: N
Save arguments to configuration file [Y/n]: Y
SAM configuration file [samconfig.toml]: [press Enter]
SAM configuration environment [default]: [press Enter]
```

**Wait for deployment** (~3-5 minutes)

You'll see:
```
Successfully created/updated stack - rag-ingestion-stack in us-east-2
```

### Update Your .env

```env
RAG_LAMBDA_FUNCTION_NAME=rag-ingestion-worker
```

## Step 4: Test the System (5 minutes)

### Start Your Next.js Server

```bash
# From project root
npm run dev
```

### Test Discovery

1. Open http://localhost:3000
2. **Sign in** to your account
3. **Create a new project** or open an existing one
4. Navigate to **`/projects/[your-project-id]/discovery`**
   - Example: `http://localhost:3000/projects/clx123abc/discovery`

5. **Enter a business idea**:
   ```
   A subscription box service for eco-friendly pet products
   ```

6. Click **"Discover Resources"**
   - Should take 10-20 seconds
   - You'll see URLs grouped by category

7. **Review and select URLs**
   - All URLs are selected by default
   - Uncheck any you don't want

8. Click **"Ingest Selected URLs"**
   - You'll get a job ID
   - Status updates every 3 seconds
   - Should complete in 2-5 minutes (depending on number of URLs)

### Verify Ingestion

Check Lambda logs:
```bash
sam logs -n RagIngestionWorkerFunction --tail
```

Or check database:
```sql
SELECT COUNT(*) FROM "DocumentChunk";
-- Should show some rows (e.g., 50-100 for 10 URLs)
```

### Test Enhanced Analysis

1. Go back to the project's main analysis page
2. Request a new viability analysis
3. Compare the results with/without RAG data
4. **With RAG**: Should include specific competitor names, pricing, market data
5. **Without RAG**: More generic analysis

## Step 5: Verify It's Working

### Check Lambda Was Invoked

```bash
aws lambda list-invocations \
  --function-name rag-ingestion-worker \
  --max-items 5
```

### Check Document Chunks Were Created

In your database client (or Neon console):

```sql
SELECT 
  "projectId",
  "sourceUrl",
  COUNT(*) as chunk_count
FROM "DocumentChunk"
GROUP BY "projectId", "sourceUrl"
ORDER BY chunk_count DESC;
```

You should see rows grouped by source URL with chunk counts.

### Check Embeddings Were Generated

```sql
SELECT 
  COUNT(*) as total_chunks,
  COUNT(embedding) as chunks_with_embeddings,
  AVG(LENGTH(embedding::text)) as avg_embedding_size
FROM "DocumentChunk";
```

All chunks should have embeddings (~1536 dimensions = ~10,000 chars in text form).

## Troubleshooting

### "BRAVE_API_KEY is required"

- Make sure `.env` file has `BRAVE_API_KEY=BSA...`
- Restart your Next.js server after adding it

### "Failed to start ingestion worker"

- Check AWS credentials in `.env`
- Verify IAM user has `lambda:InvokeFunction` permission
- Check Lambda function name matches: `rag-ingestion-worker`

### Lambda Times Out

- Check Lambda logs: `sam logs -n RagIngestionWorkerFunction --tail`
- Look for errors like "connection timeout" or "fetch failed"
- Try reducing number of URLs (< 5 for testing)

### Job Stays "Processing" Forever

Check Lambda logs for errors:
```bash
sam logs -n RagIngestionWorkerFunction --tail
```

Common issues:
- Database connection failed → Check `DATABASE_URL`
- OpenAI API error → Check `OPENAI_API_KEY`
- Timeout → Increase Lambda timeout in `template.yaml`

### No RAG Context in Analysis

- Verify chunks exist: `SELECT COUNT(*) FROM "DocumentChunk" WHERE "projectId" = 'your-project-id';`
- Check embeddings are not null
- Ensure you're analyzing the same project you ingested data for

## Success Criteria

You've successfully set up RAG when:

- ✅ Discovery Agent returns 10-15 relevant URLs
- ✅ Ingestion job completes successfully
- ✅ Database has document chunks with embeddings
- ✅ Viability analysis includes specific market data
- ✅ Analysis mentions competitor names and pricing

## Next Steps

Now that RAG is working, you can:

1. **Test with different business ideas**
   - E-commerce platforms
   - SaaS products
   - Local services
   - Mobile apps

2. **Review the insights**
   - Compare analyses with/without RAG
   - Check accuracy of market data
   - Validate competitor information

3. **Optimize the system**
   - Adjust number of search queries
   - Fine-tune relevance scoring
   - Customize chunking strategy

4. **Monitor costs**
   - Track Brave Search usage (2,000 free/month)
   - Monitor OpenAI embedding costs
   - Check Lambda execution time

## Cost Expectations

### Free Tier Usage

- **Brave Search**: 2,000 searches/month FREE
  - ~400 discovery sessions (5 queries each)
- **AWS Lambda**: 1M requests + 400,000 GB-seconds FREE
  - ~50,000 ingestion jobs/month
- **OpenAI Embeddings**: Pay as you go
  - $0.02 per 50 chunks
  - ~$1 for 2,500 chunks

### Estimated Monthly Cost (Light Usage)

- 50 discovery sessions: $0 (within free tier)
- 50 ingestion jobs (500 chunks total): $0.20
- 100 analyses with RAG: $2.00
- **Total: ~$2-3/month**

## Support

If you encounter issues:

1. Check `docs/RAG_IMPLEMENTATION.md` for detailed documentation
2. Review `lambda/README.md` for Lambda-specific troubleshooting
3. Check CloudWatch Logs in AWS Console
4. Verify all environment variables are set correctly

---

**Congratulations!** 🎉

Your RAG system is now live. You can now provide users with AI-powered business analyses backed by real market research and competitor data.

