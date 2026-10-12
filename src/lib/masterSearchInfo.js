// (v0.6.6, 사용자 요청) 마스터 검색 결과(도감 마스터 트리·집중 분석 마스터 통계·마스터 스타일)가 이름 아래에 보여 주는 정보 한 줄.
//  조건에 맞는 것만 쉼표로 잇는다 — 예: "16대 챔피언, FIDE 스탠다드 #1, 래피드 #1, 블리츠 #1" · "챔피언 도전자, FIDE 래피드 #37" · (해당 없으면) "".
//  · 챔피언: 세계 챔피언 목록(worldChampions.js)의 대수. 챔피언이 아닌 챔피언 도전자는 "챔피언 도전자".
//  · FIDE: 스탠다드·래피드·블리츠 100위 안에 드는 부문만. 첫 부문에만 "FIDE"를 붙이고 나머지는 부문 이름만 쓴다.
//  이름은 형식이 제각각("Carlsen, Magnus" · "Carlsen,M" · "Magnus Carlsen")이라 masterProfile.candidateKeys로 같은 사람을 찾는다.
import FIDE from "../data/fideRankings.json";
import { CHAMPIONS, TRANSFERS, SPLIT_ROWS } from "../data/worldChampions.js";
import { layoutMasters } from "./masterTreeLayout.js";
import { candidateKeys } from "./masterProfile.js";
import { ordinalParam } from "./ordinal.js";
import { t, lang } from "./i18n.js";

export const champNumText = (c) => (!c.no ? "" : c.reign ? t("{0}대 챔피언({1}기)", ordinalParam(c.no, lang), c.reign) : t("{0}대 챔피언", ordinalParam(c.no, lang)));
const LISTS = ["standard", "rapid", "blitz"];
// t() 키는 소스에서 글자 그대로 찾을 수 있어야 해서(check-i18n) 부문별로 따로 적는다.
const RANK_TEXT = {
  "standard-first": (n) => t("FIDE 스탠다드 #{0}", n), "rapid-first": (n) => t("FIDE 래피드 #{0}", n), "blitz-first": (n) => t("FIDE 블리츠 #{0}", n),
  standard: (n) => t("스탠다드 #{0}", n), rapid: (n) => t("래피드 #{0}", n), blitz: (n) => t("블리츠 #{0}", n),
};
let TABLE = null;
const table = () => {
  if (TABLE) return TABLE;
  TABLE = new Map();
  const at = (name) => { const k = candidateKeys(name)[0]; if (!k) return null; let e = TABLE.get(k); if (!e) { e = { champs: [], challenger: false, ranks: {} }; TABLE.set(k, e); } return e; };
  for (const c of CHAMPIONS) { const e = at(c.name); if (e) e.champs.push(c); }
  for (const n of layoutMasters(CHAMPIONS, TRANSFERS, SPLIT_ROWS, null).nodes) if (n.kind === "sat") { const e = at(n.sat.opp); if (e) e.challenger = true; }
  for (const l of LISTS) for (const r of FIDE.lists[l] || []) { const e = at(r[2]); if (e && (e.ranks[l] == null || r[0] < e.ranks[l])) e.ranks[l] = r[0]; }
  return TABLE;
};
/** 이름 → 정보 조각 목록(챔피언 대수 → 챔피언 도전자 → FIDE 부문 순위). */
export function masterInfoParts(name) {
  const k = candidateKeys(name)[0], e = k && table().get(k), out = [];
  if (!e) return out;
  const nums = [...new Set(e.champs.map(champNumText).filter(Boolean))];
  if (nums.length) out.push(...nums); else if (e.challenger && !e.champs.length) out.push(t("챔피언 도전자"));
  const first = LISTS.find((l) => e.ranks[l] != null);
  for (const l of LISTS) if (e.ranks[l] != null) out.push(RANK_TEXT[l + (l === first ? "-first" : "")](e.ranks[l]));
  return out;
}
export const masterInfoLine = (name) => masterInfoParts(name).join(", ");
