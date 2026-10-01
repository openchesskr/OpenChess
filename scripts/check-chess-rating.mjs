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
if (!/<MinigameStatsBar[^>]*game="chess"/.test(app)) fails.push("일반 대국 화면에 MinigameStatsBar(game=\"chess\")가 없음");
if (!/<MinigameLeaderboard game="chess"/.test(app)) fails.push("일반 대국 랭킹 화면(MinigameLeaderboard game=\"chess\")이 없음");

if (fails.length) { console.error("✖ check-chess-rating 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-chess-rating: 일반 대국도 minigame_stats·Elo 트리거·랭킹 화면에 연결, 집계 실패는 대국 확정을 막지 않는다");
