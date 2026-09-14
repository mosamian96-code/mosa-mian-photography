import { readFile } from "node:fs/promises";

const SITE_URL = "https://mosamianphotography.com";
const GALLERY_ID = "97560514-895e-4e68-ad15-5d7cb828ef03";
const SESSION_TOKEN = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIiwia2lkIjoiVlp4SHdWdGgyWVZxbFQtby0tWmRuZlF0azBNaEJXclBETHhCa0JTRDYyZXByRjlFdlRuZ3htaGJsWXlIbGIxTTZCWlVWT0NjNlFUQ1JnVF9nRXJGOHcifQ..EaaZoql166u0pP5M2Qd1DA.dMes2N2mgW786TcUql0p3EfF4nDQmY5ppGbMtU_9R6XQOKJT_tnoOj5hNgZJT9pEUTIc0-DQSud33hjIcZXeiTZPDTvs2E-g_KO_LjXJWzrmWhR3MQLV4UELgwCFpHcsm8wgQQv45kqx1VynSjhx3OIokXmV1m667ckgNEAI4trFwvtLwrufZJMtEGKHfYyPIRW1AEYg_-NjHVrly4LeuOAAPM8uDs-Hk-ZD-c93mvE._poQrOywlBCVhP_p9pmoOG-lTX7ITSGV9ObQUHE3mfQ";
const MISSING_FILES_PATH = "C:\\Users\\musan\\mosa-mian-photography\\scratch-missing-files.ndjson";

let batchId = null;

async function apiCall(endpoint, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: `__Secure-authjs.session-token=${SESSION_TOKEN}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${SITE_URL}${endpoint}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

async function initBatch(count) {
  console.log(`Creating batch for ${count} files...`);
  const { status, data } = await apiCall("/api/upload/batch", "POST", { totalFiles: count });
  if (status !== 200) throw new Error(`Batch creation failed: ${data.error}`);
  batchId = data.batchId;
  console.log(`✓ Batch created: ${batchId}\n`);
}

async function uploadFile(file) {
  try {
    // Init upload
    const initRes = await apiCall("/api/upload/init", "POST", {
      sha256: file.sha256,
      filename: file.filename,
      size: file.size,
      mime: "image/jpeg",
    });

    if (initRes.status !== 200) return null;

    const { uploadUrl, storageKey } = initRes.data;

    // Upload to S3
    const fileBuffer = await readFile(file.path);
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: fileBuffer,
      headers: { "Content-Type": "image/jpeg" },
    });

    if (!uploadRes.ok) return null;

    // Complete upload
    const completeRes = await apiCall("/api/upload/complete", "POST", {
      storageKey,
      sha256: file.sha256,
      filename: file.filename,
      size: file.size,
      mime: "image/jpeg",
      batchId,
    });

    if (completeRes.status !== 200) return null;

    return completeRes.data.assetId;
  } catch (err) {
    return null;
  }
}

async function main() {
  try {
    const missingRaw = await readFile(MISSING_FILES_PATH, "utf8");
    const files = missingRaw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    console.log(`\n📁 Starting upload of ${files.length} files to gallery ${GALLERY_ID}\n`);

    await initBatch(files.length);

    let uploaded = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const assetId = await uploadFile(file);

      if (assetId) {
        uploaded++;
        // Add to gallery
        await apiCall(`/api/galleries/${GALLERY_ID}/items`, "POST", { assetIds: [assetId] });
      } else {
        failed++;
      }

      if ((i + 1) % 10 === 0) {
        console.log(`[${i + 1}/${files.length}] ${uploaded} uploaded, ${failed} failed`);
      }

      // Throttle requests
      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`\n✅ Upload complete: ${uploaded} succeeded, ${failed} failed\n`);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

main();
