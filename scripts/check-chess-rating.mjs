#!/usr/bin/env node
/** (v0.6.1) 일반 체스 대국 전적·레이팅·랭킹 — 서버·화면 연결 검사(prebuild).
 *  일반 대국('chess')이 미니게임과 같은 minigame_stats·Elo 트리거를 쓰므로, 아래 중 하나라도 빠지면 대국이 끝나도 랭킹이 비거나(제약·트리거 누락)
 *  최악에는 집계 실패가 대국 결과 확정을 막는다(예외 보호 누락):
 *   ① minigame_stats.game 제약이 'chess'를 허용 — 이미 만들어진 표를 위해 create table 밖의 alter로도 넓힌다(그리고 트리거보다 앞).
 *   ② 대국 종료 트리거(minigame_game_end_trigger)가 'chess'를 포함.
 *   ③ 트리거 함수가 집계 실패를 삼켜 결과 확정을 막지 않는다(exception when others).
 *   ④ 랜덤 매칭(pvp_queue_join)으로 만든 대국은 모든 game_type이 rated.
 *   ⑤ 화면: 일반 대국 설정 화면에 통계 카드(game="chess")와 랭킹 화면(MinigameLeaderboard game="chess").
 */
import { readFileSync } from "node:fs";
import { readAppSource } from "./lib/appSource.mjs";
import { chessTcCategory, TC_BULLET_MAX_SEC, TC_BLITZ_MAX_SEC, TC_RAPID_MAX_SEC, TC_CAT_KEY, CHESS_RATING_GAMES } from "../src/lib/chessRating.js";

const sql = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
const fails = [];
const idxAlter = sql.indexOf("add constraint minigame_stats_game_check check (game in (");
const idxTrigger = sql.indexOf("create trigger minigame_game_end_trigger");
if (idxAlter < 0 || !/add constraint minigame_stats_game_check check \(game in \([^)]*'chess'/.test(sql)) fails.push("minigame_stats 제약을 'chess'까지 넓히는 alter table이 없음");
else if (idxTrigger >= 0 && idxAlter > idxTrigger) fails.push("제약 alter가 트리거 정의보다 뒤에 있음(순서 중요)");
if (!/create table if not exists public\.minigame_stats[\s\S]*?check \(game in \([^)]*'chess'/.test(sql)) fails.push("minigame_stats create table의 game 제약에 'chess'가 없음");
const trig = sql.slice(idxTrigger, idxTrigger + 600);
if (!/new\.game_type in \([^)]*'chess'/.test(trig)) fails.push("minigame_game_end_trigger가 'chess'를 포함하지 않음");
const fnStart = sql.indexOf("create or replace function public._minigame_on_game_end()");
const fn = sql.slice(fnStart, sql.indexOf("end; $$;", fnStart));
if (!/exception when others then/.test(fn)) fails.push("_minigame_on_game_end가 집계 실패를 삼키지 않음(대국 결과 확정을 막을 수 있음)");
if (!/now\(\), true\)\s*\n\s*returning \* into v_game;\s*\n\s*return v_game;/.test(sql.slice(sql.indexOf("create or replace function public.pvp_queue_join(p_time_control text default '600-0', p_game_type text default 'chess')")))) fails.push("pvp_queue_join이 모든 game_type을 rated로 만들지 않음");
const app = readAppSource();
if (!/<MinigameStatsBar[^>]*game=\{chessGame\}/.test(app)) fails.push("일반 대국 화면에 MinigameStatsBar(game={chessGame})가 없음 — 고른 타임 컨트롤 분류의 레이팅을 보여야 함");
if (!/<MinigameLeaderboard game=\{chessGame\}/.test(app)) fails.push("일반 대국 랭킹 화면(MinigameLeaderboard game={chessGame})이 없음");
// ⑦ (v0.6.2) /user 프로필: 미니게임 카드가 일반 대국 카드보다 위, 일반 대국 카드 안에 최근 대국 기록(chess.com 통계와 같은 컴포넌트)이 있다. /play에는 두지 않는다.
{
  const play = readFileSync(new URL("../src/app/play.jsx", import.meta.url), "utf8");
  if (/<OpenChessGameHistory/.test(play)) fails.push("일반 대국 기록(OpenChessGameHistory)을 /play에 두면 안 됨 — /user 프로필에만 표시");
  const prof0 = readFileSync(new URL("../src/app/profile.jsx", import.meta.url), "utf8");
  const iMini = prof0.indexOf('<AchSection title={t("미니게임")}'), iChess = prof0.indexOf('<AchSection title={t("일반 대국")}');
  if (iMini < 0 || iChess < 0 || iMini > iChess) fails.push("/user 성취도에서 미니게임 카드가 일반 대국 카드보다 위에 있지 않음");
  const iHist = prof0.indexOf("<OpenChessGameHistory uid=");
  if (iHist < iChess) fails.push("일반 대국 카드 안에 OpenChessGameHistory가 없음");
  if (!/create or replace function public\.profile_recent_games\(p_uid uuid, p_limit int default 100\)/.test(sql)) fails.push("profile_recent_games 함수가 없음");
  if (!/grant execute on function public\.profile_recent_games\(uuid, int\) to anon, authenticated/.test(sql)) fails.push("profile_recent_games 실행 권한 grant가 없음");
  const hist = readFileSync(new URL("../src/app/gameHistory.jsx", import.meta.url), "utf8");
  const prof = readFileSync(new URL("../src/app/profile.jsx", import.meta.url), "utf8");
  for (const c of ["RecentGamesList", "GameRecordSummary", "GameFilterPills"]) {
    if (!new RegExp("export function " + c + "\\b").test(hist)) fails.push("gameHistory.jsx에 " + c + "가 없음");
    if (!new RegExp("<" + c + "[ >]").test(prof)) fails.push("chess.com 통계(profile.jsx)가 공용 " + c + "를 쓰지 않음 — 두 화면의 UI가 갈라진다");
  }
}
// ⑧ (v0.6.2) 봇 대국 기록: 표·RPC·권한, 대국 종료 시 업로드, 나이트 레이스 범례 삭제 유지
{
  if (!/create table if not exists public\.bot_games/.test(sql)) fails.push("bot_games 표가 없음");
  if (!/create policy "bot games select own" on public\.bot_games for select using \(auth\.uid\(\) = uid\)/.test(sql)) fails.push("bot_games select 정책(본인만)이 없음");
  if (/grant (insert|update|delete)[^;]*on public\.bot_games/.test(sql)) fails.push("bot_games에 직접 쓰기 권한이 있음 — bot_game_record RPC로만 쓰게 해야 함");
  if (!/grant execute on function public\.bot_game_record\(text\[\], text, text, int, text\) to authenticated/.test(sql)) fails.push("bot_game_record 실행 권한 grant가 없음");
  const play = readFileSync(new URL("../src/app/play.jsx", import.meta.url), "utf8");
  if (!/sbRpc\("bot_game_record"/.test(play)) fails.push("봇 대국 종료 시 bot_game_record를 부르지 않음");
  if (/<KnightRaceLegend/.test(play)) fails.push("나이트 레이스 범례(KnightRaceLegend)가 다시 쓰이고 있음 — 사용자 요청으로 삭제됨");
}
// ⑥ (v0.6.2) 타임 컨트롤 분류별 레이팅 — 서버·클라이언트 분류 기준 일치
for (const g of CHESS_RATING_GAMES) {
  if (!new RegExp("minigame_stats_game_check check \\(game in \\([^)]*'" + g + "'").test(sql)) fails.push("minigame_stats 제약에 '" + g + "'가 없음");
}
const catFn = sql.slice(sql.indexOf("create or replace function public._chess_tc_category"), sql.indexOf("create or replace function public._minigame_on_game_end"));
const lim = [...catFn.matchAll(/< (\d+) then '(bullet|blitz|rapid)'/g)].map((m) => [m[2], +m[1]]);
const want = { bullet: TC_BULLET_MAX_SEC, blitz: TC_BLITZ_MAX_SEC, rapid: TC_RAPID_MAX_SEC };
for (const [k, v] of Object.entries(want)) {
  const got = (lim.find((x) => x[0] === k) || [])[1];
  if (got !== v) fails.push("_chess_tc_category의 " + k + " 기준(" + got + ")이 src/lib/chessRating.js(" + v + ")와 다름");
}
if (!/\+ 40 \* split_part\(p_time_control, '-', 2\)/.test(catFn)) fails.push("_chess_tc_category가 초기시간 + 40×증가시간으로 계산하지 않음");
if (!/v_game := case when new\.game_type = 'chess' then 'chess_' \|\| public\._chess_tc_category\(new\.time_control\)/.test(fn)) fails.push("_minigame_on_game_end가 일반 대국을 타임 컨트롤 분류 행(v_game)에 집계하지 않음");
if (/game = new\.game_type/.test(fn)) fails.push("_minigame_on_game_end에 분류를 거치지 않은 game = new.game_type 조건이 남아 있음");
// 화면 프리셋(TIME_CONTROLS)의 cat 라벨이 계산한 분류와 같아야 한다(선택 UI의 칸 위치 = 레이팅이 쌓이는 분류)
const common = readFileSync(new URL("../src/app/common.jsx", import.meta.url), "utf8");
const presets = [...common.matchAll(/\{ key: "(\d+-\d+)", label: [^}]*?cat: "([^"]+)"/g)];
if (presets.length < 12) fails.push("TIME_CONTROLS 프리셋을 12개 못 찾음(" + presets.length + ")");
for (const [, key, cat] of presets) if (TC_CAT_KEY[cat] !== chessTcCategory(key)) fails.push("프리셋 " + key + "의 분류(" + cat + ")가 계산한 분류(" + chessTcCategory(key) + ")와 다름");

if (fails.length) { console.error("✖ check-chess-rating 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-chess-rating: 일반 대국도 minigame_stats·Elo 트리거·랭킹 화면에 연결(타임 컨트롤 분류별), 서버·클라이언트 분류 기준 일치, 집계 실패는 대국 확정을 막지 않는다");
