// (v0.6.5) PGN Mentor PGN 파싱 공용 도구 — 대회 가공(build-pgn-tournaments)과 마스터 가공(build-master-profiles)이 함께 쓴다.
//  · 줄 끝 CRLF·BOM·주석 {…}·변형 (…)·NAG $n·수 번호·결과 기호를 정리해 "e4 e5 Nf3 …" 형태의 SAN 문자열로 만든다.
//  · 선수 이름은 "Aronian,L"과 "Aronian, Levon"처럼 표기가 섞여 있어 normalizeNames가 같은 사람을 하나의 대표 표기로 합친다.
export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** PGN 텍스트 → [{ tags, moves(SAN 배열) }]. 수순이 없는 대국(몰수 등)도 moves: [] 로 돌려준다. */
export function parsePgn(text) {
  const out = [];
  const src = String(text).replace(/^﻿/, "").replace(/\r/g, "");
  const parts = src.split(/\n(?=\[Event ")/);
  for (const chunk of parts) {
    if (!chunk.trim().startsWith("[")) continue;
    const tags = {}; let i = 0; const lines = chunk.split("\n");
    for (; i < lines.length; i++) { const m = /^\[(\w+)\s+"(.*)"\]\s*$/.exec(lines[i]); if (!m) { if (lines[i].trim() === "") continue; if (lines[i].startsWith("[")) continue; break; } tags[m[1]] = m[2]; }
    let mv = lines.slice(i).join(" ");
    mv = mv.replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
    for (let k = 0; k < 4; k++) mv = mv.replace(/\([^()]*\)/g, " ");   // 중첩 변형까지
    mv = mv.replace(/\$\d+/g, " ").replace(/\d+\.(\.\.)?/g, " ").replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, " ");
    const moves = mv.split(/\s+/).map((x) => x.replace(/[!?]+$/g, "")).filter((x) => x && /^[KQRBNOa-h]/.test(x));
    if (tags.White || tags.Black) out.push({ tags, moves });
  }
  return out;
}

const parts = (name) => {
  const s = String(name || "").trim(); const c = s.indexOf(",");
  if (c < 0) { const w = s.split(/\s+/); return { sur: w.length > 1 ? w[0] : s, given: w.slice(1).join(" ") }; }   // "Ding Liren"처럼 쉼표가 없으면 앞 낱말을 성으로
  return { sur: s.slice(0, c).trim(), given: s.slice(c + 1).trim() };
};

/** 옛 독일식·러시아식 철자를 앱에서 쓰는 영어 표기로(같은 사람이 두 이름으로 갈라지지 않게). 성과 이름의 철자만 바꾸고 나머지는 그대로. */
const SURNAME_ALIAS = { kortschnoj: "Korchnoi", kortchnoi: "Korchnoi", korchnoy: "Korchnoi", bogoljubow: "Bogoljubov", bogoljubov: "Bogoljubov", janowsky: "Janowski", jussupow: "Yusupov", tschigorin: "Chigorin", aljechin: "Alekhine", botwinnik: "Botvinnik", smyslow: "Smyslov", petrosjan: "Petrosian", tajmanov: "Taimanov", lilienthal: "Lilienthal", rubinstein: "Rubinstein", flohr: "Flohr", keres: "Keres", bronstein: "Bronstein", geller: "Geller", stein: "Stein", tal: "Tal" };
const GIVEN_ALIAS = { mihail: "Mikhail", wiktor: "Viktor", wassily: "Vasily", wassili: "Vasily", wassilij: "Vasily", dawid: "David", jefim: "Efim", artur: "Artur" };
export function aliasName(raw) {
  const s = String(raw || "").trim(); const c = s.indexOf(",");
  if (c < 0) return s;
  let sur = s.slice(0, c).trim(), given = s.slice(c + 1).trim();
  const sa = SURNAME_ALIAS[norm(sur)]; if (sa) sur = sa;
  const toks = given.split(/\s+/); const ga = GIVEN_ALIAS[norm(toks[0])]; if (ga) toks[0] = ga;
  return sur + ", " + toks.join(" ").trim();
}
const givenKey = (g) => norm(g);

/** 이름 목록(출현 횟수 포함) → Map(원래 표기 → 대표 표기). 같은 성 + 이름이 접두 관계(L ⊂ Levon)이면 같은 사람으로 보고, 가장 긴 표기를 대표로 한다.
 *  같은 성에 서로 접두 관계가 아닌 이름(Polgar Judit/Susan)은 합치지 않고, 짧은 표기가 둘 이상의 긴 표기와 맞으면(모호) 합치지 않는다. */
export function normalizeNames(rawCounts) {
  // 철자 별칭을 먼저 적용해 같은 사람의 표기를 모은다(결과 Map은 원래 표기 → 대표 표기).
  const counts = new Map(), toAlias = new Map();
  for (const [name, n] of rawCounts) { const a = aliasName(name); toAlias.set(name, a); counts.set(a, (counts.get(a) || 0) + n); }
  const core = normalizeCore(counts);
  const map = new Map(); for (const name of rawCounts.keys()) map.set(name, core.get(toAlias.get(name)) || toAlias.get(name));
  return map;
}
function normalizeCore(counts) {
  const bySur = new Map();
  for (const name of counts.keys()) { const p = parts(name); const k = norm(p.sur); if (!bySur.has(k)) bySur.set(k, []); bySur.get(k).push({ name, ...p, g: givenKey(p.given), n: counts.get(name) }); }
  const map = new Map();
  // 표기만 다른 같은 이름("Ding Liren"/"Ding, Liren", 대소문자·공백 차이)은 가장 자주 나오는 표기로 먼저 묶는다.
  const exact = new Map();
  for (const name of counts.keys()) { const p = parts(name), k = norm(p.sur) + "|" + givenKey(p.given); const cur = exact.get(k); if (!cur || counts.get(name) > counts.get(cur)) exact.set(k, name); }
  const rep = (name) => { const p = parts(name); return exact.get(norm(p.sur) + "|" + givenKey(p.given)) || name; };
  for (const list of bySur.values()) {
    // 쉼표가 없는 표기("Ding Liren")는 이름이 이미 풀려 있는 것으로 본다. 쉼표 뒤 공백("Carlsen, M")은 이니셜일 수 있으므로 길이로만 판단한다
    // (aliasName이 "Carlsen,M"을 "Carlsen, M"으로 바꾸므로 공백 유무로 가르면 짧은 표기가 긴 표기로 확장되지 못한다 — BUG-075).
    const longs = list.filter((x) => x.g.length > 2 || !x.name.includes(",")).sort((a, b) => b.g.length - a.g.length);
    const canonOf = (x) => {
      const cands = longs.filter((l) => l !== x && l.g.startsWith(x.g) && x.g.length > 0);
      const uniq = [...new Set(cands.map((l) => l.g))];
      // 후보 이름들이 서로 접두 관계(가장 긴 하나에 모두 포함)일 때만 확정
      if (!cands.length) return x;
      const top = cands[0]; if (cands.every((c) => top.g.startsWith(c.g))) return top;
      return uniq.length === 1 ? cands[0] : x;
    };
    for (const x of list) {
      let c = x;
      if (x.g.length <= 2 && x.name.includes(",")) c = canonOf(x);
      else { const longer = longs.find((l) => l !== x && l.g.startsWith(x.g) && l.g.length > x.g.length && l.n >= x.n); if (longer && x.g.length > 0) c = longer; }
      map.set(x.name, rep(c.name));
    }
  }
  return map;
}
