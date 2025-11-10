# AWS Amplify Deployment Quick Start

Get your app deployed to AWS Amplify in 15 minutes.

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] AWS Account with appropriate permissions
- [ ] GitHub repository with your code
- [ ] Neon PostgreSQL database (production)
- [ ] OpenAI API key
- [ ] Stripe account with products configured
- [ ] AWS Cognito User Pool created
- [ ] Lambda function deployed (for RAG)

## Step-by-Step Deployment

### Step 1: Connect Repository (2 minutes)

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Click **"New app"** → **"Host web app"**
3. Select **"GitHub"** and authorize
4. Select repository: `Business-Viability-Calculator`
5. Select branch: `main`
6. Click **"Next"**

### Step 2: Configure Build Settings (1 minute)

Amplify auto-detects Next.js. Verify:

- **Build command**: `npm ci && npx prisma generate && npx prisma migrate deploy && npm run build`
- **Start command**: `npm start`
- **Node version**: `20.x`

**Note:** The `amplify.yml` file in your repo handles this automatically.

### Step 3: Add Environment Variables (5 minutes)

In Amplify Console → **App settings** → **Environment variables**, add:

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
```

**See `.env.example` for complete list.**

### Step 4: Deploy (5-10 minutes)

1. Click **"Save and deploy"**
2. Wait for build to complete
3. Your app will be live at: `https://<app-id>.amplifyapp.com`

### Step 5: Configure Webhooks (2 minutes)

**Stripe Webhook:**
1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Add endpoint: `https://your-amplify-url.amplifyapp.com/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
4. Copy webhook secret and add to Amplify environment variables

**Update Cognito Callback URLs:**
1. Go to Cognito User Pool → **App integration**
2. Edit app client
3. Add callback URL: `https://your-amplify-url.amplifyapp.com`
4. Save

## Post-Deployment Checklist

- [ ] App is accessible at Amplify URL
- [ ] Health check works: `https://your-url/api/health`
- [ ] Authentication (sign up/sign in) works
- [ ] Database migrations applied successfully
- [ ] Stripe checkout works (test with test mode first)
- [ ] Webhooks are receiving events
- [ ] Lambda function can be invoked
- [ ] Monitoring and alerts configured

## Troubleshooting

### Build Fails

**Issue: Prisma Client not generated**
- **Solution**: Check `amplify.yml` includes `npx prisma generate`

**Issue: Database connection failed**
- **Solution**: Verify `DATABASE_URL` is correct and database is accessible

**Issue: Environment variables not found**
- **Solution**: Check all required variables are set in Amplify Console

### Runtime Errors

**Issue: Authentication not working**
- **Solution**: Verify Cognito configuration and callback URLs

**Issue: Stripe webhooks not working**
- **Solution**: Check webhook URL and secret match

## Next Steps

1. **Set up custom domain** (optional)
2. **Configure monitoring** (see [MONITORING.md](./MONITORING.md))
3. **Set up CI/CD** (see [DEPLOYMENT.md](./DEPLOYMENT.md))
4. **Test all features** end-to-end

## Resources

- [Full Deployment Guide](./DEPLOYMENT.md)
- [Monitoring Guide](./MONITORING.md)
- [AWS Amplify Docs](https://docs.aws.amazon.com/amplify/)

