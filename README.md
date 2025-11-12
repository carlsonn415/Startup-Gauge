# Startup Gauge

> AI-powered business analysis platform with RAG-enhanced market research, built with Next.js 14, OpenAI, and AWS.

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19-brightgreen)](https://www.prisma.io/)
[![AWS](https://img.shields.io/badge/AWS-Amplify%20%7C%20Lambda-orange)](https://aws.amazon.com/)

**[Live Demo](#)** • **[Architecture](docs/ARCHITECTURE.md)** • **[API Reference](docs/API_REFERENCE.md)**

---

## 🎯 Overview

Startup Gauge is a full-stack SaaS application that leverages AI to analyze business ideas and provide comprehensive viability assessments. The platform combines structured analysis with RAG (Retrieval-Augmented Generation) to deliver data-driven insights backed by real market research.

### Key Features

- **🤖 AI-Powered Analysis** - Generate detailed viability reports with market sizing, risk assessment, and financial projections
- **🔍 RAG-Enhanced Research** - Automatically discover and ingest relevant market data, competitor information, and industry insights
- **💳 Stripe Integration** - Multi-tier subscription plans with usage metering and automatic billing
- **🔐 AWS Cognito Auth** - Secure user authentication and session management via AWS Amplify
- **📊 Project Management** - Create, save, and track multiple business idea analyses
- **⚡ Real-time Ingestion** - Asynchronous Lambda-based document processing with status tracking
- **📈 Usage Tracking** - Monitor analysis consumption and enforce subscription limits

---

## 🏗️ Tech Stack

### Frontend
- **Next.js 14** (App Router) - React framework with server components
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Zod** - Schema validation for type-safe API contracts

### Backend
- **Next.js API Routes** - Serverless API endpoints
- **Prisma** - Type-safe ORM with PostgreSQL
- **AWS Lambda** - Serverless document ingestion worker
- **OpenAI API** - GPT-4 for analysis + embeddings for RAG

### Infrastructure
- **Neon** - Serverless PostgreSQL with pgvector extension
- **AWS Amplify** - Hosting, authentication (Cognito), and deployment
- **AWS Lambda** - Asynchronous RAG processing
- **Stripe** - Payment processing and subscription management
- **Brave Search API** - Market research and URL discovery

---

## 🚀 Features in Detail

### 1. AI Viability Analysis

Submit a business idea and receive structured analysis including:
- Market size estimation
- Customer acquisition and lifetime value projections
- Risk assessment (up to 10 identified risks)
- Step-by-step launch roadmap
- 12-month financial projections
- Confidence scoring (0-100%)

**Powered by:** OpenAI GPT-4 with strict schema validation via Zod

### 2. RAG Discovery System

Enhance analyses with real market data:
1. **Discovery Agent** - AI searches for relevant URLs (competitors, market reports, case studies)
2. **URL Selection** - Review and select relevant resources
3. **Asynchronous Ingestion** - Lambda worker fetches, chunks, and embeds content
4. **Vector Search** - Retrieve context for AI analysis using pgvector similarity search

**Tech:** AWS Lambda + OpenAI Embeddings + pgvector + Brave Search API

### 3. Subscription Management

Three-tier pricing model:
- **Free**: 3 analyses/month
- **Starter ($29)**: 25 analyses/month + detailed reports
- **Pro ($99)**: 100 analyses/month + RAG + API access

Features:
- Stripe Checkout integration
- Usage metering per billing period
- Subscription upgrade/cancel workflow
- Webhook handling for subscription events

### 4. Authentication & Authorization

- AWS Cognito via Amplify SDK
- JWT validation on API routes
- User-scoped data access
- Session management

---

## 📁 Project Structure

```
├── app/
│   ├── (app)/              # Authenticated app routes
│   │   ├── pricing/        # Subscription plans
│   │   └── projects/       # Project CRUD + discovery UI
│   ├── api/                # API routes
│   │   ├── viability/      # AI analysis endpoint
│   │   ├── discovery/      # RAG URL discovery + ingestion
│   │   ├── checkout/       # Stripe checkout
│   │   ├── subscription/   # Subscription management
│   │   └── webhooks/       # Stripe webhooks
│   ├── layout.tsx          # Root layout with auth
│   └── page.tsx            # Landing page
├── components/
│   ├── auth/               # Auth UI components
│   └── ui/                 # Reusable UI components
├── lib/
│   ├── ai/                 # OpenAI integration + prompt management
│   ├── auth/               # Amplify config + JWT verification
│   ├── db/                 # Prisma client
│   ├── rag/                # Vector search utilities
│   ├── search/             # Brave Search integration
│   └── stripe/             # Stripe client + plans
├── lambda/
│   └── rag-ingestion-worker/  # Document processing Lambda
├── prisma/
│   ├── migrations/         # Database migrations
│   └── schema.prisma       # Data models
└── docs/                   # Documentation
```

---

## ⚙️ Setup & Installation

### Prerequisites

- **Node.js 20+**
- **PostgreSQL** with pgvector extension (Neon recommended)
- **AWS Account** (for Amplify Auth + Lambda)
- **API Keys**: OpenAI, Stripe, Brave Search

### 1. Clone & Install

```bash
git clone <repository-url>
cd startup-gauge
npm install
```

### 2. Environment Variables

Create `.env` file:

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

# AWS Amplify (Cognito)
# Configure after setting up Amplify Auth
```

### 3. Database Setup

```bash
# Run migrations
npx prisma migrate dev

# Generate Prisma Client
npx prisma generate
```

### 4. Deploy Lambda Worker

```bash
cd lambda/rag-ingestion-worker
npm install
cd ..

# Deploy with AWS SAM
sam build
sam deploy --guided
```

See [docs/RAG_QUICKSTART.md](docs/RAG_QUICKSTART.md) for detailed Lambda setup.

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🧪 Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run eval         # Run AI prompt evaluation
```

---

## 📊 Database Schema

**Key Models:**

- **User** - Authentication and subscription info
- **Project** - Business idea containers
- **Analysis** - AI-generated viability reports with versioning
- **PromptVersion** - Track prompt changes and model versions
- **Subscription** - Stripe subscription data
- **UsageMeter** - Track monthly analysis consumption
- **DiscoveryJob** - RAG ingestion job tracking
- **DocumentChunk** - Vector-embedded content for RAG

See [prisma/schema.prisma](prisma/schema.prisma) for full schema.

---

## 🚢 Deployment

### Quick Start

See [docs/AMPLIFY_QUICKSTART.md](docs/AMPLIFY_QUICKSTART.md) for a 15-minute deployment guide.

### Full Deployment Guide

Complete deployment instructions are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), including:
- AWS Amplify Hosting setup
- Environment variable configuration
- AWS Cognito authentication setup
- Stripe webhook configuration
- Lambda deployment
- CI/CD pipeline setup
- Monitoring and observability

### AWS Amplify Hosting

1. **Connect GitHub** repository in Amplify console
2. **Configure build settings** (auto-detected from `amplify.yml`)
3. **Add environment variables** from `.env.example`
4. **Deploy** - Automatic on git push to main branch

**See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed instructions.**

---

## 📖 Documentation

- **[Architecture Overview](docs/ARCHITECTURE.md)** - System design and data flows
- **[API Reference](docs/API_REFERENCE.md)** - Complete API endpoint documentation
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Complete AWS Amplify deployment instructions
- **[Amplify Quick Start](docs/AMPLIFY_QUICKSTART.md)** - 15-minute deployment guide
- **[Monitoring Guide](docs/MONITORING.md)** - Production monitoring and observability
- **[RAG Setup Guide](docs/RAG_QUICKSTART.md)** - Lambda deployment walkthrough
- **[RAG Implementation](docs/RAG_IMPLEMENTATION.md)** - Technical deep dive

---

## 🔒 Security

- JWT validation on all authenticated routes
- Rate limiting on API endpoints
- Stripe webhook signature verification
- SQL injection protection via Prisma
- Environment variable validation
- CORS configuration
- Input sanitization with Zod schemas

---

## 💰 Cost Breakdown

**Free Tier Usage:**
- AWS Lambda: 1M requests/month free
- Brave Search: 2,000 searches/month free
- Neon: 10GB storage free

**Estimated Monthly Costs (Light Usage):**
- OpenAI Embeddings: ~$1-2
- OpenAI GPT-4: ~$5-10
- AWS Lambda execution: ~$0.50
- **Total: ~$7-13/month** for 50-100 analyses

---

## 🛣️ Roadmap

- [ ] Enhanced landing page with feature showcase
- [ ] User dashboard with analytics
- [ ] Export reports to PDF
- [ ] Comparative analysis (multiple ideas)
- [ ] API access for Pro tier
- [ ] Semantic chunking strategy
- [ ] Support for more document types (DOCX, MD)
- [ ] Team collaboration features

---

## 📝 License

This project is licensed under the Apache 2.0 License - see [LICENSE.md](LICENSE.md) for details.

---

## 👨‍💻 Author

**Nathan Carlson** - Portfolio Project

**Built to demonstrate:** Full-stack development, AI integration, RAG implementation, serverless architecture, payment systems, and production-ready AWS deployment.
