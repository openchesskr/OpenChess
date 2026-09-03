import {
  canMove, exposesKing, sanSrc, applySan, kingPos, isAttacked, plyIsWhite, boardOfRoot,
} from "./chessRules.js";

export const PIECE_VAL_MAT = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
export function materialDiff(board, color) {
  let d = 0;
  for (const row of board) for (const p of row) if (p) d += (p.c === color ? 1 : -1) * PIECE_VAL_MAT[p.t];
  return d;
}
// (15차 추가) 마이너 기물이 시작 칸에서 잡지도/체크도 아니게 그냥 나오는 수(전개하는 수) 또는 캐슬링 —
// 잡거나 외통을 부르는 게 아니라면 전술적으로 배울 게 없는 수이므로, 이런 수 앞에서 퍼즐 라인을 끊는다.
export const MINOR_HOME_SQUARES = new Set(["b1", "g1", "c1", "f1", "b8", "g8", "c8", "f8"]);
export function isDevelopingMove(uci, san) {
  if (san === "O-O" || san === "O-O-O") return true;
  if (san.includes("x") || san.includes("+") || san.includes("#")) return false;
  return MINOR_HOME_SQUARES.has((uci || "").slice(0, 2));
}

/* ============================================================ 기물 가치 · 희생 · 합법수 · SAN 생성 ============================================================ */
export const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100 };
export function enemyMinAttacker(board, r, c, byColor) {
  let min = null;
  for (let pr = 0; pr < 8; pr++) for (let pc = 0; pc < 8; pc++) {
    const p = board[pr][pc];
    if (!p || p.c !== byColor) continue;
    if (canMove(board, p.t, byColor, pr, pc, r, c, true)) { const v = VAL[p.t]; if (min == null || v < min) min = v; }
  }
  return min;
}
export function ownDefenders(board, r, c, color) {
  let n = 0;
  for (let pr = 0; pr < 8; pr++) for (let pc = 0; pc < 8; pc++) {
    const p = board[pr][pc];
    if (!p || p.c !== color || (pr === r && pc === c)) continue;
    if (canMove(board, p.t, color, pr, pc, r, c, true)) n++;
  }
  return n;
}
/* ── 정적 교환 평가(SEE, Static Exchange Evaluation) ──
   한 칸에서 일어나는 연속 교환을 '최소 가치 공격자' 규칙으로 끝까지 풀어
   side(둘 차례)가 그 칸을 공격해서 얻는 순이득(≥0)을 반환한다.
   보드를 실제로 복제·이동하며 풀기 때문에 슬라이딩 기물의 x-ray(가려졌다 열리는 공격)가 자연히 반영된다. */
// (20차) 기하학적으로는 그 칸을 공격하는 것처럼 보여도, 그 기물이 핀에 걸려 있어(자신의 킹이
// 체크에 노출되어) 실제로는 그 수를 둘 수 없다면 진짜 공격자가 아니다 — exposesKing으로 걸러낸다.
// (예: ...Bb4+에 Nc3로 막은 뒤 상대가 e4를 잡아도, 핀에 걸린 Nc3는 되잡을 수 없다.)
export function lva(board, tr, tc, side) {
  let best = null;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]; if (!p || p.c !== side) continue;
    let can;
    if (p.t === "P") { const dir = side === "w" ? -1 : 1; can = (tr - r === dir && Math.abs(tc - c) === 1); }
    else if (p.t === "K") can = Math.abs(tr - r) <= 1 && Math.abs(tc - c) <= 1;
    else can = canMove(board, p.t, side, r, c, tr, tc, true);
    if (can && exposesKing(board, r, c, tr, tc, side, null)) can = false;
    if (can && (best == null || VAL[p.t] < best.val)) best = { r, c, t: p.t, val: VAL[p.t] };
  }
  return best;
}
export function seeSquare(board, tr, tc, side) {
  const occ = board[tr][tc]; if (!occ) return 0;        // 잡을 대상이 없으면 0
  const att = lva(board, tr, tc, side); if (!att) return 0;
  const b = board.map((row) => row.slice());
  b[tr][tc] = { c: side, t: att.t }; b[att.r][att.c] = null;   // 최소 가치 공격자로 잡음
  const gain = VAL[occ.t] - seeSquare(b, tr, tc, side === "w" ? "b" : "w");
  return Math.max(0, gain);                              // 손해면 잡지 않음(=0)
}
// (기능) 도착 칸을 아군 폰이 지키고 있는지 — seeSquare의 되잡기 순서상 폰은 항상 가장 싼(=최우선)
// 방어자라, 이 칸에 폰의 보호가 있다면 그 되잡기는 이미 seeSquare 계산에 실제로 반영돼 있다. 이
// 함수는 그 보호 여부 자체를 따로 확인해, "동가 이상 상대에게 잡혀도 결국 폰으로 되잡는" 자리인지
// isSacrifice가 판단하는 데 쓴다(핀에 걸려 실제로는 되잡을 수 없는 폰은 제외).
export function pawnDefendsSquare(board, r, c, color) {
  const dir = color === "w" ? -1 : 1;
  for (let cc = c - 1; cc <= c + 1; cc += 2) {
    if (cc < 0 || cc > 7) continue;
    const rr = r - dir; if (rr < 0 || rr > 7) continue;
    const p = board[rr][cc];
    if (p && p.c === color && p.t === "P" && !exposesKing(board, rr, cc, r, c, color, null)) return true;
  }
  return false;
}
/* 진짜 '희생'인가: 폰 제외, 이 수로 인해 정적 교환상 실질 손실(≥1점)이 발생하는 경우만.
   (예: ...Bb4+ 차단용 Nbd2/Nc3/Bd2 는 동가치 교환이라 SEE 손실 0 → 희생 아님)
   (기능4) 임계값을 -2에서 -1로 완화: 예를 들어 "비숍을 폰 두 개와 교환"하는 유명한
   교환 희생 패턴(예: Sicilian ...Nbd7 이후 Bxe6)은 SEE상 순손실이 정확히 -1로 계산되는데
   (3 - 2 = -1, 비숍 값 3을 내주고 폰 두 개(1+1)를 되찾는 구조), 기존 <= -2 기준으로는
   이런 흔하고 중요한 교환 희생이 전부 걸러지지 않고 탁월한 수 판정에서 빠졌었다. */
// (16차) SEE(seeSquare)는 순수 기하학적 공격 가능 여부만 보고 "체크로 인해 그 수를 둘 수 없는" 상황(더블체크 등)은
// 반영하지 못한다. 그 칸을 실제로 둘 차례가 된 쪽이 "합법적으로" 잡을 수 있는지(exposesKing으로 체크 해소 여부까지) 확인한다.
export function canCaptureSquareLegally(board, tr, tc, side) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]; if (!p || p.c !== side) continue;
    let can;
    if (p.t === "P") { const dir = side === "w" ? -1 : 1; can = (tr - r === dir && Math.abs(tc - c) === 1); }
    else if (p.t === "K") can = Math.abs(tr - r) <= 1 && Math.abs(tc - c) <= 1;
    else can = canMove(board, p.t, side, r, c, tr, tc, true);
    if (can && !exposesKing(board, r, c, tr, tc, side, null)) return true;
  }
  return false;
}
// (기능) canCaptureSquareLegally와 같은 조건이되, 있는지 없는지가 아니라 합법적으로 이 칸을 잡을 수
// 있는 내 기물이 몇 개인지 센다 — 되잡기(recaptureFact)가 "대안이 없어 직관적으로 명백한 수"인지
// (후보가 정확히 1개) 판정하는 데 쓴다.
export function countLegalCapturesOnSquare(board, tr, tc, side) {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]; if (!p || p.c !== side) continue;
    let can;
    if (p.t === "P") { const dir = side === "w" ? -1 : 1; can = (tr - r === dir && Math.abs(tc - c) === 1); }
    else if (p.t === "K") can = Math.abs(tr - r) <= 1 && Math.abs(tc - c) <= 1;
    else can = canMove(board, p.t, side, r, c, tr, tc, true);
    if (can && !exposesKing(board, r, c, tr, tc, side, null)) n++;
  }
  return n;
}
// (16차→18차) color 진영 기물 중, 상대가 다음 수에 잡아 실질 손실(≥1)을 낼 수 있는 기물이 있는지 — 있다면 그 최대 손실값과 그 칸(sq).
// (18차) SEE 기하학 계산만으론 "체크 중이라 위협을 실행할 수 없는" 경우(예: Bxf7+ 이후 Qxg5는 체크 방치라 불법)를
// 걸러내지 못해 탁월 오탐의 원인이 됐다 — 실제로 그 칸을 합법적으로 잡을 수 있을 때만 위협으로 인정한다.
// (20차) skip: 집계에서 제외할 칸 — 방금 이동한 기물의 도착 칸을 빼기 위해 사용(그 칸의 손익은 net에서 별도 계산).
// (v0.2.3) 칸 좌표(sq)까지 돌려주도록 확장 — attacksPricierIndependent가 "그 방치된 칸을 상대의
// 반격 기물이 한 수로 같이 잡을 수 있는지"를 판정하려면 손실값뿐 아니라 정확한 칸 좌표가 필요하다.
export function hangingLossSq(board, color, skip) {
  const enemy = color === "w" ? "b" : "w";
  let maxLoss = 0, sq = null;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (skip && skip[0] === r && skip[1] === c) continue;
    const p = board[r][c]; if (!p || p.c !== color || p.t === "K") continue;
    const gain = seeSquare(board, r, c, enemy);
    if (gain > maxLoss && canCaptureSquareLegally(board, r, c, enemy)) { maxLoss = gain; sq = [r, c]; }
  }
  return { loss: maxLoss, sq };
}
// (21차) 내 기물이 걸려 있는 걸 방치한 수라도, 그 대신 그보다 더 비싼 상대 기물을 진짜로(=이 교환이
// 나에게 순이득인) 위협했다면 — 도망 대신 반격을 택한 찾기 어려운 수이므로 탁월로 인정하기 위한 판정.
// 단순히 기하학적으로 노리는 것만으론 부족하고(예: 똑같이 되잡혀 동가교환이면 진짜 위협이 아님),
// SEE상 순이득(> 0)이 나야 "진짜 위협"으로 센다.
export function attacksPricier(board, color, minVal) {
  const enemy = color === "w" ? "b" : "w";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]; if (!p || p.c !== enemy || p.t === "K") continue;
    if (VAL[p.t] > minVal && seeSquare(board, r, c, color) > 0) return true;
  }
  return false;
}
// (v0.2.3 버그 수정) 방치된 내 기물(hangSquare)과 가치가 같거나 더 높은 상대 기물을 안전하게
// (다음 수에 잡히지 않게) 반격 위협하더라도, 그 상대 기물이 "도망가면서 동시에" 방치된 내 기물을
// 잡을 수 있다면(예: 9.d5로 나이트 e5의 보호가 풀리는 동시에 그 나이트 바로 옆 퀸도 위협받는 경우,
// 퀸은 도망감과 동시에 Qxe5로 나이트를 그대로 챙길 수 있어 진짜 반격이 아니다) 상대 입장에서 아무
// 대가 없이 두 문제를 한 수로 해결하는 것이므로 진짜 맞대응이 아니다 — 이런 경우는 반격으로 치지
// 않고(true를 돌려줘) 희생 판정이 그대로 유지되게 한다. 반대로 반격 기물이 방치된 칸에 닿지 못해
// 상대가 정말로 "방치된 기물을 포기하고 반격에 응할지, 반격을 무시하고 방치된 기물을 챙길지" 양자
//택일해야 한다면(예: 36...Rfb8 — 방치된 나이트 d5와 반격당하는 비숍 b3가 서로 다른 칸이라 백이
// 한 수로 둘 다 해결할 수 없고, 결국 동가 맞교환으로 귀결) 이는 자연스러운 맞교환 제안일 뿐 찾기
// 어려운 진짜 희생이 아니므로 false를 돌려준다.
export function attacksPricierIndependent(board, color, minVal, hangSquare) {
  const enemy = color === "w" ? "b" : "w";
  const [hr, hc] = hangSquare;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]; if (!p || p.c !== enemy || p.t === "K") continue;
    if (VAL[p.t] < minVal || seeSquare(board, r, c, color) <= 0) continue;
    let canReachHang;
    if (p.t === "P") { const dir = enemy === "w" ? -1 : 1; canReachHang = (hr - r === dir && Math.abs(hc - c) === 1); }
    else canReachHang = canMove(board, p.t, enemy, r, c, hr, hc, true);
    if (!canReachHang) return true;
  }
  return false;
}
// (v0.2.6 기능) 어떤 기물이 위협받는 상태에서 다른 칸으로 옮겨서도 여전히 위협받는 것처럼 보일 때,
// 그 기물이 이동 가능한 다른 칸들 중 전혀 위협받지 않는 완전히 안전한 칸이 하나라도 있었는지 확인한다.
// 그런 칸이 있었는데도 굳이 위협받는 칸을 골랐다면 "몰려서 어쩔 수 없이" 둔 게 아니다(isSacrifice 참고).
export function hasSaferSquare(board, fr, fc, piece, color) {
  const enemy = color === "w" ? "b" : "w";
  for (let tr = 0; tr < 8; tr++) for (let tc = 0; tc < 8; tc++) {
    if (tr === fr && tc === fc) continue;
    const occ = board[tr][tc];
    if (occ && occ.c === color) continue;
    if (!canMove(board, piece, color, fr, fc, tr, tc, !!occ)) continue;
    if (exposesKing(board, fr, fc, tr, tc, color, null)) continue;
    const b2 = board.map((row) => row.slice());
    b2[tr][tc] = b2[fr][fc]; b2[fr][fc] = null;
    let oppGain = seeSquare(b2, tr, tc, enemy);
    const ekp = kingPos(b2, enemy);
    if (oppGain > 0 && ekp && isAttacked(b2, ekp[0], ekp[1], color) && !canCaptureSquareLegally(b2, tr, tc, enemy)) oppGain = 0;
    if (oppGain === 0) return true;
  }
  return false;
}
// (v0.4.0 기능) side 진영 기물 p(er,ec에 위치)가 (tr,tc)를 공격하는지 — 기하학적 공격 패턴만 보고
// (체크 노출 등 합법성은 따지지 않는다) 포크 판정에 쓴다.
export function attacksSquare(board, p, side, er, ec, tr, tc) {
  if (p.t === "P") { const dir = side === "w" ? -1 : 1; return tr - er === dir && Math.abs(tc - ec) === 1; }
  if (p.t === "K") return Math.abs(tr - er) <= 1 && Math.abs(tc - ec) <= 1;
  return canMove(board, p.t, side, er, ec, tr, tc, true);
}
// (v0.4.0 기능, 사용자 요청) 포크(상대 기물 하나가 아군 기물 두 개를 동시에 공격하는 것 — 그중
// 한쪽이 킹이어서 체크와 동시에 다른 기물도 위협받는 경우까지 포함)에서, 방치되어 실제로 잡히는
// 기물((hr,hc), 즉 afterHang 자리)과 함께 공격받던 "다른 쪽" 기물을 이 수가 이동·보호·차단으로
// 실제로 구해냈다면 — 애초에 포크로 둘 다 구할 방법이 없었으니 더 비싼 쪽을 살리는 당연한 선택(또는
// 체크에 대한 강제 응수)일 뿐, 스스로 찾아낸 희생이 아니므로 탁월한 수로 치지 않는다.
export function forkForcedTheOtherSide(board, after, color, fr, fc, tr, tc, hr, hc) {
  const enemy = color === "w" ? "b" : "w";
  for (let er = 0; er < 8; er++) for (let ec = 0; ec < 8; ec++) {
    const p = board[er][ec]; if (!p || p.c !== enemy) continue;
    if (!attacksSquare(board, p, enemy, er, ec, hr, hc)) continue;
    for (let r2 = 0; r2 < 8; r2++) for (let c2 = 0; c2 < 8; c2++) {
      if (r2 === hr && c2 === hc) continue;
      const q = board[r2][c2]; if (!q || q.c !== color) continue;
      if (!attacksSquare(board, p, enemy, er, ec, r2, c2)) continue;
      // (er,ec)가 (hr,hc)와 (r2,c2) 둘을 동시에 공격하는 포크 — (r2,c2)가 바로 이번 수로 이동한
      // 기물 자신(fr,fc)이라면 그 새 도착 칸(tr,tc)에서 안전해졌는지 확인한다.
      const nr = (r2 === fr && c2 === fc) ? tr : r2;
      const nc = (r2 === fr && c2 === fc) ? tc : c2;
      if (q.t === "K") { if (!isAttacked(after, nr, nc, enemy)) return true; }
      else if (seeSquare(after, nr, nc, enemy) === 0) return true;
    }
  }
  return false;
}
export function isSacrifice(board, sanRaw, color) {
  const info = sanSrc(board, sanRaw, color);
  if (!info) return false;
  const [fr, fc] = info.from;
  const [tr, tc] = info.to;
  const capturedVal = info.isCap ? (board[tr][tc] ? VAL[board[tr][tc].t] : 1) : 0;
  const after = applySan(board, sanRaw, color);
  const enemy = color === "w" ? "b" : "w";
  let oppGain = seeSquare(after, tr, tc, enemy);       // 상대가 이 칸에서 얻는 순이득(기하학적 계산)
  // (16차) 상대가 체크 상태라 체크를 해소하며 이 칸을 잡는 수가 하나도 legal하지 않다면(더블체크로 반드시
  // 킹을 움직여야 하는 경우 등), 실제로는 되잡을 수 없으므로 순이득을 0으로 취급한다.
  const ekp = kingPos(after, enemy);
  if (oppGain > 0 && ekp && isAttacked(after, ekp[0], ekp[1], color) && !canCaptureSquareLegally(after, tr, tc, enemy)) oppGain = 0;
  const net = capturedVal - oppGain;                     // 내 관점 순손익
  // (18차) 움직인 기물이 두기 전부터 이미 잡힐 위협(SEE 손실)에 놓여 있었다면 — 포크에 걸려 어쩔 수 없이
  // 기물을 내주는 수(예: 6.Bd3)나, 상대의 탁월한 수로 이미 예정된 손실을 되돌려주는 수(예: 6.Bxd5)일 뿐이므로
  // "찾아내기 어려운 비직관적 희생"이 아니다.
  const movedThreatLoss = seeSquare(board, fr, fc, enemy);
  // (v0.2.3 버그 수정) 이동한 기물이 두기 전부터 이미 잡힐 위협에 놓여 있었더라도(movedThreatLoss>=1),
  // 그 손실을 그대로 실현하는 수가 "체크"까지 동반한다면(예: 36.Nh6+ — 이미 Rf8에 공격받던 나이트를
  // 그냥 내주는 수지만 체크로 상대 응수를 강제해 뒤이은 콤비네이션의 발판이 됨) 이는 그냥 예정된
  // 손실을 수동적으로 받아들이는 것이 아니라 능동적으로 그 손실을 이용하는 수이므로 예외로 둔다.
  const givesCheck = /[+#]/.test(sanRaw);
  // (버그 수정) 예전엔 캐슬링·폰 이동이면 이 함수 맨 위에서 곧장 false를 반환해, 아래 "방치 희생"
  // (이동한 기물과는 무관하게, 상대가 이미 공격 중인 다른 내 기물을 그대로 두고 다른 수를 두는 것)
  // 판정까지 통째로 막고 있었다. 예: "1.e4 e5 2.Nf3 Nc6 3.Bc4 h6 4.d4 d6 5.dxe5 dxe5 6.Qxd8+ Nxd8
  // 7.Nxe5 Be6 8.Bb5+ c6 9.Be2 f6 10.Ng6 Rh7 11.Nxf8 Kxf8 12.b3 Nf7 13.Bb2 f5 14.Nd2 fxe4 15.Nxe4
  // Bf5"에서 흑 비숍이 백 나이트 e4를 공짜로 위협하는데도 16.O-O-O(캐슬링)로 그 나이트를 그대로
  // 방치하는 수, 그리고 "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Bxc6 dxc6 5.O-O Bg4 6.h3"에서 비숍 g4가
  // 걸렸는데도(대신 잡아주는 나이트가 없는 라인) 6...h5(폰 이동, h파일을 여는 것이 목적)로 응수하는
  // 수는 둘 다 전형적인 방치 희생인데, 이동한 기물이 각각 킹(캐슬링)·폰이라는 이유만으로 판정이
  // 시작도 못 하고 있었다. "직접 희생"(이동한 기물 자신이 잡히는 교환)만 캐슬링·폰 이동을
  // 제외하고(캐슬링은 그 자체로 기물이 잡히는 자리로 옮기는 수가 아니고, 폰을 흔히 내주는 수는
  // 탁월로 치지 않는다는 기존 취지는 그대로 유지), 아래 "방치 희생" 판정은 이동한 기물 종류와
  // 무관하게 항상 수행한다.
  // (버그 수정) 18차에서 "폰 희생 제외 원칙"에 맞춘다며 임계값을 -1에서 -2로 되돌렸는데, 폰 희생
  // 제외는 이미 위(info.piece === "P")에서 움직인 기물 자체로 걸러지고 있어 이 강화는 불필요했다.
  // 오히려 net===-1로 정확히 떨어지는 "비숍/나이트를 폰 두 개와 맞바꾸는" 대표적 교환 희생 패턴
  // (예: 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Bc4 e6 7.O-O Nbd7 8.Bxe6 — 비숍(3)을
  // 내주고 폰 두 개(1+1)를 되찾아 net=1-2=-1)가 다시 걸러지지 않게 되는 회귀를 만들었다. 바로 위
  // 블록(기능4) 주석이 설명하는 원래 의도대로 -1로 되돌린다.
  if (!info.castle && info.piece !== "P" && net <= -1) {
    // (v0.2.6 버그 수정) 예전엔 이 기물이 이동 전부터 이미 위협받고 있었고(movedThreatLoss>=1) 새로
    // 옮긴 칸의 손실도 그보다 크지 않으면(net>=-movedThreatLoss) 무조건 "예정된 손실을 그대로
    // 실현할 뿐"으로 보고 희생 판정에서 제외했다. 하지만 이 기물이 갈 수 있었던 다른 칸 중 전혀
    // 위협받지 않는 완전히 안전한 칸이 있었는데도 굳이 위협받는 것처럼 보이는 이 칸을 골랐다면
    // (예: 24.Re1 — 퀸에게 물리던 룩이 Rd1·Rf1 같은 완전 안전지대 대신 상대 룩과 마주보는 e1로
    // 피신. 겉보기엔 또 잡히는 자리 같지만 실제로 Rxe1을 받아주면 백랭크 메이트 함정이라 안전함)
    // 이는 몰려서 어쩔 수 없이 둔 게 아니라 스스로 위험해 보이는 자리로 걸어 들어간 것이므로, 정말
    // 안전한 대안이 하나도 없었을 때만(포크 등으로 진짜 궁지에 몰린 경우) 희생 판정에서 제외한다.
    if (movedThreatLoss >= 1 && net >= -movedThreatLoss && !givesCheck && !hasSaferSquare(board, fr, fc, info.piece, color)) return false;
    // (신규) 도착 칸이 아군 폰에게 보호받고 있어 net이 정확히 -1로만 떨어지는 경우 — 이는 seeSquare가
    // 이미 그 폰의 되잡기까지 반영해 계산한 결과이므로, 실제로 벌어지는 일은 "동가 이상 상대 기물과
    // 맞바꾼 뒤(순손익 0), 그 되잡은 폰마저 결국 내주는" 흐름뿐이다. 최종적으로 잡히는 내 기물이
    // 폰 하나뿐이라 기존 탁월한 수 규칙이 요구하는 실질적인 기물 손해(net<=-2)에 못 미치므로,
    // 탁월한 수로 치지 않는다. (net<=-2로 더 크게 손해라면 폰 이상의 진짜 희생이므로 그대로 인정.)
    if (net === -1 && pawnDefendsSquare(board, tr, tc, color)) return false;
    return true;
  }
  // (16차) 이 수 자체가 기물을 잡히는 칸으로 옮기지 않아도, 상대가 이미 걸고 있던 기물 잡는 위협을
  // (더 급한 수를 두느라) 그대로 무시했다면 — 그 역시 탁월한 수로 본다. (18차) 임계값도 2점 이상으로 강화.
  // (20차) afterHang은 방금 이동한 기물의 도착 칸을 제외하고 집계한다 — 그 칸의 손익은 위의 net(capturedVal-oppGain)이
  // 이미 정확히 계산했으므로, 동가 교환(net=0)인 잡는 수가 "기물을 방치했다"로 이중 집계돼 탁월 오탐을 내는 것을 막는다
  // (예: 이탈리안에서 ...Nxf3+ — 나이트 교환+체크일 뿐인데 b4에 잡히는 Bc5와 f3 나이트가 함께 집계돼 희생으로 오판).
  // (v0.2.3 버그 수정) 예전엔 beforeHang>=2까지 함께 요구해, 이 수를 두기 전에는 전혀 위험하지
  // 않았다가 "이 수 자체가 자신의 보호자를 옮겨서" 처음으로 다른 내 기물이 방치되는 패턴(예: 9.d5 —
  // d4 폰이 지키던 나이트 e5가 폰이 전진하며 보호를 잃고 새로 걸림, beforeHang=0)을 전혀 잡아내지
  // 못했다. beforeHang 조건을 없애고 afterHang>=2만으로 판정한다 — beforeHang은 더 이상 필요 없다.
  const { loss: afterHang, sq: afterHangSq } = hangingLossSq(after, color, [tr, tc]);
  if (afterHang >= 2) {
    // (v0.4.0 기능, 사용자 요청) 방치되는 기물(afterHangSq)이 애초에 다른 아군 기물(킹 포함, 즉
    // 체크당하며 함께 위협받던 경우도 포함)과 함께 포크당한 것이었고, 이 수가 그 "다른 쪽" 기물을
    // 구해낸 것뿐이라면 — 둘 다 지킬 수 없던 포크의 당연한 귀결이지 스스로 찾아낸 희생이 아니므로
    // 탁월한 수로 치지 않는다.
    if (forkForcedTheOtherSide(board, after, color, fr, fc, tr, tc, afterHangSq[0], afterHangSq[1])) return false;
    // (22차, 사용자 요청) 사잇수(zwischenzug) 예외 — 이 수 자체가 방치된 기물(afterHang)과 같거나
    // 더 비싼 상대 기물을 잡는 수라면, 방금 움직인 내 기물이 곧바로 되잡혀 net이 깎이더라도 희생이
    // 아니다: 상대가 그 되잡기에 응수를 쓰면 그 사이 나는 다음 수에 원래 걸려 있던 기물을 그대로
    // 피하면 되고, 상대가 되잡는 대신 방치된 기물을 곧장 챙기더라도 나는 이미 그 이상의 가치를
    // 상대에게서 받아낸 뒤이므로, 어느 쪽이든 결국 기물 점수 손해를 보지 않는다. 그래서 net(되잡힘
    // 손실까지 뺀 값)이 아니라 이 수가 실제로 잡은 원값(capturedVal)만 afterHang과 비교한다.
    if (info.isCap && capturedVal >= afterHang) return false;
    // (20차) 희생의 기본 정의는 "실질 손실"이다. 이 수 자체가 잡은 순이득(net)이 방치한 기물 손실(afterHang)을
    // 상쇄하고 남는다면(예: 1.e4 e5 2.d4 exd4 3.Qxd4 Nc6 4.Qd5 Nf6 5.Qf5 d5 6.exd5 Bxf5 — 퀸(9점)을 잡으며
    // Nc6(≈2점 손실)를 방치) 총합이 이득이므로 희생이 아니다. 총손익이 -2점 이하일 때만 희생으로 본다.
    if (net - afterHang > -2) return false;
    // (18차) 두 기물이 동시에 공격받는(포크) 상황에서 위협받던 기물 자신을 움직여 다른 기물을 내주는 것은,
    // 살린 기물이 내준 기물보다 가치가 "낮을" 때만 비직관적 선택으로 보고 탁월로 인정한다(동가·상위 구출은 당연한 수).
    // (21차) 살린 기물 쪽이 더 비싸더라도, 그 대신 상대의 더 비싼 기물을 반격으로 위협했다면 역시 탁월.
    if (movedThreatLoss >= 1) {
      // (v0.2.3 버그 수정) 포크에 걸린 기물을 옮겨 위험을 "줄이기만" 했을 뿐(방치된 기물의 손실이 원래
      // 포크 손실보다 작음, 예: 22.Qe3 — 나이트 포크(6점 위험)를 피해 물러났더니 우연히 무관한 비숍(2점)이
      // 방치돼 있었을 뿐)이라면 진짜 궁지에 몰린 트레이드오프가 아니라 그냥 좋은 수이므로 탁월이 아니다.
      if (afterHang < movedThreatLoss) return false;
      return VAL[info.piece] < afterHang || attacksPricier(after, color, afterHang);
    }
    // (v0.2.3 버그 수정) 방치한 기물과 가치가 같거나 더 높은 상대 기물을 안전하게 반격 위협하더라도,
    // 그 반격 기물이 도망가는 동시에 방치된 내 기물을 잡을 수 있는 게 아니라면(=서로 다른 칸이라
    // 상대가 한 수로 둘 다 해결할 수 없다면) 이는 자연스러운 맞교환 제안일 뿐이다(예: 36...Rfb8 —
    // 방치된 나이트 d5를 무시하고 무관한 비숍 b3를 반격하지만, 결국 나이트 대 비숍의 동가 교환으로
    // 귀결되는 뻔한 수). attacksPricierIndependent가 false를 돌려주면(=진짜 반격이 아니면) 탁월이 아니다.
    if (attacksPricierIndependent(after, color, afterHang, afterHangSq)) return false;
    // (v0.2.6 버그 수정) 지금 당장(상대가 아직 잡기 전) 반격 위협이 안 보여도, 상대가 실제로 이
    // 방치된 기물을 잡는 수 자체가 다른 아군 기물(주로 룩)의 시야를 가로막던 상대 기물을 치워 그
    // 즉시 훨씬 더 비싼 기물이 뚫리는 경우가 있다(예: 13...Qxc3 이후 비숍 f5가 나이트에게 걸려
    // 있지만, 그 나이트가 f5를 잡으러 움직이는 순간 d파일이 열려 룩이 곧장 퀸을 잡는다 — 상대가
    // 방치된 기물을 잡으면 오히려 9>5+3으로 더 손해라 진짜 위험이 아니다). attacksPricierIndependent는
    // 잡히기 '전' 보드만 보므로 이런 지연 발동 위협을 못 본다 — 상대의 최소가치 공격자로 실제 그
    // 칸을 잡아본 뒤, 그 결과 포지션에서 다시 pricier 위협을 검사해 "상대가 잡으면 다음 수에 바로
    // 그 이상을 회수당하는" 경우를 희생 판정에서 제외한다.
    const hangAtt = lva(after, afterHangSq[0], afterHangSq[1], enemy);
    if (hangAtt) {
      const afterCap = after.map((row) => row.slice());
      afterCap[afterHangSq[0]][afterHangSq[1]] = { c: enemy, t: hangAtt.t };
      afterCap[hangAtt.r][hangAtt.c] = null;
      if (attacksPricier(afterCap, color, afterHang)) return false;
    }
    return true;
  }
  return false;
}
// (v0.2.6 버그 수정) 직전 자신의 수(2수 전 — 상대 응수 하나를 사이에 둔 같은 진영의 수)가 이미
// 희생이었다면, 지금 이 수는 그 희생을 잇는 콤보의 연결 수(디플렉션·체크로 기물을 회수하는 수 등)일
// 뿐 새로 찾아낸 탁월한 수가 아니므로 다시 브릴리언트로 태그하지 않는다. 예: 15...Qxd2(퀸 희생)
// 다음의 16...Nf3+는 그 자체로도 SEE상 희생처럼 보이지만(나이트가 gxf3에 잡힘), 직전 수가 이미
// 희생이었던 연장선이므로 중복으로 탁월 태그를 붙이지 않는다.
export function ownPriorMoveWasSacrifice(prevSans, color, fenRoot) {
  if (!prevSans || prevSans.length < 2) return false;
  try { return isSacrifice(boardOfRoot(fenRoot, prevSans.slice(0, -2)), prevSans[prevSans.length - 2], color); } catch { return false; }
}

/* ============================================================ 품질·키워드 ============================================================ */
// (20차) 엔진 mate 값(둘 차례 관점)을 "메이트까지 남은 반수(ply)"로 변환. mate>0이면 그 쪽이 마지막 수를
// 두므로 2*mate-1수, mate<0(메이트 당하는 쪽)이면 2*|mate|수. 이 값은 둘 차례가 누구든 한 수마다 1씩 줄어든다.
export function matePliesOf(mate) { return mate === 0 ? 0 : (mate > 0 ? 2 * mate - 1 : 2 * Math.abs(mate)); }
export function fmtEvalCp(cp, mate, plies) {
  // (16차) "#"(체스 표기의 체크메이트 기호) 대신, 백/흑 수를 모두 합친 실제 남은 수(ply) 수를 M뒤에 붙여 표기한다.
  // (20차) mate 값을 백 관점으로 정규화하면(부호 반전) 둘 차례 정보가 사라져 남은 반수를 복원할 수 없다
  // (M5 다음이 M4가 아닌 M3으로 건너뛰던 원인). 정규화 시점에 계산해 둔 plies를 받으면 그대로 쓴다 —
  // 백/흑 어느 쪽이 두든 M5, M4, M3, M2, M1처럼 한 칸씩 줄어든다.
  if (mate != null) {
    const p = plies != null ? plies : matePliesOf(mate);
    if (p === 0) return "#";   // 이미 체크메이트(남은 수 0) — "-M0" 대신 메이트 기호로 표기
    return (mate > 0 ? "M" : "-M") + p;
  }
  if (cp == null) return null;
  const v = cp / 100; return (v >= 0 ? "+" : "") + v.toFixed(2);
}
// (20차) 포지션 평가(둘 차례 관점 {cp,mate}) → 백 관점 {cp}|{mate,win,plies} 객체. sansAfter = 그 포지션까지의 수순.
export function posEvalToWhite(ev, sansAfter, fenRoot) {
  if (!ev || (ev.cp == null && ev.mate == null)) return null;
  const s = plyIsWhite(sansAfter.length, fenRoot ? fenRoot.turn : "w") ? 1 : -1;
  if (ev.mate != null) return { mate: ev.mate * s, win: (ev.mate > 0) === (s === 1) ? "w" : "b", plies: matePliesOf(ev.mate) };
  return { cp: (ev.cp || 0) * s };
}
export function tierOf(loss) {
  if (loss <= 10) return "best";
  if (loss <= 35) return "excellent";
  if (loss <= 70) return "good";
  if (loss <= 100) return "inaccuracy";
  if (loss <= 200) return "mistake";
  return "blunder";
}
// (19차 기능3 → v0.3.8 완전 교체) 정확도 계산에 필요한 승률 기대값 모델은 그대로 재사용한다(공개된
// 승률 기대값 근사 — cp는 백 관점(양수=백 우세), 반환은 백의 기대 승률(0~100)). 이 함수 자체는
// EvalGraph·평가치 바 등 정확도와 무관한 다른 표시에도 쓰이므로 그대로 둔다.
export function winPctFromCp(cp) { const c = Math.max(-1200, Math.min(1200, cp)); return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1); }
// ===================== (v0.3.8) 독립 정확도 체계 — 사용자 설계 =====================
// 기존엔 chess.com 공개 근사 공식(수 하나의 승률 손실 → exp 감쇠로 그 수의 정확도, 게임 전체는
// 정확도들의 조화평균)만 썼다. 사용자가 손으로 유도한 모델로 완전히 교체한다:
//   · f(n) = n번째 수를 둔 뒤 실제 평가(승률%), g(n) = n번째 수를 두기 전 최선수 기준 평가(승률%).
//     한 수의 손실(f·g의 격차)은 이미 기존에도 쓰던 winBefore-winAfter와 같다.
//   · h(n) = "구간 n까지의 누적 정확도" — 시작부터 n번째 자기 수까지의 손실을 평균 낸 뒤 그 평균을
//     정확도로 변환한 값. n이 커질수록(대국이 길어질수록) 평균이 희석되어 수 하나가 전체에 미치는
//     영향이 자연히 줄어든다 — 그래서 오프닝/미들게임/엔드게임 구간 정확도도 "그 구간만"이 아니라
//     "시작부터 그 구간 끝까지"의 누적값으로 정의한다(사용자 확인 — 아래 reviewPhaseAccuracy 참고).
//   · 날카로움 보정 — 그 수를 두기 전 포지션의 엔진 상위 1·2·3위 후보 수 평가(승률%)의 표준편차가
//     작을수록(비슷한 값의 대안이 여럿이라 "무난한" 포지션) 그 수의 손실을 더 관대하게(작게), 표준편차가
//     클수록(정답이 사실상 하나뿐인 날카로운 포지션) 더 엄격하게(크게) 취급한다 — 즉 "같은 손실이라도
//     무난한 포지션에서 난 손실은 덜 아프고, 날카로운 포지션에서 난 손실은 더 아프다"로 보정한다.
//     손실이 아니라 정확도 자체에 곱하면 손실이 0인(완벽하게 둔) 수까지 포지션 난이도로 깎이는 부작용이
//     생겨(0에 무엇을 곱해도 0이어야 함) 손실 쪽에 곱한다. 보정 기준(SHARP_REF_*)은 그때그때 대국의
//     상대적 분포가 아니라 고정된 절대 기준값이다 — 상대 기준으로 하면 "모든 수가 다 날카로웠던 대국"과
//     "모든 수가 다 무난했던 대국"이 보정 후 똑같아지는 문제가 생긴다(내부적으로 실측 확인함).
//   · 마지막으로 전체를 하나의 튜닝 상수(NEW_ACC_CALIB)로 스케일한다 — chess.com 체감 수치와의
//     유사도는 이 상수(와 아래 다른 상수들)만 조정하면 원하는 만큼 다시 맞출 수 있다.
const NEW_ACC_DECAY = 0.055;      // 누적 평균 손실(승률%p) → 정확도 변환 감쇠 계수(기존 ACC_DECAY와 형태는 같되 독립된 튜닝 상수)
export const SHARP_REF_MEAN = 8;         // "평균적으로 무난한" 포지션의 후보 표준편차(승률%p) 절대 기준값 — 실측 없이 상식적으로 잡은 값, 튜닝 가능
export const SHARP_REF_SD = 8;           // 위 기준 근방에서 보정이 완만하게 갈리는 폭
const NEW_ACC_SHARP_LO = 0.85;    // 아주 무난한 포지션에서 손실에 곱하는 배율 하한(관대)
const NEW_ACC_SHARP_HI = 1.15;    // 아주 날카로운 포지션에서 손실에 곱하는 배율 상한(엄격)
const NEW_ACC_CALIB = 1.0;        // 전체 스케일 보정 — chess.com 근사치에 맞추는 최종 튜닝 손잡이
// (사용자 재피드백, v0.3.9) "블런더 하나가 깎는 정확도가 너무 커" — 실제 대국(openchesskr vs
// HaunthHenge, 무난한 수 8개 + 블런더 1개인 9수짜리 상대편)으로 비교해 보니 chess.com은 72.1인데
// 이 체계는 40.2로 나왔다. 원인은 조화평균 자체의 구조 — harmonicMean = n / Σ(1/acc_i)라 acc_i가
// 아주 작은 항 하나가 분모를 지배해 그 수 하나의 개별 정확도(이 사례는 약 7점)가 나머지 8개 만점
// 수를 거의 다 덮어써 버린다. NEW_ACC_DECAY(감쇠 자체)를 완화하면 부정확·실수 같은 가벼운 감점까지
// 전부 함께 관대해져 버리므로, 대신 "한 수가 조화평균에 기여할 수 있는 몫의 하한"만 따로 둔다 —
// 개별 정확도가 이 값보다 낮아도 조화평균 계산에서는 이 값으로 취급해, 아무리 심한 블런더라도
// 그 수 하나가 나머지 좋은 수들을 압도하지 못하게 막는다. 이 값(22) 아래에서는 조화평균이 사실상
// "그 정도로 나쁜 수들만 계속 뒀을 때의 하한"이 되므로, 위 실제 대국(8×100 + 1×22 → 조화평균
// 71.7)이 chess.com의 72.1과 거의 일치하도록 역산해 골랐다. 이 값보다 이미 높은(=덜 심각한) 수의
// 정확도는 전혀 건드리지 않으므로, 부정확·실수처럼 개별 정확도가 이미 22보다 높은 수들의 감점
// 강도는 이전과 동일하게 유지된다 — 유독 극단적인 블런더의 "쏠림"만 완화하는 정밀한 손질이다.
const NEW_ACC_HARMONIC_FLOOR = 22;
// (사용자 요청) 이론 수·최선 수(noPenalty로 분류된 수)는 그대로 손실 0을 유지하되, 그 외의 모든
// 감점 대상 수(우수·좋음·부정확·실수·놓친 수·블런더)는 손실을 이 배율만큼 키워 정확도를 더 엄격하게
// 매긴다 — "평균적으로 모든 게임에서 5~7%p 정도 낮아지게" 요청받아, 실제 기보(클린한 게임·블런더
// 있는 게임 둘 다)로 여러 배율을 재보 값이다.
export const NEW_ACC_PENALTY_MULT = 1.2;
// 모집단 표준편차 — gradeOne이 그 수를 두기 전 포지션의 후보 1·2·3위 평가(승률%)로 "날카로움"(sharp)을 잴 때 쓴다.
export function stdev(nums) {
  const n = nums.length; if (!n) return 0;
  const mean = nums.reduce((s, v) => s + v, 0) / n;
  return Math.sqrt(nums.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n);
}
// 표준정규분포 누적분포함수(Φ) — 외부 통계 라이브러리 없이 Abramowitz&Stegun 근사(오차 <1.5e-7)로 계산.
export function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}
// 포지션 날카로움(sharp, 승률%p 표준편차) → 그 수의 손실에 곱할 배율. 절대 기준(SHARP_REF_MEAN/SD)
// 대비 이 포지션이 얼마나 날카로웠는지의 백분위(Φ)를 [LO,HI] 구간으로 매핑한다.
// (v0.3.9 기능) 사용자 요청 — 설정 탭에서 이 "포지션 변동성 보정"(chess.com 실제 방식을 본뜬 날카로움
// 가중치) 자체를 끌 수 있게 한다. on=false면 항상 배율 1(보정 없음, 손실을 그대로 씀)을 돌려준다.
export function sharpLossMultiplier(sharp, on = true) {
  if (!on) return 1;
  const z = ((sharp || 0) - SHARP_REF_MEAN) / SHARP_REF_SD;
  return NEW_ACC_SHARP_LO + (NEW_ACC_SHARP_HI - NEW_ACC_SHARP_LO) * normalCdf(z);
}
// 손실(승률%p, 한 수 또는 평균) → 정확도(0~100). 기존 moveAccuracy와 같은 곡선 형태
// (103.1668·exp(-k·x)-3.1669)를 그대로 재사용한다.
export function newAccuracyFromAvgLoss(avgLossWinPct) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-NEW_ACC_DECAY * Math.max(0, avgLossWinPct)) - 3.1669));
}
// (사용자 재피드백) 실제 대국(같은 게임을 chess.com에서 리뷰하면 58.8/72.8인데 이 체계는 82.1/83.2로
// 나옴 — 전체적으로 너무 높고, 두 진영 차이도 거의 안 남)으로 원인을 찾았다. 처음엔 "그 수들의 손실을
// 먼저 평균 낸 뒤 그 평균 하나만 정확도로 변환"했는데(옛 구현), 이 변환 곡선(exp 감쇠)은 아래로 볼록
// (convex)이라 옌센 부등식에 의해 "손실을 먼저 평균 → 한 번 변환"은 "각 수를 먼저 변환 → 그 정확도를
// 평균"보다 항상 같거나 높게 나온다 — 즉 무난한 수(손실 0)가 많은 대국일수록 실제로는 뼈아픈 블런더
// 한두 개가 있어도 그 평균 손실 자체가 옅게 희석돼 버려, 블런더의 타격이 거의 반영되지 않았다.
// chess.com의 실제 방식(공개적으로 알려진 대로 "각 수의 정확도를 구한 뒤 조화평균")과 같은 순서로
// 바꾼다 — ① 수 하나하나의 손실(날카로움 보정 포함)을 그 자리에서 바로 정확도로 변환하고, ② 그
// 정확도들을 조화평균(harmonic mean)으로 누적한다. 조화평균은 산술평균보다 낮은 값(블런더처럼 낮은
// 값)에 훨씬 민감해(1/x의 평균이라 x가 작을수록 그 항이 급격히 커짐) 가끔 한 번 나는 블런더도 전체
// 정확도를 눈에 띄게 끌어내린다 — "게임이 길어질수록 수 하나의 영향이 자연히 옅어진다"는 설계 의도는
// n으로 나누는 구조 자체(조화평균도 결국 n/Σ(1/acc_i)로, n이 커질수록 각 항의 상대적 비중이 줄어듦)로
// 그대로 유지된다. 손실이 정확히 0인 수는 어떤 방식으로도 정확도 100을 그대로 유지한다(0에 무엇을
// 곱해도 0 → newAccuracyFromAvgLoss(0)=100).
// (v0.3.9 사용자 요청 — 구조적 버그 수정) "부정확한 수인데 누적 정확도가 오히려 오른다" — 조화평균은
// "전체 평균"이라 수학적으로는 있을 수 있는 일이다(그 수 자신의 개별 정확도가 지금까지의 누적
// 평균보다 높으면, 감점 대상인 수여도 평균을 끌어올린다). 하지만 사용자에게는 "감점되는 등급의 수인데
// 정확도가 오른다"는 게 명백한 모순으로 보인다 — 부정확·실수·놓친 수·블런더(MUST_NOT_INCREASE_KINDS)
// 부터는 누적 정확도가 그 수 때문에 절대 오르지 않도록(직전 값 이하로) 눌러 놓는다. 좋은 수·우수한
// 수 이상(손실이 있어도 noPenalty거나 상대적으로 가벼운 등급)은 그대로 자연스럽게 오르내리게 둔다
// (사용자 확인 — "좋은 수부터는 증가·감소 둘 다 가능"). 이 클램프가 호출부마다 다르게 적용되면
// 리빌 애니메이션의 누적 곡선과 최종 요약의 정확도가 서로 어긋나므로, kinds를 받는 이 함수 자체에서
// 한 번만 구현해 모든 호출부(analyzeGame 최종 점수·리뷰 요약 구간 정확도·리빌 애니메이션 곡선)가
// 항상 같은 규칙을 공유하게 한다.
export const MUST_NOT_INCREASE_KINDS = new Set(["inaccuracy", "mistake", "blunder", "miss"]);
export function newCumulativeAccuracy(losses, sharps, n, sharpOn = true, kinds = null) {
  if (n <= 0 || !losses.length) return null;
  let sumInvAcc = 0;
  let clamped = null;
  let value = null;
  for (let i = 0; i < n; i++) {
    const adjLoss = losses[i] * sharpLossMultiplier(sharps[i], sharpOn);
    const acc = newAccuracyFromAvgLoss(adjLoss);
    sumInvAcc += 1 / Math.max(NEW_ACC_HARMONIC_FLOOR, acc); // 극단적 블런더 한 수가 조화평균을 혼자 지배하지 못하도록 하한을 둔다(위 NEW_ACC_HARMONIC_FLOOR 설명 참고).
    const harmonicMean = (i + 1) / sumInvAcc;
    value = Math.round(Math.max(0, Math.min(100, harmonicMean * NEW_ACC_CALIB)) * 10) / 10;
    if (clamped != null && kinds && MUST_NOT_INCREASE_KINDS.has(kinds[i])) value = Math.min(value, clamped);
    clamped = value;
  }
  return value;
}
