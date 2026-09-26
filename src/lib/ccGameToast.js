// (v0.5.6 기능, 사용자 요청) chess.com 대국 요약 알림 — 대국이 한 판 끝날 때마다(그리고 OpenChess에
// 접속해 있지 않던 사이에 끝난 대국들은 다음 접속 때 순서대로) 결과·상대·오프닝과, 그 대국으로 바뀐
// 전적(승/무/패·승률)을 보여 준다. 화면과 분리된 순수 계산만 여기 둔다(scripts/check-cc-game-toast.mjs가 검사).

// 한 번에 이어서 띄우는 최대 개수 — 오래 접속하지 않아 수십 판이 쌓였어도 최근 것만 보여 준다.
export const CC_TOAST_MAX = 10;

const seenKey = (u) => "occ_cc_toast_seen_v1:" + String(u).toLowerCase().trim();

// 마지막으로 알림을 띄운(=본) 대국의 종료 시각(초). 처음이면 null, 저장소를 쓸 수 없으면 undefined
// (그때는 알림을 아예 띄우지 않는다 — 매 접속마다 과거 대국이 쏟아지는 것보다 조용한 편이 낫다).
export function loadCcSeen(u) {
  try {
    const v = window.localStorage.getItem(seenKey(u));
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch { return undefined; }
}
export function saveCcSeen(u, endTime) {
  try {
    const prev = loadCcSeen(u);
    if (prev != null && prev >= endTime) return; // 뒤로 되돌리지 않는다
    window.localStorage.setItem(seenKey(u), String(endTime));
  } catch { }
}

// 대국 고유 키 — chess.com 게임 ID가 있으면 그것, 없으면(옛 캐시) 종료 시각+양쪽 닉네임.
export function ccGameKey(g) {
  if (g.id != null) return "id:" + g.id;
  return "t:" + (g.endTime || 0) + ":" + ((g.white && g.white.username) || "") + ":" + ((g.black && g.black.username) || "");
}
const isStd = (g) => (g.rules || "chess") === "chess";
// 시간 순서(종료 시각, 같으면 키) — 전적 "이전/이후"를 가르는 기준.
const before = (a, b) => (a.endTime || 0) < (b.endTime || 0) || ((a.endTime || 0) === (b.endTime || 0) && ccGameKey(a) < ccGameKey(b));

export function latestEndTime(games) {
  let t = 0;
  for (const g of games || []) if (isStd(g) && g.endTime && g.endTime > t) t = g.endTime;
  return t;
}

// seen 이후에 끝난 표준 체스 대국 — 오래된 것부터, 최근 max판만.
export function pendingCcGames(games, seen, max = CC_TOAST_MAX) {
  if (seen == null) return [];
  const list = (games || []).filter((g) => isStd(g) && g.endTime && g.endTime > seen);
  list.sort((a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0));
  return list.slice(-max);
}

const pack = (w, d, l) => { const n = w + d + l; return { w, d, l, n, wr: n ? Math.round((100 * w) / n) : null }; };
// 이 대국 직전까지의 전적과 이 대국을 더한 전적. 오프닝이 있으면 같은 오프닝 대국끼리(도감 전적 칩과 같은
// 성격), 없으면 전체 전적. 도감 칩처럼 색(백/흑)은 가리지 않는다.
export function recordAround(games, g) {
  const scope = g.opening ? "opening" : "all";
  let w = 0, d = 0, l = 0;
  for (const x of games || []) {
    if (!isStd(x) || x === g || ccGameKey(x) === ccGameKey(g)) continue;
    if (scope === "opening" && x.opening !== g.opening) continue;
    if (!before(x, g)) continue;
    if (x.result === "win") w++; else if (x.result === "loss") l++; else d++;
  }
  const prev = pack(w, d, l);
  const next = g.result === "win" ? pack(w + 1, d, l) : g.result === "loss" ? pack(w, d, l + 1) : pack(w, d + 1, l);
  return { scope, prev, next, changed: g.result === "win" ? "w" : g.result === "loss" ? "l" : "d" };
}

// 같은 시간 규정(레이팅 풀)의 바로 앞 대국 대비 레이팅 변화 — computeRatingChanges와 같은 규칙.
export function ratingDeltaOf(games, g) {
  if (!g.timeClass || g.rating == null) return null;
  let prev = null;
  for (const x of games || []) {
    if (!isStd(x) || x.timeClass !== g.timeClass || x.rating == null || !before(x, g)) continue; // 변형 체스는 레이팅 풀이 따로다
    if (!prev || before(prev, x)) prev = x;
  }
  return prev ? g.rating - prev.rating : null;
}
