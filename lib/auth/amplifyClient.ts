"use client";

import { Amplify } from "aws-amplify";

const region = process.env.NEXT_PUBLIC_AMPLIFY_REGION!;
const userPoolId = process.env.NEXT_PUBLIC_USER_POOL_ID!;
const userPoolClientId = process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!;
const oauthDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN; // e.g. your-prefix.auth.us-east-2.amazoncognito.com

function getRedirectUrls(): string[] {
  // Priority: 1. Environment variable, 2. window.location.origin
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
    (typeof window !== "undefined" ? window.location.origin : "");
  
  if (!baseUrl) {
    console.warn("Amplify: No redirect URL configured. Set NEXT_PUBLIC_APP_URL or ensure window.location.origin is available.");
    return [];
  }

  // Return both the base URL and with wildcard for Cognito compatibility
  return [
    baseUrl,
    `${baseUrl}/*`,
  ];
}

let isConfigured = false;

export function configureAmplify() {
  if (isConfigured) return; // Only configure once
  
  if (!userPoolId || !userPoolClientId) {
    console.warn("Amplify: Missing required configuration (userPoolId or userPoolClientId)");
    return;
  }

  if (!oauthDomain) {
    console.warn("Amplify: OAuth domain not configured. Set NEXT_PUBLIC_COGNITO_DOMAIN");
    return;
  }

  const redirectUrls = getRedirectUrls();
  if (redirectUrls.length === 0) {
    console.warn("Amplify: No redirect URLs available. Configuration skipped.");
    return;
  }

  // Use only the base URL (first element) for Amplify SDK
  // The wildcard is only needed in Cognito console, not in SDK config
  const baseRedirectUrl = redirectUrls[0];

  try {
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId,
          userPoolClientId,
          loginWith: {
            oauth: {
              domain: oauthDomain,
              scopes: ["openid", "email", "profile"],
              redirectSignIn: [baseRedirectUrl],  // Array with only base URL
              redirectSignOut: [baseRedirectUrl],  // Array with only base URL
              responseType: "code",
            },
          },
        },
      },
    });
    
    isConfigured = true;
    console.log("Amplify configured successfully", {
      userPoolId: userPoolId.substring(0, 10) + "...",
      redirectUrl: baseRedirectUrl,
    });
  } catch (error) {
    console.error("Amplify configuration error:", error);
  }
}