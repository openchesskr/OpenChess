// (v0.7.7, 사용자 요청) "게임 끝내기"(checkmate) 퍼즐 — 체크메이트 수순의 수를 골라 퍼즐을 만든다. 순수 함수 모음(scripts/check-mate-puzzle.mjs가 검사).
//
// 후보(mateCandidates): 기보 채점 결과(analyzeGame)의 포지션 평가(evalDisp, 백 관점 {mate, win, plies})로 찾는다.
//  · 그 수를 두기 전 포지션에서 둘 차례가 강제 메이트를 갖고(win = 둘 차례), 남은 반수(plies)가 MATE_PUZZLE_MIN_PLIES~MATE_PUZZLE_MAX_PLIES이며,
//  · 실제로 둔 수가 메이트를 이어 갈 때(다음 포지션도 같은 쪽의 메이트이고 남은 반수가 늘지 않음, 또는 그 수가 바로 체크메이트 #).
//  · 연달아 이어지는 후보(같은 쪽이 2반수 간격으로 메이트를 이어 감)는 하나의 "메이트 수순"(seq)으로 묶는다 — 화면이 같은 수순끼리 묶어 보여 주고,
//    아래 중복 방지 규칙이 수순 단위로 동작한다.
//
// 중복 방지 설계(같은 포지션·같은 체크메이트 수순에서 퍼즐이 쏟아지지 않게):
//  ① 최소 길이: 사용자 수 2수(반수 3) 이상 — 메이트 인 1은 퍼즐로 만들지 않는다(가장 흔하고 같은 수순의 꼬리마다 하나씩 생겨난다).
//  ② 수순의 정체성 = 메이트 키(mateKey): 정답 주 라인이 끝나는 체크메이트 포지션(기물 배치 + 차례). 같은 수순의 어느 수에서 시작하든 같은 끝 포지션으로
//     모이므로 같은 키가 된다. 다른 대국이라도 같은 메이트 장면으로 끝나면 같은 키다.
//  ③ 키마다 퍼즐은 최대 MATE_KEY_MAX_PUZZLES개, 그리고 이미 있는 퍼즐보다 "더 긴"(시작이 더 앞선) 수순일 때만 새로 만든다 — 같거나 짧은 수순은
//     기존 퍼즐로 안내한다(mateDuplicateVerdict). 처음 누가 짧은 꼬리(메이트 인 2)를 만들었어도 더 긴 원래 수순(메이트 인 4)은 한 번 더 만들 수 있다.
//  ④ 시작 포지션 키(positionKey) 중복 검사(모든 테마 공통)는 그대로 먼저 돈다.
//  ⑤ 서버(api/puzzle-share.js)가 정답 트리의 모든 끝이 실제 체크메이트인지 chess.js로 다시 두어 확인하고, mateKey·mateLen을 직접 계산해 덮어쓴 뒤
//     같은 키의 기존 퍼즐로 ③을 다시 판정한다 — 브라우저가 키를 속여 중복을 우회할 수 없다.
export const MATE_PUZZLE_MIN_PLIES = 3;     // 사용자 수 2수 = 반수 3(내 수·상대 수·내 수)
export const MATE_PUZZLE_MAX_PLIES = 15;    // 메이트 인 8까지
export const MATE_KEY_MAX_PUZZLES = 2;

/** result: analyzeGame 결과({ evalDisp }), sans: 전체 수순(표준 시작 위치). 반환: [{ ply, san, plies, mateIn, seq }] (ply 오름차순). */
export function mateCandidates(result, sans) {
  const ev = result && result.evalDisp;
  if (!Array.isArray(ev) || !Array.isArray(sans)) return [];
  const out = [];
  for (let i = 0; i < sans.length; i++) {
    const d = ev[i], mover = i % 2 === 0 ? "w" : "b";
    if (!d || d.mate == null || d.win !== mover || !(d.plies > 0)) continue;
    if (d.plies < MATE_PUZZLE_MIN_PLIES || d.plies > MATE_PUZZLE_MAX_PLIES) continue;
    const san = String(sans[i] || "");
    const n = ev[i + 1];
    const keeps = /#$/.test(san) ? true : !!(n && n.mate != null && n.win === mover && n.plies >= 0 && n.plies <= d.plies);
    if (!keeps) continue;
    out.push({ ply: i, san, plies: d.plies, mateIn: Math.ceil(d.plies / 2) });
  }
  // 수순 묶기 — 같은 쪽이 2반수 간격으로 이어 가는 후보는 같은 수순. seq = 그 수순의 첫 후보 ply.
  let seq = null, prev = null;
  for (const c of out) {
    if (!prev || c.ply !== prev.ply + 2) seq = c.ply;
    c.seq = seq; prev = c;
  }
  return out;
}

/** 체크메이트 포지션의 키 — FEN의 기물 배치 + 차례(캐슬링·앙파상·수 번호는 체크메이트 장면의 정체성과 무관). */
export function mateKeyOfFen(fen) {
  const p = String(fen || "").trim().split(/\s+/);
  return p.length >= 2 ? p[0] + " " + p[1] : null;
}

/**
 * 같은 메이트 키의 기존 퍼즐들(existing: [{ mateLen, id }])을 보고 새 퍼즐(newLen: 정답 주 라인의 반수)을 만들어도 되는지.
 * 반환: { ok: true } | { ok: false, reason: "longer_exists" | "cap", existing }
 */
export function mateDuplicateVerdict(existing, newLen) {
  const list = (existing || []).filter((x) => x && Number.isFinite(x.mateLen));
  if (!list.length) return { ok: true };
  const longest = list.reduce((a, b) => (b.mateLen > a.mateLen ? b : a));
  if (longest.mateLen >= newLen) return { ok: false, reason: "longer_exists", existing: longest };
  if (list.length >= MATE_KEY_MAX_PUZZLES) return { ok: false, reason: "cap", existing: longest };
  return { ok: true };
}
