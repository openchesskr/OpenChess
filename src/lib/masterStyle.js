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
  return { ok: true, n: userFeat.n, list: list.slice(0, k), z, count: list.length };
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
