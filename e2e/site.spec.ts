import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { E2E } from "./constants";

/** Console errors cover the failures that have actually reached production: requests
 * blocked by the Content-Security-Policy ("Refused to connect to ..."), failed
 * resource loads, and uncaught exceptions. */
function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function expectImageLoaded(img: Locator) {
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
}

async function logIn(page: Page) {
  await page.goto("/studio/login");
  await page.getByPlaceholder("you@example.com").fill(E2E.adminEmail);
  await page.getByPlaceholder("Password").fill(E2E.adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/studio") && !url.pathname.startsWith("/studio/login"));
}

// Serial: the later tests view and download the photo the first one uploads.
test.describe.serial("site", () => {
  test("a photo uploaded in the studio is processed and gets a thumbnail", async ({ page }) => {
    const errors = watchConsole(page);
    await logIn(page);
    await page.goto(`/studio/galleries/${E2E.galleryId}`);

    // An empty gallery's dropzone takes a folder on desktop (webkitdirectory).
    const dir = await mkdtemp(path.join(os.tmpdir(), "e2e-upload-"));
    await sharp({ create: { width: 1600, height: 1067, channels: 3, background: { r: 40, g: 90, b: 140 } } })
      .jpeg()
      .toFile(path.join(dir, "e2e-photo.jpg"));
    await page.locator('input[type="file"]').setInputFiles(dir);

    // Upload, then the worker's processing -- the thumbnail only exists once both finish.
    await expectImageLoaded(page.locator('img[src*="/derivatives/"]').first());
    expect(errors).toEqual([]);
  });

  test("dark mode survives a reload", async ({ page }) => {
    await logIn(page);
    const html = page.locator("html");
    if (await html.evaluate((el) => el.classList.contains("dark"))) {
      await page.getByRole("button", { name: "Toggle dark mode" }).click();
    }
    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(html).toHaveClass(/\bdark\b/);
    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);
  });

  test("the public gallery shows the photo, and the lightbox opens and closes", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(`/${E2E.folderSlug}/${E2E.gallerySlug}`);

    const tile = page.locator('button[data-cursor="view"]').first();
    await expectImageLoaded(tile.locator("img"));

    await tile.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expectImageLoaded(dialog.locator("img").first());
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("a client link shows the photo and downloads the whole gallery as a zip", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = watchConsole(page);

    await page.goto(`/g/${E2E.clientToken}`);
    await page.getByPlaceholder("you@example.com").fill("client@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
    await expectImageLoaded(page.locator('button[data-cursor="view"] img').first());

    const href = await page.getByRole("link", { name: "Download all" }).first().getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/zip");
    const zip = await res.body();
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    expect(zip.includes(Buffer.from("e2e-photo.jpg"))).toBe(true);

    expect(errors).toEqual([]);
    await context.close();
  });
});
