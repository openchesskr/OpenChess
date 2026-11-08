#!/usr/bin/env node
/** (v0.7.4 재발 방지) 플레이 퀘스트: 일반 대국·미니게임 이벤트가 맞게 쌓이고, 날짜가 바뀌면 초기화되며, 잘못된 값은 거르는지 + play.jsx·App의 연결.
 *  실행: node scripts/check-play-quest.mjs (prebuild로 자동 실행) */
import fs from "node:fs";
import { applyPlayEvent, emptyPlayQuest, normalizePlayQuest, PLAY_QUESTS, questDone, clearedCount, GAME_MIN_PLIES, LONG_GAME_PLIES, kstDay, emitPlayEvent, onPlayEvent } from "../src/lib/playQuest.js";
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const T0 = Date.UTC(2026, 10, 8, 3, 0, 0);
let s = emptyPlayQuest(T0);
ok(clearedCount(s) === 0, "처음엔 하나도 클리어되지 않음");
s = applyPlayEvent(s, { type: "game", won: true, plies: GAME_MIN_PLIES - 1 }, T0);
ok(s.game === 0, "너무 짧은 대국(기권 등)은 인정하지 않음");
s = applyPlayEvent(s, { type: "game", won: true, plies: LONG_GAME_PLIES }, T0);
ok(s.game === 1 && s.win === 1 && s.long === 1, "충분히 긴 승리 대국: 끝까지·승리·40수 이상이 함께 오름");
s = applyPlayEvent(s, { type: "game", won: false, plies: 40 }, T0);
ok(s.game === 2 && s.win === 1 && s.long === 1, "패배 대국은 승리·40수 이상을 올리지 않음");
s = applyPlayEvent(s, { type: "minigame", game: "coord" }, T0); s = applyPlayEvent(s, { type: "minigame", game: "coord" }, T0);
ok(s.mg === 2 && s.kinds.length === 1, "같은 미니게임을 두 번 해도 종류는 1");
s = applyPlayEvent(s, { type: "minigame", game: "knight" }, T0);
ok(s.kinds.length === 2 && PLAY_QUESTS.every((q) => questDone(q, s)) && clearedCount(s) === PLAY_QUESTS.length, "조건을 모두 채우면 전부 클리어");
ok(applyPlayEvent(s, { type: "minigame", game: "BAD KEY" }, T0).kinds.length === 2, "이상한 미니게임 이름은 종류에 넣지 않음");
ok(applyPlayEvent(s, null, T0).game === s.game && applyPlayEvent(s, { type: "?" }, T0).mg === s.mg, "알 수 없는 이벤트는 무시");
// 날짜가 바뀌면 초기화(KST 자정)
const next = T0 + 24 * 3600e3;
ok(kstDay(next) !== kstDay(T0) && normalizePlayQuest(s, next).game === 0, "날짜가 바뀌면 처음부터");
ok(normalizePlayQuest({ date: kstDay(T0), game: "x", kinds: "no", mg: -3 }, T0).mg === 0, "잘못된 저장값은 0/빈 값으로");
// 이벤트 통로
{ let got = null; const off = onPlayEvent((e) => { got = e; }); onPlayEvent(() => { throw new Error("x"); }); emitPlayEvent({ type: "game" }); off(); ok(got && got.type === "game", "이벤트 구독·한 구독자 오류가 다른 구독자를 막지 않음"); }
// 연결
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const play = rd("src/app/play.jsx"), app = rd("src/App.jsx");
ok(/emitPlayEvent\(\{ type: "game"/.test(play), "play.jsx: 일반 대국 종료 시 emitPlayEvent");
ok(/emitPlayEvent\(\{ type: "minigame"/.test(play), "play.jsx: 미니게임 종료 시 emitPlayEvent");
ok(/onPlayEvent\(/.test(app) && /applyPlayEvent\(/.test(app) && /playQuest/.test(app.match(/progressSave\([^)]*\)/)?.[0] || "") , "App: 이벤트를 받아 쌓고 진행 정보에 저장");
if (fails.length) { console.error("✗ play-quest check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ play-quest check: 이벤트 집계·날짜 초기화·검증·연결 통과");
