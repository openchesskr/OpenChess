// (v0.6.7) 퍼포먼스 레이팅. 상대 레이팅이랑 상관없이 보드 위에서 둔 수의 질만 보고 매기는 점수.
// FIDE Rp처럼 상대 평균 레이팅이나 득점률은 쓰지 않고, 내 레이팅도 입력에 없다.
//   레이팅 = 기본(S, n) + 이론(T) + 탁월·유일(Q) - 블런더(B) + 오프닝(O), 결과는 [FLOOR, CAP] 안으로 자른다.
//   · S는 수 질 점수(tierScore). 수 등급별 손실을 TIER_CAP으로 잘라 평균 낸 값이라 블런더 한 수가 점수를 너무 깎지 않는다.
//   · n은 평가가 끝난 비이론 수 개수. 많을수록 같은 점수를 오래 유지한 거라 기본값이 곡선 값에 가까워진다.
//   · 이론, 탁월, 유일한 수도 실력으로 본다(사용자 결정). 외운 이론도, 찾기 어려운 수도 점수에 들어간다.
//   · 모든 가감 항에 상한이 있어서 곡선으로 보정한 기본값이 합계의 대부분을 차지한다.
// 곡선(S → 레이팅)은 scripts/calibrate-performance.mjs로 마스터·chess.com 대국을 분석하고
// scripts/fit-performance-curve.mjs로 맞춘 src/data/performanceCurve.json을 쓴다. 곡선이 없으면 아래 RA_ANCHORS(임시값)를 쓰고 결과가 provisional이 된다.
// 곡선으로 실측한 점수 구간(calibratedRange) 밖도 provisional이다. 가감 상한(THEORY_MAX 등)은 보정 대상이 아니라 설계값이다.
// 값을 바꾸면 scripts/check-performance-rating.mjs 검사를 그대로 통과해야 한다.

export const PERF = {
  FLOOR: 100,            // 모델 최저 레이팅(임시값). 점수가 0에 가까운 판의 하한
  CAP: 3500,             // 모델 최고 레이팅(임시)
  SOFT_FLOOR: 40,        // (예전 지표 robustAccuracy용) 수별 정확도 하한. 지금 퍼포먼스 레이팅은 TIER_CAP 지표를 쓴다
  SOFT_POWER: 1,         // (예전 지표용) 거듭제곱 평균 지수. -1 조화평균, 0 기하평균, 1 산술평균
  TIER_CAP: 150,         // tierScore에서 한 수가 깎을 수 있는 최대치. 블런더 한 수의 영향을 줄인다
  POOL_MIN_EVIDENCE: 10, // 여러 판을 합칠 때 평가된 비이론 수가 이보다 적은 판은 뺀다. 너무 짧아서 질을 가릴 수 없다
  EVIDENCE_K: 10,        // w(n) = n / (n + K). n=10이면 0.5, 40이면 0.8
  REF_MOVES: 30,         // R(A)가 맞춰진 기준 대국 길이(비이론 내 수). 곡선 파일의 refMoves가 있으면 그 값을 쓴다. base = FLOOR + (R(A) − FLOOR) · w(n) / w(REF)
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

// 정확도 A(0~100) → 기준 길이 대국에서의 레이팅. 단조 증가 구간선형 곡선. 아래는 곡선 파일이 없을 때 쓰는 임시값(근거 없음)이다.
export const RA_ANCHORS = [[0, 100], [40, 600], [60, 1100], [75, 1700], [85, 2200], [92, 2700], [97, 3100], [100, 3400]];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function ratingFromAccuracy(acc, anchors = RA_ANCHORS) {
  const a = clamp(+acc || 0, 0, 100);
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i];
    if (a <= x1) { const [x0, y0] = anchors[i - 1]; return y0 + ((y1 - y0) * (a - x0)) / (x1 - x0); }
  }
  return anchors[anchors.length - 1][1];
}
// 곡선 파일(src/data/performanceCurve.json)이 실제로 보정된 값인지. 보정 전에는 anchors가 null이다.
export const isCurveCalibrated = (curve) => !!(curve && Array.isArray(curve.anchors) && curve.anchors.length >= 2);

// 예전 지표. 진영 하나의 수 목록(analyzeGame의 moves 중 그 진영 것: { acc })에서 수별 정확도를 하한(floor)과 거듭제곱 평균(power)으로 모은다.
// acc가 null인 수(평가가 끝나지 않은 수)는 뺀다. 이론 수는 acc 100으로 들어가 화면 정확도와 같은 방식으로 섞인다. 반환 null = 평가된 수 없음.
export function robustAccuracy(sideMoves, floor = PERF.SOFT_FLOOR, power = PERF.SOFT_POWER) {
  let n = 0, sum = 0;
  for (const m of sideMoves || []) {
    const a = Array.isArray(m) ? m[1] : m && m.acc;       // 수별 기록 [등급, 정확도, …]도, analyzeGame의 수 객체도 받는다
    if (a == null) continue;
    const v = Math.max(floor, a);
    sum += power === 0 ? Math.log(v) : Math.pow(v, power); n++;
  }
  if (!n) return null;
  const mean = sum / n;
  const s = power === 0 ? Math.exp(mean) : Math.pow(mean, 1 / power);
  return Math.round(clamp(s, 0, 100) * 10) / 10;
}

// 수 질 점수 S(0~100, 클수록 좋음). 퍼포먼스 레이팅의 입력 지표. 평가된 비이론 수마다 등급별 손실 가중치(TIER_LOSS, 최선·유일·탁월 0 ... 블런더 320)를
// 구해 TIER_CAP(150)으로 자른 평균을 100 − 평균 · 100 / TIER_CAP 으로 뒤집는다. 자르기 때문에 블런더 한 수가 점수를 끌어내리는 폭이 제한된다.
// 연구 결과(마스터 + chess.com 래피드, 다판 합산): 같은 판 수에서 화면 정확도식·산술평균보다 레이팅 환산 오차가 작고, 판을 합칠수록 오차가 판 수의 제곱근에 비례해 줄어든다.
// 입력은 진영 하나의 수 목록. analyzeGame의 수 객체({ kind, lossWinPct })도, 수별 기록 [등급, 정확도, 손실승률, 날카로움]도 받는다. 이론 수와 평가 안 끝난 수(손실 null)는 뺀다. 평가된 수가 없으면 null.
export const TIER_LOSS = { best: 0, only: 0, brilliant: 0, excellent: 22, good: 52, inaccuracy: 85, mistake: 150, blunder: 320, miss: 120 };
export function tierScore(sideMoves, cap = PERF.TIER_CAP) {
  let n = 0, sum = 0;
  for (const m of sideMoves || []) {
    if (!m) continue;
    const kind = Array.isArray(m) ? m[0] : m.kind, loss = Array.isArray(m) ? m[2] : m.lossWinPct;
    if (kind === "book" || loss == null) continue;
    sum += Math.min(cap, TIER_LOSS[kind] ?? 50); n++;
  }
  if (!n) return null;
  return Math.round(clamp(100 - (sum / n) * (100 / cap), 0, 100) * 10) / 10;
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

// 시간 규정 보정. 곡선은 chess.com 래피드 대국(주로 10분)으로 맞췄고, 마스터 클래시컬 대국은 같은 레이팅에서 지표가 δ(곡선 파일 fit.model.delta)만큼 높게 나온다.
//  · 래피드: 보정 없음 · 스탠다드(30분 이상): 클래시컬로 보고 지표에서 δ를 뺀다
//  · 블리츠·불릿·일일: 보정 자료가 없어 provisional  · 시간 규정을 모르면: 양쪽 2300+ 레이팅(마스터 대회 대국)만 클래시컬로 보고, 그 외는 provisional
// 마스터 대회 중에는 래피드·블리츠 대회도 있어 클래시컬로 잘못 볼 수 있다(대회 표본의 대부분은 클래시컬).
export function timeProfile(game, curve) {
  const delta = curve && curve.fit && curve.fit.model && curve.fit.model.delta;
  const d = delta > 0 ? delta : 0;
  const tc = game && game.timeClass;
  if (tc === "rapid") return { shift: 0, provisional: false };
  if (tc === "standard") return { shift: d, provisional: d === 0 };
  if (tc) return { shift: 0, provisional: true };
  const wr = game && game.white && game.white.rating, br = game && game.black && game.black.rating;
  if (d > 0 && wr >= 2300 && br >= 2300) return { shift: d, provisional: false };
  return { shift: 0, provisional: true };
}

/* 퍼포먼스 레이팅 계산. 입력: { acc(수 질 점수 S), counts(countSideMoves 결과), opening, timeShift, forceProvisional }. opening은 이미 계산된 오프닝 항(없으면 0),
   timeShift는 timeProfile의 shift(지표에서 빼는 값), forceProvisional은 timeProfile의 provisional.
   curve: 곡선 파일 내용(없거나 보정 전이면 임시 앵커). provisional = 곡선이 보정 전이거나 정확도가 실측 구간(calibratedRange) 밖.
   반환: null(근거 수 0 또는 정확도 없음) | { rating, base, time, theory, quality, blunder, opening, n, provisional }. 모든 항은 화면에 내역으로 보여줄 수 있게 따로 돌려준다. */
export function performanceRating({ acc, counts, opening = 0, timeShift = 0, forceProvisional = false }, p = PERF, curve = null) {
  if (acc == null || !counts || counts.evidence <= 0) return null;
  const cal = isCurveCalibrated(curve);
  const anchors = cal ? curve.anchors : RA_ANCHORS;
  const ref = cal && curve.refMoves > 0 ? curve.refMoves : p.REF_MOVES;
  const w = counts.evidence / (counts.evidence + p.EVIDENCE_K), wRef = ref / (ref + p.EVIDENCE_K);
  const range = cal && Array.isArray(curve.calibratedRange) ? curve.calibratedRange : null;
  const accAdj = acc - (timeShift > 0 ? timeShift : 0);     // 시간 규정 보정 후 지표
  const provisional = forceProvisional || !cal || (range ? accAdj < range[0] || accAdj > range[1] : true);
  const baseAt = (a) => p.FLOOR + (ratingFromAccuracy(a, anchors) - p.FLOOR) * (w / wRef);
  const base = baseAt(acc), time = baseAt(accAdj) - base;   // time ≤ 0: 시간 규정 보정이 깎은 양(내역 표의 별도 행)
  const theory = p.THEORY_MAX * (1 - Math.exp(-counts.book / p.THEORY_TAU));
  const s = p.W_BRILLIANT * counts.brilliant + p.W_ONLY * counts.only;
  const quality = p.QUALITY_MAX * (1 - Math.exp(-s / p.QUALITY_SCALE));
  const b = counts.blunder;
  const blunder = p.BLUNDER_UNIT * (b + (p.BLUNDER_GROWTH * b * (b - 1)) / 2);
  const o = clamp(opening, -p.OPENING_MAX, p.OPENING_MAX);
  const rating = clamp(base + time + theory + quality - blunder + o, p.FLOOR, p.CAP);
  return { rating: Math.round(rating), base, time, theory, quality, blunder, opening: o, n: counts.evidence, provisional };
}

/* ── 오프닝 강도 데이터(src/data/openingStrength.json) ──
   형식: { globalMean, entries: { "w:<해시>": [표본 수, 평균 레이팅], "b:<해시>": [...] } }. 해시는 이론 포지션 키(ecoHash(bookPositionKey(fen))).
   scripts/build-opening-strength.mjs가 마스터 대국을 훑어 만든다. 파일이 비어 있으면 오프닝 항은 0이다. */
// 한 대국의 수순에서 "이론 포지션을 지나는 수" 목록 [{ ply, key }]. key = 그 수를 둔 직후 포지션의 해시. isBookKey(bookPositionKey 문자열)로 이론 여부를 판정한다.
export function bookNodesOfLine(sans, sansToFen, bookPositionKey, ecoHash, isBookKey) {
  const out = [];
  for (let i = 0; i < sans.length; i++) {
    const key = bookPositionKey(sansToFen(sans.slice(0, i + 1)));
    if (!isBookKey(key)) break;          // 이론에서 벗어나면 이후는 보지 않는다(연속 구간만)
    out.push({ ply: i, key: ecoHash(key) });
  }
  return out;
}
// 이 대국에서 side("w"|"b")의 오프닝 항. 이론에서 벗어나기 직전 가장 깊은 이론 포지션의 통계를 쓴다.
export function openingTermFromLine(nodes, side, strength, p = PERF) {
  if (!nodes || !nodes.length || !strength || !strength.entries) return 0;
  const last = nodes[nodes.length - 1];
  return openingTerm(strength.entries[side + ":" + last.key], strength.globalMean, p);
}

/* 여러 판 합산 퍼포먼스 레이팅(프로필 "최근 N판"). games: [{ moves(내 진영의 수 목록), opening, timeShift, forceProvisional }].
   점수 S는 모든 판의 수를 한꺼번에 모아 계산하고(판별 점수의 평균과 거의 같은 오차), 판 길이·이론·탁월·블런더·오프닝 항은 판마다 계산해서 평균 낸다.
   합친 수 개수 전체를 "한 판의 길이"로 세면 길이 보너스가 부풀기 때문이다. 너무 짧은 판(POOL_MIN_EVIDENCE 미만)은 뺀다.
   반환: null(쓸 수 있는 판 없음) | { rating, base, time, theory, quality, blunder, opening, n(판 평균 근거 수), games(반영한 판 수), provisional }. */
export function pooledPerformance(games, p = PERF, curve = null) {
  const use = (games || []).map((g) => ({ ...g, counts: countSideMoves(g.moves) })).filter((g) => g.counts.evidence >= p.POOL_MIN_EVIDENCE);
  if (!use.length) return null;
  const S = tierScore(use.flatMap((g) => g.moves), p.TIER_CAP);
  if (S == null) return null;
  const rs = use.map((g) => performanceRating({ acc: S, counts: g.counts, opening: g.opening || 0, timeShift: g.timeShift || 0, forceProvisional: !!g.forceProvisional }, p, curve));
  const avg = (k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
  return { rating: Math.round(avg("rating")), base: avg("base"), time: avg("time"), theory: avg("theory"), quality: avg("quality"), blunder: avg("blunder"), opening: avg("opening"), n: avg("n"), games: use.length, score: S, provisional: rs.some((r) => r.provisional) };
}
