// CSP 실측 도구(수동 실행) — 빌드한 사이트(dist)를 vercel.json과 같은 CSP로 서빙하고 실제 Chromium으로 여러 경로를 열어 위반(violation)과 엔진(WASM 워커) 부팅을 확인한다.
//  사용: 1) npm run build  2) 엔진 파일을 dist/engine/lite/에 복사(node_modules/stockfish18/bin/stockfish-18-lite-single.{js,wasm})
//        3) PW_MODULE=<playwright 모듈 폴더> SITE=dist node scripts/attack/csp/probe.mjs   (vercel.json의 CSP를 자동으로 읽는다)
//  v0.7.0에서 이 도구로 '현재 문구 그대로 강제하면 엔진이 전부 깨진다'는 것을 확인하고 'wasm-unsafe-eval'을 넣은 정책으로 12개 경로·엔진 부팅을 검증했다.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const require = createRequire((process.env.PW_MODULE || "/node-tools/node_modules/playwright") + "/");
const { chromium } = require("playwright");
import { readFileSync } from "node:fs"; import { fileURLToPath } from "node:url"; import { dirname, resolve } from "node:path";
const here = dirname(fileURLToPath(import.meta.url)); const SITE = resolve(process.env.SITE || "dist");
const csp = process.env.CSP || JSON.parse(readFileSync(resolve(here, "../../../vercel.json"), "utf8")).headers[0].headers.find((h) => h.key === "Content-Security-Policy").value, header = process.env.CSP_HEADER || "Content-Security-Policy", port = 4173 + Math.floor(Math.random() * 500);
const srv = spawn("node", [resolve(here, "server.mjs"), SITE], { env: { ...process.env, PORT: String(port), CSP: csp, CSP_HEADER: header }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch({ args: ["--no-sandbox"] }).catch(async () => chromium.launch({ args: ["--no-sandbox"] }));
const out = { violations: [], consoleErrors: [], engine: null, pages: {} };
try {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  page.on("console", (m) => { const t = m.text(); if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(t)) out.consoleErrors.push(t.slice(0, 220)); if (/Content Security Policy|Refused to/.test(t)) out.violations.push(t.slice(0, 260)); });
  page.on("pageerror", (e) => out.consoleErrors.push("pageerror: " + String(e).slice(0, 200)));
  await page.addInitScript(() => { window.__v = []; document.addEventListener("securitypolicyviolation", (e) => window.__v.push(e.violatedDirective + " " + e.blockedURI)); });
  for (const path of ["/", "/about", "/faq", "/analysis", "/puzzle", "/learn", "/play", "/setting", "/user", "/review", "/privacy", "/terms"]) {
    await page.goto(`http://localhost:${port}${path}`, { waitUntil: "load", timeout: 30000 }).catch(() => { });
    await page.waitForTimeout(2500);
    const txt = await page.evaluate(() => document.body.innerText.length);
    out.pages[path] = txt;
  }
  // 엔진: 같은 출처 워커 + WASM 인스턴스화
  await page.goto(`http://localhost:${port}/`, { waitUntil: "load" }); await page.waitForTimeout(1500);
  out.engine = await page.evaluate(() => new Promise((resolve) => {
    const t = setTimeout(() => resolve("timeout"), 20000);
    try {
      const w = new Worker("/engine/lite/stockfish-18-lite-single.js");
      w.onerror = (e) => { clearTimeout(t); resolve("worker error: " + (e.message || e.type)); };
      w.onmessage = (m) => { if (String(m.data).includes("uciok")) { clearTimeout(t); w.terminate(); resolve("uciok"); } };
      w.postMessage("uci");
    } catch (e) { clearTimeout(t); resolve("exception: " + e.message); }
  }));
  out.violations.push(...(await page.evaluate(() => window.__v)));
} finally { await browser.close(); srv.kill(); }
console.log(JSON.stringify({ ...out, violations: [...new Set(out.violations)] }, null, 1));
