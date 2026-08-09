#!/usr/bin/env node
/**
 * fetch-pgnmentor.mjs — pgnmentor.com에서 받은 다운로드 URL 목록(json)을 읽어
 * 전부 내려받고(zip은 압축 해제, pgn은 그대로), 게임 단위로 파싱해서
 * 하나의 JSON 배열로 합친다. 이 환경(샌드박스)은 pgnmentor.com 접속이 네트워크
 * 정책으로 막혀 있어서, 이 스크립트는 사용자가 로컬 PC에서 직접 실행해야 한다.
 *
 * 사용법:
 *   npm install                     # adm-zip 등 devDependencies 설치
 *   node scripts/fetch-pgnmentor.mjs pgnmentor-urls.json [출력파일.json]
 *
 * 옵션(환경변수):
 *   CONCURRENCY=4        동시 다운로드 개수
 *   DELAY_MS=300          워커 하나가 파일 하나 처리할 때마다 주는 딜레이(서버 예의)
 *   PGNMENTOR_COOKIE=""   다운로드가 로그인(유료 회원) 세션을 요구할 경우, 브라우저
 *                         개발자도구 Network 탭에서 zip 요청의 Cookie 헤더 값을 복사해 지정
 *
 * 재실행 시 .pgnmentor-cache/ 에 이미 받아둔 원본 파일은 다시 받지 않는다 — 중간에
 * 실패해도 CONCURRENCY·네트워크 문제로 처음부터 다시 받을 필요가 없다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";

const urlsPath = process.argv[2];
const outPath = process.argv[3] || "pgnmentor-games.json";
if (!urlsPath) {
  console.error("사용법: node scripts/fetch-pgnmentor.mjs <urls.json> [출력.json]");
  process.exit(1);
}

const urls = JSON.parse(readFileSync(urlsPath, "utf8"));
const CONCURRENCY = +(process.env.CONCURRENCY || 4);
const DELAY_MS = +(process.env.DELAY_MS || 300);
const COOKIE = process.env.PGNMENTOR_COOKIE || "";

const CACHE_DIR = ".pgnmentor-cache";
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeName(url) {
  return url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function downloadOne(url) {
  const cachePath = join(CACHE_DIR, safeName(url));
  if (existsSync(cachePath)) return cachePath;
  const headers = COOKIE ? { Cookie: COOKIE } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(cachePath, buf);
  return cachePath;
}

// src/App.jsx의 parsePgnSans와 동일한 규칙(체크·메이트 기호 보존, 결과 토큰에서 중단).
function parsePgnSans(pgn) {
  const body = pgn.replace(/\[[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ").replace(/\$\d+/g, " ");
  const toks = body.split(/\s+/);
  const out = [];
  for (let t of toks) {
    if (!t) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) break;
    t = t.replace(/^\d+\.(\.\.)?/, "");
    if (!t) continue;
    if (/^[a-hKQRBNO][a-h1-8xKQRBNO\-+#=]*$/.test(t)) out.push(t);
  }
  return out;
}

function parseHeaders(block) {
  const h = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m;
  while ((m = re.exec(block))) h[m[1]] = m[2];
  return h;
}

// PGN 파일 하나에 게임이 여러 개 들어있을 수 있어 "[Event " 등장 위치 기준으로 쪼갠다
// (게임 사이 빈 줄 개수가 파일마다 일정하지 않아 빈 줄 기준 분할은 불안정하다).
function splitGames(pgnText) {
  const idxs = [];
  const re = /\[Event\s+"/g;
  let m;
  while ((m = re.exec(pgnText))) idxs.push(m.index);
  const games = [];
  for (let i = 0; i < idxs.length; i++) {
    const start = idxs[i];
    const end = i + 1 < idxs.length ? idxs[i + 1] : pgnText.length;
    games.push(pgnText.slice(start, end));
  }
  return games;
}

function extractCategory(url) {
  const m = url.match(/\/(players|openings|events)\//i);
  return m ? m[1].toLowerCase() : "other";
}

function processFile(filePath, sourceUrl) {
  let pgnText;
  if (sourceUrl.toLowerCase().endsWith(".zip")) {
    const zip = new AdmZip(filePath);
    pgnText = zip
      .getEntries()
      .filter((e) => /\.pgn$/i.test(e.entryName))
      .map((e) => e.getData().toString("utf8"))
      .join("\n\n");
  } else {
    pgnText = readFileSync(filePath, "utf8");
  }
  const category = extractCategory(sourceUrl);
  const games = [];
  for (const block of splitGames(pgnText)) {
    const headers = parseHeaders(block);
    const moves = parsePgnSans(block);
    if (!moves.length) continue;
    games.push({
      white: headers.White || null,
      black: headers.Black || null,
      whiteElo: headers.WhiteElo ? +headers.WhiteElo : null,
      blackElo: headers.BlackElo ? +headers.BlackElo : null,
      event: headers.Event || null,
      date: headers.Date || null,
      result: headers.Result || null,
      eco: headers.ECO || null,
      moves,
      category,
    });
  }
  return games;
}

async function main() {
  console.log(`총 ${urls.length}개 파일 처리 시작 (동시성 ${CONCURRENCY}, 딜레이 ${DELAY_MS}ms)`);
  const queue = [...urls];
  const allGames = [];
  const failed = [];
  let done = 0;

  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        const filePath = await downloadOne(url);
        allGames.push(...processFile(filePath, url));
      } catch (e) {
        failed.push({ url, error: String((e && e.message) || e) });
      }
      done++;
      if (done % 20 === 0 || done === urls.length) {
        console.log(`진행: ${done}/${urls.length} (누적 게임 ${allGames.length}개)`);
      }
      await sleep(DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeFileSync(outPath, JSON.stringify(allGames));
  console.log(`완료: 게임 ${allGames.length}개 → ${outPath}`);
  if (failed.length) {
    writeFileSync("pgnmentor-failed.json", JSON.stringify(failed, null, 2));
    console.log(`실패 ${failed.length}개 → pgnmentor-failed.json (원인 확인 후 그 목록만 다시 돌리면 됨)`);
  }
}

main();
