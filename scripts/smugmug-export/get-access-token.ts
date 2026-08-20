#!/usr/bin/env -S npx tsx
// One-time bootstrap: exchanges a SmugMug API Key/Secret (from
// https://api.smugmug.com/api/developer/apply) for a permanent Access Token/Secret,
// via OAuth 1.0a's out-of-band ("oob") flow -- no callback server needed, SmugMug just
// displays a PIN on the page after you approve. Run once; the resulting Access
// Token/Secret go straight into SMUGMUG_ACCESS_TOKEN/SMUGMUG_ACCESS_TOKEN_SECRET and
// never expire on their own (only if manually revoked from Account Settings -> Privacy
// -> Authorized Services).
//
// Two steps, not one interactive prompt, since approving happens in a browser (a
// separate human action in between):
//   npx tsx scripts/smugmug-export/get-access-token.ts start <API_KEY> <API_SECRET>
//   ...open the printed URL, approve, get the PIN...
//   npx tsx scripts/smugmug-export/get-access-token.ts finish <PIN>

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHmac, randomBytes } from "node:crypto";

const API_BASE = "https://api.smugmug.com";
const STATE_FILE = path.join(tmpdir(), "mmp-smugmug-oauth-state.json");

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
): string {
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
  return "OAuth " + Object.entries(headerParams).map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`).join(", ");
}

function parseFormEncoded(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body));
}

type State = { consumerKey: string; consumerSecret: string; requestToken: string; requestTokenSecret: string };

async function start(consumerKey: string, consumerSecret: string) {
  const requestTokenUrl = `${API_BASE}/services/oauth/1.0a/getRequestToken`;
  const authHeader = sign("GET", requestTokenUrl, consumerKey, consumerSecret, { oauth_callback: "oob" });
  const res = await fetch(requestTokenUrl, { headers: { Authorization: authHeader } });
  if (!res.ok) {
    console.error(`getRequestToken failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  const { oauth_token: requestToken, oauth_token_secret: requestTokenSecret } = parseFormEncoded(await res.text());

  const state: State = { consumerKey, consumerSecret, requestToken, requestTokenSecret };
  await writeFile(STATE_FILE, JSON.stringify(state));

  // Access=Full is needed to download originals (not just view web-size images);
  // Permissions=Read is enough since this only ever exports, never modifies the account.
  const authorizeUrl = `${API_BASE}/services/oauth/1.0a/authorize?oauth_token=${requestToken}&Access=Full&Permissions=Read`;
  console.log("Open this URL in a browser logged into SmugMug, click Approve, and it'll show a 6-digit PIN:\n");
  console.log(authorizeUrl);
  console.log("\nThen run: npx tsx scripts/smugmug-export/get-access-token.ts finish <PIN>");
}

async function finish(pin: string) {
  const state = JSON.parse(await readFile(STATE_FILE, "utf-8")) as State;

  const accessTokenUrl = `${API_BASE}/services/oauth/1.0a/getAccessToken`;
  const authHeader = sign(
    "GET",
    accessTokenUrl,
    state.consumerKey,
    state.consumerSecret,
    { oauth_verifier: pin },
    state.requestToken,
    state.requestTokenSecret,
  );
  const res = await fetch(accessTokenUrl, { headers: { Authorization: authHeader } });
  if (!res.ok) {
    console.error(`getAccessToken failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  const { oauth_token: accessToken, oauth_token_secret: accessTokenSecret } = parseFormEncoded(await res.text());

  console.log("Done. Add these to .env:\n");
  console.log(`SMUGMUG_API_KEY=${state.consumerKey}`);
  console.log(`SMUGMUG_API_SECRET=${state.consumerSecret}`);
  console.log(`SMUGMUG_ACCESS_TOKEN=${accessToken}`);
  console.log(`SMUGMUG_ACCESS_TOKEN_SECRET=${accessTokenSecret}`);
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "start" && a && b) return start(a, b);
  if (cmd === "finish" && a) return finish(a);
  console.error("Usage:");
  console.error("  npx tsx scripts/smugmug-export/get-access-token.ts start <API_KEY> <API_SECRET>");
  console.error("  npx tsx scripts/smugmug-export/get-access-token.ts finish <PIN>");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
