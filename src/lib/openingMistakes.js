// (v0.6.9) 오프닝 실수 분석 — 내 chess.com 대국에서 반복해 둔 수순 중 엔진 평가가 크게 떨어지는 수를 찾는다.
// v0.6.6에서 집중 분석에서 뺀 기능을 학습 탭으로 옮기며, 특정 수순에 묶이지 않고 시작 포지션부터 색(백·흑)별로 찾도록 바꿨다.
// 순수 함수만 둔다(엔진은 evalPos로 주입) — scripts/check-opening-mistakes.mjs가 가짜 엔진으로 검사한다.
export const OM = {
  MAX_PLY: 30,        // 15수까지 본다
  MIN_COUNT: 2,       // 두 번 이상 반복한 수순만(한 번뿐인 수는 습관이 아니라 우연)
  MIN_GAMES: 5,       // 색별 이만큼은 있어야 분석
  DROP: 100,          // 평가 하락(센티폰) 이상이면 부정확
  BLUNDER: 250,       // 이상이면 블런더
  MAX_EVALS: 60,      // 색별 엔진 호출 상한 — 자주 둔 수순부터 쓰므로 상한에 걸려도 중요한 수순은 본다
  MAX_LINES: 5,       // 색별 보여줄 실수 수순
  MAX_GAMES: 600,     // 최근 대국만
};
const strip = (s) => String(s).replace(/[+#!?]+$/, "");
// 엔진 결과({cp, mate}, 둘 차례 기준) → 센티폰. 메이트는 ±1000.
export function cpOf(ev) { return ev.mate != null ? (ev.mate > 0 ? 1000 : -1000) : ev.cp; }
// 불릿은 시간 압박 탓이 커 학습 신호가 약하다(v0.2.2 기준을 따름). 수 없는 대국도 뺀다.
export function eligibleGames(games) {
  return (games || []).filter((g) => g && g.moves && g.moves.length && g.timeClass !== "bullet")
    .sort((a, b) => (b.endTime || 0) - (a.endTime || 0)).slice(0, OM.MAX_GAMES);
}
// 한 색의 대국들로 수순 나무를 만든다. 노드 = { san, sans(시작부터 이 수까지), count, kids: Map }
export function buildTrie(games, color) {
  const root = { san: null, sans: [], count: 0, kids: new Map() };
  for (const g of games) {
    if (g.color !== color) continue;
    root.count++;
    let node = root;
    for (let i = 0; i < Math.min(g.moves.length, OM.MAX_PLY); i++) {
      const key = strip(g.moves[i]);
      let kid = node.kids.get(key);
      if (!kid) { kid = { san: g.moves[i], sans: [...node.sans, g.moves[i]], count: 0, kids: new Map() }; node.kids.set(key, kid); }
      kid.count++;
      node = kid;
    }
  }
  return root;
}
// evalPos(sans) → Promise<{cp, mate} | null> (그 수순 뒤 둘 차례 기준). 많이 둔 수순부터 엔진에 묻고, 내 수에서 평가가 DROP 이상
// 떨어지면 그 수순을 실수로 기록(더 안 들어감). onUpdate(lines)는 새 실수를 찾을 때마다(빈도순 상위 MAX_LINES) 부른다.
export async function findOpeningMistakes({ games, color, evalPos, onUpdate, isCancelled }) {
  const root = buildTrie(games, color);
  const found = [];
  const queue = [];
  let evals = 0;
  const call = async (sans) => { evals++; try { return await evalPos(sans); } catch { return null; } };
  const rootEv = root.count >= OM.MIN_GAMES ? await call([]) : null;
  if (rootEv) queue.push({ node: root, ev: rootEv });
  while (queue.length && evals < OM.MAX_EVALS) {
    if (isCancelled && isCancelled()) return { lines: found, evals, cancelled: true };
    queue.sort((a, b) => b.node.count - a.node.count);
    const { node, ev } = queue.shift();
    // 이미 상위 MAX_LINES를 채웠고 남은 수순(빈도 ≤ node.count)이 가장 낮은 항목을 못 밀어내면 끝
    if (found.length >= OM.MAX_LINES && node.count <= found[found.length - 1].count) break;
    const moverWhite = node.sans.length % 2 === 0;
    const isUser = moverWhite === (color === "w");
    const kids = [...node.kids.values()].filter((k) => k.count >= OM.MIN_COUNT).sort((a, b) => b.count - a.count);
    for (const kid of kids) {
      if (evals >= OM.MAX_EVALS) break;
      if (isCancelled && isCancelled()) return { lines: found, evals, cancelled: true };
      const kev = await call(kid.sans);
      if (!kev) continue;
      if (isUser) {
        const drop = cpOf(ev) + cpOf(kev);   // ev = 내 차례 기준, kev = 상대 차례 기준 → 내 손실
        if (drop >= OM.DROP) {
          found.push({ seq: kid.sans, kind: drop >= OM.BLUNDER ? "blunder" : "inaccuracy", count: kid.count, color, drop });
          found.sort((a, b) => b.count - a.count);
          if (found.length > OM.MAX_LINES) found.length = OM.MAX_LINES;
          onUpdate && onUpdate([...found]);
          continue;
        }
      }
      if (kid.sans.length < OM.MAX_PLY) queue.push({ node: kid, ev: kev });
    }
  }
  return { lines: found, evals, cancelled: false };
}
// 실수 수순대로 둔 내 대국(최근순). 수순 = 시작부터의 수열.
export function gamesOfLine(games, seq, color) {
  return (games || []).filter((g) => g.color === color && g.moves.length >= seq.length && seq.every((s, i) => strip(g.moves[i]) === strip(s)))
    .sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
}
