import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";

const SITE_URL = "https://mosamianphotography.com";
const GALLERY_ID = "97560514-895e-4e68-ad15-5d7cb828ef03";
const MISSING_FILES_PATH = "C:\\Users\\musan\\mosa-mian-photography\\scratch-missing-files.ndjson";
const EXPORT_DIR = "E:\\smugmug-export\\files";

let cookieJar = [];

function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return;
  const parts = setCookieHeader.split(";")[0];
  cookieJar.push(parts);
}

function getCookieString() {
  return cookieJar.join("; ");
}

async function apiCall(endpoint, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: getCookieString(),
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${SITE_URL}${endpoint}`, opts);
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) parseCookies(setCookie);

  return { status: res.status, data: await res.json() };
}

async function authenticate() {
  console.log("Authenticating...");
  const { status, data } = await apiCall("/api/auth/callback/credentials", "POST", {
    email: "mosamian96@gmail.com",
    password: "ILoveNahida1996",
  });

  if (status !== 200) {
    console.error("Auth failed:", data);
    throw new Error("Authentication failed");
  }
  console.log("✓ Authenticated");
}

async function createBatch(count) {
  console.log(`Creating batch for ${count} files...`);
  const { data } = await apiCall("/api/upload/batch", "POST", { totalFiles: count });
  return data.batchId;
}

async function uploadFile(file) {
  // 1. Hash the file (already have it)
  const sha256 = file.sha256;

  // 2. Init upload
  const initRes = await apiCall("/api/upload/init", "POST", {
    sha256,
    filename: file.filename,
    size: file.size,
    mime: "image/jpeg",
  });

  if (initRes.status !== 200) {
    console.error(`Init failed for ${file.filename}:`, initRes.data);
    return null;
  }

  const { uploadUrl, storageKey } = initRes.data;

  // 3. Upload file to S3
  const fileBuffer = await readFile(file.path);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    body: fileBuffer,
    headers: { "Content-Type": "image/jpeg" },
  });

  if (!uploadRes.ok) {
    console.error(`Upload failed for ${file.filename}: ${uploadRes.status}`);
    return null;
  }

  // 4. Complete upload
  const completeRes = await apiCall("/api/upload/complete", "POST", {
    storageKey,
    sha256,
    filename: file.filename,
    size: file.size,
    mime: "image/jpeg",
    batchId,
  });

  if (completeRes.status !== 200) {
    console.error(`Complete failed for ${file.filename}:`, completeRes.data);
    return null;
  }

  return completeRes.data.assetId;
}

async function main() {
  try {
    // Read missing files
    console.log("Reading missing files...");
    const missingRaw = await readFile(MISSING_FILES_PATH, "utf8");
    const missingFiles = missingRaw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    console.log(`Found ${missingFiles.length} files to upload`);

    // Authenticate
    await authenticate();

    // Create batch
    const batchId = await createBatch(missingFiles.length);
    console.log(`Batch created: ${batchId}`);

    // Upload files
    let uploaded = 0;
    for (let i = 0; i < missingFiles.length; i++) {
      const file = missingFiles[i];
      process.stdout.write(`\rUploading... ${i + 1}/${missingFiles.length}`);

      const assetId = await uploadFile(file);
      if (assetId) {
        uploaded++;
        // Add to gallery
        await apiCall(`/api/galleries/${GALLERY_ID}/items`, "POST", { assetIds: [assetId] });
      }

      // Throttle to avoid rate limits
      if ((i + 1) % 10 === 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    console.log(`\n✓ Uploaded ${uploaded}/${missingFiles.length} files`);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
