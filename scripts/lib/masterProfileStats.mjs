// (v0.7.5) 마스터 상세 프로필 계산 공용 도구 — 선수별 PGN 묶음(build-master-profiles)과 저장소 안의 대국 DB(build-master-profiles-db)가 같은 계산을 쓴다.
//  입력 rec(그 선수 시점의 대국 한 판): { isW, res: "W"|"B"|"D", y(연도, 없으면 0), myElo, oppElo, opp(상대 표시 이름), moves(SAN 배열), eco(없으면 ""), ev(대회 이름 원문) }
//  출력 필드는 build-master-profiles.mjs 머리말 참고(n·y0·y1·wdl·w·b·peak·elo·fm·e4·d4·ecoW·ecoB·len·draw·opp·ev·best).
import { encodeMoves } from "../../src/lib/moveCodec.js";

const pct = (s, n) => (n ? Math.round((s / n) * 100) : 0);
/** 대회 이름에서 연도와 그 뒤(회차·장소)를 떼어 대회 계열 이름만 남긴다. */
export const eventSeries = (ev) => String(ev || "").replace(/\b(19|20)\d\d\b.*$/, "").replace(/\s+/g, " ").trim() || "?";

/** recs → 프로필(대국이 minGames보다 적으면 null). ecoName = { ECO 코드: 오프닝 이름 }. */
export function computeProfile(name, recs, ecoName, minGames = 20) {
  const P = { name, n: 0, y0: 9999, y1: 0, wdl: [0, 0, 0], w: [0, 0, 0], b: [0, 0, 0] };
  const eloByYear = new Map(), fm = new Map(), e4 = new Map(), d4 = new Map(), ecoW = new Map(), ecoB = new Map(), opp = new Map(), ev = new Map();
  let plies = 0, lenN = 0, peak = [0, 0]; const wins = [];
  const bump = (m, k, sc) => { const x = m.get(k) || [0, 0]; x[0]++; x[1] += sc; m.set(k, x); };
  for (const r of recs) {
    const { isW, res, y, myElo, oppElo, opp: oppName, moves } = r;
    if (res !== "W" && res !== "B" && res !== "D") continue;
    const sc = res === "D" ? 0.5 : (res === "W") === isW ? 1 : 0, ix = sc === 1 ? 0 : sc === 0.5 ? 1 : 2;
    P.n++; if (y) { P.y0 = Math.min(P.y0, y); P.y1 = Math.max(P.y1, y); } P.wdl[ix]++; (isW ? P.w : P.b)[ix]++;
    if (myElo) { if (y) eloByYear.set(y, Math.max(eloByYear.get(y) || 0, myElo)); if (myElo > peak[0]) peak = [myElo, y]; }
    if (moves.length) { plies += moves.length; lenN++; }
    const m0 = moves[0], m1 = moves[1];
    if (isW && m0) bump(fm, m0, sc);
    if (!isW && m0 === "e4" && m1) bump(e4, m1, sc);
    if (!isW && m0 === "d4" && m1) bump(d4, m1, sc);
    if (r.eco) bump(isW ? ecoW : ecoB, r.eco, sc);
    const o = opp.get(oppName) || [0, 0, 0, 0]; o[0]++; o[1 + ix]++; opp.set(oppName, o);
    const evName = eventSeries(r.ev);
    const e = ev.get(evName) || [0, 9999, 0]; e[0]++; if (y) { e[1] = Math.min(e[1], y); e[2] = Math.max(e[2], y); } ev.set(evName, e);
    if (sc === 1 && oppElo >= 2400 && moves.length >= 20) wins.push({ y, ev: evName, opp: oppName, oppElo, color: isW ? "w" : "b", moves });
  }
  if (P.n < minGames) return null;
  const top = (m, k, f) => [...m.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, k).map(([x, v]) => f(x, v));
  P.peak = peak; P.elo = [...eloByYear.entries()].sort((a, b) => a[0] - b[0]);
  P.fm = top(fm, 5, (x, v) => [x, v[0], pct(v[1], v[0])]); P.e4 = top(e4, 4, (x, v) => [x, v[0], pct(v[1], v[0])]); P.d4 = top(d4, 4, (x, v) => [x, v[0], pct(v[1], v[0])]);
  P.ecoW = top(ecoW, 6, (x, v) => [x, ecoName[x] || "", v[0], pct(v[1], v[0])]); P.ecoB = top(ecoB, 6, (x, v) => [x, ecoName[x] || "", v[0], pct(v[1], v[0])]);
  P.len = lenN ? Math.round(plies / lenN / 2) : 0; P.draw = pct(P.wdl[1], P.n);
  P.opp = [...opp.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 8).map(([x, v]) => [x, v[0], v[1], v[2], v[3]]);
  P.ev = top(ev, 8, (x, v) => [x, v[0], v[1] === 9999 ? 0 : v[1], v[2]]);
  wins.sort((a, b) => b.oppElo - a.oppElo || b.moves.length - a.moves.length);
  // 같은 상대에게 거둔 승리는 2판까지만(레이팅 높은 한 명에게 몰리지 않게)
  const perOpp = new Map(), pick = [];
  for (const w of wins) { const c = perOpp.get(w.opp) || 0; if (c >= 2) continue; perOpp.set(w.opp, c + 1); pick.push(w); if (pick.length === 6) break; }
  P.best = pick.map((x) => [x.y, x.ev, x.opp, x.oppElo, x.color, encodeMoves(x.moves).code]);
  return P;
}

/** ECO → 오프닝 이름(openings.json 트리에서 가장 먼저 나오는 = 가장 일반적인 이름). */
export function ecoNameTable(tree) {
  const ecoName = {};
  for (const node of Object.values(tree)) for (const m of node.moves || []) if (m.eco && m.name && !ecoName[m.eco]) ecoName[m.eco] = m.name;
  return ecoName;
}
