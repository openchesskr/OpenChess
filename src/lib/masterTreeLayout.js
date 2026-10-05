// (v0.6.3) 도감 "마스터" 모식도 배치 — 순수 계산(scripts/check-masters.mjs가 검사). 데이터는 src/data/worldChampions.js.
//  · 위→아래가 시간 순서다. 정통 계보(lane C)는 가운데 한 줄, 분열기(1993~2006)는 왼쪽(L)·오른쪽(R) 두 줄로 갈라졌다가 통합 챔피언 노드로 합쳐진다.
//  · 챔피언 노드(CH_W×CH_H) 옆에 "탈락한 도전자" 위성 노드(SAT_W×SAT_H)를 둔다. 가운데 줄은 좌우로 번갈아, 왼쪽 줄은 바깥(왼쪽), 오른쪽 줄은 바깥(오른쪽)으로 쌓는다.
//  · 같은 도전자가 한 챔피언에게 여러 번 졌으면(치고린 1889·1892) 위성 노드 하나에 해(years)를 모은다.
//  · 반환 좌표는 모두 캔버스 좌상단 기준(PAD 여백 포함). nodes[].x·y는 노드 좌상단.
export const MT = { TOUR_W: 300, TOUR_H: 120, TOUR_GAP: 28, TOUR_COL_GAP: 300, ED_W: 104, ED_H: 60, ED_GAP: 14, ED_START: 36, PANEL_GAP: 18, PANEL_PAD: 14, PANEL_HEAD: 34, PANEL_COLS: 4, PL_W: 150, PL_H: 34, PL_GAP: 10, PANEL_EMPTY_H: 64, CH_W: 224, CH_H: 88, SAT_W: 150, SAT_H: 46, SAT_STEP: 58, SAT_GAP: 30, ROW_GAP: 56, LANE_DX: 360, PAD: 70, TOP_PAD: 70, LABEL_W: 220, LABEL_H: 26, LABEL_GAP: 14, CHIP: 60, CHIP_GAP: 260, W_COL_GAP: 300, S_LEN: 260, S_DROP: 150, FIDE_W: 292, FIDE_H: 84, FIDE_STEP: 98, FIDE_COL_DX: 420, DB_W: 292, DB_H: 78, DB_STEP: 90, DB_LINK: 50, DB_COLS: 3, DB_COL_GAP: 60 };

export function satellitesOf(champ) {
  const byName = new Map(); const out = [];
  for (const d of champ.defenses || []) {
    if (!d.sat) continue;
    let s = byName.get(d.opp);
    if (!s) { s = { opp: d.opp, name: d.opp, ko: d.ko, cc: d.cc, years: [], matches: [] }; byName.set(d.opp, s); out.push(s); }
    s.years.push(d.y); s.matches.push(d);
  }
  return out;
}

/* 개최 연도에 재위 중이던 정통 계보(C·L 줄) 챔피언. 재위는 [from, to) — 같은 해 교체면 새 챔피언. 분열기 FIDE 줄(R)은 제외. 없으면 null(1946~47년 공위기 등). */
export function championAt(champions, year) {
  let found = null;
  for (const c of champions) if (c.lane !== "R" && c.from <= year && (c.to == null || year < c.to)) found = c;
  return found;
}
/* 연도 → 세로 위치: 챔피언 노드 중심들을 (재위 시작 연도, y) 기준점으로 삼아 사이를 선형 보간한다. 범위 밖은 양 끝에 붙인다. */
export function yearToY(anchors, year) {
  if (year <= anchors[0].year) return anchors[0].y;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    if (year <= b.year) return b.year === a.year ? b.y : a.y + ((year - a.year) / (b.year - a.year)) * (b.y - a.y);
  }
  return anchors[anchors.length - 1].y;
}

export function layoutMasters(champions, transfers, splitRows, upcoming, tournaments = [], editions = {}, expanded = null, fide = null, dbMasters = null) {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const splitIds = new Set(splitRows.flat().filter(Boolean));
  const nodes = [], edges = [], champNode = new Map();
  // 도감 오프닝 트리와 같은 중심 회로 칩 — 칩에서 동서남북 네 갈래 회로선이 뻗는다.
  //  북: 역대 세계 챔피언(최근 챔피언이 칩 가까이, 위로 갈수록 과거) · 동: 주요 대회 · 남: FIDE 순위 세 갈래(스탠다드·래피드·블리츠) · 서: 마스터 대국 DB 선수(알파벳순).
  const chip = { cx: 0, cy: 0, size: MT.CHIP };
  let y = 0;   // 챔피언 줄은 먼저 위→아래(과거→최근)로 쌓은 뒤, 아래 끝(최근)이 칩 위쪽에 닿도록 통째로 위로 옮긴다.
  const laneX = { C: 0, L: -MT.LANE_DX / 2, R: MT.LANE_DX / 2 };
  const placeRow = (cells) => {
    // cells: [{ champ, lane }] — 같은 행의 칸들. 행 높이 = 칸마다 필요한 높이(챔피언 또는 위성 쌓임)의 최댓값.
    const prepared = cells.map(({ champ, lane }) => {
      const sats = satellitesOf(champ);
      const sides = lane === "C" ? [sats.filter((_, i) => i % 2 === 0), sats.filter((_, i) => i % 2 === 1)] : lane === "L" ? [sats, []] : [[], sats];
      const need = Math.max(MT.CH_H, Math.max(sides[0].length, sides[1].length) * MT.SAT_STEP);
      return { champ, lane, sides, need };
    });
    const rowH = Math.max(...prepared.map((p) => p.need));
    const cy = y + rowH / 2;
    for (const p of prepared) {
      const cx = laneX[p.lane];
      const n = { id: p.champ.id, kind: "champ", champ: p.champ, lane: p.lane, x: cx - MT.CH_W / 2, y: cy - MT.CH_H / 2, w: MT.CH_W, h: MT.CH_H };
      nodes.push(n); champNode.set(p.champ.id, n);
      [["L", p.sides[0]], ["R", p.sides[1]]].forEach(([side, list]) => {
        list.forEach((s, i) => {
          const sy = cy - ((list.length - 1) * MT.SAT_STEP) / 2 + i * MT.SAT_STEP;
          const sx = side === "L" ? cx - MT.CH_W / 2 - MT.SAT_GAP - MT.SAT_W : cx + MT.CH_W / 2 + MT.SAT_GAP;
          const sn = { id: p.champ.id + ":" + s.opp, kind: "sat", sat: s, champId: p.champ.id, side, x: sx, y: sy - MT.SAT_H / 2, w: MT.SAT_W, h: MT.SAT_H };
          nodes.push(sn);
          edges.push({ kind: "sat", from: p.champ.id, to: sn.id, side });
        });
      });
    }
    y += rowH + MT.ROW_GAP;
  };
  // 데이터 순서(챔피언 배열)를 따라가며 분열기 행은 한 번에 처리한다.
  let splitDone = false;
  for (const c of champions) {
    if (splitIds.has(c.id)) {
      if (splitDone) continue;
      splitDone = true;
      for (const row of splitRows) placeRow(row.map((id, i) => id && { champ: byId.get(id), lane: i === 0 ? "L" : "R" }).filter(Boolean));
      continue;
    }
    placeRow([{ champ: c, lane: "C" }]);
  }
  // 곧 열릴 타이틀전 — 마지막 챔피언 아래에 점선 위성 노드 하나.
  let upNode = null;
  if (upcoming) {
    const base = champNode.get(upcoming.champ);
    upNode = { id: "upcoming", kind: "upcoming", upcoming, x: base.x + base.w / 2 - MT.CH_W / 2, y: y - MT.ROW_GAP + 40, w: MT.CH_W, h: MT.SAT_H + 12 };
    nodes.push(upNode);
    edges.push({ kind: "upcoming", from: upcoming.champ, to: "upcoming" });
    y = upNode.y + upNode.h + MT.ROW_GAP;
  }
  for (const t of transfers) edges.push({ kind: "transfer", from: t.from, to: t.to, t });
  const lastChamp = upNode || champNode.get(champions[champions.length - 1].id);   // 칩과 가장 가까운(맨 아래) 노드
  { const shift = chip.cy - MT.CHIP / 2 - MT.CHIP_GAP - (lastChamp.y + lastChamp.h); for (const n of nodes) n.y += shift; }
  const champRight = Math.max(...nodes.map((n) => n.x + n.w)), champLeft = Math.min(...nodes.map((n) => n.x));
  // 오른쪽 대회 열 — 개최 연도를 챔피언 행의 높이에 맞추되(기준점 보간), 대회 블록(허브) 오른쪽으로 연도 블록이 한 줄로 이어진다(editions[id] = [[연도, 대국 수, 선수 수, 이름들], …]).
  // expanded = "대회id:연도" 하나면 그 연도 블록 아래에 대진표 영역(panel)이 펼쳐지고, 그 높이만큼 아래 대회들이 밀려난다.
  let rail = null;
  const panels = [];
  if (tournaments.length) {
    const colX = champRight + MT.TOUR_COL_GAP;
    const sorted = tournaments.map((tr, i) => ({ tr, i })).sort((a, b) => a.tr.from - b.tr.from || a.i - b.i);
    const tourNodes = [];
    const panelW = MT.PANEL_COLS * MT.PL_W + (MT.PANEL_COLS - 1) * MT.PL_GAP + MT.PANEL_PAD * 2;
    const info = sorted.map(({ tr }) => {
      const eds = (editions[tr.id] || []).map((e) => ({ y: e[0], games: e[1], n: e[2], names: e[3] || [] }));
      if (!eds.some((e) => e.y === tr.from)) eds.push({ y: tr.from, games: 0, n: 0, names: [] });
      eds.sort((a, b) => a.y - b.y);
      return { tr, eds };
    });
    const expOf = (tr, eds, ek) => (ek && ek.startsWith(tr.id + ":") ? eds.find((e) => tr.id + ":" + e.y === ek) : null);
    const panelHOf = (exp) => (!exp ? 0 : exp.names.length ? MT.PANEL_HEAD + MT.PANEL_PAD + Math.ceil(exp.names.length / MT.PANEL_COLS) * MT.PL_H + (Math.ceil(exp.names.length / MT.PANEL_COLS) - 1) * MT.PL_GAP + MT.PANEL_PAD : MT.PANEL_HEAD + MT.PANEL_EMPTY_H);
    // 대회 허브는 챔피언 행과 무관하게 연도순으로 위→아래 일정 간격으로 쌓고(연도 블록을 펼치면 그 높이만큼 아래가 밀린다), 펼치지 않은 상태의 열 가운데가 중심 회로 칩과 같은 높이가 되도록 전체를 옮긴다.
    const stack = (ek) => { let prevBottom = null; return info.map(({ tr, eds }) => { const exp = expOf(tr, eds, ek); const halfDown = Math.max(MT.TOUR_H / 2, exp ? MT.ED_H / 2 + MT.PANEL_GAP + panelHOf(exp) : 0); const cy = prevBottom == null ? 0 : prevBottom + MT.TOUR_GAP + MT.TOUR_H / 2; prevBottom = cy + halfDown; return cy; }); };
    const base = stack(null), offset = chip.cy - (base[0] + base[base.length - 1]) / 2, cys = stack(expanded).map((c) => c + offset);
    for (let ti = 0; ti < info.length; ti++) {
      const { tr, eds } = info[ti], cy = cys[ti];
      const exp = expOf(tr, eds, expanded), panelH = panelHOf(exp);
      const hub = { id: "tour:" + tr.id, kind: "tour", tour: tr, x: colX, y: cy - MT.TOUR_H / 2, w: MT.TOUR_W, h: MT.TOUR_H};
      nodes.push(hub); tourNodes.push(hub);
      let ex = colX + MT.TOUR_W + MT.ED_START;
      eds.forEach((e) => {
        const en = { id: "ed:" + tr.id + ":" + e.y, kind: "edition", tourId: tr.id, tour: tr, year: e.y, games: e.games, open: exp === e, x: ex, y: cy - MT.ED_H / 2, w: MT.ED_W, h: MT.ED_H };
        nodes.push(en);
        if (exp === e) {
          const pn = { id: "panel:" + en.id, tourId: tr.id, tour: tr, year: e.y, empty: !e.names.length, x: en.x, y: en.y + en.h + MT.PANEL_GAP, w: panelW, h: panelH };
          panels.push(pn);
          e.names.forEach((nm, i) => nodes.push({ id: "pl:" + tr.id + ":" + e.y + ":" + i, kind: "player", tourId: tr.id, tour: tr, name: nm, year: e.y, x: pn.x + MT.PANEL_PAD + (i % MT.PANEL_COLS) * (MT.PL_W + MT.PL_GAP), y: pn.y + MT.PANEL_HEAD + Math.floor(i / MT.PANEL_COLS) * (MT.PL_H + MT.PL_GAP), w: MT.PL_W, h: MT.PL_H }));
          edges.push({ kind: "drop", tour: tr, from: en.id, to: en.id, enId: en.id, panel: pn });
        }
        ex += MT.ED_W + MT.ED_GAP;
      });
      edges.push({ kind: "row", from: hub.id, to: hub.id, tour: tr, x1: colX + MT.TOUR_W, x2: ex - MT.ED_GAP, y: cy });
    }
    const first = tourNodes[0], last = tourNodes[tourNodes.length - 1];
    rail = { x: colX - 28, y1: first.y + first.h / 2, y2: last.y + last.h / 2 };
    rail.mid = chip.cy;   // 동쪽 회로선이 일자로 닿는 높이 = 칩 높이(= 펼치지 않은 대회 열의 가운데)
    for (const n of tourNodes) edges.push({ kind: "tour", from: n.id, to: n.id });
  }
  const half = chip.size / 2;
  // 서쪽 — 마스터 대국 DB 선수(알파벳 순). 한 줄로 쭉 늘어놓으면 너무 길어 DB_COLS개의 세로 열로 나누고(앞 열이 칩에 가깝고 A→Z가 열을 따라 이어진다),
  // 열마다 세로선(wrail)을 두며 칩 높이의 서쪽 선이 일직선으로 모든 세로선을 지난다. 열은 같은 길이(짝수 줄)라 이 직선은 노드를 가로지르지 않는다.
  let wrails = null;
  if (dbMasters && dbMasters.length) {
    const per = Math.ceil(dbMasters.length / MT.DB_COLS), perEven = per + (per % 2), total = (perEven - 1) * MT.DB_STEP;
    wrails = [];
    for (let k = 0; k < MT.DB_COLS; k++) {
      const wx = champLeft - MT.W_COL_GAP - k * (MT.DB_LINK + MT.DB_W + MT.DB_COL_GAP), part = dbMasters.slice(k * per, (k + 1) * per);
      if (!part.length) break;
      // 짝수 줄 기준으로 칩 높이를 가운데로 맞춘다(줄이 모자란 마지막 열도 같은 자리에서 시작).
      part.forEach((m, j) => {
        const cyy = chip.cy - total / 2 + j * MT.DB_STEP, i = k * per + j;
        const n = { id: "dbm:" + i, kind: "dbm", dbm: { name: m[0], games: m[1], elo: m[2] }, index: i, col: k, x: wx - MT.DB_LINK - MT.DB_W, y: cyy - MT.DB_H / 2, w: MT.DB_W, h: MT.DB_H };
        nodes.push(n); edges.push({ kind: "dlink", from: n.id, to: n.id, wx });
      });
      wrails.push({ x: wx, y1: chip.cy - total / 2, y2: chip.cy - total / 2 + (part.length - 1) * MT.DB_STEP, col: k });
      if (k) edges.push({ kind: "wseg", from: null, to: null, col: k, x1: wrails[k - 1].x, x2: wx });
    }
  }
  const wrail = wrails && wrails[0];
  // 남쪽 — FIDE 순위 세 갈래: 칩 아래 선이 분기점에서 가로로 갈라져 세 줄로 내려가고, 각 줄에 1위부터 쭉 나열한다.
  let south = null;
  if (fide) {
    const jy = chip.cy + half + MT.S_LEN, firstY = jy + MT.S_DROP;
    south = { jy, bus: { x1: -MT.FIDE_COL_DX, x2: MT.FIDE_COL_DX }, cols: [] };
    ["standard", "rapid", "blitz"].forEach((key, ci) => {
      const cx = (ci - 1) * MT.FIDE_COL_DX, list = fide.lists[key] || [];
      south.cols.push({ key, cx, drop: { x: cx, y1: jy, y2: firstY } });
      list.forEach((r, i) => {
        const n = { id: "fide:" + key + ":" + r[0], kind: "fide", list: key, rank: r[0], fide: { id: r[1], name: r[2], fed: r[3], rating: r[4], born: r[5] }, x: cx - MT.FIDE_W / 2, y: firstY + i * MT.FIDE_STEP, w: MT.FIDE_W, h: MT.FIDE_H };
        nodes.push(n);
        if (i) edges.push({ kind: "fchain", from: "fide:" + key + ":" + list[i - 1][0], to: n.id, list: key, rank: r[0] });
      });
    });
  }
  // 회로 칩의 네 갈래(trace.pts = 꺾은선 꼭짓점) — 북: 가장 최근 챔피언 아래까지, 동·서: 세로선까지 일직선, 남: 분기점까지.
  const traces = [{ dir: "N", pts: [[chip.cx, chip.cy - half], [chip.cx, lastChamp.y + lastChamp.h]] }];
  if (rail) traces.push({ dir: "E", pts: [[chip.cx + half, chip.cy], [rail.x, chip.cy]] });
  if (south) traces.push({ dir: "S", pts: [[chip.cx, chip.cy + half], [chip.cx, south.jy]] });
  if (wrail) traces.push({ dir: "W", pts: [[chip.cx - half, chip.cy], [wrail.x, chip.cy]] });
  // 좌표를 양수로 옮긴다.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of [...nodes, ...panels]) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.w); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + n.h); }
  // 열 이름 라벨 — 오프닝 트리의 금색 오프닝 이름처럼 해당 회로선 옆에 놓는다.
  const labels = [];
  labels.push({ id: "champs", key: "champs", align: "left", x: chip.cx + 16, y: chip.cy - half - MT.CHIP_GAP / 2 - MT.LABEL_H / 2, w: MT.LABEL_W, h: MT.LABEL_H });
  if (rail) labels.push({ id: "tours", key: "tours", align: "center", x: (chip.cx + half + rail.x) / 2 - MT.LABEL_W / 2, y: chip.cy - 8 - MT.LABEL_H, w: MT.LABEL_W, h: MT.LABEL_H });
  if (wrail) labels.push({ id: "db", key: "db", align: "center", x: (chip.cx - half + wrail.x) / 2 - MT.LABEL_W / 2, y: chip.cy - 8 - MT.LABEL_H, w: MT.LABEL_W, h: MT.LABEL_H });
  if (south) for (const c of south.cols) labels.push({ id: "fide-" + c.key, key: "fide-" + c.key, align: "center", plaque: true, x: c.cx - MT.FIDE_W / 2, y: c.drop.y1 + (MT.S_DROP - 52) / 2, w: MT.FIDE_W, h: 52 });
  for (const l of labels) { minX = Math.min(minX, l.x); maxX = Math.max(maxX, l.x + l.w); minY = Math.min(minY, l.y); }
  const dx = MT.PAD - minX, dy = MT.TOP_PAD - minY;
  for (const l of labels) { l.x += dx; l.y += dy; }
  for (const n of [...nodes, ...panels]) { n.x += dx; n.y += dy; }
  if (rail) { rail.x += dx; rail.y1 += dy; rail.y2 += dy; rail.mid += dy; }
  if (wrails) for (const w of wrails) { w.x += dx; w.y1 += dy; w.y2 += dy; }
  if (south) { south.jy += dy; south.bus.x1 += dx; south.bus.x2 += dx; for (const c of south.cols) { c.cx += dx; c.drop.x += dx; c.drop.y1 += dy; c.drop.y2 += dy; } }
  chip.cx += dx; chip.cy += dy;
  for (const t of traces) for (const q of t.pts) { q[0] += dx; q[1] += dy; }
  for (const e of edges) { if (e.kind === "row") { e.x1 += dx; e.x2 += dx; e.y += dy; } if (e.kind === "dlink") e.wx += dx; if (e.kind === "wseg") { e.x1 += dx; e.x2 += dx; } }
  const byNodeId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) { e.a = byNodeId.get(e.from); e.b = byNodeId.get(e.to); }
  const width = maxX - minX + MT.PAD * 2, height = maxY - minY + MT.TOP_PAD + MT.PAD;
  return { nodes, panels, edges, labels, rail, wrail, wrails, south, chip, traces, width, height, centerX: chip.cx, lastChamp, byNodeId };
}

/* 챔피언 노드끼리 잇는 선의 경로(SVG path)와 라벨 위치. 위 노드 아래 가운데 → 아래 노드 위 가운데를 세로 곡선으로 잇는다. */
export function transferPath(a, b) {
  const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y;
  const my = (y1 + y2) / 2;
  return { d: "M" + x1 + " " + y1 + " C" + x1 + " " + my + " " + x2 + " " + my + " " + x2 + " " + y2, lx: (x1 + x2) / 2, ly: my };
}

/* 팬 한계 — 내용(캔버스 전체)이 화면 밖으로 완전히 사라지지 않게 한다. 내용이 화면보다 작은 축은 가운데(세로는 위쪽 여백)에 고정,
   큰 축은 가장자리가 화면 가장자리를 넘지 않는 범위 안에서만 움직인다(맨 아래 챔피언이 바닥에서 멈춘다). */
export function clampMasterPan(pan, zoom, viewW, viewH, layout, margin = 20) {
  const cw = layout.width * zoom, ch = layout.height * zoom;
  const axis = (p, view, size, center) => (size + margin * 2 <= view ? (center ? (view - size) / 2 : margin) : Math.max(view - size - margin, Math.min(margin, p)));
  return { x: axis(pan.x, viewW, cw, true), y: axis(pan.y, viewH, ch, false) };
}
