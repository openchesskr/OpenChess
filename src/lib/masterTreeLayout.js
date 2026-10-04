// (v0.6.3) 도감 "마스터" 모식도 배치 — 순수 계산(scripts/check-masters.mjs가 검사). 데이터는 src/data/worldChampions.js.
//  · 위→아래가 시간 순서다. 정통 계보(lane C)는 가운데 한 줄, 분열기(1993~2006)는 왼쪽(L)·오른쪽(R) 두 줄로 갈라졌다가 통합 챔피언 노드로 합쳐진다.
//  · 챔피언 노드(CH_W×CH_H) 옆에 "탈락한 도전자" 위성 노드(SAT_W×SAT_H)를 둔다. 가운데 줄은 좌우로 번갈아, 왼쪽 줄은 바깥(왼쪽), 오른쪽 줄은 바깥(오른쪽)으로 쌓는다.
//  · 같은 도전자가 한 챔피언에게 여러 번 졌으면(치고린 1889·1892) 위성 노드 하나에 해(years)를 모은다.
//  · 반환 좌표는 모두 캔버스 좌상단 기준(PAD 여백 포함). nodes[].x·y는 노드 좌상단.
export const MT = { TOUR_W: 300, TOUR_H: 120, TOUR_GAP: 28, TOUR_COL_GAP: 300, ED_W: 104, ED_H: 60, ED_GAP: 14, ED_START: 36, PANEL_GAP: 18, PANEL_PAD: 14, PANEL_HEAD: 34, PANEL_COLS: 4, PL_W: 150, PL_H: 34, PL_GAP: 10, PANEL_EMPTY_H: 64, CH_W: 224, CH_H: 88, SAT_W: 150, SAT_H: 46, SAT_STEP: 58, SAT_GAP: 30, ROW_GAP: 56, LANE_DX: 360, PAD: 70, TOP_PAD: 70, LABEL_W: 220, LABEL_H: 26, LABEL_GAP: 14, CHIP: 60, CHIP_GAP: 260, STUB_N: 300, STUB_W: 420 };

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

export function layoutMasters(champions, transfers, splitRows, upcoming, tournaments = [], editions = {}, expanded = null) {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const splitIds = new Set(splitRows.flat().filter(Boolean));
  const nodes = [], edges = [], champNode = new Map();
  // 도감 오프닝 트리와 같은 중심 회로 칩 — 칩에서 동서남북 네 갈래 회로선이 뻗는다. 남쪽: 역대 세계 챔피언, 동쪽: 주요 대회, 북·서쪽은 아직 비어 있는 단자(끝 패드)만 둔다.
  const chip = { cx: 0, cy: MT.TOP_PAD + MT.STUB_N + MT.CHIP / 2, size: MT.CHIP };
  let y = chip.cy + MT.CHIP / 2 + MT.CHIP_GAP;
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
  // 오른쪽 대회 열 — 개최 연도를 챔피언 행의 높이에 맞추되(기준점 보간), 대회 블록(허브) 오른쪽으로 연도 블록이 한 줄로 이어진다(editions[id] = [[연도, 대국 수, 선수 수, 이름들], …]).
  // expanded = "대회id:연도" 하나면 그 연도 블록 아래에 대진표 영역(panel)이 펼쳐지고, 그 높이만큼 아래 대회들이 밀려난다.
  let rail = null;
  const panels = [];
  if (tournaments.length) {
    const colX = nodes.reduce((m, n) => Math.max(m, n.x + n.w), -Infinity) + MT.TOUR_COL_GAP;
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
  // 회로 칩의 네 갈래(trace)와 북·서쪽 끝 패드 — 남쪽은 첫 챔피언 노드 위, 동쪽은 대회 열 세로선(rail) 꼭대기까지.
  const half = chip.size / 2, firstChamp = champNode.get(champions[0].id);
  // trace.pts = 꺾은선 꼭짓점. 동쪽 선은 칩에서 오른쪽으로 길게 나가 대회 열 가까이에서 세로선(rail)의 가운데 높이로 꺾여 닿는다.
  const traces = [{ dir: "S", pts: [[chip.cx, chip.cy + half], [chip.cx, firstChamp.y]] }];
  if (rail) traces.push({ dir: "E", pts: [[chip.cx + half, chip.cy], [rail.x, chip.cy]] });
  traces.push({ dir: "N", pts: [[chip.cx, chip.cy - half], [chip.cx, chip.cy - half - MT.STUB_N]] });
  traces.push({ dir: "W", pts: [[chip.cx - half, chip.cy], [chip.cx - half - MT.STUB_W, chip.cy]] });
  const pads = traces.filter((t) => t.dir === "N" || t.dir === "W").map((t) => ({ dir: t.dir, x: t.pts[t.pts.length - 1][0], y: t.pts[t.pts.length - 1][1] }));
  // 좌표를 양수로 옮긴다.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of [...nodes, ...panels]) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.w); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + n.h); }
  for (const pd of pads) { minX = Math.min(minX, pd.x - 8); minY = Math.min(minY, pd.y - 8); }
  // 열 이름 라벨("역대 세계 챔피언"·"주요 대회") — 오프닝 트리의 금색 오프닝 이름처럼 해당 회로선 옆에 놓는다: 챔피언은 남쪽 선 오른쪽, 대회는 동쪽 선 위.
  const labels = [];
  labels.push({ id: "champs", key: "champs", align: "left", x: chip.cx + 16, y: chip.cy + half + (MT.CHIP_GAP - MT.LABEL_H) / 2, w: MT.LABEL_W, h: MT.LABEL_H });
  if (rail) labels.push({ id: "tours", key: "tours", align: "center", x: (chip.cx + half + rail.x) / 2 - MT.LABEL_W / 2, y: chip.cy - 8 - MT.LABEL_H, w: MT.LABEL_W, h: MT.LABEL_H });
  for (const l of labels) { minX = Math.min(minX, l.x); maxX = Math.max(maxX, l.x + l.w); minY = Math.min(minY, l.y); }
  const dx = MT.PAD - minX, dy = MT.TOP_PAD - minY;
  for (const l of labels) { l.x += dx; l.y += dy; }
  for (const n of [...nodes, ...panels]) { n.x += dx; n.y += dy; }
  if (rail) { rail.x += dx; rail.y1 += dy; rail.y2 += dy; rail.mid += dy; }
  chip.cx += dx; chip.cy += dy;
  for (const t of traces) for (const q of t.pts) { q[0] += dx; q[1] += dy; }
  for (const pd of pads) { pd.x += dx; pd.y += dy; }
  for (const e of edges) if (e.kind === "row") { e.x1 += dx; e.x2 += dx; e.y += dy; }
  const byNodeId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) { e.a = byNodeId.get(e.from); e.b = byNodeId.get(e.to); }
  const width = maxX - minX + MT.PAD * 2, height = maxY - minY + MT.TOP_PAD + MT.PAD;
  return { nodes, panels, edges, labels, rail, chip, traces, pads, width, height, centerX: chip.cx, byNodeId };
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
