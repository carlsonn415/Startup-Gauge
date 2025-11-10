"use client";

import { Amplify } from "aws-amplify";

const region = process.env.NEXT_PUBLIC_AMPLIFY_REGION!;
const userPoolId = process.env.NEXT_PUBLIC_USER_POOL_ID!;
const userPoolClientId = process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!;
const oauthDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN; // e.g. your-prefix.auth.us-east-2.amazoncognito.com
const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");

export function configureAmplify() {
  if (!userPoolId || !userPoolClientId) return;

  // Use environment variable for redirect URLs, fallback to window.location.origin
  const redirectSignIn = appUrl || (typeof window !== "undefined" ? window.location.origin : "");
  const redirectSignOut = redirectSignIn;

  if (!redirectSignIn) {
    console.warn("Amplify: No redirect URL configured. Set NEXT_PUBLIC_APP_URL or ensure window.location.origin is available.");
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: {
          oauth: oauthDomain
            ? {
                domain: oauthDomain,
                scopes: ["openid", "email", "profile"],
                redirectSignIn: [redirectSignIn],   // <-- must be string[]
                redirectSignOut: [redirectSignOut], // <-- must be string[]
                responseType: "code",
              }
            : undefined,
        },
      },
    },
  });
}