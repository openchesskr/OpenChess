// (v0.6.4) 마스터 스타일 매칭 — 대국 기보(SAN)만으로 계산하는 13개 스타일 특징(엔진 없음)과, 내 특징을 마스터 900명의 특징과 견주는 함수.
// 마스터 쪽 특징은 scripts/build-master-styles.mjs가 대국 DB에서 같은 함수(styleFeatures)로 미리 계산해 src/data/masterStyles.json에 둔다.
//  각 특징은 0~1 비율이고, 분모가 되는 대국이 없으면 null(비교에서 뺀다).
import { t } from "./i18n.js";

export const STYLE_KEYS = ["w_e4", "w_d4", "w_flank", "b_e5", "b_c5", "b_d5", "b_nf6", "castleQ", "capRate", "checkRate", "length", "queenTrade", "drawRate"];
// 표본이 적은 비율을 평균 쪽으로 당기는 값(분모 + SHRINK) — 몇 판 안 둔 사람이 극단으로 나오지 않게.
export const STYLE_SHRINK = 6;
export const MIN_STYLE_GAMES = 15;

const clean = (s) => String(s || "").replace(/[+#!?]+$/g, "");
/* games: [{ moves: ["e4","e5",…], color: "w"|"b", result: "win"|"loss"|"draw" }]. 반환: { vec: (number|null)[13], den: number[13], n }. */
export function styleFeatures(games) {
  const c = new Array(13).fill(0), d = new Array(13).fill(0);
  let caps = 0, checks = 0, plies = 0, lenSum = 0, n = 0;
  for (const g of games || []) {
    const mv = (g.moves || []).map(clean); if (mv.length < 6 || !g.color) continue;
    n++;
    const raw = g.moves;
    if (g.color === "w") {
      d[0]++; d[1]++; d[2]++;
      if (mv[0] === "e4") c[0]++; else if (mv[0] === "d4") c[1]++; else c[2]++;
    } else {
      if (mv[0] === "e4") { d[3]++; d[4]++; if (mv[1] === "e5") c[3]++; if (mv[1] === "c5") c[4]++; }
      if (mv[0] === "d4") { d[5]++; d[6]++; if (mv[1] === "d5") c[5]++; if (mv[1] === "Nf6") c[6]++; }
    }
    // 이 대국의 내 쪽 수만으로 캐슬링·교환·체크 성향을 센다
    let mine = 0, castled = false, qSide = false;
    for (let i = 0; i < raw.length; i++) {
      if ((i % 2 === 0) !== (g.color === "w")) continue;
      mine++; const s = raw[i];
      if (/^O-O-O/.test(s)) { castled = true; qSide = true; } else if (/^O-O/.test(s)) castled = true;
      if (s.includes("x")) caps++;
      if (/[+#]/.test(s)) checks++;
    }
    plies += mine; lenSum += Math.min(raw.length, 120) / 120;
    if (castled) { d[7]++; if (qSide) c[7]++; }
    // 퀸 교환: 연속한 두 수가 모두 같은 칸에서 퀸이 잡는 수(Qxd5 … Qxd5)
    let trade = false;
    for (let i = 0; i + 1 < mv.length; i++) { const a = /^Qx([a-h][1-8])/.exec(mv[i]), b = /^Qx([a-h][1-8])/.exec(mv[i + 1]); if (a && b && a[1] === b[1]) { trade = true; break; } }
    d[11]++; if (trade) c[11]++;
    d[12]++; if (g.result === "draw") c[12]++;
  }
  const vec = new Array(13).fill(null);
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 11, 12]) vec[i] = d[i] ? c[i] / d[i] : null;
  vec[8] = plies ? caps / plies : null; vec[9] = plies ? checks / plies : null; vec[10] = n ? lenSum / n : null;
  d[8] = d[9] = plies; d[10] = n;
  return { vec, den: d, n };
}

/* 사용자의 비율을 모집단 평균 쪽으로 당긴다. */
export function shrinkVec(vec, den, mean) { return vec.map((v, i) => (v == null ? null : (v * den[i] + mean[i] * STYLE_SHRINK) / (den[i] + STYLE_SHRINK))); }

/* data: masterStyles.json({mean, std, masters:[[이름, 대국 수, 엘로, 특징 벡터]]}). 반환: 가까운 순 최대 k명 [{name, games, elo, sim, dist}] 과 내 특징의 표준점수. */
export function matchMasters(userFeat, data, k = 3) {
  if (!userFeat || userFeat.n < MIN_STYLE_GAMES) return { ok: false, n: userFeat ? userFeat.n : 0, list: [], z: [] };
  const u = shrinkVec(userFeat.vec, userFeat.den, data.mean);
  const z = u.map((v, i) => (v == null ? null : (v - data.mean[i]) / (data.std[i] || 1)));
  const list = [];
  for (const [name, games, elo, vec] of data.masters) {
    let s = 0, dims = 0;
    for (let i = 0; i < 13; i++) { if (z[i] == null || vec[i] == null) continue; const mz = (vec[i] - data.mean[i]) / (data.std[i] || 1); s += (z[i] - mz) ** 2; dims++; }
    if (dims < 8) continue;
    const dist = Math.sqrt(s / dims);
    list.push({ name, games, elo, dist, sim: 1 / (1 + dist) });
  }
  list.sort((a, b) => a.dist - b.dist);
  return { ok: true, n: userFeat.n, list: list.slice(0, k), z, u, count: list.length };
}
/* 마스터와 내가 모두 평균보다 같은 방향으로 두드러진 특징(닮은 점) 최대 2개. */
export function sharedTraits(z, master, data, max = 2) {
  const out = [];
  STYLE_KEYS.forEach((key, i) => {
    if (z[i] == null || master[3][i] == null) return;
    const mz = (master[3][i] - data.mean[i]) / (data.std[i] || 1);
    if (Math.abs(z[i]) >= 0.5 && Math.abs(mz) >= 0.5 && Math.sign(z[i]) === Math.sign(mz)) out.push({ key, high: z[i] > 0, strength: Math.min(Math.abs(z[i]), Math.abs(mz)) });
  });
  return out.sort((a, b) => b.strength - a.strength).slice(0, max);
}
export function traitLabel(key, high) {
  return ({
    w_e4: high ? t("백으로 1.e4를 즐겨 둠") : t("백으로 1.e4를 잘 안 둠"),
    w_d4: high ? t("백으로 1.d4를 즐겨 둠") : t("백으로 1.d4를 잘 안 둠"),
    w_flank: high ? t("백으로 1.c4·1.Nf3 같은 측면 오프닝을 즐겨 둠") : t("백으로 측면 오프닝을 잘 안 둠"),
    b_e5: high ? t("흑으로 1.e4에 …e5로 응수") : t("흑으로 1.e4에 …e5를 잘 안 둠"),
    b_c5: high ? t("흑으로 1.e4에 시실리안으로 응수") : t("흑으로 1.e4에 시실리안을 잘 안 둠"),
    b_d5: high ? t("흑으로 1.d4에 …d5로 응수") : t("흑으로 1.d4에 …d5를 잘 안 둠"),
    b_nf6: high ? t("흑으로 1.d4에 인디언 계열로 응수") : t("흑으로 1.d4에 인디언 계열을 잘 안 둠"),
    castleQ: high ? t("퀸사이드 캐슬링을 자주 함") : t("킹사이드 캐슬링을 선호"),
    capRate: high ? t("기물 교환을 자주 함") : t("기물을 잘 교환하지 않음"),
    checkRate: high ? t("체크를 자주 걸어 공격") : t("체크를 아껴 둠"),
    length: high ? t("대국이 긴 편") : t("대국이 짧게 끝나는 편"),
    queenTrade: high ? t("퀸 교환이 잦음") : t("퀸을 남겨 두는 편"),
    drawRate: high ? t("무승부가 많음") : t("승부를 가리는 편"),
  }[key] || key);
}

/* (v0.6.4) 기준 하나씩의 이름·값 표기·비교. 화면(app/growth.jsx)의 "어떤 점이 비슷한가" 표가 쓴다. */
export const CRITERIA_GROUPS = [
  { id: "open", keys: ["w_e4", "w_d4", "w_flank", "b_e5", "b_c5", "b_d5", "b_nf6"] },
  { id: "mid", keys: ["capRate", "checkRate", "queenTrade", "castleQ"] },
  { id: "game", keys: ["length", "drawRate"] },
];
export const criterionLabel = (key) => ({
  w_e4: t("백 1.e4 선택"), w_d4: t("백 1.d4 선택"), w_flank: t("백 측면 오프닝(1.c4·1.Nf3 등)"),
  b_e5: t("1.e4에 …e5 응수"), b_c5: t("1.e4에 …c5(시실리안) 응수"), b_d5: t("1.d4에 …d5 응수"), b_nf6: t("1.d4에 …Nf6 응수"),
  castleQ: t("퀸사이드 캐슬링(캐슬링한 대국 중)"), capRate: t("기물을 잡는 수의 비율"), checkRate: t("체크를 거는 수의 비율"),
  length: t("평균 대국 길이"), queenTrade: t("퀸 교환이 나온 대국"), drawRate: t("무승부 비율"),
}[key] || key);
export const criterionGroupLabel = (id) => ({ open: t("오프닝 선택"), mid: t("중반 성향"), game: t("대국 흐름") }[id] || id);
/* 값 표기: 비율은 %, 대국 길이는 평균 수(한 수 = 백·흑 한 쌍; 특징값은 최대 120 plies = 60수 기준으로 0~1). */
export function formatCriterion(key, v) {
  if (v == null) return "—";
  if (key === "length") return t("약 {0}수", Math.round(v * 60));
  return Math.round(v * 100) + "%";
}
/* (v0.6.4) 판정은 기준마다 "사람이 보기에 큰 차이인가"로 직접 계산한다. 예전엔 차이를 마스터 900명의 표준편차로 나눴는데, 체크·기물 잡기 비율처럼
   마스터끼리도 거의 같은 값이면 표준편차가 아주 작아 9% 대 7% 같은 2%p 차이가 "많이 다름"이 되는 문제가 있었다(순위 계산에는 그대로 쓰되 판정에는 쓰지 않는다).
   · share(선택·응수·캐슬링·교환·무승부 비율): 두 값의 %p 차이 — 7%p 이하 거의 같음, 15%p 이하 비슷함, 30%p 이하 다름, 그 이상 많이 다름
   · intensity(체크·기물 잡기 빈도): 큰 값 ÷ 작은 값 — 1.3배 이하 거의 같음, 1.7배 이하 비슷함, 2.5배 이하 다름, 그 이상 많이 다름(둘 다 2% 미만이면 거의 같음)
   · length(평균 대국 길이): 큰 값 ÷ 작은 값 — 1.15배 이하 거의 같음, 1.35배 이하 비슷함, 1.8배 이하 다름, 그 이상 많이 다름 */
export const CRITERION_KIND = { w_e4: "share", w_d4: "share", w_flank: "share", b_e5: "share", b_c5: "share", b_d5: "share", b_nf6: "share", castleQ: "share", queenTrade: "share", drawRate: "share", capRate: "intensity", checkRate: "intensity", length: "length" };
export const LEVEL_RULES = { share: [0.07, 0.15, 0.30], intensity: [1.3, 1.7, 2.5], length: [1.15, 1.35, 1.8] };
export const LEVELS = ["same", "close", "far", "veryFar"];
export const levelLabel = (lv) => ({ same: t("거의 같음"), close: t("비슷함"), far: t("다름"), veryFar: t("많이 다름"), na: t("비교 불가") }[lv] || lv);
/* 기준 하나의 차이(share=절대 차이 0~1, 그 밖=배수)와 단계. 한쪽이 없으면 null/"na". */
export function criterionDiff(key, a, b) {
  if (a == null || b == null) return { diff: null, level: "na" };
  const kind = CRITERION_KIND[key] || "share", [t1, t2, t3] = LEVEL_RULES[kind];
  let diff;
  if (kind === "share") diff = Math.abs(a - b);
  else { const hi = Math.max(a, b), lo = Math.min(a, b); if (kind === "intensity" && hi < 0.02) return { diff: 1, level: "same" }; diff = hi / Math.max(lo, kind === "intensity" ? 0.005 : 0.01); }
  return { diff, level: diff <= t1 ? "same" : diff <= t2 ? "close" : diff <= t3 ? "far" : "veryFar" };
}
/* 차이 표기: share는 "±N%p", 배수는 "N.N배". */
export function formatDiff(key, diff) {
  if (diff == null) return "—";
  return (CRITERION_KIND[key] || "share") === "share" ? "±" + Math.round(diff * 100) + "%p" : (Math.round(diff * 10) / 10).toFixed(1) + "배";
}
/* userVec(표본 보정된 내 값 u)과 마스터 벡터를 기준 13개 모두 비교한다. 반환: [{key, mine, theirs, diff, level}] (STYLE_KEYS 순서). */
export function compareCriteria(u, masterVec) {
  return STYLE_KEYS.map((key, i) => ({ key, mine: u[i], theirs: masterVec[i], ...criterionDiff(key, u[i], masterVec[i]) }));
}
