// (v0.7.1 기능, 사용자 요청) 채팅 오프닝 룰렛 — 보낸 사람이 정한 수(ply)까지의 수순 중, 오프닝 도감(SNAP.tree)에 이름이 있는 오프닝을 같은 ply에서 무작위로 하나 뽑는다.
// 결과(이름·ECO·수순)와 릴에 돌아갈 이름 목록(reel, 마지막이 당첨)을 메시지에 함께 담아 두 사람 화면에서 같은 연출이 나오게 한다.
// 순수 계산만 둔다(scripts/check-chat-quiz-roulette.mjs가 검사). tree는 { "e4 c6": { opening: { eco, name } }, … } 모양(SNAP.tree).
export const ROULETTE_MIN_PLY = 1;
export const ROULETTE_MAX_PLY = 19;   // 도감 트리가 20수(ply)까지라 그 앞 노드까지 이름이 붙는다
export const ROULETTE_REEL_LEN = 14;  // 릴에 흘러가는 이름 수(마지막이 당첨)
const SAN_RE = /^[A-Za-z0-9=+#\-]{2,10}$/;

// 그 ply의 도감 오프닝 후보 — [{ sans, name, eco }]
export function roulettePool(tree, ply) {
  const out = [];
  for (const [key, node] of Object.entries(tree || {})) {
    if (!key) continue;
    const sans = key.split(" ");
    if (sans.length !== ply) continue;
    const op = node && node.opening;
    if (op && op.name) out.push({ sans, name: op.name, eco: op.eco || "" });
  }
  return out;
}
// 각 ply별 후보 수 — 고를 수 없는 ply(0개)를 화면에서 막는 데 쓴다.
export function rouletteCounts(tree) {
  const counts = {};
  for (const [key, node] of Object.entries(tree || {})) {
    if (!key || !(node && node.opening && node.opening.name)) continue;
    const n = key.split(" ").length;
    counts[n] = (counts[n] || 0) + 1;
  }
  return counts;
}
const shuffle = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// 룰렛 한 판 — { ply, name, eco, sans, reel } 또는 후보가 없으면 null.
export function makeRoulette(tree, ply, rng = Math.random) {
  if (!Number.isInteger(ply) || ply < ROULETTE_MIN_PLY || ply > ROULETTE_MAX_PLY) return null;
  const pool = roulettePool(tree, ply);
  if (!pool.length) return null;
  const win = pool[Math.floor(rng() * pool.length)];
  const names = [...new Set(pool.map((x) => x.name))].filter((nm) => nm !== win.name);
  const reel = [...shuffle(names, rng).slice(0, ROULETTE_REEL_LEN - 1), win.name];
  return { ply, name: win.name, eco: win.eco, sans: win.sans, reel };
}

// 받은 룰렛 payload 검증 — 모양이 어긋나면 null.
export function normalizeRoulette(r) {
  if (!r || typeof r !== "object" || !Number.isInteger(r.ply) || r.ply < ROULETTE_MIN_PLY || r.ply > ROULETTE_MAX_PLY) return null;
  if (typeof r.name !== "string" || !r.name || r.name.length > 120) return null;
  if (!Array.isArray(r.sans) || r.sans.length !== r.ply || r.sans.some((s) => typeof s !== "string" || !SAN_RE.test(s))) return null;
  const eco = typeof r.eco === "string" && /^[A-E][0-9]{2}$/.test(r.eco) ? r.eco : "";
  let reel = Array.isArray(r.reel) ? r.reel.filter((x) => typeof x === "string" && x && x.length <= 120).slice(0, 24) : [];
  if (!reel.length || reel[reel.length - 1] !== r.name) reel = [...reel.filter((x) => x !== r.name), r.name];
  return { ply: r.ply, name: r.name, eco, sans: r.sans, reel };
}
