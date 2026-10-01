// (v0.6.1) 무한 체크메이트 게임의 포지션 풀 — 압축 데이터 해석, "한 번 나온 포지션은 다시 나오지 않는" 선택, 테마 균등 추첨.
// 화면(src/app/play.jsx)과 검사(scripts/check-attack-positions.mjs)가 같이 쓴다. DOM·React에 의존하지 않는다.
//
// 데이터 형식(src/data/attackPositions.json, scripts/build-attack-positions.mjs가 만든다):
//   [fen, "uci uci ...", "theme theme", 출처]  — 공격 측이 두기 직전의 FEN, 공격·수비 번갈아 마지막은 체크메이트 수.
//   (예전 형식 { id, fen, moves:[...], mateIn, src }도 읽는다.)

export const ATTACK_SEEN_KEY = "occ_attack_seen";
export const attackGradeOfMate = (n) => (n <= 1 ? "S" : n === 2 ? "A" : n === 3 ? "B" : "C");

// FEN의 앞 네 칸(기물 배치·차례·캐슬링·앙파상)으로 만든 짧은 해시 — 포지션 id. 같은 포지션은 데이터를 다시 만들어도 같은 id다.
export function attackHash(fen) {
  const s = fen.split(" ").slice(0, 4).join(" ");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// 번들 데이터 한 줄 → { id, fen, moves, mateIn, src, th }
export function decodeAttackRow(r) {
  if (Array.isArray(r)) {
    const moves = String(r[1]).split(" ").filter(Boolean);
    return { id: "s" + attackHash(r[0]), fen: r[0], moves, mateIn: (moves.length + 1) / 2, src: r[3] || "", th: r[2] ? String(r[2]).split(" ") : [] };
  }
  return { id: "s" + attackHash(r.fen), fen: r.fen, moves: r.moves, mateIn: r.mateIn, src: r.src || "", th: r.th || [] };
}

// 같은 FEN은 한 번만(앞쪽이 이긴다) — 번들 + 개발자 추가분을 합칠 때 쓴다.
export function dedupeAttackPositions(list) {
  const seen = new Set();
  return list.filter((p) => { const k = p.fen.split(" ").slice(0, 4).join(" "); if (seen.has(k)) return false; seen.add(k); return true; });
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// list(한 등급의 포지션) 중 seen(이미 나온 id 집합)에 없는 것을 하나 고른다. pick은 서버가 준 난수 — 같은 (list, pick, seen)이면 항상 같은 포지션.
// 테마(th[0])를 먼저 고르고(개수의 제곱근에 비례 — 흔한 테마가 독점하지 않으면서 희귀 테마도 너무 자주 나오지 않게) 그 안에서 고른다.
// 안 나온 포지션이 하나도 없으면 그 등급을 처음부터 다시 돌린다(reset: true — 호출부가 seen에서 이 등급 id를 지운다).
export function pickAttackPosition(list, pick, seen) {
  if (!list || !list.length) return { pos: null, reset: false };
  let fresh = list.filter((p) => !seen.has(p.id));
  let reset = false;
  if (!fresh.length) { fresh = list; reset = true; }
  const buckets = new Map();
  for (const p of fresh) { const k = (p.th && p.th[0]) || "mate"; const a = buckets.get(k); if (a) a.push(p); else buckets.set(k, [p]); }
  const keys = [...buckets.keys()].sort();
  const rnd = mulberry32(pick | 0);
  const weights = keys.map((k) => Math.sqrt(buckets.get(k).length));
  let x = rnd() * weights.reduce((a, b) => a + b, 0), ki = 0;
  for (; ki < keys.length - 1; ki++) { if (x < weights[ki]) break; x -= weights[ki]; }
  const arr = buckets.get(keys[ki]);
  return { pos: arr[Math.floor(rnd() * arr.length)], reset };
}

// ---- 이미 나온 포지션 기록(브라우저 localStorage) ----
export function loadAttackSeen(storage) {
  try { return new Set(JSON.parse((storage || globalThis.localStorage).getItem(ATTACK_SEEN_KEY) || "[]")); } catch { return new Set(); }
}
export function saveAttackSeen(seen, storage) {
  try { (storage || globalThis.localStorage).setItem(ATTACK_SEEN_KEY, JSON.stringify([...seen])); } catch { /* 저장 불가(사생활 보호 모드 등) — 이번 접속 동안만 기억 못 함 */ }
}
// 한 포지션을 "나왔다"고 기록하고, 풀을 한 바퀴 다 돌았으면(reset) 그 등급 기록을 비운 뒤 이 포지션부터 다시 센다.
export function markAttackSeen(pos, gradeList, reset, storage) {
  const seen = loadAttackSeen(storage);
  if (reset) gradeList.forEach((p) => seen.delete(p.id));
  seen.add(pos.id);
  saveAttackSeen(seen, storage);
}
