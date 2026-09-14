import { chromium } from "playwright";

const browser = await chromium.launch();

const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await desktop.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await desktop.waitForTimeout(3000);
await desktop.screenshot({ path: "scratch/intro-desktop.png" });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mobile.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await mobile.waitForTimeout(3000);
await mobile.screenshot({ path: "scratch/intro-mobile.png" });

await browser.close();
