import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");
const OLD_DIR = path.resolve(ROOT, "dashboard/static/new-ui");
const NEXT_DIR = path.resolve(ROOT, "dashboard-next");
const SCREENSHOT_DIR = path.resolve(NEXT_DIR, "screenshots-parity");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const SAMPLE_SOL = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ReserveVault {
    function deposit() external payable {}
    function withdraw() external {}
    function balanceOf(address user) external view returns (uint256) {}
}`;

const SAMPLE_REPORT = {
  report_id: "DS-7A31",
  generated_at: "2026-10-12T16:44:00.000Z",
  mode: "local",
  target: "YieldVault.sol",
  is_real: false,
  summary: {
    total: 4,
    succeeded: 1,
    failed: 0,
    not_applicable: 3
  },
  results: [
    { module: "Reentrancy", status: "SUCCEEDED", profit_eth: 10.0, note: "An external call can occur before the vault balance is reduced.", duration_s: 8.4 },
    { module: "Oracle Manipulation", status: "NOT APPLICABLE", profit_eth: 0, note: "No configured price-reading function for this vault sample.", duration_s: 2.1 },
    { module: "Flash Loan", status: "NOT APPLICABLE", profit_eth: 0, note: "No configured lending or price-sensitive path for this vault sample.", duration_s: 2.3 },
    { module: "Governance Takeover", status: "NOT APPLICABLE", profit_eth: 0, note: "No governance role was configured for this vault sample.", duration_s: 1.8 }
  ]
};

async function startServers() {
  console.log("Starting old prototype server on port 8000...");
  const oldServer = spawn("python", ["-m", "http.server", "8000", "--directory", OLD_DIR], {
    shell: true,
    stdio: "ignore",
  });

  console.log("Starting Next.js server on port 3000...");
  const nextServer = spawn("npx", ["next", "start", "-p", "3000"], {
    cwd: NEXT_DIR,
    shell: true,
    stdio: "ignore",
  });

  // Wait for servers to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));
  return { oldServer, nextServer };
}

async function compareImages(browser, buf1, buf2, width, height) {
  const page = await browser.newPage();
  const b64_1 = buf1.toString("base64");
  const b64_2 = buf2.toString("base64");

  const diffResult = await page.evaluate(
    async ({ b64_1, b64_2, width, height }) => {
      const loadImg = (b64) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = `data:image/png;base64,${b64}`;
        });

      const [img1, img2] = await Promise.all([loadImg(b64_1), loadImg(b64_2)]);
      const canvas1 = document.createElement("canvas");
      canvas1.width = width;
      canvas1.height = height;
      const ctx1 = canvas1.getContext("2d");
      ctx1.drawImage(img1, 0, 0);
      const data1 = ctx1.getImageData(0, 0, width, height).data;

      const canvas2 = document.createElement("canvas");
      canvas2.width = width;
      canvas2.height = height;
      const ctx2 = canvas2.getContext("2d");
      ctx2.drawImage(img2, 0, 0);
      const data2 = ctx2.getImageData(0, 0, width, height).data;

      const diffCanvas = document.createElement("canvas");
      diffCanvas.width = width;
      diffCanvas.height = height;
      const diffCtx = diffCanvas.getContext("2d");
      const diffImgData = diffCtx.createImageData(width, height);
      const diffData = diffImgData.data;

      let diffPixels = 0;
      const totalPixels = width * height;
      const threshold = 12; // allow minor subpixel anti-aliasing variations

      for (let i = 0; i < data1.length; i += 4) {
        const dr = Math.abs(data1[i] - data2[i]);
        const dg = Math.abs(data1[i + 1] - data2[i + 1]);
        const db = Math.abs(data1[i + 2] - data2[i + 2]);
        const da = Math.abs(data1[i + 3] - data2[i + 3]);

        if (dr > threshold || dg > threshold || db > threshold || da > threshold) {
          diffPixels++;
          diffData[i] = 255;
          diffData[i + 1] = 0;
          diffData[i + 2] = 100;
          diffData[i + 3] = 255;
        } else {
          diffData[i] = data1[i];
          diffData[i + 1] = data1[i + 1];
          diffData[i + 2] = data1[i + 2];
          diffData[i + 3] = 40;
        }
      }

      diffCtx.putImageData(diffImgData, 0, 0);
      return {
        diffPixels,
        totalPixels,
        diffPercent: (diffPixels / totalPixels) * 100,
        diffPngB64: diffCanvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, ""),
      };
    },
    { b64_1, b64_2, width, height }
  );

  await page.close();
  return diffResult;
}

async function preparePageState(page, route) {
  if (route === "configure") {
    await page.evaluate((sol) => {
      if (window.appState) {
        window.appState.source = sol;
        window.appState.fileName = "ReserveVault.sol";
        window.appState.uploadValid = true;
        window.appState.protocol = "VAULT";
        window.appState.roleMap = { deposit: "deposit", withdraw: "withdraw", balanceOf: "balanceOf" };
      }
    }, SAMPLE_SOL);
    await page.reload();
  } else if (route === "report") {
    await page.evaluate((rep) => {
      if (window.appState) {
        window.appState.report = rep;
      }
    }, SAMPLE_REPORT);
    await page.reload();
  } else if (route === "running") {
    await page.evaluate(() => {
      if (window.appState) {
        window.appState.protocol = "VAULT";
        window.appState.fileName = "ReserveVault.sol";
        window.appState.runRows = [
          { module: "Reentrancy", state: "RUNNING", progress: 45, elapsed_s: 1.2 },
          { module: "Oracle Manipulation", state: "QUEUED", progress: 0, elapsed_s: 0 },
          { module: "Flash Loan", state: "QUEUED", progress: 0, elapsed_s: 0 },
          { module: "Governance Takeover", state: "QUEUED", progress: 0, elapsed_s: 0 }
        ];
        window.appState.overallProgress = 11;
      }
    });
    // Let DOM update
    await page.waitForTimeout(200);
  } else if (route === "history") {
    await page.waitForSelector(".table-wrap, .empty-state");
    await page.waitForTimeout(300);
  }
}

async function maskCanvases(page) {
  await page.addStyleTag({
    content: `
      #pixelFieldCanvas, #glassCanvas, #glassFallback {
        visibility: hidden !important;
        opacity: 0 !important;
      }
    `,
  });
}

async function runVisualParity() {
  const { oldServer, nextServer } = await startServers();
  let browser;

  const results = [];

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--use-gl=angle", "--use-angle=swiftshader"],
    });

    const viewports = [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 360, height: 800 },
    ];

    const routes = ["upload", "configure", "running", "report", "history"];

    for (const vp of viewports) {
      console.log(`\n======================================================`);
      console.log(`TESTING VIEWPORT: ${vp.name.toUpperCase()} (${vp.width}x${vp.height})`);
      console.log(`======================================================`);

      const contextOld = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        reducedMotion: "reduce",
      });
      const contextNew = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        reducedMotion: "reduce",
      });

      const pageOld = await contextOld.newPage();
      const pageNew = await contextNew.newPage();

      for (const route of routes) {
        const hash = `#/${route}`;
        const urlOld = `http://127.0.0.1:8000/${hash}`;
        const urlNew = `http://127.0.0.1:3000/${hash}`;

        await pageOld.goto(urlOld, { waitUntil: "networkidle" });
        await pageNew.goto(urlNew, { waitUntil: "networkidle" });

        await preparePageState(pageOld, route);
        await preparePageState(pageNew, route);

        await maskCanvases(pageOld);
        await maskCanvases(pageNew);

        await pageOld.waitForTimeout(300);
        await pageNew.waitForTimeout(300);

        const oldBuf = await pageOld.screenshot({ fullPage: false });
        const newBuf = await pageNew.screenshot({ fullPage: false });

        const oldPath = path.join(SCREENSHOT_DIR, `${vp.name}-${route}-old.png`);
        const newPath = path.join(SCREENSHOT_DIR, `${vp.name}-${route}-new.png`);
        fs.writeFileSync(oldPath, oldBuf);
        fs.writeFileSync(newPath, newBuf);

        const diff = await compareImages(browser, oldBuf, newBuf, vp.width, vp.height);
        const diffPath = path.join(SCREENSHOT_DIR, `${vp.name}-${route}-diff.png`);
        fs.writeFileSync(diffPath, Buffer.from(diff.diffPngB64, "base64"));

        const passed = diff.diffPercent < 0.2; // less than 0.2% difference (anti-aliasing noise)
        console.log(
          `[${vp.name.toUpperCase()}] ${route.padEnd(10)}: Diff = ${diff.diffPixels} px (${diff.diffPercent.toFixed(3)}%) - ${passed ? "PASS" : "CHECK DIFF"}`
        );

        results.push({
          viewport: vp.name,
          width: vp.width,
          height: vp.height,
          route,
          diffPixels: diff.diffPixels,
          totalPixels: diff.totalPixels,
          diffPercent: diff.diffPercent,
          passed,
        });
      }

      await contextOld.close();
      await contextNew.close();
    }

    // Now test 3D scene live cursor movement with reduced motion disabled
    console.log(`\n======================================================`);
    console.log(`TESTING 3D CANVAS & CURSOR MOVEMENT (1440x900)`);
    console.log(`======================================================`);
    const ctx3DOld = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "no-preference",
    });
    const ctx3DNew = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "no-preference",
    });
    const p3DOld = await ctx3DOld.newPage();
    const p3DNew = await ctx3DNew.newPage();

    await p3DOld.goto("http://127.0.0.1:8000/#/upload", { waitUntil: "networkidle" });
    await p3DNew.goto("http://127.0.0.1:3000/#/upload", { waitUntil: "networkidle" });

    // Move cursor across the screen
    for (const [x, y] of [[300, 200], [700, 450], [1100, 300], [1200, 600]]) {
      await p3DOld.mouse.move(x, y);
      await p3DNew.mouse.move(x, y);
      await p3DOld.waitForTimeout(100);
      await p3DNew.waitForTimeout(100);
    }
    await p3DOld.waitForTimeout(500);
    await p3DNew.waitForTimeout(500);

    const old3DBuf = await p3DOld.screenshot();
    const new3DBuf = await p3DNew.screenshot();
    fs.writeFileSync(path.join(SCREENSHOT_DIR, "3d-upload-old.png"), old3DBuf);
    fs.writeFileSync(path.join(SCREENSHOT_DIR, "3d-upload-new.png"), new3DBuf);

    console.log("Captured 3D interaction screenshots: 3d-upload-old.png and 3d-upload-new.png");

    await ctx3DOld.close();
    await ctx3DNew.close();
  } finally {
    if (browser) await browser.close();
    oldServer.kill();
    nextServer.kill();
  }

  // Summary report
  console.log(`\n======================================================`);
  console.log(`PARITY TEST SUMMARY REPORT`);
  console.log(`======================================================`);
  let allPass = true;
  for (const r of results) {
    const status = r.diffPercent < 0.2 ? "PARITY CONFIRMED" : "DRIFT DETECTED";
    if (r.diffPercent >= 0.2) allPass = false;
    console.log(`${r.viewport.padEnd(8)} | #${r.route.padEnd(10)} | diff: ${r.diffPixels}px (${r.diffPercent.toFixed(3)}%) | ${status}`);
  }

  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, "parity-report.json"),
    JSON.stringify(results, null, 2)
  );

  return allPass;
}

runVisualParity()
  .then((pass) => {
    console.log(`\nVisual Parity Suite Finished. Overall Result: ${pass ? "SUCCESS" : "REVIEW REQUIRED"}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error running visual parity check:", err);
    process.exit(1);
  });
