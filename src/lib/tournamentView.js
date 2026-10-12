// (v0.6.5) 대회 회차 화면의 순수 계산 — 순위표·크로스테이블·녹아웃 대진표·대국 목록. 화면(components/tournamentView.jsx)과 검사(scripts/check-tournament-data.mjs)가 함께 쓴다.
// 입력 회차(ed)는 scripts/build-pgn-tournaments.mjs가 만든 형식이다:
//  ed.pl = [[이름, 엘로, 타이틀, 점수×2, 본 경기 대국 수], …]  (점수 순)
//  ed.g  = [[라운드, 보드(또는 매치 안의 국 번호), 백 선수 번호, 흑 선수 번호, 결과(2 백승·1 무·0 흑승·-1 모름), 수순 부호, ECO, 단계(생략=본 경기)], …]
//  ed.fmt = rr(라운드로빈) · swiss · ko(녹아웃) · match(두 사람의 매치) · list(라운드 정보 없음)
export const RES_TXT = { 2: "1-0", 1: "0.5-0.5", 0: "0-1", "-1": "*" };   // ½ 기호는 쓰지 않는다(0.5 표기)
export const fmtScore = (s2) => String(s2 / 2);   // 점수×2 → "8.5"·"10"
const isMain = (g) => !g[7];

/** 본 경기(단계 0)만 번호와 함께 돌려준다. */
export const mainGames = (ed) => ed.g.map((g, i) => ({ g, i })).filter((x) => isMain(x.g));

/** 순위표: 본 경기를 한 선수만(pl 순서 = 점수 순). */
export function standings(ed) {
  return ed.pl.map((p, i) => ({ i, name: p[0], elo: p[1], title: p[2], score2: p[3], n: p[4] })).filter((r) => r.n > 0);
}

/** 크로스테이블(라운드로빈): 행 선수 시점의 결과 문자 배열 cells[i][j] = [{ t: "1"|"0.5"|"0", gi }]. i·j는 standings 안의 위치. */
export function crosstable(ed) {
  const rows = standings(ed), pos = new Map(rows.map((r, k) => [r.i, k]));
  const cells = rows.map(() => rows.map(() => []));
  for (const { g, i } of mainGames(ed)) {
    const a = pos.get(g[2]), b = pos.get(g[3]); if (a == null || b == null || g[4] < 0) continue;
    const wa = g[4] === 2 ? "1" : g[4] === 1 ? "0.5" : "0", wb = g[4] === 0 ? "1" : g[4] === 1 ? "0.5" : "0";
    cells[a][b].push({ t: wa, gi: i, c: "w" }); cells[b][a].push({ t: wb, gi: i, c: "b" });
  }
  return { rows, cells };
}

/** 녹아웃 대진표: 라운드별 매치(같은 두 선수의 모든 국). 라운드는 오름차순, 마지막이 결승. */
export function bracket(ed) {
  const byRound = new Map();
  for (const { g, i } of mainGames(ed)) {
    if (!g[0]) continue;
    if (!byRound.has(g[0])) byRound.set(g[0], new Map());
    const a = Math.min(g[2], g[3]), b = Math.max(g[2], g[3]), k = a + "-" + b, m = byRound.get(g[0]);
    if (!m.has(k)) m.set(k, { a, b, sa: 0, sb: 0, games: [], tb: false });
    const x = m.get(k); x.games.push(i); if (g[1] > 2) x.tb = true;
    const pa = g[2] === a ? "w" : "b";   // a가 백인가
    if (g[4] === 1) { x.sa += 0.5; x.sb += 0.5; } else if (g[4] === 2) { if (pa === "w") x.sa++; else x.sb++; } else if (g[4] === 0) { if (pa === "w") x.sb++; else x.sa++; }
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b).map((r) => {
    const ms = [...byRound.get(r).values()].map((m) => ({ ...m, win: m.sa > m.sb ? m.a : m.sb > m.sa ? m.b : null }));
    ms.sort((x, y) => Math.max(ed.pl[y.a][1], ed.pl[y.b][1]) - Math.max(ed.pl[x.a][1], ed.pl[x.b][1]) || x.a - y.a);
    return { r, matches: ms };
  });
  // 3·4위전: 마지막 라운드에 매치가 둘 이상이면, 직전 라운드 승자끼리의 매치가 결승이고 나머지는 3·4위전(bronze)이다.
  if (rounds.length >= 2) {
    const last = rounds[rounds.length - 1], prev = new Set(rounds[rounds.length - 2].matches.map((m) => m.win).filter((x) => x != null));
    if (last.matches.length > 1) last.matches.forEach((m) => { if (!(prev.has(m.a) && prev.has(m.b))) m.bronze = true; });
  }
  return rounds;
}
/** 라운드 이름(남은 매치 수 기준): 1 결승 · 2 준결승 · 4 8강 … */
export function roundKey(remaining) { return remaining === 1 ? "final" : remaining === 2 ? "semi" : remaining === 4 ? "qf" : remaining === 8 ? "r16" : remaining === 16 ? "r32" : remaining === 32 ? "r64" : "round"; }

/** 매치(두 사람): 국 순서와 누적 점수. */
export function matchSummary(ed) {
  const gs = mainGames(ed).slice().sort((x, y) => x.g[0] - y.g[0] || x.g[1] - y.g[1] || x.i - y.i);
  let a = 0, b = 0; const first = 0;   // 매치는 선수 두 명 — 0번(점수 1위)이 a
  return gs.map(({ g, i }) => { const wa = g[2] === first; if (g[4] === 1) { a += 0.5; b += 0.5; } else if (g[4] === 2) { if (wa) a++; else b++; } else if (g[4] === 0) { if (wa) b++; else a++; } return { gi: i, a, b }; });
}

/** 대국 목록 필터: { round(0=전체), text(선수 이름 일부), res(전체=null, 2·1·0), stage(null 전체) }. 결과는 정렬된 [{g, i}]. */
export function filterGames(ed, f = {}) {
  const q = String(f.text || "").trim().toLowerCase();
  const out = ed.g.map((g, i) => ({ g, i })).filter(({ g }) => {
    if (f.round && g[0] !== f.round) return false;
    if (f.res != null && g[4] !== f.res) return false;
    if (f.stage != null && (g[7] || 0) !== f.stage) return false;
    if (q && !(ed.pl[g[2]][0].toLowerCase().includes(q) || ed.pl[g[3]][0].toLowerCase().includes(q))) return false;
    return true;
  });
  return out.sort((x, y) => (x.g[7] || 0) - (y.g[7] || 0) || x.g[0] - y.g[0] || x.g[1] - y.g[1] || x.i - y.i);
}
export const roundsOf = (ed) => [...new Set(ed.g.map((g) => g[0]).filter(Boolean))].sort((a, b) => a - b);

/** 회차의 우승자: 녹아웃은 결승 승자, 그 밖은 최고 점수자(공동 4명 초과면 없음). { names: [이름], score(점수), tie: 공동 여부 } 또는 null. */
export function winnerOf(ed) {
  if (ed.fmt === "ko") {
    const br = bracket(ed); const fin = br.length ? br[br.length - 1].matches.filter((m) => !m.bronze) : [];
    if (fin.length !== 1 || fin[0].win == null) return null;
    const m = fin[0]; return { names: [ed.pl[m.win][0]], score: Math.max(m.sa, m.sb), tie: false };
  }
  const rows = standings(ed); if (!rows.length) return null;
  const top = rows[0].score2, ws = rows.filter((r) => r.score2 === top);
  if (!top || ws.length > 4) return null;
  return { names: ws.map((r) => r.name), score: top / 2, tie: ws.length > 1 };
}
