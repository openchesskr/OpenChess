// (v0.6.7) 퍼포먼스 레이팅 — 상대 레이팅과 무관하게, 보드 위에서 두어진 수의 절대적인 질만으로 매기는 점수.
// FIDE의 Rp(상대 평균 + 득점률 표)와 달리 내 레이팅·상대 레이팅이 입력에 없다. 구조:
//   Rp = 기본(A, n) + 이론(T) + 탁월·유일(Q) − 블런더(B) + 오프닝(O)   → [FLOOR, CAP]
//   · A  화면에 보이는 최종 누적 정확도(moveQuality.js newCumulativeAccuracy 결과). 화면의 정확도와 순서가 어긋나지 않게 이 값을 그대로 입력으로 쓴다.
//   · n  평가가 끝난 비이론 내 수 개수. 많을수록 "그 정확도를 더 오래 유지했다"는 증거가 늘어 기본값이 R(A)에 가까워진다.
//   · 이론·탁월·유일은 실력으로 본다(사용자 결정) — 암기한 이론도, 찾기 어려운 수도 점수에 들어간다. 포화 곡선은 점수 폭주를 막는 안전장치일 뿐이다.
//   · 모든 항이 상한으로 묶여 있어 보정된 기본값(R(A))이 합산을 압도한다.
// ⚠ PERF의 숫자는 전부 임시값이다. R(A) 곡선(RA_ANCHORS)은 레이팅이 알려진 대국의 분석 결과로 보정해야 하며(scripts/ 로컬 보정 예정), 가감 상한도
//   실제 대국에 돌려 보며 조정한다. 값을 바꾸면 scripts/check-performance-rating.mjs의 불변식이 그대로 통과해야 한다.

export const PERF = {
  CALIBRATED: false,     // R(A) 곡선·가감 상한을 실제 대국으로 보정했는가. false면 리뷰 화면이 "보정 전 임시 수치"를 표시하고 check:release가 실패한다
  FLOOR: 100,            // 모델 최저 레이팅(임시) — 정확도 0%에 가까운 판의 하한
  CAP: 3500,             // 모델 최고 레이팅(임시)
  EVIDENCE_K: 10,        // w(n) = n / (n + K). n=10이면 0.5, 40이면 0.8
  THEORY_MAX: 60,        // 이론 항 상한. T = MAX · (1 − e^(−t/TAU)), t = 이론 수 개수
  THEORY_TAU: 8,
  QUALITY_MAX: 120,      // 탁월·유일 항 상한. Q = MAX · (1 − e^(−s/SCALE)), s = 탁월·유일 가중 개수
  QUALITY_SCALE: 4,
  W_BRILLIANT: 1.0,
  W_ONLY: 0.5,
  BLUNDER_UNIT: 45,      // 블런더 한 개의 기본 감점. j번째 블런더는 UNIT · (1 + GROWTH · (j − 1))
  BLUNDER_GROWTH: 0.35,
  OPENING_MAX: 10,       // 오프닝 항은 ±이 값 안쪽(아주 미세하게)
  OPENING_SHRINK_K: 30,  // 표본이 적은 포지션은 전체 평균 쪽으로 당긴다
  OPENING_SCALE: 60,     // 평균 레이팅 차이(점)를 tanh로 눌러 ±OPENING_MAX로 매핑하는 폭
};

// 정확도 A(0~100) → 충분히 긴 대국에서의 레이팅. 단조 증가 구간선형 곡선(임시 — 보정 필요).
export const RA_ANCHORS = [[0, 100], [40, 600], [60, 1100], [75, 1700], [85, 2200], [92, 2700], [97, 3100], [100, 3400]];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function ratingFromAccuracy(acc) {
  const a = clamp(+acc || 0, 0, 100);
  for (let i = 1; i < RA_ANCHORS.length; i++) {
    const [x1, y1] = RA_ANCHORS[i];
    if (a <= x1) { const [x0, y0] = RA_ANCHORS[i - 1]; return y0 + ((y1 - y0) * (a - x0)) / (x1 - x0); }
  }
  return RA_ANCHORS[RA_ANCHORS.length - 1][1];
}

// 진영 하나의 수 목록(analyzeGame의 moves 중 그 진영 것: { kind, lossWinPct })에서 항별 입력 개수를 센다.
// 평가가 안 끝난 수(lossWinPct == null, kind가 book이 아닌 경우)는 증거로 세지 않는다.
export function countSideMoves(sideMoves) {
  const c = { evidence: 0, book: 0, brilliant: 0, only: 0, blunder: 0 };
  for (const m of sideMoves || []) {
    if (!m) continue;
    if (m.kind === "book") { c.book++; continue; }
    if (m.lossWinPct == null) continue;
    c.evidence++;
    if (m.kind === "brilliant") c.brilliant++;
    else if (m.kind === "only") c.only++;
    else if (m.kind === "blunder") c.blunder++;
  }
  return c;
}

// 오프닝 항: entry = [표본 수, 그 포지션을 거친 마스터 대국에서 이 진영 선수들의 평균 레이팅], strength = { globalMean, ... } 전체 평균.
// 표본이 적으면 전체 평균 쪽으로 당겨 우연한 한두 판이 점수를 흔들지 못하게 하고, tanh로 눌러 ±OPENING_MAX를 넘지 못하게 한다.
export function openingTerm(entry, globalMean, p = PERF) {
  if (!entry || !(globalMean > 0)) return 0;
  const [n, mean] = entry;
  if (!(n > 0) || !(mean > 0)) return 0;
  const shrunk = (n * mean + p.OPENING_SHRINK_K * globalMean) / (n + p.OPENING_SHRINK_K);
  return p.OPENING_MAX * Math.tanh((shrunk - globalMean) / p.OPENING_SCALE);
}

/* 퍼포먼스 레이팅 계산. 입력: { acc, counts(countSideMoves 결과), opening }  — opening은 이미 계산된 오프닝 항(없으면 0).
   반환: null(근거 수 0 또는 정확도 없음) | { rating, base, theory, quality, blunder, opening, n }. 모든 항은 화면에 내역으로 보여줄 수 있게 따로 돌려준다. */
export function performanceRating({ acc, counts, opening = 0 }, p = PERF) {
  if (acc == null || !counts || counts.evidence <= 0) return null;
  const w = counts.evidence / (counts.evidence + p.EVIDENCE_K);
  const base = p.FLOOR + (ratingFromAccuracy(acc) - p.FLOOR) * w;
  const theory = p.THEORY_MAX * (1 - Math.exp(-counts.book / p.THEORY_TAU));
  const s = p.W_BRILLIANT * counts.brilliant + p.W_ONLY * counts.only;
  const quality = p.QUALITY_MAX * (1 - Math.exp(-s / p.QUALITY_SCALE));
  const b = counts.blunder;
  const blunder = p.BLUNDER_UNIT * (b + (p.BLUNDER_GROWTH * b * (b - 1)) / 2);
  const o = clamp(opening, -p.OPENING_MAX, p.OPENING_MAX);
  const rating = clamp(base + theory + quality - blunder + o, p.FLOOR, p.CAP);
  return { rating: Math.round(rating), base, theory, quality, blunder, opening: o, n: counts.evidence };
}

/* ── 오프닝 강도 데이터(src/data/openingStrength.json) ──
   형식: { globalMean, entries: { "w:<해시>": [표본 수, 평균 레이팅], "b:<해시>": [...] } }. 해시는 이론 포지션 키(ecoHash(bookPositionKey(fen))).
   scripts/build-opening-strength.mjs가 마스터 대국을 훑어 만든다. 파일이 비어 있으면 오프닝 항은 0이다. */
// 한 대국의 수순에서 "이론 포지션을 지나는 수" 목록 — [{ ply, key }]. key = 그 수를 둔 직후 포지션의 해시. isBookKey(bookPositionKey 문자열)로 이론 여부를 판정한다.
export function bookNodesOfLine(sans, sansToFen, bookPositionKey, ecoHash, isBookKey) {
  const out = [];
  for (let i = 0; i < sans.length; i++) {
    const key = bookPositionKey(sansToFen(sans.slice(0, i + 1)));
    if (!isBookKey(key)) break;          // 이론에서 벗어나면 이후는 보지 않는다(연속 구간만)
    out.push({ ply: i, key: ecoHash(key) });
  }
  return out;
}
// 이 대국에서 side("w"|"b")의 오프닝 항 — 이론을 벗어나기 직전, 가장 깊은 이론 포지션의 통계를 쓴다.
export function openingTermFromLine(nodes, side, strength, p = PERF) {
  if (!nodes || !nodes.length || !strength || !strength.entries) return 0;
  const last = nodes[nodes.length - 1];
  return openingTerm(strength.entries[side + ":" + last.key], strength.globalMean, p);
}
