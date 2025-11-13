# Complete Deployment Guide

> Step-by-step guide to deploy Startup Gauge from scratch to production

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Database Setup](#database-setup)
4. [AWS Cognito Authentication Setup](#aws-cognito-authentication-setup)
5. [Stripe Configuration](#stripe-configuration)
6. [RAG System Setup (Lambda)](#rag-system-setup-lambda)
7. [AWS Amplify Deployment](#aws-amplify-deployment)
8. [Post-Deployment Configuration](#post-deployment-configuration)
9. [Monitoring & Observability](#monitoring--observability)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

- ✅ **AWS Account** with appropriate permissions
- ✅ **GitHub Repository** with your code
- ✅ **Node.js 20+** installed locally
- ✅ **PostgreSQL Database** (Neon recommended) with pgvector extension
- ✅ **API Keys**: OpenAI, Stripe, Brave Search
- ✅ **AWS CLI** and **SAM CLI** installed (for Lambda deployment)

---

## Local Development Setup

### Step 1: Clone and Install

```bash
git clone <repository-url>
cd Business-Viability-Calculator
npm install
```

### Step 2: Environment Variables

Create `.env` file in the project root:

```env
# Database
DATABASE_URL="postgresql://user:pass@host.neon.tech/db?sslmode=require"

# OpenAI
OPENAI_API_KEY="sk-..."

# AWS (for Lambda invocation)
IAM_AWS_ACCESS_KEY_ID="AKIA..."
IAM_AWS_SECRET_ACCESS_KEY="..."
IAM_AWS_REGION="us-east-2"
RAG_LAMBDA_FUNCTION_NAME="rag-ingestion-worker"

# Brave Search
BRAVE_API_KEY="BSA..."

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_PRICE_STARTER="price_..."
STRIPE_PRICE_PRO="price_..."

# AWS Amplify (Cognito) - Configure after setting up Cognito
NEXT_PUBLIC_AMPLIFY_REGION="us-east-2"
NEXT_PUBLIC_USER_POOL_ID="us-east-2_..."
NEXT_PUBLIC_USER_POOL_CLIENT_ID="..."
NEXT_PUBLIC_COGNITO_DOMAIN="your-prefix.auth.us-east-2.amazoncognito.com"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Step 3: Database Setup

```bash
# Run migrations
npx prisma migrate dev

# Generate Prisma Client
npx prisma generate
```

### Step 4: Enable pgvector Extension

In your Neon database SQL editor, run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Verify:
```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### Step 5: Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Database Setup

### Option 1: Neon (Recommended)

1. Go to [Neon Console](https://console.neon.tech)
2. Create a new project
3. Copy the connection string
4. Enable pgvector extension (see above)
5. Use the connection string as `DATABASE_URL`

### Option 2: Self-Hosted PostgreSQL

1. Install PostgreSQL with pgvector extension
2. Create database: `CREATE DATABASE startup_gauge;`
3. Enable extension: `CREATE EXTENSION vector;`
4. Use connection string: `postgresql://user:pass@host:5432/startup_gauge`

### Run Migrations

```bash
# Development
npx prisma migrate dev

# Production (after deployment)
npx prisma migrate deploy
```

---

## AWS Cognito Authentication Setup

### Step 1: Create User Pool

1. Go to [AWS Cognito Console](https://console.aws.amazon.com/cognito/)
2. Click **"Create user pool"**
3. Choose **"Email"** as sign-in option
4. Configure password policy (recommended: 8+ chars, mixed case, numbers)
5. Enable **MFA** (optional but recommended)
6. Click **"Next"**

### Step 2: Configure App Integration

1. **App client name**: `startup-gauge-app`
2. Enable **OpenID Connect (OIDC)**
3. **Allowed callback URLs**: 
   - `http://localhost:3000` (for development)
   - `http://localhost:3000/*`
   - `https://your-domain.com` (add after deployment)
   - `https://your-domain.com/*`
4. **Allowed sign-out URLs**: Same as callback URLs
5. Create the user pool

### Step 3: Configure Domain

1. In your User Pool, go to **"App integration"** tab
2. Under **"Domain"**, click **"Create Cognito domain"**
3. Choose a domain prefix (e.g., `startup-gauge-auth`)
4. Save the domain (e.g., `startup-gauge-auth.auth.us-east-2.amazoncognito.com`)

### Step 4: Get Configuration Values

From your User Pool, copy:
- **User Pool ID**: `us-east-2_XXXXXXXXX`
- **App Client ID**: From "App integration" → "App clients"
- **Domain**: `your-prefix.auth.us-east-2.amazoncognito.com`
- **Region**: Your AWS region (e.g., `us-east-2`)

### Step 5: Add to Environment Variables

```env
NEXT_PUBLIC_AMPLIFY_REGION=us-east-2
NEXT_PUBLIC_USER_POOL_ID=us-east-2_XXXXXXXXX
NEXT_PUBLIC_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_DOMAIN=your-prefix.auth.us-east-2.amazoncognito.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Stripe Configuration

### Step 1: Create Products in Stripe

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/products)
2. Create products:

**Starter Plan:**
- Name: "Starter"
- Price: $29/month (recurring)
- Copy the Price ID (starts with `price_...`)

**Pro Plan:**
- Name: "Pro"
- Price: $99/month (recurring)
- Copy the Price ID

### Step 2: Get API Keys

1. Go to [Stripe API Keys](https://dashboard.stripe.com/apikeys)
2. Copy **Publishable key** (starts with `pk_test_...` for test mode)
3. Copy **Secret key** (starts with `sk_test_...` for test mode)

### Step 3: Set Up Webhooks (Local Development)

1. Install Stripe CLI: `brew install stripe/stripe-cli/stripe`
2. Login: `stripe login`
3. Forward webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
4. Copy the webhook signing secret (starts with `whsec_...`)

### Step 4: Add to Environment Variables

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
```

**Note:** For production, use live keys (`pk_live_...`, `sk_live_...`) and configure webhooks in Stripe Dashboard.

---

## RAG System Setup (Lambda)

The RAG system requires an AWS Lambda function to process document ingestion asynchronously.

### Step 1: Get Brave Search API Key

1. Visit [Brave Search API](https://brave.com/search/api/)
2. Sign up for free tier (2,000 searches/month)
3. Copy your API key (starts with `BSA...`)
4. Add to `.env`:
   ```env
   BRAVE_API_KEY=BSA...
   ```

### Step 2: Set Up AWS Credentials

**Option A: Create IAM User**

1. Go to AWS Console → **IAM** → **Users** → **Add user**
2. User name: `startup-gauge-lambda-invoker`
3. Select "Access key - Programmatic access"
4. Attach policy: `AWSLambdaRole` (or create custom policy with `lambda:InvokeFunction`)
5. Copy Access Key ID and Secret Access Key
6. Add to `.env`:
   ```env
   IAM_AWS_ACCESS_KEY_ID=AKIA...
   IAM_AWS_SECRET_ACCESS_KEY=...
   IAM_AWS_REGION=us-east-2
   ```

**Option B: Use AWS CLI**

If you have AWS CLI configured:
```bash
cat ~/.aws/credentials
```
Copy values to `.env` as above.

### Step 3: Install AWS SAM CLI

**macOS:**
```bash
brew install aws-sam-cli
```

**Linux/Windows:**
See [AWS SAM CLI Installation Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

Verify:
```bash
sam --version
```

### Step 4: Deploy Lambda Function

```bash
# From project root
cd lambda/rag-ingestion-worker
npm install
cd ..

# Build and deploy
sam build
sam deploy --guided
```

**Follow the prompts:**

```
Stack Name [rag-ingestion-stack]: rag-ingestion-stack
AWS Region [us-east-2]: us-east-2
Parameter DatabaseUrl []: postgresql://...your-database-url...
Parameter OpenAIApiKey []: sk-...your-openai-key...
Confirm changes before deploy [Y/n]: Y
Allow SAM CLI IAM role creation [Y/n]: Y
Disable rollback [y/N]: N
Save arguments to configuration file [Y/n]: Y
```

Wait for deployment (~3-5 minutes).

### Step 5: Update Environment Variables

After deployment, add to `.env`:

```env
RAG_LAMBDA_FUNCTION_NAME=rag-ingestion-worker
```

### Step 6: Test RAG System Locally

1. Start your Next.js server: `npm run dev`
2. Sign in to your app
3. Create a new project
4. Navigate to `/projects/[project-id]/discovery`
5. Enter a business idea and click "Discover Resources"
6. Select URLs and click "Ingest Selected URLs"
7. Monitor Lambda logs:
   ```bash
   sam logs -n RagIngestionWorkerFunction --tail
   ```

---

## AWS Amplify Deployment

### Step 1: Connect Repository

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Click **"New app"** → **"Host web app"**
3. Select **"GitHub"** and authorize
4. Select repository: `Business-Viability-Calculator`
5. Select branch: `main` (or your production branch)
6. Click **"Next"**

### Step 2: Configure Build Settings

Amplify auto-detects Next.js. The `amplify.yml` file in your repo handles:
- Prisma Client generation
- Database migrations
- Build process

Verify settings:
- **Build command**: `npm ci && npx prisma generate && npx prisma migrate deploy && npm run build`
- **Start command**: `npm start`
- **Node version**: `20.x`

### Step 3: Add Environment Variables

In Amplify Console → **App settings** → **Environment variables**, add all variables:

**Required Variables:**
```env
DATABASE_URL=postgresql://...production-database...
OPENAI_API_KEY=sk-...
IAM_AWS_ACCESS_KEY_ID=AKIA...
IAM_AWS_SECRET_ACCESS_KEY=...
IAM_AWS_REGION=us-east-2
RAG_LAMBDA_FUNCTION_NAME=rag-ingestion-worker
BRAVE_API_KEY=BSA...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
NEXT_PUBLIC_AMPLIFY_REGION=us-east-2
NEXT_PUBLIC_USER_POOL_ID=us-east-2_...
NEXT_PUBLIC_USER_POOL_CLIENT_ID=...
NEXT_PUBLIC_COGNITO_DOMAIN=your-prefix.auth.us-east-2.amazoncognito.com
NEXT_PUBLIC_APP_URL=https://your-amplify-url.amplifyapp.com
```

**Important Notes:**
- Use **live** Stripe keys for production (not test keys)
- Use **production** database URL
- Never commit these values to Git

### Step 4: Review and Deploy

1. Review all settings
2. Click **"Save and deploy"**
3. Wait for build to complete (5-10 minutes)
4. Your app will be available at: `https://<app-id>.amplifyapp.com`

---

## Post-Deployment Configuration

### Step 1: Update Cognito Callback URLs

After Amplify deployment:

1. Go to Cognito User Pool → **App integration**
2. Edit your app client
3. Add **both** callback URLs:
   - `https://your-amplify-url.amplifyapp.com`
   - `https://your-amplify-url.amplifyapp.com/*`
4. Add **both** sign-out URLs:
   - `https://your-amplify-url.amplifyapp.com`
   - `https://your-amplify-url.amplifyapp.com/*`
5. Save changes

### Step 2: Configure Stripe Webhooks

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. Endpoint URL: `https://your-amplify-url.amplifyapp.com/api/webhooks/stripe`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
5. Copy the **Signing secret** (starts with `whsec_...`)
6. Add to Amplify environment variables: `STRIPE_WEBHOOK_SECRET`

### Step 3: Update App URL

Update `NEXT_PUBLIC_APP_URL` in Amplify environment variables to your production URL.

### Step 4: Verify Deployment

**Health Check:**
```bash
curl https://your-amplify-url.amplifyapp.com/api/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "database": "connected"
}
```

**Test Features:**
- [ ] Sign up / Sign in works
- [ ] Create a project
- [ ] Generate viability analysis
- [ ] Discovery and ingestion (RAG)
- [ ] Stripe checkout
- [ ] Subscription management

---

## Monitoring & Observability

### CloudWatch Logs

**Access Logs:**
1. Go to [CloudWatch Console](https://console.aws.amazon.com/cloudwatch/)
2. Navigate to **Log groups**
3. Find:
   - Amplify: `/aws/amplify/<app-id>`
   - Lambda: `/aws/lambda/rag-ingestion-worker`

**View via CLI:**
```bash
# Amplify logs
aws logs tail /aws/amplify/<app-id> --follow

# Lambda logs
aws logs tail /aws/lambda/rag-ingestion-worker --follow
```

### Set Up Alarms

**1. Create SNS Topic:**
```bash
aws sns create-topic --name startup-gauge-alerts
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-2:ACCOUNT:startup-gauge-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com
```

**2. Create Error Rate Alarm:**
- Go to CloudWatch → **Alarms** → **Create alarm**
- Metric: `5xxError` (Amplify)
- Threshold: > 10 errors in 5 minutes
- Action: Send SNS notification

**3. Create Lambda Error Alarm:**
- Metric: `Errors` (Lambda)
- Function: `rag-ingestion-worker`
- Threshold: > 5 errors in 5 minutes
- Action: Send SNS notification

### Cost Monitoring

**Set Up Budget:**
1. Go to [AWS Cost Management](https://console.aws.amazon.com/cost-management/)
2. **Budgets** → **Create budget**
3. Amount: $50-100/month (adjust based on usage)
4. Alerts: At 80% and 100%

**Estimated Monthly Costs (Light Usage):**
- Amplify Hosting: ~$5-10
- Lambda: ~$1-5
- Cognito: Free (under 50K MAU)
- Database (Neon): ~$10-20
- CloudWatch: ~$1-5
- **Total: ~$20-40/month**

### Database Monitoring

**Neon Console:**
- Monitor active connections
- View query performance
- Check storage usage
- Set up alerts for high connection count or storage usage

---

## Troubleshooting

### Build Failures

**Issue: Prisma Client not generated**
- **Solution**: Check `amplify.yml` includes `npx prisma generate` in preBuild phase

**Issue: Database connection failed**
- **Solution**: Verify `DATABASE_URL` is correct and database is accessible from AWS
- Check SSL mode is set correctly (`?sslmode=require`)

**Issue: Environment variables not found**
- **Solution**: Check all required variables are set in Amplify Console
- Verify variable names match exactly (case-sensitive)

### Runtime Errors

**Issue: Authentication not working**
- **Solution**: 
  - Verify Cognito configuration
  - Check callback URLs match your domain
  - Verify environment variables are set correctly
  - Check browser console for errors

**Issue: Stripe webhooks not working**
- **Solution**: 
  - Verify webhook URL is correct
  - Check webhook secret matches
  - Verify webhook events are selected in Stripe Dashboard
  - Check webhook logs in Stripe Dashboard

**Issue: Lambda invocation fails**
- **Solution**: 
  - Check AWS credentials are correct
  - Verify Lambda function name matches
  - Check IAM permissions for Lambda invoke
  - Review Lambda logs in CloudWatch

**Issue: RAG ingestion not working**
- **Solution**:
  - Check Brave API key is set
  - Verify Lambda function is deployed
  - Check Lambda logs for errors
  - Verify database has pgvector extension enabled

### Performance Issues

**Issue: Slow page loads**
- **Solution**: 
  - Enable Amplify caching
  - Check database query performance
  - Review CloudWatch metrics
  - Optimize API routes

**Issue: Database connection pool exhausted**
- **Solution**: 
  - Increase connection pool size in Prisma
  - Check for connection leaks
  - Monitor connection usage

---

## Post-Deployment Checklist

- [ ] App is accessible at Amplify URL
- [ ] Health check endpoint works: `/api/health`
- [ ] Authentication (sign up/sign in) works
- [ ] Database migrations applied successfully
- [ ] Stripe checkout works (test with test mode first)
- [ ] Webhooks are receiving events
- [ ] Lambda function can be invoked
- [ ] RAG discovery and ingestion works
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active
- [ ] Monitoring and alerts configured
- [ ] Error tracking set up
- [ ] Cost monitoring enabled

---

## Next Steps

After successful deployment:

1. **Test all features** end-to-end
2. **Set up monitoring** and alerts
3. **Configure custom domain** (optional)
4. **Review security** settings
5. **Document** any custom configurations
6. **Share** the live URL for demos!

---

## Additional Resources

- **[Architecture Documentation](./ARCHITECTURE.md)** - System design and data flows
- **[API Reference](./API_REFERENCE.md)** - Complete API endpoint documentation
- **[RAG Implementation](./RAG_IMPLEMENTATION.md)** - Technical deep dive into RAG system
- [AWS Amplify Documentation](https://docs.aws.amazon.com/amplify/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Stripe API Documentation](https://stripe.com/docs/api)

---

## Support

For issues or questions:
- Check the troubleshooting section above
- Review CloudWatch logs for errors
- Verify all environment variables are set correctly
- Check AWS service status pages

