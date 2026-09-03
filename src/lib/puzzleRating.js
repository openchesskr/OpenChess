import { startBoard, plyIsWhite, sanSrc, applySan, parseFenFull } from "./chessRules.js";

// (기능2) 저장 직전 최종 안전장치: setup+solution 전체를 시작 위치부터 다시 재생하며 각 수가
// "그 시점에 둘 차례인 쪽"의 합법수인지 검증한다. 하나라도 어긋나면(불법수·차례 뒤바뀜 등) 저장을 막는다.
export function isSanSequenceValid(setup, solution, fenRoot) {
  try {
    if ((!setup.length && !fenRoot) || !solution.length) return false;
    let board = fenRoot ? fenRoot.board : startBoard();
    let ply = 0;
    for (const san of [...setup, ...solution]) {
      const color = plyIsWhite(ply, fenRoot ? fenRoot.turn : "w") ? "w" : "b";
      const info = sanSrc(board, san, color);
      if (!info) return false;
      board = applySan(board, san, color);
      ply++;
    }
    return true;
  } catch { return false; }
}
// (20차 기능1) 트리 퍼즐 검증 — 통과 불가(표시 전용) 가지를 포함한 모든 가지가 합법 수순이어야 한다.
// (v0.4.1 기능, item 5) fenRoot가 있으면(FEN 기반 사용자 생성 퍼즐) setup이 비어 있어도(=대국 없이
// 그 FEN에서 곧바로 시작) 통과시키고, 표준 시작 위치 대신 fenRoot부터 재생해 검증한다.
export function isTreeSequenceValid(setup, tree, fenRoot) {
  try {
    if ((!setup.length && !fenRoot) || !tree || !(tree.children || []).length) return false;
    let board = fenRoot ? fenRoot.board : startBoard(); let ply = 0;
    for (const san of setup) {
      const c = plyIsWhite(ply, fenRoot ? fenRoot.turn : "w") ? "w" : "b";
      if (!sanSrc(board, san, c)) return false;
      board = applySan(board, san, c); ply++;
    }
    const walk = (node, brd, p) => (node.children || []).every((k) => {
      const c = plyIsWhite(p, fenRoot ? fenRoot.turn : "w") ? "w" : "b";
      if (!k || !k.san || !sanSrc(brd, k.san, c)) return false;
      return walk(k, applySan(brd, k.san, c), p + 1);
    });
    return walk(tree, board, ply);
  } catch { return false; }
}
// (기능1) puzzle.tree(분기 트리)가 있으면 트리 전체를, puzzle.lines(다중 라인)가 있으면 그 라인 전부를,
// 없으면 기존 solution 하나만 검증한다.
export function isPuzzleSequenceValid(pz) {
  const fenRoot = (!pz.setupSans || !pz.setupSans.length) && pz.fen ? parseFenFull(pz.fen) : null;
  const setup = [...(pz.setupSans || []), pz.mistakeSan].filter(Boolean);
  if (pz.tree) {
    if (isTreeSequenceValid(setup, pz.tree, fenRoot)) return true;
    // (v0.4.3 변경, 사용자 요청) 희생 테마(sacrifice) 데이터 형식이 바뀌었다 — mistakeSan은 이제
    // 다른 테마와 같은 뜻("이미 두어진, 방금 응수된 직전 수" — 퍼즐 솔버 인트로가 이 수를 컴퓨터의
    // 응수로 자동 재생한다)이고, 사용자가 실제로 찾아야 할 수(옛 mistakeSan이 가리키던 희생 수
    // 그 자체)는 트리의 첫 수로만 존재한다. 이 변경 전에 만들어진 희생 테마 퍼즐(mistakeSan이 아직
    // "희생 수 자체"인 구버전 데이터 — 예: 대국 분석에서 자동 생성된 퍼즐)도 계속 유효하게 인정하기
    // 위해, 위 새 형식으로 실패하면 구버전 형식(mistakeSan을 setup에서 뺀 채로)으로 한 번 더 시도한다.
    if ((pz.themes || []).includes("sacrifice")) return isTreeSequenceValid(pz.setupSans || [], pz.tree, fenRoot);
    return false;
  }
  const lines = (pz.lines && pz.lines.length) ? pz.lines : [{ tag: "best", solution: pz.solution }];
  return lines.every((l) => isSanSequenceValid(setup, l.solution || [], fenRoot));
}
// (기능) 라인 하나의 평균 실제 풀이 시간(ms, 이상치 제외 후 서버가 집계 — puzzle_line_avg_solve_ms
// RPC)을 정적 기본 레이팅에 가감한다. "이 레이팅대에서 보통 이 정도 걸린다"는 기대 시간
// (expectedSolveMsFromRating) 대비 실제 평균이 얼마나 벗어났는지를 로그 스케일로 반영해(2배 오래
// 걸리면 +300점, 2배 빨리 풀면 -300점, 최대 ±400점) 튀지 않게 완만히 조정한다. 표본이 너무
// 적으면(< RATING_MIN_SAMPLES) 아직 신뢰할 수 없다고 보고 기본 레이팅을 그대로 쓴다.
export const RATING_MIN_SAMPLES = 5;
export function expectedSolveMsFromRating(rating) {
  // 100점대는 8초, 3000점대는 120초 정도 걸릴 거라고 보는 선형 기준선(둘 다 대략적인 경험적 값).
  const sec = 8 + ((rating - 100) / 2900) * 112;
  return sec * 1000;
}
export function applySolveTimeAdjustment(baseRating, avgMs, sampleCount) {
  if (!avgMs || !sampleCount || sampleCount < RATING_MIN_SAMPLES) return baseRating;
  const expected = expectedSolveMsFromRating(baseRating);
  const ratio = avgMs / Math.max(1000, expected);
  const adj = Math.max(-400, Math.min(400, 300 * Math.log2(ratio)));
  return Math.max(100, Math.min(3000, Math.round(baseRating + adj)));
}
// 퍼즐 전체 레이팅 = 모든 라인 레이팅의 평균(라인 레이팅 합 ÷ 라인 수).
export function puzzleAverageRating(lineRatings) {
  if (!lineRatings || !lineRatings.length) return 100;
  return Math.round(lineRatings.reduce((a, b) => a + b, 0) / lineRatings.length);
}
// (v0.4.1 기능, item 3) 사용자 요청 — "체감 레이팅"이 아니라 실제로 오르내리는 공개 퍼즐 레이팅.
// 표준 Elo — 이 퍼즐(라인)의 레이팅을 상대로 놓고, 라인을 끝까지 풀면 승리(1), 틀린 수를 두면
// 그 즉시 그 시도에 대해 패배(0)로 반영한다(한 시도 안에서 여러 번 틀리면 그만큼 여러 번 깎임 —
// 매 수마다 즉시 갱신되므로 다음 패배의 기댓값 계산에는 방금 깎인 레이팅이 그대로 반영된다).
// K=24는 체스 사이트들이 흔히 쓰는 값(라인 레이팅과 100~3000점 척도가 이미 넓어 너무 크게 흔들리지
// 않도록 표준 체스 Elo(K=32)보다 살짝 낮춤)이고, 100~3000은 puzzleLineBaseRating과 같은 척도로 맞춰
// 둘을 곧바로 비교할 수 있게 한다.
export const PUZZLE_RATING_K = 24;
export function puzzleEloExpected(myRating, oppRating) { return 1 / (1 + Math.pow(10, (oppRating - myRating) / 400)); }
export function puzzleEloUpdate(myRating, oppRating, won) {
  const next = myRating + PUZZLE_RATING_K * ((won ? 1 : 0) - puzzleEloExpected(myRating, oppRating));
  return Math.max(100, Math.min(3000, Math.round(next)));
}
