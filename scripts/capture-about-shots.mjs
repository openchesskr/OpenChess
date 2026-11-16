/**
 * (v0.7.8, 사용자 요청) /about 소개 페이지 스크린샷을 6개 언어로 새로 찍는다.
 *  · 버전 종료 프로토콜(README)에서 매 버전마다 실행해, 소개 페이지의 화면이 늘 최신 UI를 보여 주게 한다.
 *  · 결과: public/about/v3/<언어>/<이름>.webp (540×1088, 휴대폰 360×725 화면을 1.5배로)
 *  · 게스트 상태로 찍는다(로그인 정보·개인 데이터가 들어가지 않게). 공지·오늘의 퍼즐 창은 미리 닫아 둔다.
 *
 * 실행 순서:
 *   npx vite build && npx vite preview --port 4173   (다른 터미널)
 *   npm run about:shots                 # 6개 언어 전부
 *   npm run about:shots -- en ja        # 일부 언어만
 *   ABOUT_SHOTS_URL=http://localhost:5173 npm run about:shots   # 다른 주소
 *
 * 찍는 목록(SHOTS)을 바꾸면 src/AboutPage.jsx의 SHOT 이름과 scripts/check-about-shots.mjs의 검사도 함께 맞춘다(검사가 빠진 파일을 잡는다).
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ABOUT_SHOT_NAMES, ABOUT_SHOT_LANGS, ABOUT_SHOT_DIR } from "./about-shots.config.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.ABOUT_SHOTS_URL || "http://localhost:4173";
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = await import("playwright")); }

const version = (readFileSync(path.join(ROOT, "src/app/changelog.js"), "utf8").match(/version: "([\d.]+)"/) || [])[1];
// 분석 탭에 미리 둬 둘 수순(평가 바·추천 수·오프닝 이름이 보이게)
const ANALYSIS_SANS = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"];

async function dict(lang) {
  if (lang === "ko") return {};
  return (await import(path.join(ROOT, "src/lib/i18n", lang + ".js"))).default;
}

// 각 화면을 여는 방법. tr(한국어) = 그 언어로 화면에 보이는 글자.
const SHOTS = {
  "study-board": { route: "/analysis" },
  "study-moves": { route: "/analysis", scroll: 620 },
  "study-3": { route: "/analysis", scroll: 1240 },
  "play": { route: "/play" },
  "play-game": { route: "/play", click: ["일반 대국"] },
  "learn": { route: "/learn" },
  "learn-2": { route: "/learn", pager: 1 },
  "dex-tree": { route: "/book" },
  "dex-masters": { route: "/book", click: ["마스터"] },
  "dex-ach": { route: "/book", click: ["업적"] },
  "dex-skin": { route: "/book", click: ["스킨"] },
  "dex-pieces": { route: "/book", click: ["스킨", "기물 도감"], scroll: 330 },
  "dex-sets": { route: "/book", click: ["스킨", "세트 도감"], scroll: 330 },
  "settings": { route: "/setting" },
  "settings-2": { route: "/setting", scroll: 700 },
  "settings-3": { route: "/setting", scroll: 1400 },
};
{
  const a = Object.keys(SHOTS).sort().join(","), b = [...ABOUT_SHOT_NAMES].sort().join(",");
  if (a !== b) { console.error("✖ SHOTS와 about-shots.config.mjs의 이름 목록이 다름\n  " + a + "\n  " + b); process.exit(1); }
}

async function toWebp(page, png) {
  // 브라우저의 캔버스로 WebP 변환(별도 이미지 도구 없이)
  const b64 = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL("image/webp", 0.8).split(",")[1];
  }, "data:image/png;base64," + png.toString("base64"));
  return Buffer.from(b64, "base64");
}

async function clickText(page, label) {
  const loc = page.getByRole("button", { name: label, exact: false }).first();
  if (await loc.count()) { await loc.click({ timeout: 4000 }).catch(() => {}); return true; }
  const any = page.getByText(label, { exact: true }).first();
  if (await any.count()) { await any.click({ timeout: 4000 }).catch(() => {}); return true; }
  return false;
}

const langs = process.argv.slice(2).filter((x) => ABOUT_SHOT_LANGS.includes(x));
const LANGS = langs.length ? langs : ABOUT_SHOT_LANGS;
const browser = await chromium.launch();
const conv = await (await browser.newContext()).newPage();
let ok = 0, warn = 0;
for (const lang of LANGS) {
  const d = await dict(lang);
  const tr = (ko) => d[ko] || ko;
  const outDir = path.join(ROOT, ABOUT_SHOT_DIR, lang);
  mkdirSync(outDir, { recursive: true });
  for (const [name, s] of Object.entries(SHOTS)) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 725 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, locale: lang });
    await ctx.addInitScript(({ lang, version, sans }) => {
      try {
        localStorage.setItem("occ_lang", lang); localStorage.removeItem("occ_lang_auto");
        localStorage.setItem("oc_learn_pager_seen", "1");
        const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
        localStorage.setItem("chess_state_v5:guest", JSON.stringify({ dismissedAnnounceVersion: version, dailyPuzzleHideDate: today, analysisSans: sans }));
      } catch { /* 무시 */ }
    }, { lang, version, sans: ANALYSIS_SANS });
    const page = await ctx.newPage();
    await page.goto(BASE + s.route, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    for (const label of s.click || []) {
      if (!(await clickText(page, tr(label)))) { console.warn("  ⚠ " + lang + "/" + name + ": '" + tr(label) + "' 버튼을 찾지 못함"); warn++; }
      await page.waitForTimeout(1200);
    }
    if (s.pager) {
      await page.evaluate((n) => {
        const sc = [...document.querySelectorAll("div")].find((el) => getComputedStyle(el).scrollSnapType.startsWith("x") && el.scrollWidth > el.clientWidth + 10);
        if (sc) sc.scrollTo({ left: (sc.scrollWidth / sc.children.length) * n, behavior: "instant" });
      }, s.pager);
      await page.waitForTimeout(1200);
    }
    if (s.scroll) {
      await page.mouse.move(180, 360);
      for (let y = 0; y < s.scroll; y += 200) { await page.mouse.wheel(0, Math.min(200, s.scroll - y)); await page.waitForTimeout(60); }
      await page.waitForTimeout(1200);
    }
    const png = await page.screenshot({ type: "png" });
    writeFileSync(path.join(outDir, name + ".webp"), await toWebp(conv, png));
    ok++;
    await ctx.close();
  }
  console.log("✔ " + lang + ": " + Object.keys(SHOTS).length + "장");
}
await browser.close();
console.log("완료: " + ok + "장" + (warn ? " (경고 " + warn + "건 — 화면을 직접 확인할 것)" : "") + " → " + ABOUT_SHOT_DIR + "/<언어>/");
