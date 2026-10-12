#!/usr/bin/env node
/** (v0.6.5) pgnmentor.com의 PGN 파일을 사이트가 직접 제공하는 다운로드 링크를 따라 전부 받아 하나의 압축 파일로 묶는 도구.
 *  앱 빌드(prebuild)에는 들어가지 않는 개발 도구다 — 받은 원본은 저장소에 커밋하지 않는다(용량·Vercel 배포 용량 규칙). 대회 색인 등 가공한 결과만 따로 커밋한다.
 *
 *  사용법 (Node 18 이상, 별도 설치 없음):
 *    node scripts/fetch-pgnmentor.mjs --dry-run            # 받을 파일 목록과 총 용량만 확인(내려받지 않음)
 *    node scripts/fetch-pgnmentor.mjs                       # 전부 받아 ./pgnmentor-download/ 에 저장하고 pgnmentor-all.zip 으로 묶음
 *    node scripts/fetch-pgnmentor.mjs --only events         # 주소에 "events"가 든 파일만(쉼표로 여러 개: --only events,players)
 *  옵션: --out <폴더> · --start <시작 주소> · --depth <따라갈 페이지 단계, 기본 2> · --delay <ms, 기본 1000> · --concurrency <1~3, 기본 1> · --no-archive · --contact <메일·주소>
 *
 *  예의·안전 규칙(대량 요청이라 반드시 지킨다)
 *   · robots.txt를 먼저 읽어 금지된 경로는 건드리지 않고, Crawl-delay가 있으면 그 값 이상으로 쉰다.
 *   · 기본은 한 번에 하나씩, 요청 사이 1초 이상(무작위 지연 포함). User-Agent에 도구 이름과 연락처를 밝힌다.
 *   · 서버가 429/503을 주면 점점 길게 쉬며 다시 시도하고, 계속 막히면 멈춘다(재실행하면 이어받는다).
 *   · 같은 호스트만 따라간다. 이미 받은 파일(manifest.json에 기록, 크기 일치)은 건너뛰어 중단 후 재실행이 안전하다.
 *   · 받은 파일의 라이선스·이용 조건은 사이트의 안내를 직접 확인할 것 — 앱에 넣을 때는 대국 데이터(수순·결과)만 가공해 쓰고 원본 파일을 재배포하지 않는다.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf("--" + name); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : def; };
const START = String(opt("start", "https://www.pgnmentor.com/files.html"));
const OUT = resolve(String(opt("out", "pgnmentor-download")));
const DELAY = Math.max(300, Number(opt("delay", 1000)));
const CONC = Math.min(3, Math.max(1, Number(opt("concurrency", 1))));
const DRY = argv.includes("--dry-run"), NO_ARCHIVE = argv.includes("--no-archive");
const ONLY = opt("only", null) ? String(opt("only")).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : null;
const CONTACT = String(opt("contact", "set --contact <email>"));
const UA = "OpenChess-pgn-fetch/1.0 (personal data import; " + CONTACT + ")";
const FILE_RE = /\.(zip|pgn|gz|7z)$/i;
const MAX_PAGES = 200, MAX_RETRY = 5;
const MAX_DEPTH = Math.max(0, Number(opt("depth", 2)));   // 0이면 시작 페이지의 링크만 쓴다(필요한 링크가 한 페이지에 다 있을 때 — 불필요한 요청을 줄인다)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms + Math.floor(Math.random() * ms * 0.4);
const log = (...a) => console.log(...a);

// ── robots.txt (User-agent: * 그룹의 Disallow·Crawl-delay만 해석) ──
async function loadRobots(origin) {
  const rules = { disallow: [], delay: 0 };
  try {
    const r = await fetch(origin + "/robots.txt", { headers: { "User-Agent": UA } });
    if (!r.ok) return rules;
    let applies = false;
    for (const raw of (await r.text()).split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
      const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line); if (!m) continue;
      const k = m[1].toLowerCase(), v = m[2].trim();
      if (k === "user-agent") applies = v === "*";
      else if (applies && k === "disallow" && v) rules.disallow.push(v);
      else if (applies && k === "crawl-delay") rules.delay = Math.max(rules.delay, Number(v) * 1000 || 0);
    }
  } catch { /* robots.txt가 없거나 못 읽으면 제한 없음으로 본다 */ }
  return rules;
}
const allowed = (rules, pathname) => !rules.disallow.some((d) => pathname.startsWith(d));

// ── 요청(재시도·백오프) ──
let lastReq = 0, minGap = DELAY;
async function polite() { const wait = lastReq + jitter(minGap) - Date.now(); if (wait > 0) await sleep(wait); lastReq = Date.now(); }
async function request(url, init = {}) {
  for (let a = 0; a <= MAX_RETRY; a++) {
    await polite();
    try {
      const r = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers || {}) }, redirect: "follow" });
      if (r.status === 429 || r.status === 503 || r.status >= 500) {
        const ra = Number(r.headers.get("retry-after")) * 1000 || 0;
        const back = Math.max(ra, 4000 * 2 ** a); log("  … 서버가 바쁨(" + r.status + "), " + Math.round(back / 1000) + "초 쉬고 재시도"); await sleep(back); minGap = Math.min(minGap * 1.5, 15000); continue;
      }
      return r;
    } catch (e) { if (a === MAX_RETRY) throw e; await sleep(2000 * 2 ** a); }
  }
  throw new Error("재시도 한도 초과: " + url);
}

// ── 목록 수집: 시작 페이지에서 같은 호스트의 페이지를 최대 깊이 2까지 따라가며 .zip/.pgn 링크를 모은다 ──
function hrefs(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) { try { out.add(new URL(m[1].replace(/&amp;/g, "&"), base).href); } catch { /* 잘못된 링크 */ } }
  return [...out];
}
async function discover(rules) {
  const host = new URL(START).host, files = new Map(), seen = new Set(), queue = [[START, 0]];
  while (queue.length && seen.size < MAX_PAGES) {
    const [url, depth] = queue.shift(); if (seen.has(url)) continue; seen.add(url);
    const u = new URL(url); if (!allowed(rules, u.pathname)) { log("robots 금지, 건너뜀:", u.pathname); continue; }
    const r = await request(url); if (!r.ok || !/html|text/i.test(r.headers.get("content-type") || "text/html")) continue;
    for (const link of hrefs(await r.text(), url)) {
      const lu = new URL(link); if (lu.host !== host) continue;
      if (FILE_RE.test(lu.pathname)) { if (allowed(rules, lu.pathname)) files.set(lu.href, null); }
      else if (depth < MAX_DEPTH && /\.(html?|php)$|\/$/i.test(lu.pathname)) queue.push([lu.href, depth + 1]);
    }
    log("페이지 읽음(" + seen.size + "): " + u.pathname + " → 파일 " + files.size + "개");
  }
  let list = [...files.keys()].sort();
  if (ONLY) list = list.filter((u) => ONLY.some((k) => u.toLowerCase().includes(k)));
  return list;
}

// ── 받기(이어받기 안전: .part로 받고 크기를 확인한 뒤 이름을 바꾼다) ──
const manifestPath = join(OUT, "manifest.json");
const loadManifest = () => { try { return JSON.parse(readFileSync(manifestPath, "utf8")); } catch { return { files: {} }; } };
const saveManifest = (m) => { mkdirSync(OUT, { recursive: true }); writeFileSync(manifestPath, JSON.stringify(m, null, 1)); };
const localPath = (url) => { const u = new URL(url); return join(OUT, u.pathname.replace(/^\/+/, "").replace(/\.\./g, "_")); };
async function download(url, manifest) {
  const dest = localPath(url), rec = manifest.files[url];
  if (rec && rec.status === "done" && existsSync(dest) && statSync(dest).size === rec.size) return "skip";
  mkdirSync(dirname(dest), { recursive: true });
  const r = await request(url); if (!r.ok || !r.body) { manifest.files[url] = { status: "error", http: r.status }; return "error"; }
  const want = Number(r.headers.get("content-length")) || null, part = dest + ".part", hash = createHash("sha256");
  const src = Readable.fromWeb(r.body); src.on("data", (c) => hash.update(c));
  try { await pipeline(src, createWriteStream(part)); } catch (e) { try { unlinkSync(part); } catch { /* 없음 */ } throw e; }   // 끊기면 찌꺼기(.part)를 남기지 않는다
  const size = statSync(part).size;
  if (want && size !== want) { unlinkSync(part); manifest.files[url] = { status: "error", reason: "size " + size + "/" + want }; return "error"; }
  renameSync(part, dest); manifest.files[url] = { status: "done", size, sha256: hash.digest("hex"), at: new Date().toISOString() }; return "ok";
}

// ── 하나의 압축 파일로 묶기: zip(저장만 — 안의 파일이 이미 zip) → 없으면 bsdtar -a → 없으면 tar.gz ──
function archive() {
  const base = resolve(OUT, "..");
  const tries = [
    ["pgnmentor-all.zip", "zip", ["-0", "-r", "-q", join(base, "pgnmentor-all.zip"), ".", "-x", "*.part"]],
    ["pgnmentor-all.zip", "tar", ["-a", "--exclude=*.part", "-cf", join(base, "pgnmentor-all.zip"), "-C", OUT, "."]],
    ["pgnmentor-all.tar.gz", "tar", ["-czf", join(base, "pgnmentor-all.tar.gz"), "--exclude=*.part", "-C", OUT, "."]],
  ];
  for (const [name, cmd, args] of tries) {
    const r = spawnSync(cmd, args, { cwd: OUT, stdio: "ignore" });
    if (r.status === 0 && existsSync(join(base, name))) return join(base, name);
  }
  return null;
}

async function main() {
  const origin = new URL(START).origin;
  log("시작: " + START + (DRY ? " (미리보기)" : "") + " · 간격 " + DELAY + "ms · 동시 " + CONC);
  const rules = await loadRobots(origin);
  if (rules.delay) { minGap = Math.max(minGap, rules.delay); log("robots Crawl-delay " + rules.delay / 1000 + "초 적용"); }
  const list = await discover(rules);
  if (!list.length) { log("받을 파일 링크를 찾지 못했어요. --start 로 목록 페이지 주소를 직접 지정해 보세요."); process.exit(2); }
  log("\n받을 파일 " + list.length + "개");
  if (DRY) {
    let total = 0, known = 0;
    for (const u of list) { const r = await request(u, { method: "HEAD" }); const n = Number(r.headers.get("content-length")); if (n) { total += n; known++; } }
    log("용량 확인된 " + known + "개 합계 약 " + (total / 1048576).toFixed(1) + " MB");
    list.slice(0, 15).forEach((u) => log("  " + new URL(u).pathname)); if (list.length > 15) log("  … 외 " + (list.length - 15) + "개");
    return;
  }
  const manifest = loadManifest(); let ok = 0, skip = 0, err = 0, idx = 0;
  const worker = async () => {
    while (idx < list.length) {
      const i = idx++, url = list[i];
      try { const s = await download(url, manifest); if (s === "ok") ok++; else if (s === "skip") skip++; else err++; log("[" + (i + 1) + "/" + list.length + "] " + s + " " + new URL(url).pathname); }
      catch (e) { err++; manifest.files[url] = { status: "error", reason: String(e.message || e) }; log("[" + (i + 1) + "/" + list.length + "] 오류 " + new URL(url).pathname + " — " + (e.message || e)); }
      if ((i + 1) % 10 === 0) saveManifest(manifest);
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker)); saveManifest(manifest);
  log("\n완료: 새로 " + ok + " · 건너뜀 " + skip + " · 오류 " + err + (err ? " (같은 명령을 다시 실행하면 오류난 것만 이어서 받습니다)" : ""));
  if (!NO_ARCHIVE && !err) { const a = archive(); log(a ? "압축 파일: " + a : "압축 도구(zip·tar)를 찾지 못했어요 — " + OUT + " 폴더를 직접 압축하세요."); }
}
main().catch((e) => { console.error("실패:", e.message || e); process.exit(1); });
