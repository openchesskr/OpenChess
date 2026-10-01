#!/usr/bin/env node
/** (v0.5.7, BUG-024·BUG-025 재발 방지) 수락한 실시간 대전을 여는 경로를 한 곳(App의 enterPvpGame)으로 묶어 둔다.
 *   · BUG-024: 채팅 도전장 카드가 게임 종류를 안 보고 늘 체스 화면(resumePvpGame)으로 열어, 미니게임 대전이 체스 화면에 물렸다.
 *   · BUG-025: 플레이 탭은 한 번 열리면 계속 마운트돼 있는데, 체스 재개 effect가 마운트 때 한 번만 돌아 이후 수락한 대국에 못 들어갔다.
 *  검사 — ① `resumePvpGame: g` 같은 체스 재개 seed는 enterPvpGame 안에서만 만든다, ② 도전장 수락 콜백(onAcceptPvpInvite·onAccepted)은
 *  enterPvpGame만 넘긴다, ③ PlayPage의 seed.resumePvpGame 적용 effect는 빈 의존성 배열([])이 아니다,
 *  ④ 미니게임 재개(PlaySpecialGames)는 재개할 대전마다 key로 새로 마운트한다.
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-pvp-entry.mjs
 */
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const lines = src.split("\n");
const fails = [];

// ① 체스 재개 seed를 만드는 곳
const enterStart = lines.findIndex((l) => /const enterPvpGame = useCallback/.test(l));
if (enterStart < 0) fails.push("App.jsx에 enterPvpGame이 없다 — 수락한 대전은 이 함수 하나로 열어야 한다");
const enterEnd = enterStart < 0 ? -1 : lines.findIndex((l, i) => i > enterStart && /^\s*\}, \[/.test(l));
lines.forEach((l, i) => {
  if (!/resumePvpGame:\s*\w/.test(l) || /^\s*(\/\/|\*)/.test(l)) return;
  if (i > enterStart && i <= enterEnd) return;
  fails.push("App.jsx:" + (i + 1) + " — 체스 재개 seed(resumePvpGame)는 enterPvpGame 안에서만 만든다(게임 종류별 화면 선택을 건너뛰게 됨)");
});

// ② 수락 콜백
lines.forEach((l, i) => {
  const m = /\bonAccept(?:PvpInvite|ed)=\{([^}]*)\}/.exec(l);
  if (!m || /^\s*(\/\/|\*)/.test(l)) return;
  const v = m[1].trim();
  if (v !== "enterPvpGame" && v !== "onAcceptPvpInvite" && v !== "onAccepted") fails.push("App.jsx:" + (i + 1) + " — 도전장 수락 콜백은 enterPvpGame(또는 그걸 받은 prop)만 넘긴다: " + v);
});

// ③ PlayPage의 재개 effect 의존성
const applyIdx = lines.findIndex((l) => /applyPvpGame\(seed\.resumePvpGame\)/.test(l));
if (applyIdx < 0) fails.push("PlayPage의 seed.resumePvpGame 적용 effect를 찾지 못했다");
else {
  const depLine = lines.slice(applyIdx, applyIdx + 4).find((l) => /^\s*\}, \[.*\]\);/.test(l));
  if (!depLine || /\}, \[\]\);/.test(depLine)) fails.push("App.jsx:" + (applyIdx + 1) + " — seed.resumePvpGame 적용 effect가 마운트 때 한 번만 돈다(플레이 탭은 계속 마운트돼 있어 이후 수락한 대국에 못 들어감)");
}

// ④ 미니게임 재개 key
if (!/<Game key=\{resumeGame \?/.test(src)) fails.push("PlaySpecialGames — 재개할 대전마다 <Game key=…>로 새로 마운트해야 한다(useMinigameMatch는 initialGame을 첫 마운트 때만 읽음)");

// ⑤ (BUG-041) 새로고침 때 진행 중 대전을 이어받는 effect — 체스가 아닌 대전(미니게임)을 체스 대국으로 열지 않는다
const resumeQ = lines.findIndex((l) => /pvp_games\?status=eq\.active&or=\(white_uid\.eq\./.test(l));
if (resumeQ < 0) fails.push("PlayPage의 진행 중 대전 이어받기(pvp_games?status=eq.active…)를 찾지 못했다");
else {
  const win = lines.slice(resumeQ, resumeQ + 25);
  const guard = win.findIndex((l) => /!== PVP_GAME_TYPE/.test(l)), apply = win.findIndex((l) => /^\s*applyPvpGame\(g\);/.test(l));
  if (guard < 0 || apply < 0 || guard > apply) fails.push("App.jsx:" + (resumeQ + 1) + " — 새로고침 이어받기가 game_type을 보지 않고 applyPvpGame(g)을 부른다(미니게임 대전이 체스 대국으로 열려 시간 초과 패배·먹통)");
}

if (fails.length) {
  console.error("✖ check-pvp-entry: " + fails.length + "건\n  · " + fails.join("\n  · "));
  process.exit(1);
}
console.log("✔ check-pvp-entry: 수락한 대전은 모두 enterPvpGame 한 곳에서 게임 종류별 화면으로 열린다");
