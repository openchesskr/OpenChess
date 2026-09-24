// ============================================================ 러시아워(룩 탈출) 규칙 엔진 ============================================================
// (v0.5.3 기능, 사용자 설계) "그로테스크 퍼즐 + 러시아워" — 내 기물들로 엉켜 있는 포지션에서 룩(주인공
// 룩)을 탈출시켜 상대 백랭크로 보내 킹을 체크메이트하는 퍼즐. 브라우저(게임 화면)와 Node(레벨 생성기
// scripts/build-rush-levels.mjs)가 이 파일 하나를 함께 쓴다 — 레벨 파일에 기록된 최소 수(par)가 실제
// 게임 규칙과 어긋나지 않도록 규칙 구현을 한 곳에만 둔다.
//
// 규칙
// 1. 백(나)만 수를 둔다. 백 기물은 모두 실제 체스 규칙대로 움직인다(폰 전진·2칸 전진·대각선 포획,
//    나이트 L자, 슬라이딩 기물은 막히면 멈춤). 백 킹은 없다 — 이 퍼즐은 "내 킹의 안전"이 아니라 룩의
//    탈출 경로(개방/폐쇄 포지션, 기물 간 간섭·트랩)에 집중한다.
// 2. 흑(상대)은 스스로 움직이지 않는 수비 기물이다. 단, 방금 움직인 백 기물이 흑 기물의 공격 범위에
//    들어오면 그 기물을 잡으러 온다(가장 값싼 기물이 먼저, 흑 킹이 체크에 노출되는 포획은 불가) —
//    이게 "희생으로 상대 기물을 끌어내는" 핵심 로직이다. 주인공 룩이 잡히면 실패.
// 3. 흑 킹이 체크메이트되고, 그 체크를 주는 기물 중에 주인공 룩이 있으면 성공.
// 4. 메이트가 아닌 체크를 주면 흑은 결정론적으로 응수한다(체크 준 기물 포획 → 킹 이동 → 가로막기
//    순, 같은 종류면 칸 순서) — 같은 수를 두면 누구에게나 항상 같은 결과가 나와야 PvP가 공정하다.
//
// 보드 표현: 길이 64 배열, 인덱스 = rank0(1랭크)*8 + file. 칸 값은 null 또는 "wR"/"bK" 같은 2글자.
// 주인공 룩은 칸 값 대신 hero 인덱스로 따로 추적한다(다른 백 룩과 구분).

export const RUSH_VALUES = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100 };
const FILES = "abcdefgh";
export const rushSqName = (i) => FILES[i & 7] + ((i >> 3) + 1);
export const rushSqIndex = (s) => (s.charCodeAt(0) - 97) + (parseInt(s.slice(1), 10) - 1) * 8;
const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KG = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// 레벨 문자열("wR:a1 wP:a2 ... bK:g8", 첫 wR에 * 표시 = 주인공)을 상태로 바꾼다.
export function rushParse(spec) {
  const board = new Array(64).fill(null);
  let hero = -1;
  for (const tok of spec.trim().split(/\s+/)) {
    const [pc, sq] = tok.split(":");
    const isHero = pc.endsWith("*");
    const code = isHero ? pc.slice(0, -1) : pc;
    const i = rushSqIndex(sq);
    board[i] = code;
    if (isHero) hero = i;
  }
  return { board, hero };
}
export function rushSerialize(state) {
  const out = [];
  state.board.forEach((p, i) => { if (p) out.push(p + (i === state.hero ? "*" : "") + ":" + rushSqName(i)); });
  return out.join(" ");
}
const stateKey = (s) => s.board.map((p) => p || "..").join("") + s.hero;

// color 진영이 칸 i를 공격하는지(슬라이딩은 막힘 고려).
export function rushAttacked(board, i, color) {
  const f = i & 7, r = i >> 3;
  const pawnDir = color === "w" ? -1 : 1; // 공격하는 폰이 있을 자리의 랭크 방향
  for (const df of [-1, 1]) {
    const nf = f + df, nr = r + pawnDir;
    if (onBoard(nf, nr) && board[nr * 8 + nf] === color + "P") return true;
  }
  for (const [df, dr] of KN) { const nf = f + df, nr = r + dr; if (onBoard(nf, nr) && board[nr * 8 + nf] === color + "N") return true; }
  for (const [df, dr] of KG) { const nf = f + df, nr = r + dr; if (onBoard(nf, nr) && board[nr * 8 + nf] === color + "K") return true; }
  for (const [dirs, types] of [[ORTHO, "RQ"], [DIAG, "BQ"]]) {
    for (const [df, dr] of dirs) {
      let nf = f + df, nr = r + dr;
      while (onBoard(nf, nr)) {
        const p = board[nr * 8 + nf];
        if (p) { if (p[0] === color && types.includes(p[1])) return true; break; }
        nf += df; nr += dr;
      }
    }
  }
  return false;
}
// 칸 i를 공격하는 color 기물들의 위치.
function attackersOf(board, i, color) {
  const out = [];
  const f = i & 7, r = i >> 3;
  const pawnDir = color === "w" ? -1 : 1;
  for (const df of [-1, 1]) { const nf = f + df, nr = r + pawnDir; if (onBoard(nf, nr) && board[nr * 8 + nf] === color + "P") out.push(nr * 8 + nf); }
  for (const [df, dr] of KN) { const nf = f + df, nr = r + dr; if (onBoard(nf, nr) && board[nr * 8 + nf] === color + "N") out.push(nr * 8 + nf); }
  for (const [df, dr] of KG) { const nf = f + df, nr = r + dr; if (onBoard(nf, nr) && board[nr * 8 + nf] === color + "K") out.push(nr * 8 + nf); }
  for (const [dirs, types] of [[ORTHO, "RQ"], [DIAG, "BQ"]]) {
    for (const [df, dr] of dirs) {
      let nf = f + df, nr = r + dr;
      while (onBoard(nf, nr)) {
        const p = board[nr * 8 + nf];
        if (p) { if (p[0] === color && types.includes(p[1])) out.push(nr * 8 + nf); break; }
        nf += df; nr += dr;
      }
    }
  }
  return out;
}

// 한 기물의 유사 합법 수(pseudo-legal) — 자기 편 칸으로는 못 가고, 상대 킹은 잡을 수 없다.
function pieceMoves(board, from) {
  const p = board[from]; if (!p) return [];
  const color = p[0], type = p[1], opp = color === "w" ? "b" : "w";
  const f = from & 7, r = from >> 3;
  const out = [];
  const canLand = (j) => { const q = board[j]; return !q || (q[0] === opp && q[1] !== "K"); };
  if (type === "P") {
    const dir = color === "w" ? 1 : -1, startRank = color === "w" ? 1 : 6, lastRank = color === "w" ? 7 : 0;
    const r1 = r + dir;
    if (onBoard(f, r1) && !board[r1 * 8 + f] && r1 !== lastRank) {
      out.push(r1 * 8 + f);
      const r2 = r + 2 * dir;
      if (r === startRank && !board[r2 * 8 + f]) out.push(r2 * 8 + f);
    }
    for (const df of [-1, 1]) {
      const nf = f + df;
      if (!onBoard(nf, r1) || r1 === lastRank) continue;
      const q = board[r1 * 8 + nf];
      if (q && q[0] === opp && q[1] !== "K") out.push(r1 * 8 + nf);
    }
    return out;
  }
  if (type === "N" || type === "K") {
    for (const [df, dr] of type === "N" ? KN : KG) { const nf = f + df, nr = r + dr; if (onBoard(nf, nr) && canLand(nr * 8 + nf)) out.push(nr * 8 + nf); }
    return out;
  }
  const dirs = type === "R" ? ORTHO : type === "B" ? DIAG : [...ORTHO, ...DIAG];
  for (const [df, dr] of dirs) {
    let nf = f + df, nr = r + dr;
    while (onBoard(nf, nr)) {
      const j = nr * 8 + nf, q = board[j];
      if (q) { if (canLand(j)) out.push(j); break; }
      out.push(j); nf += df; nr += dr;
    }
  }
  return out;
}

const kingOf = (board, color) => board.indexOf(color + "K");

// 흑의 합법 수 — 흑 킹이 체크에 노출되지 않는 것만.
function blackLegalMoves(board) {
  const out = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p[0] !== "b") continue;
    for (const j of pieceMoves(board, i)) {
      const nb = board.slice(); nb[j] = p; nb[i] = null;
      if (!rushAttacked(nb, kingOf(nb, "b"), "w")) out.push([i, j]);
    }
  }
  return out;
}

// 백이 지금 둘 수 있는 모든 수 [[from,to], ...]. 백 킹이 없으므로 유사 합법 수가 곧 합법 수다.
export function rushWhiteMoves(state) {
  const out = [];
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p || p[0] !== "w") continue;
    for (const j of pieceMoves(state.board, i)) out.push([i, j]);
  }
  return out;
}
export function rushTargetsFrom(state, from) {
  const p = state.board[from];
  if (!p || p[0] !== "w") return [];
  return pieceMoves(state.board, from);
}

// 백이 from→to를 둔 결과. { state, status: "play"|"win"|"fail", events: [...] }
// events는 화면 연출용 — { kind: "move"|"capture"|"lure"|"reply", from, to, piece, captured }.
export function rushApply(state, from, to) {
  const board = state.board.slice();
  const piece = board[from];
  const captured = board[to];
  board[to] = piece; board[from] = null;
  let hero = state.hero === from ? to : state.hero;
  const events = [{ kind: captured ? "capture" : "move", from, to, piece, captured }];
  const bk = kingOf(board, "b");
  if (bk >= 0 && rushAttacked(board, bk, "w")) {
    const replies = blackLegalMoves(board);
    if (!replies.length) {
      const checkers = attackersOf(board, bk, "w");
      const heroMates = checkers.includes(hero);
      return { state: { board, hero }, status: heroMates ? "win" : "mateOther", events };
    }
    // 메이트가 아닌 체크 — 결정론적 응수: 체크 준 기물을 가장 값싼 기물로 잡기 → 킹 이동 → 가로막기.
    const checkers = attackersOf(board, bk, "w");
    const score = ([a, b]) => {
      const mover = board[a];
      if (checkers.includes(b)) return 0 + RUSH_VALUES[mover[1]] / 1000;
      if (mover[1] === "K") return 1 + b / 1000;
      return 2 + RUSH_VALUES[mover[1]] / 1000 + b / 100000;
    };
    replies.sort((x, y) => score(x) - score(y) || x[0] - y[0] || x[1] - y[1]);
    const [ra, rb] = replies[0];
    const took = board[rb];
    board[rb] = board[ra]; board[ra] = null;
    events.push({ kind: "reply", from: ra, to: rb, piece: board[rb], captured: took });
    if (rb === hero) return { state: { board, hero: -1 }, status: "fail", events };
    return { state: { board, hero }, status: "play", events };
  }
  // 유인 포획 — 방금 움직인 기물만 노린다(가장 값싼 공격자부터, 흑 킹을 노출시키는 포획은 제외).
  const attackers = attackersOf(board, to, "b").sort((a, b) => RUSH_VALUES[board[a][1]] - RUSH_VALUES[board[b][1]] || a - b);
  for (const a of attackers) {
    const nb = board.slice(); nb[to] = nb[a]; nb[a] = null;
    if (rushAttacked(nb, kingOf(nb, "b"), "w")) continue;
    events.push({ kind: "lure", from: a, to, piece: board[a], captured: piece });
    if (to === hero) return { state: { board: nb, hero: -1 }, status: "fail", events };
    return { state: { board: nb, hero }, status: "play", events };
  }
  return { state: { board, hero }, status: "play", events };
}

// 최소 수 풀이(BFS). 반환: { par, line: [[from,to],...], lured: bool } 또는 null.
// maxStates를 넘으면 포기(null) — 생성기가 너무 넓은 퍼즐을 버리는 용도.
export function rushSolve(start, maxDepth = 10, maxStates = 250000) {
  const seen = new Map();
  seen.set(stateKey(start), null);
  let frontier = [{ s: start, key: stateKey(start) }];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const [a, b] of rushWhiteMoves(node.s)) {
        const res = rushApply(node.s, a, b);
        if (res.status === "fail" || res.status === "mateOther") continue;
        const k = stateKey(res.state);
        if (seen.has(k)) continue;
        seen.set(k, { prev: node.key, mv: [a, b], lure: res.events.some((e) => e.kind === "lure") });
        if (res.status === "win") {
          const line = []; let lured = false; let cur = k;
          while (seen.get(cur)) { const e = seen.get(cur); line.unshift(e.mv); lured = lured || e.lure; cur = e.prev; }
          return { par: depth, line, lured, states: seen.size };
        }
        next.push({ s: res.state, key: k });
        if (seen.size > maxStates) return null;
      }
    }
    if (!next.length) return null;
    frontier = next;
  }
  return null;
}
