// (v0.6.6, 사용자 요청) 마스터 대국 DB의 선수 이름("Carlsen,M")을 풀네임("Magnus Carlsen")으로 바꾼다 — 집중 분석 마스터 통계가 쓴다.
// 이름에 이니셜만 있는 DB 표기를 FIDE 랭킹·마스터 대국 DB 선수 목록·세계 챔피언·도감 선수 표기(EXTRA_KO)의 풀네임과 (성, 이름 첫 글자) 키로 이어 붙이고,
// 찾지 못하면 playerNames.js의 기본 영어 표기(enName)로 둔다. 순수 함수 — scripts/check-master-prefix.mjs가 검사한다.
import FIDE from "../data/fideRankings.json";
import DBM from "../data/dbMasters.json";
import { CHAMPIONS } from "../data/worldChampions.js";
import { EXTRA_KO, enName } from "../data/playerNames.js";
import { candidateKeys } from "./masterProfile.js";

const givenOf = (n) => { const s = String(n || ""), c = s.indexOf(","); return c >= 0 ? s.slice(c + 1).trim() : s.split(/\s+/).slice(0, -1).join(" "); };
const isFull = (n) => givenOf(n).replace(/[.\s]/g, "").length > 2;   // 이름이 이니셜(1~2자)뿐이면 풀네임이 아니다
let FULL = null;
function table() {
  if (FULL) return FULL;
  FULL = new Map();
  const add = (name) => {
    if (!name || !isFull(name)) return;
    const k = candidateKeys(name)[0]; if (!k) return;
    const cur = FULL.get(k); if (!cur || givenOf(name).length > givenOf(cur).length) FULL.set(k, name);
  };
  for (const l of Object.values(FIDE.lists)) for (const r of l) add(r[2]);
  for (const m of DBM.masters) add(m.name);
  for (const c of CHAMPIONS) add(c.name);
  for (const n of Object.keys(EXTRA_KO)) add(n);
  return FULL;
}
const cache = new Map();
/** "Carlsen,M" → "Magnus Carlsen". 풀네임을 모르면 enName의 기본 표기("M. Carlsen" 등). */
export function fullPlayerName(raw) {
  if (!raw) return "?";
  const hit = cache.get(raw); if (hit) return hit;
  let out = enName(raw);
  if (!isFull(raw)) { const k = candidateKeys(raw)[0], f = k && table().get(k); if (f) out = enName(f); }
  cache.set(raw, out);
  return out;
}
