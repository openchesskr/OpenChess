// (v0.5.7) 나이트 레이스 규칙 — 판정·라운드 생성의 단일 출처. src/App.jsx(혼자·봇·실시간 화면)와
// scripts/check-knight-rounds.mjs(prebuild 검사)가 함께 쓴다. supabase-setup.sql의 knight_attacked_squares·
// knight_danger·_knight_gen_round가 같은 규칙이다(실시간 대전 라운드는 서버가 만든다) — 한쪽을 고치면 반드시 같이 고칠 것.
//
// (v0.5.7 버그 수정 BUG-020, 사용자 제보 "답이 없는 포지션") 예전 규칙의 두 가지 어긋남:
//  ① 위협 칸 계산이 "목표 칸 기준 점대칭 반사점이 보드 안인 칸"만 셌다 — 예) 목표 e5, 흑 룩 f4일 때 f1은 룩이 뻔히
//     공격하는데도(반사점 d9가 보드 밖이라) 안전 칸으로 취급됐다. 게임은 f1을 거쳐 풀리는 라운드를 냈지만, 보는 사람은
//     f1·f3·g4가 모두 룩에 잡혀 "답이 없다"고 느꼈다.
//  ② 룩·비숍의 공격선이 다른 기물을 뚫고 보드 끝까지 이어졌다(실제 체스와 다름).
// 이제 위협 칸은 실제 체스와 같다 — 공격선은 남아 있는 기물(색 무관)에 막히고, 막은 칸 자체는 공격(보호)된다.
// 나이트는 움직이므로 공격선을 막지 않는다.

export const KNIGHT_FILES = "abcdefgh";
export const KNIGHT_ALL_SQS = [];
for (let f = 0; f < 8; f++) for (let r = 1; r <= 8; r++) KNIGHT_ALL_SQS.push(KNIGHT_FILES[f] + r);

const toFR = (sq) => [sq.charCodeAt(0) - 97, parseInt(sq.slice(1), 10) - 1];
const toSq = (f, r) => String.fromCharCode(97 + f) + (r + 1);
const onBoard = (f, r) => f >= 0 && f <= 7 && r >= 0 && r <= 7;
const KNIGHT_DELTAS = [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
export const KNIGHT_HAZARD_DIRS = { R: ROOK_DIRS, B: BISHOP_DIRS, Q: [...ROOK_DIRS, ...BISHOP_DIRS] };

// 나이트가 sq에서 갈 수 있는 칸(illegal에 든 칸 제외).
export function knightNeighbors(sq, illegal) {
  const [f, r] = toFR(sq);
  const bad = illegal ? (illegal instanceof Set ? illegal : new Set(illegal)) : null;
  const out = [];
  for (const [df, dr] of KNIGHT_DELTAS) {
    const nf = f + df, nr = r + dr;
    if (!onBoard(nf, nr)) continue;
    const n = toSq(nf, nr);
    if (!bad || !bad.has(n)) out.push(n);
  }
  return out;
}

// 목표 칸 center 기준 점대칭 칸(보드 밖이면 null) — 실시간 대전의 두 시작 칸·기물 배치에만 쓴다(위협 판정에는 쓰지 않는다).
export function knightReflectSq(sq, center) {
  const [f, r] = toFR(sq), [cf, cr] = toFR(center);
  const nf = 2 * cf - f, nr = 2 * cr - r;
  return onBoard(nf, nr) ? toSq(nf, nr) : null;
}

// 위협 기물(R·B·Q)이 공격하는 칸 — blockers(남아 있는 기물 칸)에 닿으면 그 칸까지만(그 칸은 포함).
export function knightAttackedSquares(sq, type, blockers) {
  const [f, r] = toFR(sq);
  const block = blockers ? (blockers instanceof Set ? blockers : new Set(blockers)) : null;
  const out = [];
  for (const [df, dr] of KNIGHT_HAZARD_DIRS[type] || []) {
    let nf = f + df, nr = r + dr;
    while (onBoard(nf, nr)) {
      const n = toSq(nf, nr);
      out.push(n);
      if (block && block.has(n)) break;
      nf += df; nr += dr;
    }
  }
  return out;
}

// 보드에 남아 있는 기물 — taken(color 나이트가 잡은 상대 기물 칸)만 빠진다.
const liveHazards = (round, taken) => {
  const t = new Set(taken || []);
  return (round.hazards || []).filter((h) => !t.has(h.sq));
};

// color 나이트가 들어가면 잡히는 칸 — 남아 있는 상대 색 기물의 공격 칸(공격선은 남아 있는 모든 기물에 막힌다).
export function knightDangerFor(round, color, taken) {
  const live = liveHazards(round, taken);
  const blockers = new Set(live.map((h) => h.sq));
  const out = new Set();
  live.forEach((h) => { if (h.color !== color) knightAttackedSquares(h.sq, h.type, blockers).forEach((s) => out.add(s)); });
  return [...out];
}

// color 나이트가 설 수 없는 칸 — 아직 남아 있는 자기 색 기물(상대 나이트가 잡아 간 것은 빼고).
export function knightOwnBlocked(round, color, oppTaken) {
  const t = new Set(oppTaken || []);
  return (round.hazards || []).filter((h) => h.color === color && !t.has(h.sq)).map((h) => h.sq);
}

// 한 수를 두었을 때 — 상대 기물을 잡았는지(tookPiece), 그 뒤 내 나이트가 잡혔는지(captured).
export function knightApplyMove(round, color, taken, sq) {
  const tookPiece = (round.hazards || []).some((h) => h.sq === sq && h.color !== color && !(taken || []).includes(sq));
  const nextTaken = tookPiece ? [...(taken || []), sq] : (taken || []);
  return { taken: nextTaken, tookPiece, captured: knightDangerFor(round, color, nextTaken).includes(sq) };
}

// 나이트를 잡은(그 칸을 공격한) 상대 기물 — 잡힘 연출에서 날아올 기물. removed: 이미 잡혀 사라진 기물 칸.
export function knightCatcherOf(hazards, knightColor, knightSq, removed) {
  const gone = new Set(removed || []);
  const live = (hazards || []).filter((h) => !gone.has(h.sq));
  const blockers = new Set(live.map((h) => h.sq));
  return live.find((h) => h.color !== knightColor && knightAttackedSquares(h.sq, h.type, blockers).includes(knightSq)) || null;
}

// 최단 경로(BFS) — illegal 칸은 밟지 않는다. 없으면 null.
export function knightShortestPath(start, target, illegal) {
  if (start === target) return [start];
  const bad = illegal instanceof Set ? illegal : new Set(illegal || []);
  const visited = new Set([start]);
  let frontier = [[start]];
  while (frontier.length) {
    const next = [];
    for (const path of frontier) {
      for (const nb of knightNeighbors(path[path.length - 1], bad)) {
        if (nb === target) return [...path, nb];
        if (!visited.has(nb)) { visited.add(nb); next.push([...path, nb]); }
      }
    }
    frontier = next;
  }
  return null;
}
export function knightDistance(start, target, illegal) { const p = knightShortestPath(start, target, illegal); return p ? p.length - 1 : null; }

// "잡지 않고도 확실히 가는" 길의 금지 칸 — 처음 위협 칸 + 모든 기물 칸(자기 색은 설 수 없고, 상대 색은 잡으면 그 기물이 막던
// 공격선이 열려 앞길이 위험해질 수 있어 경로 계산에선 벽으로 둔다). 이 칸들만 피하면 도중에 아무것도 잡지 않으므로 위협 칸이
// 처음 그대로라, 이렇게 찾은 경로는 실제 규칙에서도 반드시 통한다. 라운드의 par·봇 경로가 이 기준이다(기물을 잡아 더 빨리
// 가는 길이 있으면 그건 사람의 몫).
export function knightSafeWalls(round, color) {
  return new Set([...knightDangerFor(round, color, []), ...(round.hazards || []).map((h) => h.sq)]);
}

// 기물을 잡는 것까지 모두 고려한 실제 최단 수 — (칸, 잡은 기물 집합) 상태 BFS. 검사 스크립트가 "답이 있는지"를 규칙 그대로
// 확인하는 데 쓴다(게임 중에는 쓰지 않는다).
export function knightExactPath(round, color, start) {
  const own = new Set(knightOwnBlocked(round, color, []));
  const key = (sq, taken) => sq + "|" + [...taken].sort().join(",");
  const seen = new Set([key(start, [])]);
  let frontier = [{ sq: start, taken: [], path: [start] }];
  if (start === round.target) return [start];
  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      for (const nb of knightNeighbors(st.sq, own)) {
        const mv = knightApplyMove(round, color, st.taken, nb);
        if (mv.captured) continue;
        if (nb === round.target) return [...st.path, nb];
        const k = key(nb, mv.taken);
        if (seen.has(k)) continue;
        seen.add(k); next.push({ sq: nb, taken: mv.taken, path: [...st.path, nb] });
      }
    }
    frontier = next;
  }
  return null;
}

// ---- 라운드 생성 ----
// 1~4라운드는 v0.5.5 곡선 그대로. (v0.5.7, 사용자 요청) 5라운드는 반드시 상대 퀸이 나오는 매우 어려운 라운드 —
// 기물 5쌍 중 1쌍이 퀸, par 6~8, 기물이 없을 때보다 최소 2수 더 돌아가야 하고(minDetour 2), 최단 경로로 가는 첫 수가
// 딱 하나뿐이다(onlyFirst — 처음 한 수를 잘못 고르면 최단으로는 못 간다).
export const KNIGHT_ROUND_SPECS = [
  { minDist: 3, maxDist: 4, pairs: 1, minDetour: 0, queens: 0, onlyFirst: false, timeMs: 5000 },
  { minDist: 4, maxDist: 5, pairs: 2, minDetour: 1, queens: 0, onlyFirst: false, timeMs: 8000 },
  { minDist: 5, maxDist: 6, pairs: 3, minDetour: 1, queens: 0, onlyFirst: false, timeMs: 11000 },
  { minDist: 6, maxDist: 7, pairs: 4, minDetour: 1, queens: 0, onlyFirst: false, timeMs: 14000 },
  { minDist: 6, maxDist: 8, pairs: 5, minDetour: 2, queens: 1, onlyFirst: true, timeMs: 17000 },
];
export const KNIGHT_GEN_TRIES = 4000;

// 조건을 만족하는 첫 수가 몇 개인지 — start의 이웃 중 목표까지 남은 거리가 par-1인 칸 수.
function firstMoveCount(start, target, walls, par) {
  return knightNeighbors(start, walls).filter((n) => n === target ? par === 1 : knightDistance(n, target, walls) === par - 1).length;
}

// spec 하나로 라운드를 시도한다. solo면 흑 기물만 둔다(상대가 없으니 내 진영 기물이 필요 없다). rnd: 0~1 난수 함수.
export function knightTryGen(spec, { solo = false, rnd = Math.random } = {}) {
  const pick = () => KNIGHT_ALL_SQS[Math.floor(rnd() * 64)];
  for (let attempt = 0; attempt < KNIGHT_GEN_TRIES; attempt++) {
    const target = KNIGHT_FILES[2 + Math.floor(rnd() * 4)] + (3 + Math.floor(rnd() * 4));
    const whiteStart = pick();
    const blackStart = knightReflectSq(whiteStart, target);
    // 백은 항상 목표보다 아래쪽(랭크가 같거나 낮은 쪽)에서 시작한다 — 흑이면 보드를 뒤집는 규칙만으로 내 나이트가 화면 아래에 온다.
    if (!blackStart || whiteStart === target || parseInt(whiteStart.slice(1), 10) > parseInt(blackStart.slice(1), 10)) continue;
    const used = new Set([whiteStart, blackStart, target]);
    const hazW = [], hazB = [];
    for (let i = 0; i < spec.pairs; i++) {
      for (let t = 0; t < 50; t++) {
        const sq = pick(), m = knightReflectSq(sq, target);
        if (!m || sq === m || used.has(sq) || used.has(m)) continue;
        used.add(sq); used.add(m); hazW.push(sq); hazB.push(m); break;
      }
    }
    if (hazW.length < spec.pairs) continue;
    const hazards = [];
    hazW.forEach((sq, i) => {
      const type = i < spec.queens ? "Q" : (rnd() < 0.5 ? "B" : "R");
      if (!solo) hazards.push({ sq, type, color: "w" });
      hazards.push({ sq: hazB[i], type, color: "b" });
    });
    const r = { target, hazards };
    const wIllegal = knightDangerFor(r, "w", []);
    if (wIllegal.includes(target) || wIllegal.includes(whiteStart)) continue;
    const wWalls = knightSafeWalls(r, "w");
    const par = knightDistance(whiteStart, target, wWalls);
    if (par == null || par < spec.minDist || par > spec.maxDist) continue;
    let bIllegal = [];
    if (!solo) {
      // 점대칭이라도 보드 끝·공격선 막힘은 대칭이 아니어서, 흑 쪽도 재서 같을 때만 쓴다.
      bIllegal = knightDangerFor(r, "b", []);
      if (bIllegal.includes(target) || bIllegal.includes(blackStart)) continue;
      if (knightDistance(blackStart, target, knightSafeWalls(r, "b")) !== par) continue;
    }
    if (spec.minDetour > 0) {
      const plain = solo ? knightDistance(whiteStart, target, []) : Math.min(knightDistance(whiteStart, target, []), knightDistance(blackStart, target, []));
      if (par < plain + spec.minDetour) continue;
    }
    if (spec.onlyFirst) {
      if (firstMoveCount(whiteStart, target, wWalls, par) !== 1) continue;
      if (!solo && firstMoveCount(blackStart, target, knightSafeWalls(r, "b"), par) !== 1) continue;
    }
    return { target, whiteStart, blackStart, hazards, wIllegal, bIllegal, par, moveBudget: par + 1 };
  }
  return null;
}

// 라운드 idx(0~4)의 라운드를 만든다. 조건에 맞는 라운드를 못 찾으면 조건을 한 단계씩 낮춰 다시 뽑되, 퀸 라운드(5라운드)는
// 퀸을 빼지 않고 나머지 조건만 낮춘다. 제한시간은 원래 라운드 것 그대로.
export function knightGenRound(roundIdx, opts = {}) {
  const idx = Math.min(Math.max(roundIdx, 0), KNIGHT_ROUND_SPECS.length - 1);
  const base = KNIGHT_ROUND_SPECS[idx];
  const timeLimitMs = base.timeMs;
  const ladder = [base];
  if (base.queens) {
    ladder.push({ ...base, onlyFirst: false }, { ...base, onlyFirst: false, minDetour: 1 }, { ...base, onlyFirst: false, minDetour: 1, pairs: 4, minDist: 5 },
      { ...base, onlyFirst: false, minDetour: 0, pairs: 3, minDist: 4 }, { ...base, onlyFirst: false, minDetour: 0, pairs: 2, minDist: 3 });
  } else {
    for (let k = idx - 1; k >= 0; k--) ladder.push(KNIGHT_ROUND_SPECS[k]);
  }
  for (const spec of ladder) {
    const r = knightTryGen(spec, opts);
    if (r) return { ...r, timeLimitMs };
  }
  return { target: "d4", whiteStart: "a1", blackStart: "g7", hazards: [], wIllegal: [], bIllegal: [], par: 2, moveBudget: 3, timeLimitMs };
}
