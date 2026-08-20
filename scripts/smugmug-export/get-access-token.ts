#!/usr/bin/env -S npx tsx
// One-time bootstrap: exchanges a SmugMug API Key/Secret (from
// https://api.smugmug.com/api/developer/apply) for a permanent Access Token/Secret,
// via OAuth 1.0a's out-of-band ("oob") flow -- no callback server needed, SmugMug just
// displays a PIN on the page after you approve. Run once; the resulting Access
// Token/Secret go straight into SMUGMUG_ACCESS_TOKEN/SMUGMUG_ACCESS_TOKEN_SECRET and
// never expire on their own (only if manually revoked from Account Settings -> Privacy
// -> Authorized Services).
//
// Usage: npx tsx scripts/smugmug-export/get-access-token.ts <API_KEY> <API_SECRET>

import { createInterface } from "node:readline/promises";
import { createHmac, randomBytes } from "node:crypto";

const API_BASE = "https://api.smugmug.com";

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sign(
  method: "GET",
  url: string,
  consumerKey: string,
  consumerSecret: string,
  extraParams: Record<string, string>,
  token?: string,
  tokenSecret?: string,
): { authHeader: string } {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
    ...extraParams,
  };
  if (token) oauthParams.oauth_token = token;

  const baseParamString = Object.entries(oauthParams)
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort(([ka, va], [kb, vb]) => (ka === kb ? (va < vb ? -1 : va > vb ? 1 : 0) : ka < kb ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const signatureBase = [method, percentEncode(url), percentEncode(baseParamString)].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret ?? "")}`;
  const signature = createHmac("sha1", signingKey).update(signatureBase).digest("base64");

  const headerParams = { ...oauthParams, oauth_signature: signature };
  const authHeader =
    "OAuth " + Object.entries(headerParams).map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`).join(", ");
  return { authHeader };
}

function parseFormEncoded(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body));
}

async function main() {
  const [consumerKey, consumerSecret] = process.argv.slice(2);
  if (!consumerKey || !consumerSecret) {
    console.error("Usage: npx tsx scripts/smugmug-export/get-access-token.ts <API_KEY> <API_SECRET>");
    process.exit(1);
  }

  // Step 1: request token, with oob callback (no server needed -- SmugMug shows a PIN
  // on its own page instead of redirecting anywhere).
  const requestTokenUrl = `${API_BASE}/services/oauth/1.0a/getRequestToken`;
  const { authHeader: reqAuth } = sign("GET", requestTokenUrl, consumerKey, consumerSecret, {
    oauth_callback: "oob",
  });
  const reqRes = await fetch(requestTokenUrl, { headers: { Authorization: reqAuth } });
  if (!reqRes.ok) {
    console.error(`getRequestToken failed (${reqRes.status}): ${await reqRes.text()}`);
    process.exit(1);
  }
  const { oauth_token: requestToken, oauth_token_secret: requestTokenSecret } = parseFormEncoded(await reqRes.text());

  // Step 2: send the user to approve. Access=Full is needed to download originals
  // (not just view web-size images); Permissions=Read is enough since this only ever
  // exports, never modifies the SmugMug account.
  const authorizeUrl = `${API_BASE}/services/oauth/1.0a/authorize?oauth_token=${requestToken}&Access=Full&Permissions=Read`;
  console.log("\n1. Open this URL in a browser where you're logged into SmugMug:\n");
  console.log(`   ${authorizeUrl}\n`);
  console.log("2. Click Approve/Allow. SmugMug will show a 6-digit PIN on the page (not redirect anywhere).\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pin = (await rl.question("3. Paste that PIN here: ")).trim();
  rl.close();

  // Step 3: exchange the verifier PIN for a permanent access token.
  const accessTokenUrl = `${API_BASE}/services/oauth/1.0a/getAccessToken`;
  const { authHeader: accAuth } = sign(
    "GET",
    accessTokenUrl,
    consumerKey,
    consumerSecret,
    { oauth_verifier: pin },
    requestToken,
    requestTokenSecret,
  );
  const accRes = await fetch(accessTokenUrl, { headers: { Authorization: accAuth } });
  if (!accRes.ok) {
    console.error(`getAccessToken failed (${accRes.status}): ${await accRes.text()}`);
    process.exit(1);
  }
  const { oauth_token: accessToken, oauth_token_secret: accessTokenSecret } = parseFormEncoded(await accRes.text());

  console.log("\nDone. Add these to .env:\n");
  console.log(`SMUGMUG_API_KEY=${consumerKey}`);
  console.log(`SMUGMUG_API_SECRET=${consumerSecret}`);
  console.log(`SMUGMUG_ACCESS_TOKEN=${accessToken}`);
  console.log(`SMUGMUG_ACCESS_TOKEN_SECRET=${accessTokenSecret}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
