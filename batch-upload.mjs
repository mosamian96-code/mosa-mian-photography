import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const SITE_URL = "https://mosamianphotography.com";
const GALLERY_ID = "97560514-895e-4e68-ad15-5d7cb828ef03";
const MISSING_FILES_PATH = "C:\\Users\\musan\\mosa-mian-photography\\scratch-missing-files.ndjson";
const EXPORT_DIR = "E:\\smugmug-export\\files";

let sessionToken = null;

async function authenticate(email, password) {
  console.log("Authenticating...");
  const res = await fetch(`${SITE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status}`);
  }

  // Extract session from Set-Cookie header
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("No session cookie received");
  }

  sessionToken = setCookie.split(";")[0];
  console.log("✓ Authenticated");
}

async function uploadFile(file) {
  const filePath = file.path;
  const fileBuffer = await readFile(filePath);

  // Upload via the studio upload endpoint
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), file.filename);

  // This would need the actual upload flow - for now just prepare
  return {
    sha256: file.sha256,
    filename: file.filename,
    size: file.size,
    path: filePath,
  };
}

async function main() {
  try {
    // Authenticate
    await authenticate("mosamian96@gmail.com", "ILoveNahida1996");

    // Read missing files
    console.log("\nReading missing files...");
    const missingRaw = await readFile(MISSING_FILES_PATH, "utf8");
    const missingFiles = missingRaw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    console.log(`Found ${missingFiles.length} missing files to upload`);
    console.log(`Target gallery: ${GALLERY_ID}`);
    console.log("\nSample files to upload:");
    missingFiles.slice(0, 3).forEach((f) => {
      console.log(`  - ${f.filename} (${(f.size / 1024).toFixed(1)}KB)`);
    });

    console.log(`\nReady to upload ${missingFiles.length} files.`);
    console.log("Use the studio UI to upload, or provide further instructions.");
  } catch (err) {
    console.error("Error:", err.message);
  }
}

main();
