// (v0.6.3) 도감 "마스터" 서쪽 DB 선수·남쪽 FIDE 순위 노드의 이름 표기.
//  · 한국어: src/data/masterKo.json(선수 약 900명 — 챔피언·도전자·대회 우승자는 playerNames.js의 기존 표기를 그대로 가져왔고, 나머지는 AI 초안 · 출처는 항목마다 src에 기록)에서
//    "성, 이름" 그대로 찾고, 없으면 성 + 이름 첫 글자로 찾는다. 그래도 없으면 playerNames.js의 성 검색 → 영문.
//  · 그 밖의 언어: "Given Surname" (예: "Magnus Carlsen"). 이름이 이니셜뿐이면 "A. Surname".
import KO from "./masterKo.json";
import { dbPlayerName } from "./playerNames.js";

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
const splitName = (raw) => { const s = String(raw || "").replace(/\s+/g, " ").trim(), i = s.indexOf(","); return i >= 0 ? [s.slice(0, i).trim(), s.slice(i + 1).trim()] : (() => { const t = s.split(" "); return t.length > 1 ? [t[0], t.slice(1).join(" ")] : [s, ""]; })(); };
const keyOf = (raw) => { const [sur, giv] = splitName(raw); return norm(sur) + "|" + norm(giv).slice(0, 1); };
const BY_KEY = (() => { const m = new Map(); for (const [name, v] of Object.entries(KO.names)) { const k = keyOf(name); if (!m.has(k)) m.set(k, v[0]); } return m; })();

export function masterName(raw, lang) {
  if (lang === "ko") {
    const hit = KO.names[raw]; if (hit) return hit[0];
    const byKey = BY_KEY.get(keyOf(raw)); if (byKey) return byKey;
    return dbPlayerName(raw, "ko");
  }
  const [sur, giv] = splitName(raw);
  if (!giv) return sur;
  return (giv.length <= 2 ? giv.replace(/\.?$/, ".") : giv) + " " + sur;
}
