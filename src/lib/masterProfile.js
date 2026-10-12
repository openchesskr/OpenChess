// (v0.6.5) 마스터 이름 → 상세 프로필(src/data/masterProfiles.json)·출전 대회(tournamentSearch.json) 찾기 — 순수 함수(scripts/check-tournament-data.mjs가 검사).
//  프로필 키는 "성(영문 소문자·공백 제거)|이름 첫 글자"(build-db-masters.mjs의 도감 선수 키와 같은 규칙). 도감 노드의 이름은 형식이 제각각이라
//  ("Carlsen, Magnus" · "Garry Kasparov" · "Ding Liren" · "Maxime Vachier-Lagrave") 가능한 (성, 이름) 해석을 모두 만들어 첫 적중을 쓴다.
const strip = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const ini = (s) => strip(s).slice(0, 1);

/** 이름 → 후보 키 목록(가능성 높은 순). */
export function candidateKeys(name) {
  const raw = String(name || "").replace(/\s+[A-Z]{3}$/, "").trim(); if (!raw) return [];
  const out = [], c = raw.indexOf(",");
  if (c >= 0) { out.push(strip(raw.slice(0, c)) + "|" + ini(raw.slice(c + 1))); return out; }
  const t = raw.split(/\s+/);
  if (t.length === 1) return [strip(t[0]) + "|"];
  out.push(strip(t[t.length - 1]) + "|" + ini(t[0]));   // "Garry Kasparov" → kasparov|g
  out.push(strip(t[0]) + "|" + ini(t[1]));              // "Ding Liren" → ding|l (성이 앞인 이름)
  if (t.length >= 3) out.push(strip(t.slice(-2).join("")) + "|" + ini(t[0]));   // "Jorden van Foreest" → vanforeest|j
  return out;
}
const idxCache = new WeakMap();
/** profiles = { p: { key: 프로필 } } → Map(공백 뺀 키 → 프로필). */
export function indexProfiles(profiles) {
  if (idxCache.has(profiles)) return idxCache.get(profiles);
  const m = new Map(); for (const [k, v] of Object.entries(profiles.p)) m.set(k.replace(/ /g, ""), v);
  idxCache.set(profiles, m); return m;
}
// 성만 같은 키를 모은 표(성 → 키 목록) — 애칭("Bobby Fischer" ↔ "Fischer, Robert")처럼 이름 첫 글자가 달라도 성이 유일하면 같은 사람으로 본다.
const bySur = (keys) => { const m = new Map(); for (const k of keys) { const s = k.split("|")[0]; if (!m.has(s)) m.set(s, []); m.get(s).push(k); } return m; };
const surCache = new WeakMap();
export function findProfile(profiles, name) {
  if (!profiles) return null; const m = indexProfiles(profiles);
  const cands = candidateKeys(name);
  for (const k of cands) { const p = m.get(k); if (p) return p; }
  if (!surCache.has(profiles)) surCache.set(profiles, bySur(m.keys()));
  for (const k of cands) { const list = surCache.get(profiles).get(k.split("|")[0]); if (list && list.length === 1) return m.get(list[0]); }
  return null;
}
const sidxCache = new WeakMap();
/** search = { t: [대회 id], p: { 이름: [[대회 번호, 횟수, 첫 해, 마지막 해]] } } → 이름 키별로 합친 Map. */
function indexSearch(search) {
  if (sidxCache.has(search)) return sidxCache.get(search);
  const m = new Map();
  for (const [name, list] of Object.entries(search.p)) {
    const c = name.indexOf(","), key = strip(c >= 0 ? name.slice(0, c) : name.split(" ")[0]) + "|" + ini(c >= 0 ? name.slice(c + 1) : name.split(" ").slice(1).join(" "));
    const acc = m.get(key) || new Map();
    for (const [k, n, y0, y1] of list) { const x = acc.get(k) || [0, 9999, 0]; x[0] += n; x[1] = Math.min(x[1], y0); x[2] = Math.max(x[2], y1); acc.set(k, x); }
    m.set(key, acc);
  }
  sidxCache.set(search, m); return m;
}
/** 이 선수가 출전한 대회 [{ id, n(출전 횟수), y0, y1 }] — 횟수 많은 순. */
export function playedTournaments(search, name, limit = 10) {
  if (!search) return []; const m = indexSearch(search);
  const cands = candidateKeys(name);
  let hit = cands.map((k) => m.get(k)).find(Boolean);
  if (!hit) { if (!surCache.has(search)) surCache.set(search, bySur(m.keys())); for (const k of cands) { const list = surCache.get(search).get(k.split("|")[0]); if (list && list.length === 1) { hit = m.get(list[0]); break; } } }
  if (hit) { const acc = hit; return [...acc.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, limit).map(([i, v]) => ({ id: search.t[i], n: v[0], y0: v[1], y1: v[2] })); }
  return [];
}
/** 선수 이름 일부(영문, 대소문자·악센트 무시)가 든 이름이 출전한 대회 id 집합. */
export function tournamentsOfPlayerQuery(search, q) {
  const out = new Set(); const s = strip(q); if (!search || s.length < 2) return out;
  for (const [name, list] of Object.entries(search.p)) if (strip(name).includes(s)) for (const [k] of list) out.add(search.t[k]);
  return out;
}
