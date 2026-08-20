import { createHmac, randomBytes } from "node:crypto";

// SmugMug API v2 only supports OAuth 1.0a (no OAuth2/API-key-only mode) -- this is a
// minimal from-scratch signer rather than an npm dependency, matching how HMAC signing
// is already done natively elsewhere in this codebase (e.g. src/lib/public-site/gallery-auth.ts).
// Reference: https://api.smugmug.com/api/v2/doc/tutorial/authorization.html

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export type OAuthCredentials = {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

/**
 * Builds a signed `Authorization` header for one request. SmugMug's own account
 * owner gets a permanent Access Token + Secret from Account Settings -> Privacy,
 * which skips the full three-legged OAuth dance (request token -> user authorizes ->
 * access token) entirely -- appropriate here since this script only ever exports the
 * account owner's own data, never a third party's.
 */
export function signRequest(
  method: "GET",
  url: string,
  creds: OAuthCredentials,
): string {
  const parsed = new URL(url);
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const allParams: [string, string][] = [...Object.entries(oauthParams)];
  for (const [key, value] of parsed.searchParams.entries()) {
    allParams.push([key, value]);
  }

  const baseParamString = allParams
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort(([ka, va], [kb, vb]) => (ka === kb ? (va < vb ? -1 : va > vb ? 1 : 0) : ka < kb ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const baseUrl = `${parsed.origin}${parsed.pathname}`;
  const signatureBase = [method, percentEncode(baseUrl), percentEncode(baseParamString)].join("&");
  const signingKey = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(signatureBase).digest("base64");

  const headerParams = { ...oauthParams, oauth_signature: signature };
  const header = Object.entries(headerParams)
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(", ");

  return `OAuth ${header}`;
}

export function credsFromEnv(): OAuthCredentials {
  const consumerKey = process.env.SMUGMUG_API_KEY;
  const consumerSecret = process.env.SMUGMUG_API_SECRET;
  const accessToken = process.env.SMUGMUG_ACCESS_TOKEN;
  const accessTokenSecret = process.env.SMUGMUG_ACCESS_TOKEN_SECRET;
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    throw new Error(
      "SMUGMUG_API_KEY, SMUGMUG_API_SECRET, SMUGMUG_ACCESS_TOKEN, and SMUGMUG_ACCESS_TOKEN_SECRET must all be set " +
        "(see docs/bulk-import.md for where to get each one)",
    );
  }
  return { consumerKey, consumerSecret, accessToken, accessTokenSecret };
}
