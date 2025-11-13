import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient({
  region: process.env.IAM_AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.IAM_AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.IAM_AWS_SECRET_ACCESS_KEY || "",
  },
});

/**
 * Invoke a Lambda function asynchronously
 */
export async function invokeLambdaAsync(
  functionName: string,
  payload: any
): Promise<void> {
  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: "Event", // Async invocation
    Payload: Buffer.from(JSON.stringify(payload)),
  });

  try {
    await lambdaClient.send(command);
  } catch (error) {
    console.error(`Failed to invoke Lambda ${functionName}:`, error);
    throw error;
  }
}

