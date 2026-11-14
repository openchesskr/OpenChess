#!/usr/bin/env node
/** (v0.7.4 재발 방지) 플레이 퀘스트: 일반 대국·미니게임 이벤트가 맞게 쌓이고, 초기화 없이 쌓이며(v0.7.6), 서버 보상표와 같으며, 잘못된 값은 거르는지 + play.jsx·App의 연결.
 *  실행: node scripts/check-play-quest.mjs (prebuild로 자동 실행) */
import fs from "node:fs";
import { applyPlayEvent, emptyPlayQuest, normalizePlayQuest, normalizeServerPlayQuest, unclaimedKeys, PLAY_QUESTS, PLAY_QUEST_COINS, questDone, clearedCount, GAME_MIN_PLIES, LONG_GAME_PLIES, emitPlayEvent, onPlayEvent } from "../src/lib/playQuest.js";
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
let s = emptyPlayQuest();
ok(clearedCount(s) === 0, "처음엔 하나도 클리어되지 않음");
s = applyPlayEvent(s, { type: "game", won: true, plies: GAME_MIN_PLIES - 1 });
ok(s.game === 0, "너무 짧은 대국(기권 등)은 인정하지 않음");
s = applyPlayEvent(s, { type: "game", won: true, plies: LONG_GAME_PLIES });
ok(s.game === 1 && s.win === 1 && s.long === 1, "충분히 긴 승리 대국: 끝까지·승리·40수 이상이 함께 오름");
s = applyPlayEvent(s, { type: "game", won: false, plies: 40 });
ok(s.game === 2 && s.win === 1 && s.long === 1, "패배 대국은 승리·40수 이상을 올리지 않음");
s = applyPlayEvent(s, { type: "minigame", game: "coord" }); s = applyPlayEvent(s, { type: "minigame", game: "coord" });
ok(s.mg === 2 && s.kinds.length === 1, "같은 미니게임을 두 번 해도 종류는 1");
s = applyPlayEvent(s, { type: "minigame", game: "knight" });
ok(s.kinds.length === 2 && PLAY_QUESTS.every((q) => questDone(q, s)) && clearedCount(s) === PLAY_QUESTS.length, "조건을 모두 채우면 전부 클리어");
ok(applyPlayEvent(s, { type: "minigame", game: "BAD KEY" }).kinds.length === 2, "이상한 미니게임 이름은 종류에 넣지 않음");
ok(applyPlayEvent(s, null).game === s.game && applyPlayEvent(s, { type: "?" }).mg === s.mg, "알 수 없는 이벤트는 무시");
// (v0.7.6, 사용자 요청) 초기화 없음 — 옛 버전의 날짜(date)가 붙은 저장값도 숫자를 그대로 이어 간다.
ok(normalizePlayQuest({ ...s, date: "2020-01-01" }).game === s.game, "날짜가 지나도 진행값이 초기화되면 안 됨");
ok(normalizePlayQuest({ game: "x", kinds: "no", mg: -3 }).mg === 0, "잘못된 저장값은 0/빈 값으로");
// 서버 진행값: kinds는 숫자, claimed에 모르는 키는 버림, 클리어했지만 안 받은 퀘스트만 수령 대상
{ const sv = normalizeServerPlayQuest({ game: 3, win: 0, long: 1, mg: 2, kinds: 1, claimed: ["game", "hack"] });
  ok(sv && sv.server && sv.claimed.join() === "game", "서버 진행값 검증(모르는 키 제거)");
  ok(unclaimedKeys(sv).join() === "long,mg", "수령 대상: 클리어했고 아직 안 받은 퀘스트만(" + unclaimedKeys(sv).join() + ")");
  ok(unclaimedKeys(s).length === 0, "이 기기 값(로그인 전)으로는 보상을 요청하지 않음");
  ok(normalizeServerPlayQuest({ error: "x" }) === null, "모양이 틀린 서버 응답은 null"); }
// 서버 보상표(economy_params().playQuests)와 클라이언트 목표치·금액, 서버 집계 기준(20수·80수)이 같아야 한다.
{ const sql = fs.readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
  const m = /"playQuests": (\{[^\n]*\}\}),/.exec(sql);
  const P = m ? JSON.parse(m[1]) : null;
  ok(P && PLAY_QUESTS.every((q) => P[q.key] && P[q.key].target === q.target && P[q.key].coins === PLAY_QUEST_COINS) && Object.keys(P).length === PLAY_QUESTS.length, "서버 playQuests(목표·코인)와 클라이언트 PLAY_QUESTS·PLAY_QUEST_COINS가 다름");
  const counts = /function public\._play_quest_counts[\s\S]*?\$\$;/.exec(sql);
  ok(counts && new RegExp("plies >= " + GAME_MIN_PLIES + "\\b").test(counts[0]) && new RegExp("plies >= " + LONG_GAME_PLIES + "\\b").test(counts[0]), "서버 _play_quest_counts의 대국 인정 기준(20수·80수)이 클라이언트와 다름");
  ok(/'economy_claim_play_quest', 'play_quest_status'/.test(sql), "플레이 퀘스트 RPC가 로그인 사용자 권한 목록(v_auth)에 없음"); }
// 이벤트 통로
{ let got = null; const off = onPlayEvent((e) => { got = e; }); onPlayEvent(() => { throw new Error("x"); }); emitPlayEvent({ type: "game" }); off(); ok(got && got.type === "game", "이벤트 구독·한 구독자 오류가 다른 구독자를 막지 않음"); }
// 연결
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const play = rd("src/app/play.jsx"), app = rd("src/App.jsx");
ok(/emitPlayEvent\(\{ type: "game"/.test(play), "play.jsx: 일반 대국 종료 시 emitPlayEvent");
ok(/emitPlayEvent\(\{ type: "minigame"/.test(play), "play.jsx: 미니게임 종료 시 emitPlayEvent");
ok(/onPlayEvent\(/.test(app) && /applyPlayEvent\(/.test(app) && /playQuest/.test(app.match(/progressSave\([^)]*\)/)?.[0] || "") , "App: 이벤트를 받아 쌓고 진행 정보에 저장");
ok(/playQuestStatus\(\)/.test(app) && /economyClaimPlayQuest\(key\)/.test(app) && /unclaimedKeys\(st\)/.test(app), "App: 서버 진행값을 받아 클리어한 퀘스트 보상을 요청하지 않음");
if (fails.length) { console.error("✗ play-quest check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ play-quest check: 이벤트 집계·초기화 없음·서버 진행값·보상표 일치·연결 통과");
