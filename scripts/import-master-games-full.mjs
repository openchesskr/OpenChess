#!/usr/bin/env node
/**
 * import-master-games-full.mjs — fetch-pgnmentor.mjs가 만든 pgnmentor-games.ndjson(원본
 * 480만 게임)을 그대로 Supabase master_games_full 테이블에 적재한다(supabase-setup.sql
 * 16번 섹션 참고). build-master-games.mjs(public/master-games.json)와 달리 오프닝 트리
 * 노드 매칭이나 노드당 상한 없이, 유효한 게임(중복·레이팅 이상치 제외)을 전부 넣는다 —
 * 정적 인덱스는 첫 화면을 빠르게 보여줄 "시드"로만 쓰고, 화면의 "더 불러오기"는 이 테이블에
 * 실시간으로 질의해(search_master_games_full RPC) 정적 인덱스의 상한 밖에 있는 대국이나
 * 특정 마스터의 대국도 계속 찾을 수 있게 한다.
 *
 * RLS가 anon/authenticated의 이 테이블 쓰기(사실 읽기도)를 완전히 막아 두므로 반드시
 * SERVICE ROLE 키가 필요하다(Supabase 대시보드 → Project Settings → API → service_role).
 * 이 키는 RLS를 완전히 우회하는 만능 키이므로 절대 .env(VITE_ 접두사 등 클라이언트로 번들되는
 * 값)에 넣거나 커밋하지 말 것 — 이 스크립트를 실행하는 셸에서만 환경변수로 넘긴다.
 *
 * 재실행해도 안전(idempotent)하다 — fp(fnv1a 지문, build-master-games.mjs와 동일한 방식)에
 * unique 제약을 걸어 두고 on_conflict=fp&resolution=ignore-duplicates로 삽입하므로, 이미
 * 들어간 행은 조용히 건너뛴다. 중간에 네트워크가 끊겨도 처음부터 다시 돌리면 이어받듯 진행된다.
 *
 * 사용법:
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxxx \
 *     node scripts/import-master-games-full.mjs pgnmentor-games.ndjson
 *
 * 옵션(환경변수):
 *   BATCH_SIZE=500      한 REST 요청에 담아 보낼 행 수
 *   CONCURRENCY=3        동시에 날릴 요청 개수(너무 높이면 Supabase 쪽에서 레이트리밋 걸릴 수 있음)
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const inPath = process.argv[2];
if (!inPath) {
  console.error("사용법: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-master-games-full.mjs <입력.ndjson>");
  process.exit(1);
}

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다(anon 키 아님 — service_role 키. Supabase 대시보드 → Project Settings → API에서 확인).");
  process.exit(1);
}

const BATCH_SIZE = +(process.env.BATCH_SIZE || 500);
const CONCURRENCY = +(process.env.CONCURRENCY || 3);
const MAX_PLAUSIBLE_ELO = 2900; // build-master-games.mjs와 동일한 기준(엔진 대국·헤더 손상 배제)

function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const insertUrl = SB_URL.replace(/\/$/, "") + "/rest/v1/master_games_full?on_conflict=fp";
async function insertBatch(rows) {
  const res = await fetch(insertUrl, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: "Bearer " + SB_KEY,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
}
async function insertBatchWithRetry(rows, attempt = 0) {
  try {
    await insertBatch(rows);
    inserted += rows.length;
  } catch (e) {
    if (attempt >= 4) { failed += rows.length; console.error(`배치 삽입 실패(포기, ${rows.length}행): ${e.message}`); return; }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return insertBatchWithRetry(rows, attempt + 1);
  }
}

const seen = new Set();
let total = 0, kept = 0, dup = 0, skippedRating = 0, skippedNoMoves = 0, inserted = 0, failed = 0;
let batch = [];
const inflight = new Set();

// (동시성) 배치를 CONCURRENCY개까지 동시에 날리고, 그 이상이면 스트림을 잠깐 멈춰(rl.pause)
// 메모리에 무한정 쌓이지 않게 한다 — 480만 게임을 한 번에 배열로 모았다가 보내면 메모리가 터진다.
function launch(rows, rl) {
  const p = insertBatchWithRetry(rows).finally(() => { inflight.delete(p); if (rl.isPaused()) rl.resume(); });
  inflight.add(p);
  if (inflight.size >= CONCURRENCY) rl.pause();
}

const rl = createInterface({ input: createReadStream(inPath, "utf8"), crlfDelay: Infinity });

rl.on("line", (line) => {
  if (!line) return;
  total++;
  let g;
  try { g = JSON.parse(line); } catch { return; }
  if (!g.moves) { skippedNoMoves++; return; }

  if ((g.whiteElo && g.whiteElo > MAX_PLAUSIBLE_ELO) || (g.blackElo && g.blackElo > MAX_PLAUSIBLE_ELO)) {
    skippedRating++;
    return;
  }

  const moves = g.moves.split(" ");
  const fp = fnv1a(`${g.white}|${g.black}|${g.date}|${g.result}|${moves.slice(0, 20).join(" ")}`);
  if (seen.has(fp)) { dup++; return; }
  seen.add(fp);
  kept++;

  const year = g.date ? parseInt(g.date.slice(0, 4), 10) : null;
  batch.push({
    white: g.white || "?",
    black: g.black || "?",
    white_elo: g.whiteElo || null,
    black_elo: g.blackElo || null,
    event: g.event || null,
    year: (year && year > 1000 && year < 2100) ? year : null,
    result: g.result || null,
    eco: g.eco || null,
    moves: g.moves,
    fp,
  });
  if (batch.length >= BATCH_SIZE) { const toSend = batch; batch = []; launch(toSend, rl); }

  if (total % 300000 === 0) {
    console.log(`읽음 ${total}건 (유효 ${kept}, 중복 ${dup}, 레이팅 이상치 ${skippedRating}, 적재 ${inserted}, 실패 ${failed})`);
  }
});

rl.on("close", async () => {
  if (batch.length) launch(batch, rl);
  while (inflight.size) await Promise.race(inflight);
  console.log(
    `완료: 전체 ${total}건 중 유효 ${kept}건(중복 ${dup}건, 이동 정보 없음 ${skippedNoMoves}건, ` +
    `레이팅 이상치 ${skippedRating}건 제외) → 적재 성공 ${inserted}행, 실패 ${failed}행`
  );
  if (failed > 0) process.exitCode = 1;
});
