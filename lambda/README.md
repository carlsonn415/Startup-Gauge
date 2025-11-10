# RAG Ingestion Worker Lambda

This Lambda function handles the ingestion of web pages and PDFs for the RAG (Retrieval-Augmented Generation) system.

## Prerequisites

1. **AWS CLI** installed and configured
2. **AWS SAM CLI** installed (`brew install aws-sam-cli` on macOS)
3. **Node.js 20.x** installed
4. **PostgreSQL with pgvector** extension enabled (already set up in Neon)

## Environment Variables Needed

Before deploying, ensure you have:

- `DATABASE_URL` - Your PostgreSQL connection string (from Neon)
- `OPENAI_API_KEY` - Your OpenAI API key for embeddings
- `IAM_AWS_ACCESS_KEY_ID` - AWS access key (for Next.js to invoke Lambda)
- `IAM_AWS_SECRET_ACCESS_KEY` - AWS secret key
- `IAM_AWS_REGION` - AWS region (e.g., `us-east-2`)
- `RAG_LAMBDA_FUNCTION_NAME` - Lambda function name (default: `rag-ingestion-worker`)
- `BRAVE_API_KEY` - Brave Search API key

## Setup Steps

### 1. Install Lambda Dependencies

```bash
cd lambda/rag-ingestion-worker
npm install
cd ../..
```

### 2. Build and Deploy with SAM

```bash
cd lambda

# Build the Lambda function
sam build

# Deploy (first time - guided)
sam deploy --guided

# You'll be prompted for:
# - Stack name: rag-ingestion-stack
# - AWS Region: us-east-2 (or your preferred region)
# - Parameter DatabaseUrl: <paste your DATABASE_URL>
# - Parameter OpenAIApiKey: <paste your OPENAI_API_KEY>
# - Confirm changes: Y
# - Allow SAM CLI IAM role creation: Y
# - Save arguments to config: Y
```

### 3. Get the Lambda Function ARN

After deployment, SAM will output the function ARN. Copy it for the next step.

```bash
# Or get it with:
aws lambda get-function --function-name rag-ingestion-worker --query 'Configuration.FunctionArn'
```

### 4. Update Your Next.js Environment Variables

Add these to your `.env` file:

```env
RAG_LAMBDA_FUNCTION_NAME=rag-ingestion-worker
IAM_AWS_ACCESS_KEY_ID=<your-access-key>
IAM_AWS_SECRET_ACCESS_KEY=<your-secret-key>
IAM_AWS_REGION=us-east-2
BRAVE_API_KEY=<your-brave-api-key>
```

### 5. Grant Next.js API Permission to Invoke Lambda

The IAM user whose credentials you use in Next.js needs permission to invoke the Lambda:

```bash
aws iam attach-user-policy \
  --user-name <your-iam-user> \
  --policy-arn arn:aws:iam::aws:policy/AWSLambdaRole
```

Or create a custom policy with minimal permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:us-east-2:*:function:rag-ingestion-worker"
    }
  ]
}
```

## Testing

### Test the Lambda Locally

```bash
cd lambda
sam local invoke RagIngestionWorkerFunction --event test-event.json
```

Create `test-event.json`:

```json
{
  "jobId": "test-job-123",
  "projectId": "test-project-123",
  "userId": "test-user-123",
  "urls": [
    {
      "url": "https://example.com",
      "title": "Example Site",
      "category": "competitor",
      "relevanceScore": 0.95,
      "reason": "Direct competitor"
    }
  ]
}
```

### Test End-to-End

1. Create a new project in your Next.js app
2. Navigate to `/projects/[id]/discovery`
3. Enter a business idea and click "Discover Resources"
4. Review the URLs and click "Ingest Selected URLs"
5. Monitor the job status in the UI

### Check Lambda Logs

```bash
sam logs -n RagIngestionWorkerFunction --tail
```

Or in AWS Console: CloudWatch > Log Groups > `/aws/lambda/rag-ingestion-worker`

## Updating the Lambda

After making code changes:

```bash
cd lambda
sam build
sam deploy  # No --guided flag needed after first deployment
```

## Cost Estimates

- **Lambda**: ~$0.20 per 1M requests + $0.0000166667 per GB-second
- **Embedding API**: ~$0.02 per 50 chunks (1000 tokens each)
- **Data Transfer**: Negligible for most use cases

Typical ingestion job (10 URLs, 50 chunks each):
- Lambda: ~$0.01
- Embeddings: ~$0.10
- **Total: ~$0.11 per job**

## Troubleshooting

### Lambda times out
- Increase `Timeout` in `template.yaml` (max 900 seconds)
- Reduce number of URLs processed per invocation
- Increase `MemorySize` for faster processing

### Database connection errors
- Verify `DATABASE_URL` is correct and accessible from Lambda
- Check security group rules if using VPC
- Ensure SSL mode is correct (`?sslmode=require`)

### Embedding API errors
- Check `OPENAI_API_KEY` is valid
- Monitor rate limits (3,500 RPM for text-embedding-3-small)
- Add exponential backoff in code if needed

### Out of memory
- Increase `MemorySize` in `template.yaml`
- Process URLs in smaller batches
- Reduce chunk size

## Architecture

```
Next.js API Route
    ↓
Async Lambda Invoke (Event)
    ↓
rag-ingestion-worker Lambda
    ↓
├─ Fetch URL content (HTML/PDF)
├─ Chunk text (1000 tokens, 200 overlap)
├─ Generate embeddings (OpenAI)
└─ Store in PostgreSQL (pgvector)
```

## Monitoring

Key metrics to watch:
- Lambda invocation count
- Lambda duration
- Lambda errors
- OpenAI API token usage
- Database storage growth

Set up CloudWatch alarms for:
- Lambda error rate > 5%
- Lambda duration > 10 minutes
- Lambda throttles

## Security Best Practices

1. **Use AWS Secrets Manager** for sensitive environment variables
2. **Enable Lambda VPC** if database is in VPC
3. **Set resource limits** (memory, timeout) appropriately
4. **Use IAM roles** with least privilege
5. **Enable CloudTrail** for audit logging
6. **Rotate credentials** regularly

## Next Steps

- [ ] Add retry logic for failed URLs
- [ ] Implement progress updates (via WebSocket or polling)
- [ ] Add support for more content types (DOCX, MD, etc.)
- [ ] Optimize chunking strategy (semantic vs fixed)
- [ ] Add deduplication to avoid reprocessing same URLs
- [ ] Implement batch processing for large URL lists

