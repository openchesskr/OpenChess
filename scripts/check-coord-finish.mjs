#!/usr/bin/env node
/** (v0.5.7, BUG-033 재발 방지) 좌표 인지 게임 실시간 대전 — 15라운드가 다 끝나면 곧장 결과(정산 화면)가 확정돼야 한다.
 *  예전엔 마지막 라운드의 승자가 기록돼도 클라이언트의 결과 확정 effect가 라운드 "수"만 보고 있어 다시 돌지 않았고, 서버
 *  coord_reveal_next도 15라운드에선 행을 그대로 돌려줘, 정산 화면이 뜨지 않은 채 멈춰 있었다. 이제는 세 겹으로 확정한다:
 *   ① 서버 coord_click — 마지막 라운드 정답이면 그 자리에서 coord_finish
 *   ② 서버 coord_reveal_next — 라운드가 다 찼으면(이미 멈춘 옛 대전 포함) coord_finish
 *   ③ 클라이언트 CoordRaceBoard — 마지막 라운드 승자(lastWinner)를 의존성으로 두고 coord_finish 호출
 *  빈 PostgreSQL에서 15라운드를 끝까지 두어 마지막 클릭 직후 status가 white_won/black_won이 되는 것을 확인했다(BUGS.md).
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-coord-finish.mjs
 */
import { readFileSync } from "node:fs";
import { readAppSource } from "./lib/appSource.mjs";

const sql = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
const app = readAppSource();
const fails = [];
const fnBody = (name) => { const m = new RegExp("create or replace function public\\." + name + "\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$", "i").exec(sql); return m ? m[1] : ""; };

const click = fnBody("coord_click");
if (!/return\s+public\.coord_finish\(\s*p_game_id\s*\)/i.test(click)) fails.push("supabase-setup.sql coord_click — 마지막 라운드 정답에서 coord_finish로 결과를 확정하지 않는다");
const reveal = fnBody("coord_reveal_next");
const full = /if\s+jsonb_array_length\(v_rounds\)\s*>=\s*v_total_rounds\s+then([\s\S]*?)end if;/i.exec(reveal);
if (!full || !/coord_finish/.test(full[1])) fails.push("supabase-setup.sql coord_reveal_next — 라운드가 다 찼을 때 coord_finish로 확정하지 않는다(행을 그대로 돌려주면 대전이 멈춘다)");

const board = /function CoordRaceBoard\(([\s\S]*?)\n}\n/.exec(app);
if (!board) fails.push("App.jsx에서 CoordRaceBoard를 찾지 못했다");
else {
  const eff = /useEffect\(\(\) => \{\s*if \(finished \|\| rounds\.length < COORD_TOTAL_ROUNDS[^\n]*\n\s*sbRpc\("coord_finish"[^\n]*\n\s*\}, \[([^\]]*)\]\)/.exec(board[1]);
  if (!eff) fails.push("CoordRaceBoard — 라운드가 다 찼을 때 coord_finish를 부르는 effect를 찾지 못했다");
  else if (!/lastWinner/.test(eff[1])) fails.push("CoordRaceBoard — coord_finish effect의 의존성에 마지막 라운드 승자(lastWinner)가 없다: [" + eff[1] + "]");
}

if (fails.length) {
  console.error("✖ check-coord-finish: " + fails.length + "건\n  · " + fails.join("\n  · "));
  process.exit(1);
}
console.log("✔ check-coord-finish: 좌표 인지 게임 마지막 라운드에서 결과가 곧장 확정된다(서버 2곳 + 클라이언트)");
