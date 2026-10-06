#!/usr/bin/env node
/** (v0.6.4, BUG-062 재발 방지) 끝났는데 active로 남는 대국(좀비) 정리 경로 검사.
 *  체크메이트를 당한 쪽이 결과 보고 전에 사라지면 대국이 active로 남고, 승자가 새 매칭을 눌러도 pvp_queue_join이 그 끝난 대국을 되돌려줘 새 상대를 못 만났다.
 *  서버 검증 API(api/pvp-finish.js, chess.js 재생)가 이미 있어 결과 확정은 안전하다 — 남은 구멍은 클라이언트가 그 API를 부르지 않거나 한 번 실패하면 포기하는 것이었다.
 *  ① pvpStatusFromEnd가 서버 계산 규칙(체크메이트=걸린 쪽 반대 승, 스테일메이트·3회 동형=무승부, 진행 중=null)과 같다.
 *  ② 끝난 위치의 수순을 가진 active 대국이 돌아오면 joinPvpQueue가 새 매칭 전에 서버 검증 확정(pvpFinishVerified)을 먼저 부른다.
 *  ③ pvpFinishVerified는 네트워크 오류·5xx는 재시도하고 4xx(검증 거절)는 재시도하지 않는다.
 *  ④ 대국 종료 보고 effect와 joinPvpQueue가 같은 변환(pvpStatusFromEnd)을 쓴다 — 호출부마다 다르게 쓰면 서버가 거절한다. */
import { readFileSync } from "node:fs";
import { readAppSource } from "./lib/appSource.mjs";
const fails = [];
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };

const { pvpStatusFromEnd, safeGameEndState } = await import("../src/lib/chessRules.js");
eq(pvpStatusFromEnd({ end: "checkmate", color: "b" }), "white_won", "흑이 메이트당하면 백 승");
eq(pvpStatusFromEnd({ end: "checkmate", color: "w" }), "black_won", "백이 메이트당하면 흑 승");
eq(pvpStatusFromEnd({ end: "stalemate", color: "w" }), "draw", "스테일메이트는 무승부");
eq(pvpStatusFromEnd({ end: "threefold" }), "draw", "3회 동형 반복은 무승부");
eq(pvpStatusFromEnd({ end: null }), null, "진행 중은 null");
eq(pvpStatusFromEnd(null), null, "null 입력");
eq(safeGameEndState(["f3", "e5", "g4", "Qh4#"]), { end: "checkmate", color: "w" }, "풀 메이트(백이 당함) 판정");
eq(pvpStatusFromEnd(safeGameEndState(["f3", "e5", "g4", "Qh4#"])), "black_won", "풀 메이트는 흑 승");
eq(safeGameEndState(["e4", "e5"]).end, null, "진행 중 수순");
eq(safeGameEndState(["e4", "e4"]).end, null, "불법 수가 섞이면 던지지 않고 진행 중 취급");
eq(safeGameEndState(null).end, null, "수순 없음");

const src = readAppSource();
const jp = /const joinPvpQueue = async \(\) => \{[\s\S]*?\n  \};/.exec(src);
if (!jp) fails.push("joinPvpQueue를 찾지 못함");
else {
  const b = jp[0];
  const iFirst = b.indexOf('sbRpcRow("pvp_queue_join"'), iFin = b.indexOf("pvpFinishVerified(g.id"), iSecond = b.indexOf('sbRpcRow("pvp_queue_join"', iFirst + 10);
  if (iFin < 0) fails.push("joinPvpQueue가 끝난 대국을 서버 검증으로 확정하지 않음(pvpFinishVerified 호출 없음)");
  if (!(iFirst >= 0 && iFin > iFirst && iSecond > iFin)) fails.push("joinPvpQueue 순서가 '대기열 합류 → 끝난 대국 확정 → 다시 합류'가 아님");
  if (!/safeGameEndState\(g\.sans\)/.test(b)) fails.push("joinPvpQueue가 돌아온 대국의 수순이 끝난 위치인지 확인하지 않음");
  if (!/pvpStatusFromEnd\(/.test(b)) fails.push("joinPvpQueue가 pvpStatusFromEnd를 쓰지 않음");
}
if (!/pvpFinishVerified\(pvpGame\.id, pvpStatusFromEnd\(endState\)\)/.test(src)) fails.push("대국 종료 보고 effect가 pvpStatusFromEnd를 쓰지 않음");

// ③ 재시도 동작 — 가짜 fetch
const calls = []; let script = [];
globalThis.window = { location: { origin: "http://localhost", pathname: "/" } };
globalThis.fetch = async () => { const r = script.shift(); calls.push(r); if (r === "net") throw new Error("net"); return { ok: r === 200, status: r }; };
const realSetTimeout = globalThis.setTimeout; globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);
// supabaseClient.js는 import.meta.env(Vite 전용)로 설정을 읽으므로, 값을 채운 사본을 임시 폴더에 만들어 불러온다.
const { mkdtempSync, writeFileSync, copyFileSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path"); const { pathToFileURL } = await import("node:url");
const dir = mkdtempSync(join(tmpdir(), "oc-pvp-"));
const libSrc = readFileSync(new URL("../src/lib/supabaseClient.js", import.meta.url), "utf8").replaceAll("import.meta.env", '({ VITE_SUPABASE_URL: "http://sb.test", VITE_SUPABASE_ANON_KEY: "k" })');
writeFileSync(join(dir, "supabaseClient.js"), libSrc);
copyFileSync(new URL("../src/lib/siteConfig.js", import.meta.url), join(dir, "siteConfig.js"));
await import("node:fs").then((fs) => fs.symlinkSync(new URL("../node_modules", import.meta.url).pathname, join(dir, "node_modules")));
const sc = await import(pathToFileURL(join(dir, "supabaseClient.js")).href);
sc.setSbToken("t");
script = ["net", 502, 200]; eq(await sc.pvpFinishVerified(1, "draw"), true, "오류 두 번 뒤 성공하면 true"); eq(calls.length, 3, "세 번 시도");
calls.length = 0; script = [400]; eq(await sc.pvpFinishVerified(1, "draw"), false, "4xx는 즉시 포기"); eq(calls.length, 1, "4xx는 재시도하지 않음");
calls.length = 0; script = ["net", "net", "net", "net"]; eq(await sc.pvpFinishVerified(1, "draw"), false, "계속 실패하면 false"); eq(calls.length, 4, "최대 네 번 시도");
if (fails.length) { console.error("✖ check-pvp-finish 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-pvp-finish: 끝난 위치 판정 변환, 새 매칭 전 서버 검증 확정, 실패 재시도가 유지된다");
