# API Reference

> Complete API documentation for Business Viability Calculator

---

## Table of Contents

1. [Authentication](#authentication)
2. [AI Analysis](#ai-analysis)
3. [RAG Discovery](#rag-discovery)
4. [Projects](#projects)
5. [Subscriptions](#subscriptions)
6. [Webhooks](#webhooks)
7. [Error Codes](#error-codes)
8. [Rate Limits](#rate-limits)

---

## Authentication

All API endpoints (except webhooks) require authentication via JWT token from AWS Cognito.

### Request Headers

```http
Authorization: Bearer <JWT_ID_TOKEN>
```

### Getting a Token

Tokens are obtained through AWS Amplify authentication:

```typescript
import { fetchAuthSession } from "aws-amplify/auth";

const session = await fetchAuthSession();
const idToken = session.tokens?.idToken?.toString();
```

### Token Claims

JWT contains user information:
```json
{
  "email": "user@example.com",
  "sub": "cognito-user-id",
  "iat": 1699564800,
  "exp": 1699568400
}
```

---

## AI Analysis

### Generate Viability Analysis

Generate AI-powered business viability report with optional RAG context.

**Endpoint:** `POST /api/viability`

**Authentication:** Required

**Request Body:**
```json
{
  "idea": "A subscription box service for eco-friendly pet products",
  "targetMarket": "Pet owners aged 25-45 interested in sustainability",
  "budgetUsd": 50000,
  "timelineMonths": 12,
  "projectId": "clx123abc" // Optional - for RAG context
}
```

**Request Schema:**
- `idea` (string, min 10 chars) - Business idea description
- `targetMarket` (string, min 2 chars) - Target customer segment
- `budgetUsd` (number, >= 0, optional, default: 0) - Initial budget
- `timelineMonths` (number, > 0, optional, default: 6) - Launch timeline
- `projectId` (string, optional) - Existing project ID for RAG enhancement

**Success Response:** `200 OK`
```json
{
  "ok": true,
  "data": {
    "summary": "Eco-friendly pet subscription boxes target a growing market...",
    "marketSizeUsd": 4500000000,
    "risks": [
      "High customer acquisition costs in competitive market",
      "Supply chain complexity for sustainable sourcing",
      "Retention challenges typical of subscription models"
    ],
    "steps": [
      {
        "title": "Market Research & Validation",
        "description": "Conduct surveys with target customers...",
        "durationWeeks": 4
      },
      {
        "title": "Supplier Partnerships",
        "description": "Establish relationships with sustainable product manufacturers...",
        "durationWeeks": 6
      }
    ],
    "profitModel": {
      "cacUsd": 45,
      "ltvUsd": 280,
      "grossMarginPct": 55,
      "breakEvenMonths": 18,
      "monthlyProjection": [
        { "month": 1, "revenueUsd": 5000, "costUsd": 8000 },
        { "month": 2, "revenueUsd": 12000, "costUsd": 15000 }
      ]
    },
    "confidencePct": 72
  },
  "meta": {
    "model": "gpt-4o",
    "promptTokens": 1250,
    "completionTokens": 890,
    "costUsd": 0.0199,
    "projectId": "clx123abc",
    "analysisId": "clx456def",
    "usage": {
      "remaining": 2,
      "limit": 3
    }
  }
}
```

**Error Responses:**

`401 Unauthorized` - Missing or invalid JWT
```json
{
  "ok": false,
  "error": "Unauthorized - Please sign in"
}
```

`429 Too Many Requests` - Usage limit exceeded
```json
{
  "ok": false,
  "error": "Usage limit exceeded",
  "limit": 3,
  "remaining": 0
}
```

`400 Bad Request` - Validation error
```json
{
  "ok": false,
  "error": "Validation error: idea must be at least 10 characters"
}
```

**Notes:**
- Uses GPT-4 with structured output
- Automatically creates/updates project if `projectId` not provided
- Checks subscription tier usage limits before processing
- Increments usage counter on success
- If project has ingested RAG documents, retrieves top 5 relevant chunks
- Response validated against Zod schema for type safety

---

## RAG Discovery

### Discover URLs

Use AI to discover relevant URLs for market research.

**Endpoint:** `POST /api/discovery/urls`

**Authentication:** Required

**Request Body:**
```json
{
  "businessIdea": "Eco-friendly pet subscription boxes"
}
```

**Success Response:** `200 OK`
```json
{
  "ok": true,
  "urls": [
    {
      "url": "https://www.barkbox.com",
      "title": "BarkBox - Monthly Dog Subscription",
      "category": "competitor",
      "relevanceScore": 0.95,
      "reason": "Leading pet subscription box competitor"
    },
    {
      "url": "https://www.grandviewresearch.com/industry-analysis/pet-care-market",
      "title": "Pet Care Market Size Report",
      "category": "market_report",
      "relevanceScore": 0.88,
      "reason": "Comprehensive market analysis and growth projections"
    }
  ],
  "metadata": {
    "queriesGenerated": 5,
    "totalSearchResults": 48,
    "filteredUrls": 12
  }
}
```

**Flow:**
1. GPT-4 generates 5-7 targeted search queries
2. Brave Search API executes queries (5 results each)
3. GPT-4 filters and ranks results by relevance
4. Returns top 10-15 URLs categorized

**Categories:**
- `competitor` - Direct/indirect competitors
- `market_report` - Industry reports, market analysis
- `industry_news` - News articles, trends, thought leadership

**Error Responses:**

`401 Unauthorized`
```json
{
  "ok": false,
  "error": "Unauthorized"
}
```

`400 Bad Request`
```json
{
  "ok": false,
  "error": "businessIdea is required"
}
```

---

### Ingest URLs

Trigger asynchronous ingestion of discovered URLs into RAG system.

**Endpoint:** `POST /api/discovery/ingest`

**Authentication:** Required

**Request Body:**
```json
{
  "projectId": "clx123abc",
  "urls": [
    {
      "url": "https://www.barkbox.com",
      "title": "BarkBox - Monthly Dog Subscription",
      "category": "competitor",
      "relevanceScore": 0.95,
      "reason": "Leading pet subscription box competitor"
    }
  ]
}
```

**Success Response:** `200 OK`
```json
{
  "ok": true,
  "jobId": "clx789ghi",
  "status": "processing",
  "message": "Ingesting 5 URLs in the background"
}
```

**Flow:**
1. Validates user owns the project
2. Creates `DiscoveryJob` record with status "pending"
3. Invokes AWS Lambda asynchronously with job payload
4. Updates job status to "processing"
5. Returns immediately with job ID

**Lambda Payload:**
```json
{
  "jobId": "clx789ghi",
  "projectId": "clx123abc",
  "userId": "clx000usr",
  "urls": [...]
}
```

**Error Responses:**

`404 Not Found` - Project doesn't exist or unauthorized
```json
{
  "ok": false,
  "error": "Project not found or unauthorized"
}
```

`500 Internal Server Error` - Lambda invocation failed
```json
{
  "ok": false,
  "error": "Failed to start ingestion worker"
}
```

---

### Check Job Status

Poll ingestion job status.

**Endpoint:** `GET /api/discovery/status/{jobId}`

**Authentication:** Required

**URL Parameters:**
- `jobId` (string) - DiscoveryJob ID from ingest response

**Success Response:** `200 OK`
```json
{
  "ok": true,
  "job": {
    "id": "clx789ghi",
    "status": "completed",
    "urlCount": 5,
    "chunksCount": 127,
    "createdAt": "2024-11-07T12:00:00.000Z",
    "completedAt": "2024-11-07T12:03:45.000Z"
  }
}
```

**Job Statuses:**
- `pending` - Job created, waiting for Lambda
- `processing` - Lambda actively processing URLs
- `completed` - All URLs successfully ingested
- `failed` - Job encountered errors

**Error Responses:**

`404 Not Found`
```json
{
  "ok": false,
  "error": "Job not found"
}
```

`403 Forbidden` - Job belongs to different user
```json
{
  "ok": false,
  "error": "Unauthorized"
}
```

---

## Projects

### Get Project

Retrieve project details with latest analysis.

**Endpoint:** `GET /api/projects/{id}`

**Authentication:** Required

**URL Parameters:**
- `id` (string) - Project ID

**Success Response:** `200 OK`
```json
{
  "ok": true,
  "project": {
    "id": "clx123abc",
    "businessIdea": "Eco-friendly pet subscription boxes",
    "createdAt": "2024-11-01T10:00:00.000Z",
    "latestAnalysis": {
      "id": "clx456def",
      "input": { ... },
      "output": { ... },
      "model": "gpt-4o",
      "tokenUsage": 2140,
      "costUsd": "0.0199",
      "status": "success",
      "createdAt": "2024-11-01T10:05:00.000Z"
    }
  }
}
```

**Error Responses:**

`404 Not Found`
```json
{
  "ok": false,
  "error": "Project not found"
}
```

**Notes:**
- Only returns projects owned by authenticated user
- Includes most recent analysis (if any)
- Uses project title as `businessIdea` field

---

## Subscriptions

### Create Checkout Session

Initiate Stripe checkout or upgrade existing subscription.

**Endpoint:** `POST /api/checkout`

**Authentication:** Required

**Request Body:**
```json
{
  "planId": "starter"
}
```

**Plan IDs:**
- `free` - Not a valid checkout option
- `starter` - $29/month, 25 analyses
- `pro` - $99/month, 100 analyses + RAG

**Success Response (New Subscription):** `200 OK`
```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/pay/cs_test_..."
}
```

**Success Response (Upgrade Existing):** `200 OK`
```json
{
  "ok": true,
  "upgraded": true,
  "message": "Subscription updated"
}
```

**Flow:**
1. Get/create user and Stripe customer
2. Check for existing subscription
3. If active subscription exists: Update plan with proration
4. If cancelled subscription exists: Reactivate and upgrade
5. If no subscription: Create Stripe Checkout session
6. Update usage meter with new plan limits

**Error Responses:**

`400 Bad Request`
```json
{
  "ok": false,
  "error": "Invalid plan"
}
```

---

### Get User Subscription

Retrieve current subscription status and plan.

**Endpoint:** `GET /api/user/subscription`

**Authentication:** Required

**Success Response:** `200 OK`
```json
{
  "ok": true,
  "plan": {
    "id": "starter",
    "name": "Starter",
    "priceMonthly": 29,
    "stripePriceId": "price_...",
    "includedAnalyses": 25,
    "features": [
      "25 analyses per month",
      "Detailed viability reports",
      "Priority email support",
      "Export to PDF"
    ]
  },
  "subscription": {
    "status": "active",
    "currentPeriodEnd": "2024-12-01T00:00:00.000Z",
    "cancelAtPeriodEnd": false
  }
}
```

**Subscription Statuses:**
- `active` - Paid and current
- `trialing` - In trial period
- `past_due` - Payment failed
- `canceled` - Subscription ended
- `null` - Free tier (no subscription)

---

### Cancel Subscription

Cancel subscription at end of billing period.

**Endpoint:** `POST /api/subscription/cancel`

**Authentication:** Required

**Request Body:** (empty)

**Success Response:** `200 OK`
```json
{
  "ok": true,
  "message": "Subscription will be cancelled at the end of the billing period"
}
```

**Flow:**
1. Finds user's active subscription
2. Calls Stripe API to set `cancel_at_period_end: true`
3. Updates local database to reflect cancellation status
4. User retains access until period end

**Error Responses:**

`400 Bad Request` - No active subscription
```json
{
  "ok": false,
  "error": "No active subscription"
}
```

---

## Webhooks

### Stripe Webhook Handler

Receives and processes Stripe subscription events.

**Endpoint:** `POST /api/webhooks/stripe`

**Authentication:** Stripe signature verification

**Request Headers:**
```http
Stripe-Signature: t=1699564800,v1=signature...
```

**Supported Events:**

#### `checkout.session.completed`
Fired when user completes Stripe Checkout.

**Actions:**
- Create/update Subscription record
- Initialize UsageMeter for current period
- Store subscription status and billing dates

#### `customer.subscription.updated`
Fired when subscription changes (plan upgrade, renewal, cancellation).

**Actions:**
- Update Subscription status and dates
- Update UsageMeter limits if plan changed
- Sync `cancelAtPeriodEnd` flag

#### `customer.subscription.deleted`
Fired when subscription is permanently deleted.

**Actions:**
- Update Subscription status to "canceled"

#### `invoice.payment_succeeded`
Fired when payment succeeds (start of new billing period).

**Actions:**
- Reset UsageMeter for new period
- Set consumed counter to 0

**Success Response:** `200 OK`
```json
{
  "received": true
}
```

**Error Responses:**

`400 Bad Request` - Invalid signature
```json
{
  "error": "Invalid signature"
}
```

**Security:**
- Verifies webhook signature using `STRIPE_WEBHOOK_SECRET`
- Prevents replay attacks
- Validates event authenticity

---

## Error Codes

### HTTP Status Codes

| Code | Description | Common Causes |
|------|-------------|---------------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Invalid input, validation error |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Valid token but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Usage limit exceeded |
| 500 | Internal Server Error | Server-side error, check logs |

### Error Response Format

All errors follow consistent format:

```json
{
  "ok": false,
  "error": "Human-readable error message"
}
```

Some errors include additional context:

```json
{
  "ok": false,
  "error": "Usage limit exceeded",
  "limit": 3,
  "remaining": 0
}
```

---

## Rate Limits

### Per-User Limits (by Subscription)

| Tier | Analyses/Month | RAG Jobs | Requests/Minute |
|------|----------------|----------|-----------------|
| Free | 3 | N/A | 10 |
| Starter | 25 | N/A | 20 |
| Pro | 100 | Unlimited | 60 |

### Global Limits

- **Viability Analysis:** Max 1 concurrent request per user
- **Discovery URLs:** 5 requests/minute per user
- **RAG Ingestion:** Max 20 URLs per job
- **Status Polling:** 1 request/second recommended

### External API Limits

**OpenAI:**
- GPT-4: 10,000 tokens/minute (shared)
- Embeddings: 3,500 requests/minute

**Brave Search:**
- Free tier: 2,000 searches/month
- Rate limit: 1 request/second

**Stripe:**
- 100 requests/second per account

---

## Usage Examples

### Complete Analysis Flow

```typescript
import { fetchAuthSession } from "aws-amplify/auth";

// 1. Get auth token
const session = await fetchAuthSession();
const token = session.tokens?.idToken?.toString();

// 2. Generate analysis
const analysisRes = await fetch("/api/viability", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  },
  body: JSON.stringify({
    idea: "Eco-friendly pet subscription boxes",
    targetMarket: "Millennials with pets",
    budgetUsd: 50000,
    timelineMonths: 12
  })
});

const analysis = await analysisRes.json();
console.log("Project ID:", analysis.meta.projectId);
console.log("Remaining analyses:", analysis.meta.usage.remaining);
```

### RAG Enhancement Flow

```typescript
// 1. Discover URLs
const discoveryRes = await fetch("/api/discovery/urls", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  },
  body: JSON.stringify({
    businessIdea: "Eco-friendly pet subscription boxes"
  })
});

const { urls } = await discoveryRes.json();

// 2. Trigger ingestion
const ingestRes = await fetch("/api/discovery/ingest", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  },
  body: JSON.stringify({
    projectId: "clx123abc",
    urls: urls.slice(0, 10) // Select first 10
  })
});

const { jobId } = await ingestRes.json();

// 3. Poll status
const checkStatus = async () => {
  const statusRes = await fetch(`/api/discovery/status/${jobId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const { job } = await statusRes.json();
  
  if (job.status === "completed") {
    console.log(`Ingested ${job.chunksCount} chunks`);
  } else if (job.status === "failed") {
    console.error("Ingestion failed");
  } else {
    setTimeout(checkStatus, 3000); // Poll every 3 seconds
  }
};

checkStatus();

// 4. Run analysis with RAG context
const enhancedRes = await fetch("/api/viability", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  },
  body: JSON.stringify({
    idea: "Eco-friendly pet subscription boxes",
    targetMarket: "Millennials with pets",
    projectId: "clx123abc" // Same project with ingested docs
  })
});

const enhanced = await enhancedRes.json();
// Analysis now includes insights from ingested competitor/market data
```

---

## Changelog

**v1.0** (November 2024)
- Initial API release
- Core viability analysis endpoint
- RAG discovery and ingestion pipeline
- Stripe subscription management
- Usage metering and limits

---

**Last Updated:** November 2024  
**API Version:** 1.0  
**Base URL:** `https://your-app.amplifyapp.com/api`

