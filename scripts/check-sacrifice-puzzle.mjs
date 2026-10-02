#!/usr/bin/env node
/** (v0.6.2, BUG-054·055 재발 방지) 엔진 풀 폴백과 희생 퍼즐 첫 수.
 *  ① poolFallbackWorker(src/lib/enginePool.js): 풀 워커 인자 순서 (fen,d,multipv,mt,onLines,slot)로 부르면 엔진 인자 순서
 *     (fen,d,multipv,mt,onProgress,onLines,slot)로 정확히 전달된다 — onLines 자리에 slot 문자열이 들어가 조용히 죽던 BUG-054.
 *  ② staticSacrificeSans: FEN 3kr3/5R2/7p/p4K1B/P7/7P/8/8 w에서 희생 후보에 1.Rc7이 있고 희생이 아닌 최선수 1.Rg7은 없다(BUG-055).
 *  ③ 소스 계약: genPuzzleTree는 희생 테마(requireMaterialRecovery)에 firstSan이 없으면 만들지 않고, 퍼즐 만들기 FEN 분기는 희생 테마에서
 *     findSacrificeFirstMove로 첫 수를 먼저 고정한다. poolWorker의 대체 엔진은 어댑터를 거친다.
 *  실행: node scripts/check-sacrifice-puzzle.mjs (prebuild)
 */
import { readFileSync } from "node:fs";
import { poolFallbackWorker } from "../src/lib/enginePool.js";
import { parseFenFull } from "../src/lib/chessRules.js";
import { staticSacrificeSans } from "../src/lib/moveQuality.js";

const fails = [];
// ①
{
  const calls = [];
  const engine = { evaluate: (...a) => { calls.push(["evaluate", a]); return Promise.resolve(null); }, evaluateMulti: (...a) => { calls.push(["evaluateMulti", a]); return Promise.resolve([]); } };
  const w = poolFallbackWorker(engine);
  if (poolFallbackWorker(engine) !== w) fails.push("poolFallbackWorker가 같은 엔진에 매번 새 어댑터를 만듦");
  const onLines = () => { };
  w.evaluateMulti("fen", 99, 5, 700, onLines, "slot-x");
  const a = (calls.find((c) => c[0] === "evaluateMulti") || [])[1] || [];
  if (a[4] !== undefined || a[5] !== onLines || a[6] !== "slot-x") fails.push("evaluateMulti 인자 순서 불일치: onProgress=undefined, onLines, slot 순이어야 함 — " + JSON.stringify(a.map((x) => typeof x)));
  const prog = () => { };
  w.evaluate("fen", 20, prog, 500, "s");
  const e = (calls.find((c) => c[0] === "evaluate") || [])[1] || [];
  if (e[2] !== prog || e[3] !== 500 || e[4] !== "s") fails.push("evaluate 인자가 그대로 전달되지 않음");
}
// ②
{
  const root = parseFenFull("3kr3/5R2/7p/p4K1B/P7/7P/8/8 w - - 0 1");
  const sacs = staticSacrificeSans(root.board, "w", root.ep);
  if (!sacs.includes("Rc7")) fails.push("희생 후보에 Rc7이 없음: " + sacs.join(" "));
  if (sacs.includes("Rg7")) fails.push("희생이 아닌 Rg7이 희생 후보에 포함됨");
}
// ③
const common = readFileSync(new URL("../src/app/common.jsx", import.meta.url), "utf8");
const puzzle = readFileSync(new URL("../src/app/puzzle.jsx", import.meta.url), "utf8");
if (!/if \(requireMaterialRecovery && !firstSan\) return null;/.test(common)) fails.push("genPuzzleTree에 희생 테마 firstSan 필수 가드가 없음");
if (!/if \(!pool \|\| !pool\.length\) return poolFallbackWorker\(engine\);/.test(common)) fails.push("poolWorker의 대체 엔진이 poolFallbackWorker 어댑터를 거치지 않음");
const a = puzzle.indexOf("const runPcGenerate"), b = puzzle.indexOf("const pickPcThemeFen");
const run = puzzle.slice(a, b);
if (a < 0 || b < 0) fails.push("runPcGenerate 범위를 못 찾음");
else if (!/theme === "sacrifice"[\s\S]*findSacrificeFirstMove\(engine, \[\], fenRoot\)/.test(run)) fails.push("퍼즐 만들기 FEN 분기가 희생 테마에서 findSacrificeFirstMove로 첫 수를 고정하지 않음");
if (fails.length) { console.error("✖ check-sacrifice-puzzle 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-sacrifice-puzzle: 풀 폴백 어댑터 인자 순서·희생 후보 열거·희생 퍼즐 첫 수 고정 계약이 유지된다");
