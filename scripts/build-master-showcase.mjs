// (v0.5.5) 플레이 탭 "일반 대국" 버튼 보드에서 재생할 마스터 대국 표본 — public/master-games.json(수 MB급, 12만여 판)을
// 매번 받지 않도록, 양쪽 모두 엘로 2650 이상·30~70수 사이·결과가 난 대국 중 80판만 골라 src/data/masterShowcase.json으로 뽑는다.
// 같은 시드로 항상 같은 표본이 나온다. 실행: node scripts/build-master-showcase.mjs
import fs from "node:fs";
import { Chess } from "chess.js";

const src = JSON.parse(fs.readFileSync(new URL("../public/master-games.json", import.meta.url), "utf8"));
let seed = 20260925;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pool = src.games.filter((g) => g.whiteElo >= 2650 && g.blackElo >= 2650 && (g.result === "1-0" || g.result === "0-1") && g.moves);
const out = [];
const seen = new Set();
while (out.length < 80 && pool.length) {
  const g = pool.splice(Math.floor(rand() * pool.length), 1)[0];
  const sans = g.moves.trim().split(/\s+/);
  if (sans.length < 60 || sans.length > 140) continue;
  const key = g.white + g.black + g.date;
  if (seen.has(key)) continue;
  // 재생 중 멈추지 않도록 수순 전체가 합법인지 미리 확인한다.
  const c = new Chess();
  try { for (const s of sans) c.move(s); } catch { continue; }
  seen.add(key);
  const year = g.date ? parseInt(g.date.slice(0, 4), 10) : null;
  out.push({ w: g.white, b: g.black, y: year && year > 1000 ? year : null, r: g.result, m: sans.join(" ") });
}
fs.writeFileSync(new URL("../src/data/masterShowcase.json", import.meta.url), JSON.stringify(out));
console.log("wrote", out.length, "games");
