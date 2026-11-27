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

/** The gallery opens on its cover: the title over the cover photo (no cover is chosen,
 * so the first photo stands in), and "View gallery" brings the photo grid into view. */
async function expectCoverThenPhotos(page: Page) {
  const cover = page.locator("header").filter({ has: page.getByRole("heading", { level: 1, name: "E2E Gallery" }) });
  await expectImageLoaded(cover.locator("img"));
  const tile = page.getByTestId("gallery-tile").first();
  await page.getByRole("link", { name: "View gallery" }).click();
  await expect(tile).toBeInViewport();
  await expectImageLoaded(tile.locator("img"));
  return tile;
}

async function logIn(page: Page) {
  await page.goto("/studio/login");
  await page.getByPlaceholder("you@example.com").fill(E2E.adminEmail);
  await page.getByPlaceholder("Password").fill(E2E.adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/studio") && !url.pathname.startsWith("/studio/login"));
}

test("a signed-out visitor can reach the password reset pages, and nothing else in the studio", async ({ page }) => {
  await page.goto("/studio/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/studio\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "Forgot password?" })).toBeVisible();

  // The link in the reset email opens this page.
  await page.goto("/studio/reset-password?token=not-a-real-token&email=someone%40example.com");
  await expect(page).toHaveURL(/\/studio\/reset-password/);

  await page.goto("/studio/galleries");
  await expect(page).toHaveURL(/\/studio\/login$/);

  // The old "magic token" password-reset endpoint is gone.
  const res = await page.request.post("/api/admin/reset-password", {
    data: { email: "e2e@example.com", newPassword: "takeover-attempt", token: "admin-reset-token" },
  });
  expect(res.status()).toBe(404);
});

test("an unknown public page or client link answers with a real 404", async ({ page }) => {
  // A loading.tsx on these routes once made every unknown URL a 200 "soft 404".
  expect((await page.request.get("/no-such-folder/no-such-gallery")).status()).toBe(404);
  expect((await page.request.get("/g/no-such-link")).status()).toBe(404);
});

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
    const thumbnail = page.locator('img[src*="/derivatives/"]').first();
    try {
      await expect(thumbnail).toBeVisible({ timeout: 90_000 });
    } catch {
      // The upload dialog's per-file status ("network error during upload", ...) and
      // the console say why; without them a failure here is just "not found".
      const pageText = (await page.locator("body").innerText().catch(() => "")).slice(0, 1500);
      throw new Error(`No thumbnail after 90s.\n\nConsole errors:\n${errors.join("\n") || "(none)"}\n\nPage:\n${pageText}`);
    }
    await expectImageLoaded(thumbnail);
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

    const tile = await expectCoverThenPhotos(page);

    // Breadcrumb links have a 44px-tall tap area without changing the layout.
    const home = page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Home" });
    expect((await home.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await tile.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expectImageLoaded(dialog.locator("img").first());
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("on a phone, the S/M/L thumbnail sizes each look different", async ({ page }) => {
    // Fixed row heights made Medium and Large identical on a phone (one photo, full width).
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${E2E.folderSlug}/${E2E.gallerySlug}`);
    const tile = await expectCoverThenPhotos(page);
    const sizes = page.getByRole("group", { name: "Image size" });
    const widthAfter = async (label: string) => {
      await sizes.getByRole("button", { name: label, exact: true }).click();
      await expect(sizes.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
      return (await tile.boundingBox())!.width;
    };
    const small = await widthAfter("S");
    const medium = await widthAfter("M");
    const large = await widthAfter("L");
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });

  test("a client link shows the photo and downloads the whole gallery in either size", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = watchConsole(page);

    await page.goto(`/g/${E2E.clientToken}`);
    await page.getByPlaceholder("you@example.com").fill("client@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
    await expectCoverThenPhotos(page);

    // The gallery offers originals, so "Download all" asks which size.
    await page.getByRole("button", { name: "Download all" }).click();
    const sizes = [
      { option: /Full resolution/, zipName: `${E2E.gallerySlug}.zip` },
      { option: /Web size/, zipName: `${E2E.gallerySlug}-web-size.zip` },
    ];
    for (const { option, zipName } of sizes) {
      const href = await page.getByRole("link", { name: option }).getAttribute("href");
      const res = await page.request.get(href!);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("application/zip");
      expect(res.headers()["content-disposition"]).toContain(zipName);
      const zip = await res.body();
      expect(zip.subarray(0, 2).toString()).toBe("PK");
      expect(zip.includes(Buffer.from("e2e-photo.jpg"))).toBe(true);
    }
    // Escape closes the menu.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: /Web size/ })).toBeHidden();

    expect(errors).toEqual([]);
    await context.close();
  });

  test("the studio shows what the client did with their link", async ({ page }) => {
    const errors = watchConsole(page);
    await logIn(page);
    await page.goto(`/studio/galleries/${E2E.galleryId}`);

    // The previous test opened the link once and downloaded both zips.
    await expect(page.getByText(/Last opened .+ · 1 visit · 2 downloads/)).toBeVisible();
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    const activity = page.locator("ol").filter({ hasText: "Opened the gallery" });
    await expect(activity).toContainText("Downloaded all photos (full resolution)");
    await expect(activity).toContainText("Downloaded all photos (web size)");

    // The same two zips in the gallery's 30-day stats. (Views from Playwright's
    // headless browser are left out on purpose, like any other headless client.)
    await expect(page.getByTestId("stats-downloads")).toHaveText("2");
    expect(errors).toEqual([]);
  });

  test("a client can download just their favorites as a zip", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = watchConsole(page);

    // The client gave their email in an earlier test (it's stored on the link).
    await page.goto(`/g/${E2E.clientToken}`);
    const tile = await expectCoverThenPhotos(page);
    await expect(page.getByRole("button", { name: /Download favorites/ })).toBeHidden();

    await tile.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /Favorite/ }).click();
    await expect(dialog.getByText("♥")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Download favorites (1)" }).click();
    const href = await page.getByRole("link", { name: /Web size/ }).getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toContain(`${E2E.gallerySlug}-favorites-web-size.zip`);
    const zip = await res.body();
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    expect(zip.includes(Buffer.from("e2e-photo.jpg"))).toBe(true);

    expect(errors).toEqual([]);
    await context.close();
  });

  test("the studio sets a link's expiry date, and the client sees it", async ({ page, browser }) => {
    await logIn(page);
    await page.goto(`/studio/galleries/${E2E.galleryId}`);

    const lastDay = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const iso = lastDay.toISOString().slice(0, 10);
    const expiry = page.getByLabel("Expires");
    await expiry.fill(iso);
    await expiry.blur();
    await expect(expiry).toHaveValue(iso);
    await page.reload();
    await expect(page.getByLabel("Expires")).toHaveValue(iso);

    // The client (who gave their email in an earlier test) sees the last day.
    const client = await browser.newContext();
    const clientPage = await client.newPage();
    await clientPage.goto(`/g/${E2E.clientToken}`);
    const longDate = lastDay.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    await expect(clientPage.getByText(`Available until ${longDate}`)).toBeVisible();
    await client.close();

    // No email provider in the test environment: the studio says why the email didn't
    // go, rather than failing silently.
    await page.getByRole("button", { name: "Email to client" }).click();
    await expect(page.getByLabel("Client's email")).toHaveValue("client@example.com");
    await page.getByRole("button", { name: "Send email" }).click();
    await expect(page.getByText(/The email couldn't be sent/)).toBeVisible();
  });

  // Last in the suite: it renames the gallery the tests above use (and renames it back).
  test("renaming a gallery's web address redirects the old one", async ({ page }) => {
    await logIn(page);
    await page.goto(`/studio/galleries/${E2E.galleryId}`);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Web address").fill("E2E Renamed");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByLabel("Web address")).toBeHidden();

    const oldPath = `/${E2E.folderSlug}/${E2E.gallerySlug}`;
    const newPath = `/${E2E.folderSlug}/e2e-renamed`;
    const moved = await page.request.get(oldPath, { maxRedirects: 0 });
    expect(moved.status()).toBe(308);
    expect(moved.headers()["location"]).toBe(newPath);
    expect((await page.request.get(newPath)).status()).toBe(200);

    // Renaming back makes the original address a real page again, and the
    // in-between one redirects to it (no stale redirect, no loop).
    const back = await page.request.patch(`/api/galleries/${E2E.galleryId}`, { data: { slug: E2E.gallerySlug } });
    expect(back.status()).toBe(200);
    expect((await page.request.get(oldPath, { maxRedirects: 0 })).status()).toBe(200);
    const again = await page.request.get(newPath, { maxRedirects: 0 });
    expect(again.status()).toBe(308);
    expect(again.headers()["location"]).toBe(oldPath);
  });
});
