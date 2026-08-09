#!/usr/bin/env node
/**
 * fetch-pgnmentor.mjs — pgnmentor.com에서 받은 다운로드 URL 목록(json)을 읽어
 * 전부 내려받고(zip은 압축 해제, pgn은 그대로), 게임 단위로 파싱해서
 * NDJSON(한 줄에 게임 하나)으로 흘려쓴다. 이 환경(샌드박스)은 pgnmentor.com 접속이
 * 네트워크 정책으로 막혀 있어서, 이 스크립트는 사용자가 로컬 PC에서 직접 실행해야 한다.
 *
 * (메모리 이슈 수정) 실제 데이터량이 수십만 게임 규모라, 전체를 배열에 모았다가
 * 마지막에 한 번에 JSON.stringify 하면 힙이 터진다(직렬화 시점에 원본+문자열이 동시에
 * 메모리에 떠서 사실상 두 배). 그래서 파일 하나 처리할 때마다 게임을 즉시 출력
 * 스트림에 한 줄씩 써서 흘려보내고 버린다 — 어떤 시점에도 메모리엔 파일 하나 분량만 있다.
 *
 * 사용법:
 *   npm install                     # adm-zip 등 devDependencies 설치
 *   node scripts/fetch-pgnmentor.mjs pgnmentor-urls.json [출력파일.ndjson]
 *
 * 옵션(환경변수):
 *   CONCURRENCY=4        동시 다운로드 개수
 *   DELAY_MS=300          워커 하나가 파일 하나 처리할 때마다 주는 딜레이(서버 예의)
 *   PGNMENTOR_COOKIE=""   다운로드가 로그인(유료 회원) 세션을 요구할 경우, 브라우저
 *                         개발자도구 Network 탭에서 zip 요청의 Cookie 헤더 값을 복사해 지정
 *
 * 출력 형식: NDJSON — 한 줄에 게임 객체 하나(JSON.parse per line). 큰 배열 하나로
 * 만들지 않는 이유도 위와 같다(읽는 쪽도 통째로 파싱하면 다시 터진다).
 *
 * 재실행 시 .pgnmentor-cache/ 에 이미 받아둔 원본 파일은 다시 받지 않는다 — 중간에
 * 실패해도 CONCURRENCY·네트워크 문제로 처음부터 다시 받을 필요가 없다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";

const urlsPath = process.argv[2];
const outPath = process.argv[3] || "pgnmentor-games.ndjson";
if (!urlsPath) {
  console.error("사용법: node scripts/fetch-pgnmentor.mjs <urls.json> [출력.ndjson]");
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

// moves는 배열이 아니라 공백으로 이어붙인 문자열로 저장한다 — 게임 수십만 건 규모에서
// 토큰 하나하나가 별도 JS 문자열 객체가 되면(배열) 오버헤드가 커서 메모리·용량을 크게 먹는다.
// 필요할 때 parsePgnSans(움직임문자열)로 다시 토큰화하면 되므로 정보 손실은 없다.
function* processFile(filePath, sourceUrl) {
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
  for (const block of splitGames(pgnText)) {
    const headers = parseHeaders(block);
    const moves = parsePgnSans(block);
    if (!moves.length) continue;
    yield {
      white: headers.White || null,
      black: headers.Black || null,
      whiteElo: headers.WhiteElo ? +headers.WhiteElo : null,
      blackElo: headers.BlackElo ? +headers.BlackElo : null,
      event: headers.Event || null,
      date: headers.Date || null,
      result: headers.Result || null,
      eco: headers.ECO || null,
      moves: moves.join(" "),
      category,
    };
  }
}

function writeLine(stream, obj) {
  const chunk = JSON.stringify(obj) + "\n";
  const ok = stream.write(chunk);
  if (ok) return Promise.resolve();
  return new Promise((resolve) => stream.once("drain", resolve));
}

async function main() {
  console.log(`총 ${urls.length}개 파일 처리 시작 (동시성 ${CONCURRENCY}, 딜레이 ${DELAY_MS}ms)`);
  const queue = [...urls];
  const failed = [];
  const out = createWriteStream(outPath, { flags: "w" });
  let gameCount = 0;
  let done = 0;

  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        const filePath = await downloadOne(url);
        for (const game of processFile(filePath, url)) {
          await writeLine(out, game);
          gameCount++;
        }
      } catch (e) {
        failed.push({ url, error: String((e && e.message) || e) });
      }
      done++;
      if (done % 20 === 0 || done === urls.length) {
        console.log(`진행: ${done}/${urls.length} (누적 게임 ${gameCount}개)`);
      }
      await sleep(DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await new Promise((resolve) => out.end(resolve));

  console.log(`완료: 게임 ${gameCount}개 → ${outPath} (NDJSON, 한 줄에 게임 하나씩)`);
  if (failed.length) {
    writeFileSync("pgnmentor-failed.json", JSON.stringify(failed, null, 2));
    console.log(`실패 ${failed.length}개 → pgnmentor-failed.json (원인 확인 후 그 목록만 다시 돌리면 됨)`);
  }
}

main();
