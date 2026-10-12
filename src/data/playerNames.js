// (v0.6.3) 도감 "마스터" 선수 이름 표기 — 로마자 이름 → 한국어. 챔피언·도전자는 worldChampions.js의 ko를 그대로 쓰고, 대회 우승자는 아래 EXTRA_KO(AI 초안 — 검수 필요)를 쓴다.
// 한국어 표기가 없는 선수는 로마자 그대로 나온다. 마스터 대국 DB의 "Carlsen,M" 형식은 dbPlayerName이 성으로 찾아 같은 한국어 이름을 쓴다(성이 같은 선수가 여럿이면 로마자).
import { CHAMPIONS } from "./worldChampions.js";
import { satellitesOf } from "../lib/masterTreeLayout.js";
export const EXTRA_KO = {
  "Evgeny Bareev": "예브게니 바레예프", "Levon Aronian": "레본 아로니안", "Teimour Radjabov": "테이무르 라드자보프", "Hikaru Nakamura": "히카루 나카무라", "Wesley So": "웨슬리 소",
  "Jorden van Foreest": "요르덴 판 포레스트", "Anish Giri": "아니시 기리", "Wei Yi": "웨이 이", "Praggnanandhaa Rameshbabu": "라메시바부 프라그나난다", "Nodirbek Abdusattorov": "노디르벡 압두사토로프",
  "Alireza Firouzja": "알리레자 피로우자", "Maxime Vachier-Lagrave": "막심 바시에라그라브", "Shakhriyar Mamedyarov": "샤흐리야르 마메댜로프", "Wang Hao": "왕하오", "Vidit Gujrathi": "비디트 구자라티",
  "Jan-Krzysztof Duda": "얀크리슈토프 두다", "Peter Svidler": "표트르 스비들러", "Reuben Fine": "리우번 파인", "Valery Salov": "발레리 살로프", "Predrag Nikolic": "프레드라그 니콜리치",
  "Alexey Dreev": "알렉세이 드레예프", "Alexander Grischuk": "알렉산드르 그리슈크", "Radoslaw Wojtaszek": "라도스와프 보이타셰크", "Leinier Dominguez": "레이니에르 도밍게스", "Viorel Bologan": "비오렐 볼로간",
  "Arkadij Naiditsch": "아르카디 나이디치", "Heikki Westerinen": "헤이키 베스테리넨", "Laszlo Szabo": "라슬로 사보", "Oleg Romanishin": "올레그 로마니신", "Jan Smejkal": "얀 스메이칼", "Ulf Andersson": "울프 안데르손",
  "Tamaz Giorgadze": "타마즈 기오르가제", "Raymond Keene": "레이먼드 킨", "Gennady Kuzmin": "겐나디 쿠즈민", "Vlastimil Hort": "블라스티밀 호르트", "Mihai Suba": "미하이 슈바", "Yehuda Gruenfeld": "예후다 그륀펠트",
  "Yuri Razuvaev": "유리 라주바예프", "Zoltan Ribli": "졸탄 리블리", "Yuri Balashov": "유리 발라쇼프", "Smbat Lputian": "스밤바트 루프티안", "Efim Geller": "에핌 겔러", "Alexander Chernin": "알렉산드르 체르닌",
  "Igor Stohl": "이고르 슈토흘", "Jeroen Piket": "예룬 피케트", "Vera Menchik": "베라 멘치크", "Lyudmila Rudenko": "류드밀라 루덴코", "Elisaveta Bykova": "엘리자베타 비코바", "Olga Rubtsova": "올가 루프초바",
  "Nona Gaprindashvili": "노나 가프린다슈빌리", "Maia Chiburdanidze": "마이아 치부르다니제", "Xie Jun": "셰쥔", "Susan Polgar": "수전 폴가르", "Zhu Chen": "주천", "Antoaneta Stefanova": "안토아네타 스테파노바",
  "Xu Yuhua": "쉬위화", "Alexandra Kosteniuk": "알렉산드라 코스테니우크", "Hou Yifan": "허우이판", "Anna Ushenina": "안나 우셰니나", "Mariya Muzychuk": "마리야 무지치크", "Tan Zhongyi": "탄중이",
  "Ju Wenjun": "쥐원쥔", "Aleksandra Goryachkina": "알렉산드라 고랴치키나", "Divya Deshmukh": "디비야 데슈무크", "Jose Raul Capablanca": "호세 라울 카파블랑카",
};
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
export const PLAYER_KO = (() => {
  const m = { ...EXTRA_KO };
  for (const c of CHAMPIONS) { m[c.name] = c.ko; for (const s of satellitesOf(c)) m[s.opp] = s.ko; }
  return m;
})();
// 성(정규화) → 한국어 이름. 같은 성에 다른 선수가 있으면 모호하므로 뺀다.
const BY_SURNAME = (() => {
  const seen = new Map();
  for (const [name, ko] of Object.entries(PLAYER_KO)) {
    const toks = name.split(/\s+/); const keys = new Set([norm(toks[toks.length - 1]), norm(toks[0])]);
    for (const k of keys) { if (!seen.has(k)) seen.set(k, new Set()); seen.get(k).add(ko); }
  }
  const out = new Map(); for (const [k, v] of seen) if (v.size === 1) out.set(k, [...v][0]);
  return out;
})();
export function playerName(name, lang) { return lang === "ko" && PLAYER_KO[name] ? PLAYER_KO[name] : name; }
/* 마스터 대국 DB 형식 "Carlsen,M"·"Short, Nigel D" → 표시용 이름. 한국어면 성으로 찾은 한국어 이름, 없으면 "M. Carlsen". */
export function dbPlayerName(raw, lang) {
  const [sur, given] = String(raw || "").split(",").map((x) => x.trim());
  if (lang === "ko") { const ko = BY_SURNAME.get(norm(sur)); if (ko) return ko; }
  const ini = given ? given.split(/\s+/).map((g) => g[0]).filter(Boolean).slice(0, 1).join("") : "";
  return (ini ? ini + ". " : "") + sur;
}
/* (v0.6.5) 영어 원문 전체 이름 — "Carlsen, Magnus" → "Magnus Carlsen". 이름이 이니셜뿐이면("Carlsen, M") "M. Carlsen", 한 글자 낱말은 마침표를 붙인다("Beliavsky, Alexander G" → "Alexander G. Beliavsky").
   끝의 숫자·나라 코드는 지운다. 도감 마스터 화면(챔피언·우승자·대국 선수)은 언어와 상관없이 이 표기를 쓴다. */
export function enName(raw) {
  const s = String(raw || "").replace(/\d+/g, "").replace(/\s+[A-Z]{3}$/, "").replace(/\s+/g, " ").trim();
  const i = s.indexOf(","); if (i < 0) return s;
  const sur = s.slice(0, i).trim(), given = s.slice(i + 1).trim(); if (!given) return sur;
  if (given.replace(/[.\s]/g, "").length <= 2) return given[0].toUpperCase() + ". " + sur;
  return given.split(" ").map((w) => (w.length === 1 ? w + "." : w)).join(" ") + " " + sur;
}

