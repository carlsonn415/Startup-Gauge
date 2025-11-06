import { CognitoJwtVerifier } from "aws-jwt-verify";

const userPoolId = process.env.NEXT_PUBLIC_USER_POOL_ID as string | undefined;
const userPoolClientId = process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID as string | undefined;

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

export function getVerifier() {
  if (!userPoolId || !userPoolClientId) return null;
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "id",
      clientId: userPoolClientId,
    });
  }
  return verifier;
}

export async function verifyAuthHeader(authorization?: string) {
  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, "");
  const v = getVerifier();
  if (!v) return null;
  try {
    const payload = await v.verify(token);
    return payload as Record<string, any>;
  } catch {
    return null;
  }
}

