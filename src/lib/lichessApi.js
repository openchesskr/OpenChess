import { apiUrl } from "./siteConfig.js";
export const LICHESS_API = apiUrl("/api/lichess");
export const WIKI_API = "https://en.wikipedia.org/api/rest_v1/page/summary/";

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const LICHESS_STATS_WINDOW_MONTHS = 12; // 전체 누적(수백만 표본) 대신 "최근 N개월간 실제로 두어진 대국"만 집계
export function lichessSinceParam(monthsBack) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - monthsBack);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}
// (버그 수정, 사용자 제보) useOpeningTreeAuto(도감 트리를 백그라운드에서 계속 채우는 훅)는 동시에
// 최대 8개까지 리체스 조회를 띄운다 — 레이트리밋(429)에 걸리면 아래 lichessFetchWithRetry가 그
// "호출 하나"에 대해서는 백오프하며 재시도하지만, 나머지 7개 동시 호출은 그 사실을 전혀 모른 채 각자
// 독립적으로 계속 재시도해(최악의 경우 8칸 × 3회 = 24개 요청이 짧은 시간에 몰림) 429가 429를 부르며
// 콘솔이 같은 에러로 도배되는 걸(사용자 제보 스크린샷) 확인했다 — 짧은 시간에 계속되는 실패한
// 네트워크 요청·재시도 처리 자체가 메인 스레드를 붙잡아, 같은 시점에 매칭 대기 화면 궤도 애니메이션이
// (레이트리밋과 무관한 기능인데도) 멈춰 보이는 데 일부 영향을 줬을 수 있다. 모든 호출이 공유하는
// "쿨다운" 시각을 하나 두어, 어느 한 호출이든 429를 맞으면 그 뒤로 들어오는 모든 호출(동시에 떠 있는
// 다른 7개 포함)이 그 쿨다운이 끝날 때까지 먼저 기다리게 한다 — 실패가 실패를 부르며 몰아치는 걸 막는다.
let _lichessCooldownUntil = 0;
// (사용자 요청, 성능) 화면에 곧바로 보여줘야 하는 조회(분석 탭 수 블록 통계)가 도감 트리를 백그라운드에서
// 계속 채우는 조회(동시 8개씩 수백 건)에 밀려 느려지지 않게 한다. 앞쪽(foreground) 조회가 하나라도 진행
// 중이면 백그라운드 조회는 새 요청을 시작하지 않고 잠시 기다린다(이미 나간 요청은 그대로 끝까지 진행).
let _lichessFg = 0;
const _lichessFgWaiters = [];
export function lichessForeground(promise) {
  _lichessFg++;
  return Promise.resolve(promise).finally(() => { _lichessFg--; if (_lichessFg === 0) while (_lichessFgWaiters.length) _lichessFgWaiters.shift()(); });
}
export const lichessForegroundBusy = () => _lichessFg > 0;
export function whenLichessIdle() { return _lichessFg === 0 ? Promise.resolve() : new Promise((r) => _lichessFgWaiters.push(r)); }
export async function lichessFetchWithRetry(url) {
  // 다른 동시 호출이 이미 429를 맞아 쿨다운 중이면, 이 호출은 새로 요청을 던지기 전에 그 쿨다운이
  // 끝날 때까지 먼저 기다린다 — 이미 레이트리밋된 상태에 요청을 더 얹지 않기 위함.
  const wait0 = _lichessCooldownUntil - Date.now();
  if (wait0 > 0) await _sleep(wait0);
  let res = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url);
    if (res.status === 429) { // 레이트리밋: 백오프 후 재시도(공유 쿨다운도 함께 갱신)
      const ra = parseFloat(res.headers.get("Retry-After"));
      const wait = Number.isFinite(ra) ? ra * 1000 : 1200 * (attempt + 1);
      _lichessCooldownUntil = Math.max(_lichessCooldownUntil, Date.now() + wait);
      await _sleep(wait);
      continue;
    }
    break;
  }
  if (!res || !res.ok) {
    const detail = res ? await res.text().catch(() => "") : "";
    throw new Error("lichess " + (res ? res.status : "no-response") + " (" + url + ")" + (detail ? ": " + detail.slice(0, 200) : ""));
  }
  return res;
}
// (기능) 외부 대국 데이터베이스(선수/이벤트/오프닝 묶음)에서 뽑아낸 정적 마스터 대국 —
// scripts/build-master-games.mjs로 public/master-games.json 생성. Lichess 마스터 DB 표본이
// 적은 포지션을 보충하려고 만들었지만, 지금은 "출처 구분 없이 항상 합쳐서 보여주기"로 정해서
// 매번 Lichess·개발자 추가분과 함께 합친다. 최초 1회만 fetch해서 메모리에 캐싱 — 파일이 몇 MB급이라
// 초기 번들에는 안 넣고 마스터 대국을 처음 조회할 때만 지연 로드한다.
export const MASTER_DATA_BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) ? import.meta.env.BASE_URL : "/";
let masterGameData = null;
let masterGameLoadPromise = null;
export function loadMasterGameData() {
  if (masterGameData) return Promise.resolve(masterGameData);
  if (!masterGameLoadPromise) {
    masterGameLoadPromise = fetch(MASTER_DATA_BASE + "master-games.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { masterGameData = d; return d; })
      .catch(() => null);
  }
  return masterGameLoadPromise;
}
// (v0.6.6, 사용자 요청) 정적 마스터 대국 DB에서 "이 수순으로 시작하는 모든 대국"을 찾는 접두사 색인.
// 예전엔 build-master-games.mjs가 openings.json 트리 노드(3,985곳)마다 미리 뽑아 둔 index를 썼다 — 트리 밖의 포지션은 대국이 있어도 못 찾았고,
// 노드당 500판까지만 담겨 있었다(1.e4만 해도 실제로는 6만 판 가까이). 이제 모든 대국의 수순 문자열(체크·메이트 기호 제거)을 정렬해 두고
// 이진 탐색으로 접두사가 같은 구간을 통째로 찾는다 — 어떤 포지션이든 DB에 있는 대국을 빠짐없이, 상한 없이 돌려준다.
// 색인은 DB를 처음 조회할 때 한 번(약 0.5초) 만들어 메모리에 둔다.
const _prefixIdx = new WeakMap();
const _stripCk = (s) => String(s || "").replace(/[+#]/g, "");
function masterPrefixIndex(data) {
  let ix = _prefixIdx.get(data);
  if (ix) return ix;
  const games = data.games, n = games.length, norm = new Array(n);
  for (let i = 0; i < n; i++) norm[i] = _stripCk(games[i].moves);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => (norm[a] < norm[b] ? -1 : norm[a] > norm[b] ? 1 : 0));
  ix = { norm, order };
  _prefixIdx.set(data, ix);
  return ix;
}
/** sans로 시작하는 모든 대국의 번호(data.games 인덱스). sans가 비면 전체. 토큰 경계를 지킨다("Qa1"이 "Qa1b2"로 시작하는 대국에 걸리지 않음). */
export function staticMasterGameIdxsFor(sans, data) {
  if (!data || !data.games) return [];
  const { norm, order } = masterPrefixIndex(data);
  const key = sans.map(_stripCk).join(" ");
  if (!key) return order.slice();
  let lo = 0, hi = order.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (norm[order[mid]] < key) lo = mid + 1; else hi = mid; }
  const out = [];
  for (let i = lo; i < order.length; i++) {
    const s = norm[order[i]];
    if (!s.startsWith(key)) break;
    if (s.length === key.length || s.charCodeAt(key.length) === 32) out.push(order[i]);
  }
  return out;
}
const _resOf = (r) => (r === "1-0" ? "w" : r === "0-1" ? "b" : "d");
export function staticMasterGamesFor(sans, data) {
  if (!data) return [];
  return staticMasterGameIdxsFor(sans, data).map((gi) => {
    const g = data.games[gi];
    const winner = g.result === "1-0" ? "white" : g.result === "0-1" ? "black" : null;
    const year = g.date ? parseInt(g.date.slice(0, 4), 10) : null;
    return { id: "extm_" + gi, winner, white: { name: g.white, rating: g.whiteElo }, black: { name: g.black, rating: g.blackElo }, year: (year && year > 1000 && year < 2100) ? year : null, event: g.event || "" };   // event: 집중 분석 마스터 대국의 검색·표시
  });
}
/** 이 포지션 이후 정적 DB 대국의 승·무·패와 많이 둔 다음 수(Lichess 통계를 못 받을 때의 대체이자 오프라인 통계). */
export function staticMasterStatsFor(sans, data) {
  const idxs = staticMasterGameIdxsFor(sans, data), nxt = new Map();
  let white = 0, draws = 0, black = 0;
  for (const gi of idxs) {
    const g = data.games[gi], r = _resOf(g.result);
    if (r === "w") white++; else if (r === "b") black++; else draws++;
    const mv = String(g.moves || "").split(" ")[sans.length];
    if (!mv) continue;
    const x = nxt.get(mv) || { san: mv, white: 0, draws: 0, black: 0, avg: null };
    if (r === "w") x.white++; else if (r === "b") x.black++; else x.draws++;
    nxt.set(mv, x);
  }
  const moves = [...nxt.values()].sort((a, b) => (b.white + b.draws + b.black) - (a.white + a.draws + a.black)).slice(0, 12);
  return { white, draws, black, moves };
}
