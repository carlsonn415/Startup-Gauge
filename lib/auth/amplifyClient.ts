"use client";

import { Amplify } from "aws-amplify";

const region = process.env.NEXT_PUBLIC_AMPLIFY_REGION!;
const userPoolId = process.env.NEXT_PUBLIC_USER_POOL_ID!;
const userPoolClientId = process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!;
const oauthDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN; // e.g. your-prefix.auth.us-east-2.amazoncognito.com

const redirectSignIn = typeof window !== "undefined" ? window.location.origin : "";
const redirectSignOut = redirectSignIn;

export function configureAmplify() {
  if (!userPoolId || !userPoolClientId || !region) return;

  Amplify.configure({
    Auth: {
      Cognito: {
        region,
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