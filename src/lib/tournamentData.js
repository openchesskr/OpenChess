// (v0.6.5) 대회 데이터 지연 로드 — 대회마다 한 파일(src/data/tournaments/<id>.json)이고 Vite가 파일마다 별도 덩어리로 나눈다(대회를 열 때만 내려받음).
// 선수 → 대회 검색 색인(tournamentSearch.json)도 처음 검색할 때만 불러온다.
const LOADERS = import.meta.glob("../data/tournaments/*.json");
const cache = new Map();
export const hasTournamentData = (id) => !!LOADERS["../data/tournaments/" + id + ".json"];
/** 대회 한 곳의 모든 회차 { id, eds }. 없으면 null. */
export function loadTournament(id) {
  const key = "../data/tournaments/" + id + ".json";
  if (!LOADERS[key]) return Promise.resolve(null);
  if (!cache.has(key)) cache.set(key, LOADERS[key]().then((m) => m.default || m).catch(() => { cache.delete(key); return null; }));
  return cache.get(key);
}
let searchP = null;
export function loadTournamentSearch() { if (!searchP) searchP = import("../data/tournamentSearch.json").then((m) => m.default || m).catch(() => { searchP = null; return null; }); return searchP; }
let profP = null;
/** 마스터 상세 프로필 { p: { "성|이름첫글자": 프로필 } } — 마스터 카드를 처음 열 때만 불러온다. */
export function loadMasterProfiles() { if (!profP) profP = import("../data/masterProfiles.json").then((m) => m.default || m).catch(() => { profP = null; return null; }); return profP; }
