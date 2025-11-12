# Monitoring & Observability Guide

Complete guide for monitoring Startup Gauge in production.

## Table of Contents

1. [CloudWatch Logs](#cloudwatch-logs)
2. [Error Monitoring](#error-monitoring)
3. [Performance Monitoring](#performance-monitoring)
4. [Lambda Monitoring](#lambda-monitoring)
5. [Database Monitoring](#database-monitoring)
6. [Cost Monitoring](#cost-monitoring)
7. [Uptime Monitoring](#uptime-monitoring)
8. [Setting Up Alarms](#setting-up-alarms)

---

## CloudWatch Logs

### Accessing Logs

1. Go to [AWS CloudWatch Console](https://console.aws.amazon.com/cloudwatch/)
2. Navigate to **Log groups**
3. Find logs for:
   - **Amplify**: `/aws/amplify/<app-id>`
   - **Lambda**: `/aws/lambda/rag-ingestion-worker`

### Log Groups

**Amplify Application Logs:**
```
/aws/amplify/<your-app-id>
```

**Lambda Function Logs:**
```
/aws/lambda/rag-ingestion-worker
```

### Viewing Logs

**Via AWS Console:**
1. Select log group
2. Click **"Log streams"**
3. Select a stream to view logs
4. Use filters to search for specific errors

**Via AWS CLI:**
```bash
# View recent Amplify logs
aws logs tail /aws/amplify/<app-id> --follow

# View Lambda logs
aws logs tail /aws/lambda/rag-ingestion-worker --follow

# Filter for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/rag-ingestion-worker \
  --filter-pattern "ERROR"
```

---

## Error Monitoring

### CloudWatch Alarms for Errors

**Set up 4xx/5xx Error Alarms:**

1. Go to CloudWatch → **Alarms** → **Create alarm**
2. Select metric: **Amplify** → **4xxError** or **5xxError**
3. Configure:
   - **Statistic**: Sum
   - **Period**: 5 minutes
   - **Threshold**: > 10 errors
4. **Actions**: Send SNS notification or email

**Create SNS Topic for Alerts:**

1. Go to [SNS Console](https://console.aws.amazon.com/sns/)
2. Create topic: `startup-gauge-alerts`
3. Subscribe your email
4. Use this topic in CloudWatch alarms

### Application Error Tracking

**Add Error Logging:**

The app already logs errors with `console.error()`. To enhance:

1. **Add structured logging:**
   ```typescript
   console.error('[API Error]', {
     endpoint: '/api/viability',
     userId: user.id,
     error: err.message,
     timestamp: new Date().toISOString(),
   });
   ```

2. **Search logs for patterns:**
   - `[API Error]` - API route errors
   - `[Webhook]` - Stripe webhook errors
   - `[Sync]` - Subscription sync errors

### Common Error Patterns

**Database Connection Errors:**
- Pattern: `PrismaClientKnownRequestError` or `Connection timeout`
- Action: Check database status, connection pool size

**Authentication Errors:**
- Pattern: `Unauthorized` or `JWT verification failed`
- Action: Verify Cognito configuration, token expiration

**Stripe Webhook Errors:**
- Pattern: `Webhook signature verification failed`
- Action: Check webhook secret, verify endpoint URL

---

## Performance Monitoring

### Amplify Metrics

Monitor in CloudWatch:

**Key Metrics:**
- **Request Count**: Total requests per period
- **4xxError**: Client errors
- **5xxError**: Server errors
- **Latency**: Response time (p50, p95, p99)

**View Metrics:**
1. Go to CloudWatch → **Metrics** → **AWS/Amplify**
2. Select your app
3. View graphs for:
   - Request count
   - Error rates
   - Response times

### Database Performance

**Neon Console Metrics:**
- Query execution time
- Connection count
- Storage usage
- CPU usage

**Slow Query Logging:**
Enable in Neon Console to identify slow queries.

### API Response Times

**Monitor via Logs:**
Search CloudWatch logs for response times:
```bash
aws logs filter-log-events \
  --log-group-name /aws/amplify/<app-id> \
  --filter-pattern "duration"
```

**Set Up Latency Alarms:**
1. Create CloudWatch alarm
2. Metric: `Latency` (p95)
3. Threshold: > 2000ms
4. Alert when slow responses detected

---

## Lambda Monitoring

### Lambda Metrics

Monitor in CloudWatch:

**Key Metrics:**
- **Invocations**: Number of function calls
- **Errors**: Failed invocations
- **Duration**: Execution time
- **Throttles**: Rate limit hits

**View Metrics:**
1. Go to Lambda Console
2. Select function: `rag-ingestion-worker`
3. Go to **Monitoring** tab
4. View graphs and metrics

### Lambda Alarms

**Error Rate Alarm:**
1. CloudWatch → **Alarms** → **Create alarm**
2. Metric: `Errors` (Lambda)
3. Threshold: > 5 errors in 5 minutes
4. Action: Send SNS notification

**Duration Alarm:**
1. Metric: `Duration` (Lambda)
2. Threshold: > 30 seconds (adjust based on your needs)
3. Alert on slow executions

**Throttle Alarm:**
1. Metric: `Throttles` (Lambda)
2. Threshold: > 0
3. Alert when function is throttled

### Lambda Logs

**View Execution Logs:**
```bash
aws logs tail /aws/lambda/rag-ingestion-worker --follow
```

**Common Lambda Issues:**
- **Timeout**: Increase timeout in Lambda configuration
- **Memory**: Increase memory allocation if needed
- **Cold Starts**: Consider provisioned concurrency for production

---

## Database Monitoring

### Neon Console

**Monitor:**
- Active connections
- Query performance
- Storage usage
- CPU usage

**Set Up Alerts:**
1. Go to Neon Console → **Settings** → **Alerts**
2. Configure:
   - **High connection count**: Alert at 80% of limit
   - **Storage usage**: Alert at 80% capacity
   - **Slow queries**: Alert on queries > 5 seconds

### Connection Pool Monitoring

**Check Active Connections:**
```sql
SELECT count(*) FROM pg_stat_activity 
WHERE datname = 'your_database_name';
```

**Monitor Connection Usage:**
- Set up alert when connections > 80% of pool
- Review connection leaks in application logs

### Query Performance

**Enable Query Logging:**
In Neon Console, enable slow query logging.

**Review Slow Queries:**
```sql
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

---

## Cost Monitoring

### AWS Cost Explorer

**Set Up Budget:**
1. Go to [AWS Cost Management](https://console.aws.amazon.com/cost-management/)
2. **Budgets** → **Create budget**
3. Configure:
   - **Budget type**: Cost budget
   - **Amount**: $50-100/month (adjust based on usage)
   - **Alerts**: At 80% and 100%

**Track Costs by Service:**
- Amplify Hosting
- Lambda
- Cognito
- CloudWatch Logs

### Estimated Monthly Costs

**Low Traffic (100 users, 500 analyses/month):**
- Amplify: ~$5-10
- Lambda: ~$1-5
- Cognito: Free (under 50K MAU)
- Database (Neon): ~$10-20
- CloudWatch: ~$1-5
- **Total: ~$20-40/month**

**Medium Traffic (1,000 users, 5,000 analyses/month):**
- Amplify: ~$20-50
- Lambda: ~$10-20
- Cognito: Free
- Database: ~$30-50
- CloudWatch: ~$5-10
- **Total: ~$65-130/month**

**High Traffic (10,000 users, 50,000 analyses/month):**
- Amplify: ~$100-200
- Lambda: ~$50-100
- Cognito: Free (if under 50K MAU)
- Database: ~$100-200
- CloudWatch: ~$20-50
- **Total: ~$270-550/month**

### Cost Optimization Tips

1. **Enable Amplify caching** to reduce bandwidth
2. **Optimize Lambda** memory allocation
3. **Use database connection pooling** efficiently
4. **Archive old CloudWatch logs** to reduce storage costs
5. **Monitor unused resources** and clean them up

---

## Uptime Monitoring

### AWS Route 53 Health Checks

**Set Up Health Check:**
1. Go to [Route 53 Console](https://console.aws.amazon.com/route53/)
2. **Health checks** → **Create health check**
3. Configure:
   - **Endpoint**: Your Amplify URL
   - **Path**: `/api/health` (create this endpoint)
   - **Interval**: 30 seconds
   - **Failure threshold**: 3

**Create Health Check Endpoint:**

Add to `app/api/health/route.ts`:
```typescript
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ 
    status: "ok", 
    timestamp: new Date().toISOString() 
  });
}
```

### Third-Party Uptime Monitoring

**Options:**
- **UptimeRobot** (free tier: 50 monitors)
- **Pingdom** (paid)
- **StatusCake** (free tier available)

**Configure:**
1. Sign up for service
2. Add monitor for your Amplify URL
3. Set check interval (1-5 minutes)
4. Configure alert channels (email, SMS, Slack)

---

## Setting Up Alarms

### Complete Alarm Setup

**1. Create SNS Topic:**
```bash
aws sns create-topic --name startup-gauge-alerts
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-2:ACCOUNT:startup-gauge-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com
```

**2. Create CloudWatch Alarms:**

**High Error Rate:**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name amplify-high-error-rate \
  --alarm-description "Alert when error rate is high" \
  --metric-name 5xxError \
  --namespace AWS/Amplify \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-2:ACCOUNT:startup-gauge-alerts
```

**Lambda Errors:**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name lambda-errors \
  --alarm-description "Alert on Lambda errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=rag-ingestion-worker \
  --alarm-actions arn:aws:sns:us-east-2:ACCOUNT:startup-gauge-alerts
```

### Dashboard Creation

**Create CloudWatch Dashboard:**
1. Go to CloudWatch → **Dashboards** → **Create dashboard**
2. Add widgets for:
   - Amplify request count
   - Error rates (4xx, 5xx)
   - Lambda invocations
   - Lambda errors
   - Database connections
   - Response times

**Save and Share:**
- Save dashboard
- Share with team members
- Set as homepage for quick monitoring

---

## Best Practices

1. **Set up alerts early** - Don't wait for issues
2. **Review logs regularly** - Weekly log review
3. **Monitor costs** - Set budgets and alerts
4. **Track key metrics** - Response times, error rates
5. **Document incidents** - Keep track of issues and resolutions
6. **Automate responses** - Use Lambda for auto-remediation where possible

---

## Quick Reference

**Key Log Groups:**
- Amplify: `/aws/amplify/<app-id>`
- Lambda: `/aws/lambda/rag-ingestion-worker`

**Key Metrics:**
- Amplify: `4xxError`, `5xxError`, `Latency`
- Lambda: `Invocations`, `Errors`, `Duration`, `Throttles`

**Alarm Thresholds:**
- Error rate: > 10 errors in 5 minutes
- Lambda errors: > 5 errors in 5 minutes
- Latency: > 2000ms (p95)

**Cost Budget:**
- Recommended: $50-100/month for small-medium traffic
- Adjust based on actual usage

