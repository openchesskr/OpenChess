#!/usr/bin/env node
/**
 * build-daily-puzzles.mjs — 리체스 퍼즐 DB(CSV)에서 오프닝 테마별 "오늘의 퍼즐" 후보 풀을 만든다.
 *
 * 리체스 퍼즐 데이터는 라이브 API가 아니라 https://database.lichess.org/#puzzles 에서 받는 CSV
 * 통짜 덤프(수백MB)다 — 개발자가 미리 로컬에 내려받아(lichess_db_puzzle.csv) 이 스크립트에 경로로
 * 넘긴다. 각 행의 FEN은 "퍼즐이 시작되기 직전" 포지션이라, 시작 위치부터의 SAN 수순(setupSans)이
 * 필요한 이 앱의 퍼즐 포맷과 맞추려면 원본 대국(GameUrl)의 PGN을 리체스에서 받아 그 지점까지의
 * 수순을 복원해야 한다 — 그래서 이 스크립트는 CSV를 필터링하는 동시에 리체스에 대국 PGN을
 * 요청한다(요청 사이 딜레이를 둬 예의를 지킨다).
 *
 * 여기서 만드는 JSON은 "후보 원본 데이터"(시작 위치까지의 수순 + 정답 한 줄)일 뿐이다 — 상대가
 * 시도할 수 있는 다른 응수까지 포함한 여러 라인(가지)은 앱이 런타임에 실제 엔진(Stockfish)으로
 * genPuzzleTree를 돌려 만든다(오프라인 스크립트는 엔진을 쓰지 않는다). "XXXXXX-N" 퍼즐 ID의 N은
 * 그렇게 만들어진 여러 라인 중 날짜 시드로 뽑힌 줄의 순번이다.
 *
 * 사용법:
 *   node scripts/build-daily-puzzles.mjs --csv=./lichess_db_puzzle.csv --tag=Italian_Game \
 *     --out=public/daily-puzzles/Italian_Game.json --count=40
 *
 * 옵션:
 *   --csv        리체스 퍼즐 CSV 파일 경로 (필수)
 *   --tag        OpeningTags 컬럼에서 찾을 태그(정확히 일치, 예: Italian_Game) (필수)
 *   --out        출력 JSON 경로 (필수)
 *   --count      뽑을 후보 퍼즐 개수(기본 40 — 2주 로테이션 하나에 여유 있게)
 *   --minRating  난이도 하한(기본 1200)
 *   --maxRating  난이도 상한(기본 2200)
 *   --delay      대국 PGN 요청 사이 대기(ms, 기본 400 — 리체스에 대한 예의)
 */
import { createReadStream, writeFileSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname } from "node:path";
import { Chess } from "chess.js";

function arg(name, def) {
  const p = process.argv.find((a) => a.startsWith("--" + name + "="));
  return p ? p.slice(name.length + 3) : def;
}
const CSV_PATH = arg("csv");
const TAG = arg("tag");
const OUT_PATH = arg("out");
const COUNT = +arg("count", "40");
const MIN_RATING = +arg("minRating", "1200");
const MAX_RATING = +arg("maxRating", "2200");
const DELAY_MS = +arg("delay", "400");

if (!CSV_PATH || !TAG || !OUT_PATH) {
  console.error("사용법: node scripts/build-daily-puzzles.mjs --csv=<path> --tag=<OpeningTag> --out=<path> [--count=40] [--minRating=1200] [--maxRating=2200] [--delay=400]");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 리체스 퍼즐 CSV는 1~2GB급이라 한 번에 메모리로 읽으면(readFileSync) 위험하다 — 한 줄씩
// 스트리밍으로 읽는다. 값 안에 콤마/따옴표가 없어(Moves·Themes·OpeningTags는 공백으로 구분된
// 토큰 목록) 단순 split(",")으로 충분하다. 공식 헤더:
// PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
async function* iterPuzzleRows(csvPath) {
  const rl = createInterface({ input: createReadStream(csvPath, "utf8"), crlfDelay: Infinity });
  let idx = null;
  for await (const line of rl) {
    if (!line) continue;
    if (!idx) { const header = line.split(","); idx = Object.fromEntries(header.map((h, i) => [h, i])); continue; }
    const cols = line.split(",");
    if (cols.length < Object.keys(idx).length) continue;
    yield {
      id: cols[idx.PuzzleId],
      fen: cols[idx.FEN],
      moves: cols[idx.Moves].split(" "),
      rating: +cols[idx.Rating],
      popularity: +cols[idx.Popularity],
      nbPlays: +cols[idx.NbPlays],
      themes: (cols[idx.Themes] || "").split(" ").filter(Boolean),
      gameUrl: cols[idx.GameUrl],
      openingTags: (cols[idx.OpeningTags] || "").split(" ").filter(Boolean),
    };
  }
}

// GameUrl 예: https://lichess.org/yy8FKg2G/black#40 → 게임 id: yy8FKg2G
function gameIdFromUrl(url) {
  const m = /lichess\.org\/([A-Za-z0-9]{8})/.exec(url || "");
  return m ? m[1] : null;
}

async function fetchGamePgn(gameId) {
  const res = await fetch("https://lichess.org/game/export/" + gameId + "?literate=false&clocks=false&evals=false");
  if (!res.ok) throw new Error("게임 PGN 요청 실패(" + res.status + "): " + gameId);
  return await res.text();
}

// 두 FEN이 "같은 국면"인지 — 캐슬링·앙파상·차례까지만 비교하고(수순 복원에 필요한 전부),
// 하프무브/풀무브 카운터는 무시한다.
function fenCoreEq(a, b) {
  return (a || "").split(" ").slice(0, 4).join(" ") === (b || "").split(" ").slice(0, 4).join(" ");
}

async function buildOne(row) {
  const gameId = gameIdFromUrl(row.gameUrl);
  if (!gameId) return null;
  const pgn = await fetchGamePgn(gameId);
  const full = new Chess();
  full.loadPgn(pgn);
  const fullSans = full.history();
  // 원본 대국을 처음부터 재생하며 FEN이 일치하는 지점을 찾는다 — 리체스 퍼즐 FEN은 "그 수를 두기
  // 직전" 포지션이라, 그 지점까지의 SAN이 이 앱의 setupSans가 된다.
  const chess = new Chess();
  let matchPly = fenCoreEq(chess.fen(), row.fen) ? 0 : -1;
  for (let i = 0; matchPly === -1 && i < fullSans.length; i++) {
    chess.move(fullSans[i]);
    if (fenCoreEq(chess.fen(), row.fen)) matchPly = i + 1;
  }
  if (matchPly === -1) return null; // 원본 대국과 FEN이 어긋남 — 건너뜀(리체스가 다른 변형 PGN을 정식으로 삼은 경우 등)
  const setupSans = fullSans.slice(0, matchPly);
  // 퍼즐의 UCI 수순(첫 수=상대의 실수, 이후 정답 라인)을 이어서 SAN으로 변환한다.
  const solveChess = new Chess(chess.fen());
  const puzzleSans = [];
  for (const uci of row.moves) {
    const from = uci.slice(0, 2), to = uci.slice(2, 4), promotion = uci.slice(4) || undefined;
    const mv = solveChess.move({ from, to, promotion });
    if (!mv) return null; // UCI 수를 못 뒀음 — 데이터 불일치, 건너뜀
    puzzleSans.push(mv.san);
  }
  const mistakeSan = puzzleSans[0];
  const solution = puzzleSans.slice(1);
  if (!mistakeSan || !solution.length) return null;
  return {
    lichessId: row.id,
    setupSans,
    mistakeSan,
    solution,
    rating: row.rating,
    themes: row.themes,
    openingTags: row.openingTags,
    sourceUrl: row.gameUrl,
  };
}

async function main() {
  const candidates = [];
  for await (const row of iterPuzzleRows(CSV_PATH)) {
    if (row.rating < MIN_RATING || row.rating > MAX_RATING) continue;
    if (!row.openingTags.includes(TAG)) continue;
    candidates.push(row);
  }
  console.log(TAG + ": CSV에서 " + candidates.length + "개 후보 발견(평점 " + MIN_RATING + "~" + MAX_RATING + ")");
  // 인기도(popularity) 높은 순으로 우선 시도 — 원본 대국 조회 실패 등에 대비해 COUNT보다 넉넉히 시도한다.
  candidates.sort((a, b) => b.popularity - a.popularity);
  const out = [];
  for (const row of candidates) {
    if (out.length >= COUNT) break;
    try {
      const built = await buildOne(row);
      if (built) { out.push(built); console.log("  [" + out.length + "/" + COUNT + "] " + row.id + " 완료"); }
      else console.warn("  " + row.id + " 건너뜀(대국 불일치 또는 데이터 이상)");
    } catch (e) {
      console.warn("  " + row.id + " 실패: " + e.message);
    }
    await sleep(DELAY_MS);
  }
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log("완료: " + out.length + "개 퍼즐 → " + OUT_PATH);
}
main();
