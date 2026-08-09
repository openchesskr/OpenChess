#!/usr/bin/env node
/**
 * build-theory-book.mjs — pgnmentor.com "Openings" 카테고리(파일명 자체가 세부 변형
 * 이름인 zip들, 예: RuyLopezMarshall.zip, SicilianNajdorf6Bg5.zip)를 이용해
 * src/App.jsx의 "이론 수 체계"(CONTENT.treeAdds/names, seedContent() 함수)를 채울
 * 데이터를 뽑아낸다. fetch-pgnmentor.mjs를 먼저 돌려 .pgnmentor-cache/ 에 원본을
 * 받아둔 상태여야 한다(다시 다운로드하지 않고 캐시를 그대로 읽는다).
 *
 * 파일 하나 = 그 이름의 변형을 향한 실제 대국들. 대국들이 공통으로 따라가는 수순을
 * "다수결 경로"로 뽑아 그 파일의 대표 라인으로 삼는다 — 각 수(ply)마다 가장 많이
 * 둔 수를 고르되, 1위·2위가 동률이거나 남은 대국 수가 너무 적으면 그 지점에서 멈춘다
 * (그 이상은 이 파일이 대표하는 하나의 변형이 아니라 여러 갈래로 갈라진다는 뜻이므로).
 *
 * 사용법:
 *   node scripts/build-theory-book.mjs pgnmentor-urls_1.json theory-book.json
 *
 * 옵션(환경변수):
 *   MAX_PLY=24      대표 라인 최대 길이(수)
 *   MIN_ACTIVE=3    이 미만으로 대국이 남으면 라인 연장을 멈춤
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import AdmZip from "adm-zip";

const urlsPath = process.argv[2];
const outPath = process.argv[3] || "theory-book.json";
if (!urlsPath) {
  console.error("사용법: node scripts/build-theory-book.mjs <urls.json> [출력.json]");
  process.exit(1);
}

const MAX_PLY = +(process.env.MAX_PLY || 24);
const MIN_ACTIVE = +(process.env.MIN_ACTIVE || 3);
const CACHE_DIR = ".pgnmentor-cache";

function safeName(url) {
  return url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

// fetch-pgnmentor.mjs의 parsePgnSans/splitGames와 동일한 규칙.
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

// 파일명(카멜케이스+수순 붙은 형태)을 사람이 읽을 이름으로 변환.
// 예: "SicilianNajdorf6Bg5" -> "Sicilian Najdorf 6.Bg5", "QGDTarrasch" -> "QGD Tarrasch"
// 완벽하진 않지만(자동 생성이라), 필요하면 앱 내 개발자 모드 이름 편집기로 나중에 고칠 수 있다.
function humanizeName(base) {
  let s = base;
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");      // 연속 대문자(약어) 다음 새 단어 경계
  s = s.replace(/([a-zA-Z])(\d+)([A-Z])/g, "$1 $2.$3"); // "글자+수순번호+대문자"는 수순 표기로: Najdorf6Bg5 -> Najdorf 6.Bg5
  // (주의) "끝이 숫자면 띄어쓰기" 같은 폴백 규칙은 일부러 넣지 않는다 — "Bg5"처럼 문자열 끝이
  // 알파벳+숫자로 끝나는 진짜 SAN 수 표기(기물+칸)와 구분할 방법이 없어서, 넣으면 "Bg 5"처럼
  // 수 표기 자체를 깨뜨린다. 대신 "Other34"류는 붙은 채로 남지만(사소한 표기 문제), 이름은 앱
  // 개발자 모드에서 언제든 수정할 수 있으니 이쪽이 더 안전하다.
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");             // 카멜케이스 경계
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function extractGamesMoves(filePath, isZip) {
  let pgnText;
  if (isZip) {
    const zip = new AdmZip(filePath);
    pgnText = zip
      .getEntries()
      .filter((e) => /\.pgn$/i.test(e.entryName))
      .map((e) => e.getData().toString("utf8"))
      .join("\n\n");
  } else {
    pgnText = readFileSync(filePath, "utf8");
  }
  return splitGames(pgnText).map(parsePgnSans).filter((mv) => mv.length > 0);
}

// 다수결 경로: 매 ply마다 최다 득표 수를 고르되, 1위·2위 동률이거나 남은 대국이
// MIN_ACTIVE 미만이면 그 지점에서 멈춘다.
function representativeLine(gamesMoves) {
  let active = gamesMoves;
  const line = [];
  for (let ply = 0; ply < MAX_PLY; ply++) {
    const withMove = active.filter((mv) => ply < mv.length);
    if (withMove.length < MIN_ACTIVE) break;
    const freq = new Map();
    for (const mv of withMove) freq.set(mv[ply], (freq.get(mv[ply]) || 0) + 1);
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) break;
    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) break; // 동률이면 여기서 갈라짐 → 중단
    const [bestSan] = sorted[0];
    line.push(bestSan);
    active = withMove.filter((mv) => mv[ply] === bestSan);
  }
  return line;
}

const urls = JSON.parse(readFileSync(urlsPath, "utf8")).filter((u) => /\/openings\//i.test(u));
console.log(`Openings 카테고리 파일 ${urls.length}개 처리`);

const entries = [];
let skipped = 0;
for (const url of urls) {
  const cachePath = join(CACHE_DIR, safeName(url));
  if (!existsSync(cachePath)) { skipped++; continue; }
  const isZip = url.toLowerCase().endsWith(".zip");
  const name = basename(url).replace(/\.(zip|pgn)$/i, "");
  let gamesMoves;
  try { gamesMoves = extractGamesMoves(cachePath, isZip); } catch (e) { console.error("실패", url, e.message); skipped++; continue; }
  if (!gamesMoves.length) { skipped++; continue; }
  const line = representativeLine(gamesMoves);
  if (line.length < 2) { skipped++; continue; } // 너무 짧으면(공통 수순이 거의 없으면) 의미 없어 제외
  entries.push({ moves: line, name: humanizeName(name), games: gamesMoves.length });
}

writeFileSync(outPath, JSON.stringify(entries, null, 2));
console.log(`완료: ${entries.length}개 라인 추출(스킵 ${skipped}개) → ${outPath}`);
console.log("샘플:", entries.slice(0, 5).map((e) => `${e.name}: ${e.moves.join(" ")}`).join("\n"));
