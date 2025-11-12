# Deployment Guide

Complete guide for deploying Startup Gauge to AWS Amplify.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [AWS Amplify Hosting Setup](#aws-amplify-hosting-setup)
3. [Environment Variables](#environment-variables)
4. [Database Setup](#database-setup)
5. [AWS Cognito Authentication](#aws-cognito-authentication)
6. [Stripe Configuration](#stripe-configuration)
7. [Lambda Deployment](#lambda-deployment)
8. [CI/CD Pipeline](#cicd-pipeline)
9. [Monitoring & Observability](#monitoring--observability)
10. [Custom Domain Setup](#custom-domain-setup)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, ensure you have:

- ✅ **AWS Account** with appropriate permissions
- ✅ **GitHub Repository** with your code
- ✅ **Neon PostgreSQL Database** (or other PostgreSQL with pgvector)
- ✅ **API Keys**: OpenAI, Stripe, Brave Search
- ✅ **Node.js 20+** installed locally (for testing)

---

## AWS Amplify Hosting Setup

### Step 1: Connect Repository

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Click **"New app"** → **"Host web app"**
3. Select **"GitHub"** as your source
4. Authorize AWS Amplify to access your GitHub account
5. Select your repository: `startup-gauge`
6. Select the branch: `main` (or your production branch)

### Step 2: Configure Build Settings

Amplify will auto-detect Next.js. Verify these settings:

**Build settings:**
- **Build command**: `npm ci && npx prisma generate && npx prisma migrate deploy && npm run build`
- **Start command**: `npm start`
- **Node version**: `20.x` (or latest LTS)

**Or use `amplify.yml`** (already configured in the repo):
- The `amplify.yml` file in the root will be automatically detected
- It handles Prisma generation and migrations automatically

### Step 3: Add Environment Variables

In the Amplify Console, go to **App settings** → **Environment variables** and add all variables from `.env.example`:

**Required Variables:**
```env
DATABASE_URL=postgresql://...
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
STRIPE_PRICE_STARTER_TO_PRO_UPGRADE=price_...
NEXT_PUBLIC_AMPLIFY_REGION=us-east-2
NEXT_PUBLIC_USER_POOL_ID=us-east-2_...
NEXT_PUBLIC_USER_POOL_CLIENT_ID=...
NEXT_PUBLIC_COGNITO_DOMAIN=your-prefix.auth.us-east-2.amazoncognito.com
NEXT_PUBLIC_APP_URL=https://your-amplify-url.amplifyapp.com
```

**Important Notes:**
- Use **live** Stripe keys for production (not test keys)
- Use **production** database URL (not development)
- Never commit these values to Git

### Step 4: Review and Deploy

1. Review all settings
2. Click **"Save and deploy"**
3. Wait for the build to complete (5-10 minutes)
4. Your app will be available at: `https://<app-id>.amplifyapp.com`

---

## Environment Variables

### Required Variables

See `.env.example` for the complete list. Here's what each does:

| Variable | Purpose | Where to Get |
|----------|---------|--------------|
| `DATABASE_URL` | PostgreSQL connection string | Neon Console |
| `OPENAI_API_KEY` | OpenAI API access | OpenAI Platform |
| `IAM_AWS_ACCESS_KEY_ID` | AWS credentials for Lambda | AWS IAM |
| `IAM_AWS_SECRET_ACCESS_KEY` | AWS credentials for Lambda | AWS IAM |
| `IAM_AWS_REGION` | AWS region | Your AWS region |
| `RAG_LAMBDA_FUNCTION_NAME` | Lambda function name | After Lambda deployment |
| `BRAVE_API_KEY` | Brave Search API | Brave Search API |
| `STRIPE_SECRET_KEY` | Stripe API key | Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | Webhook verification | Stripe Webhooks |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Public Stripe key | Stripe Dashboard |
| `STRIPE_PRICE_*` | Stripe product price IDs | Stripe Products |
| `NEXT_PUBLIC_AMPLIFY_REGION` | Cognito region | AWS Cognito |
| `NEXT_PUBLIC_USER_POOL_ID` | Cognito User Pool ID | AWS Cognito |
| `NEXT_PUBLIC_USER_POOL_CLIENT_ID` | Cognito App Client ID | AWS Cognito |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | Cognito domain | AWS Cognito |
| `NEXT_PUBLIC_APP_URL` | Application URL for OAuth redirects | Your Amplify URL or custom domain |

### Environment Variable Validation

The app will validate required environment variables on startup. Missing variables will cause build failures.

---

## Database Setup

### Step 1: Create Production Database

1. Go to [Neon Console](https://console.neon.tech)
2. Create a new project (or use existing)
3. Copy the connection string
4. Add to Amplify environment variables as `DATABASE_URL`

### Step 2: Run Migrations

Migrations run automatically during Amplify build (via `amplify.yml`):

```yaml
- npx prisma migrate deploy
```

This applies all pending migrations to your production database.

**Important:** 
- Always test migrations locally first
- Review migration files before deploying
- Consider database backups before production migrations

### Step 3: Verify Database

After deployment, verify:
- All tables exist
- Indexes are created
- pgvector extension is enabled

```sql
-- Check tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';
```

---

## AWS Cognito Authentication

### Step 1: Create User Pool

1. Go to [AWS Cognito Console](https://console.aws.amazon.com/cognito/)
2. Click **"Create user pool"**
3. Choose **"Email"** as sign-in option
4. Configure password policy (recommended: 8+ chars, mixed case, numbers)
5. Enable **MFA** (optional but recommended)
6. Configure **App integration**:
   - App client name: `startup-gauge-app`
   - Enable **OpenID Connect (OIDC)**
   - Allowed callback URLs: `https://your-domain.com, https://your-domain.com/*`
   - Allowed sign-out URLs: `https://your-domain.com`
7. Create the user pool

### Step 2: Configure Domain

1. In your User Pool, go to **"App integration"** tab
2. Under **"Domain"**, click **"Create Cognito domain"**
3. Choose a domain prefix (e.g., `startup-gauge-auth`)
4. Save the domain (e.g., `startup-gauge-auth.auth.us-east-2.amazoncognito.com`)

### Step 3: Get Configuration Values

From your User Pool, copy:
- **User Pool ID**: `us-east-2_XXXXXXXXX`
- **App Client ID**: From "App integration" → "App clients"
- **Domain**: `your-prefix.auth.us-east-2.amazoncognito.com`
- **Region**: Your AWS region (e.g., `us-east-2`)

### Step 4: Add to Amplify Environment Variables

```env
NEXT_PUBLIC_AMPLIFY_REGION=us-east-2
NEXT_PUBLIC_USER_POOL_ID=us-east-2_XXXXXXXXX
NEXT_PUBLIC_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_DOMAIN=your-prefix.auth.us-east-2.amazoncognito.com
```

### Step 5: Update Callback URLs After Deployment

After Amplify deployment, update Cognito callback URLs:
1. Go to Cognito User Pool → **App integration**
2. Edit your app client
3. Add **both** of these callback URLs:
   - `https://your-amplify-domain.amplifyapp.com`
   - `https://your-amplify-domain.amplifyapp.com/*`
4. Add **both** of these sign-out URLs:
   - `https://your-amplify-domain.amplifyapp.com`
   - `https://your-amplify-domain.amplifyapp.com/*`
5. Save changes

**Important:** Cognito requires both the base URL and the wildcard version (`/*`) to handle OAuth redirects properly.

---

## Stripe Configuration

### Step 1: Create Products in Stripe

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/products)
2. Create three products:

**Starter Plan:**
- Name: "Starter"
- Price: $29/month (recurring)
- Copy the Price ID (starts with `price_...`)

**Pro Plan:**
- Name: "Pro"
- Price: $99/month (recurring)
- Copy the Price ID

**Starter to Pro Upgrade:**
- Name: "Starter to Pro Upgrade"
- Price: $70 (one-time payment)
- Copy the Price ID

### Step 2: Get API Keys

1. Go to [Stripe API Keys](https://dashboard.stripe.com/apikeys)
2. Copy **Publishable key** (starts with `pk_live_...`)
3. Copy **Secret key** (starts with `sk_live_...`)

### Step 3: Set Up Webhooks

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. Endpoint URL: `https://your-domain.com/api/webhooks/stripe`
4. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
5. Copy the **Signing secret** (starts with `whsec_...`)

### Step 4: Add to Amplify Environment Variables

```env
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_STARTER_TO_PRO_UPGRADE=price_...
```

---

## Lambda Deployment

The RAG ingestion Lambda must be deployed separately. See [lambda/README.md](../lambda/README.md) for detailed instructions.

**Quick Steps:**

```bash
cd lambda/rag-ingestion-worker
npm install
cd ..
sam build
sam deploy --guided
```

After deployment, add the function name to Amplify environment variables:
```env
RAG_LAMBDA_FUNCTION_NAME=rag-ingestion-worker
```

---

## CI/CD Pipeline

### Automatic Deployment

AWS Amplify automatically:
- ✅ Builds on every push to `main` branch
- ✅ Creates preview deployments for pull requests
- ✅ Deploys to production on merge

### Manual Deployment

1. Go to Amplify Console
2. Select your app
3. Click **"Redeploy this version"** or **"Deploy"**

### Branch Previews

Amplify automatically creates preview deployments for:
- Pull requests
- Feature branches

Access preview URLs from:
- Amplify Console → **"Previews"** tab
- GitHub PR comments (if configured)

### Rollback

To rollback to a previous version:

1. Go to Amplify Console → **"Deployments"**
2. Find the version you want to restore
3. Click **"Redeploy this version"**

---

## Monitoring & Observability

### CloudWatch Logs

Amplify automatically sends logs to CloudWatch:

1. Go to [CloudWatch Console](https://console.aws.amazon.com/cloudwatch/)
2. Navigate to **Log groups**
3. Find: `/aws/amplify/<app-id>`
4. View build logs, runtime logs, and errors

### Set Up Alarms

**Error Rate Alarm:**

1. Go to CloudWatch → **Alarms** → **Create alarm**
2. Select metric: `4xxError` or `5xxError`
3. Threshold: `> 10 errors in 5 minutes`
4. Action: Send SNS notification or email

**Lambda Execution Monitoring:**

1. Go to Lambda Console
2. Select your function: `rag-ingestion-worker`
3. Go to **Monitoring** tab
4. Set up alarms for:
   - Error rate
   - Duration
   - Throttles

### Database Monitoring

**Neon Console:**
- Monitor connection count
- View query performance
- Check storage usage

**Set Up Alerts:**
1. Go to Neon Console → **Settings** → **Alerts**
2. Configure alerts for:
   - High connection count
   - Storage usage > 80%
   - Query duration > threshold

### Cost Monitoring

**AWS Cost Explorer:**
1. Go to [AWS Cost Management](https://console.aws.amazon.com/cost-management/)
2. Set up budgets:
   - Monthly budget: $50-100 (adjust based on usage)
   - Alert at 80% and 100%

**Track Costs:**
- Amplify Hosting: ~$0.15/GB served
- Lambda: Pay per invocation
- Cognito: Free tier (50K MAU)
- Database: Neon pricing

---

## Custom Domain Setup

### Step 1: Add Domain in Amplify

1. Go to Amplify Console → **Domain management**
2. Click **"Add domain"**
3. Enter your domain (e.g., `yourdomain.com`)
4. Follow the DNS configuration instructions

### Step 2: Configure DNS

Add these DNS records to your domain provider:

**For root domain:**
```
Type: A
Name: @
Value: [Amplify IP]
```

**For www subdomain:**
```
Type: CNAME
Name: www
Value: [Amplify domain]
```

### Step 3: SSL Certificate

Amplify automatically provisions SSL certificates via AWS Certificate Manager. No additional configuration needed.

### Step 4: Update Cognito Callback URLs

After custom domain is active, update Cognito:
1. Go to Cognito User Pool → **App integration**
2. Edit app client
3. Update callback URLs: `https://yourdomain.com, https://yourdomain.com/*`
4. Update sign-out URLs: `https://yourdomain.com`

---

## Troubleshooting

### Build Failures

**Issue: Prisma Client not generated**
- **Solution**: Ensure `npx prisma generate` runs in preBuild phase
- Check `amplify.yml` configuration

**Issue: Database connection failed**
- **Solution**: Verify `DATABASE_URL` is correct
- Check database is accessible from AWS
- Verify SSL mode is set correctly

**Issue: Environment variables not found**
- **Solution**: Check all required variables are set in Amplify Console
- Verify variable names match exactly (case-sensitive)

### Runtime Errors

**Issue: Authentication not working**
- **Solution**: Verify Cognito configuration
- Check callback URLs match your domain
- Verify environment variables are set correctly

**Issue: Stripe webhooks not working**
- **Solution**: Verify webhook URL is correct
- Check webhook secret matches
- Verify webhook events are selected in Stripe Dashboard

**Issue: Lambda invocation fails**
- **Solution**: Check AWS credentials are correct
- Verify Lambda function name matches
- Check IAM permissions for Lambda invoke

### Performance Issues

**Issue: Slow page loads**
- **Solution**: Enable Amplify caching
- Check database query performance
- Review CloudWatch metrics

**Issue: Database connection pool exhausted**
- **Solution**: Increase connection pool size
- Check for connection leaks
- Monitor connection usage

---

## Post-Deployment Checklist

- [ ] App is accessible at Amplify URL
- [ ] Authentication (sign up/sign in) works
- [ ] Database migrations applied successfully
- [ ] Stripe checkout works (test with test mode first)
- [ ] Webhooks are receiving events
- [ ] Lambda function can be invoked
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
4. **Set up CI/CD** for automated deployments
5. **Document** any custom configurations
6. **Share** the live URL for demos!

---

## Support

For issues or questions:
- Check [docs/ARCHITECTURE.md](./ARCHITECTURE.md) for system overview
- Review [docs/API_REFERENCE.md](./API_REFERENCE.md) for API details
- See AWS Amplify [documentation](https://docs.aws.amazon.com/amplify/)

