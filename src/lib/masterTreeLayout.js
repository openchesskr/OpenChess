// (v0.6.3) 도감 "마스터" 모식도 배치 — 순수 계산(scripts/check-masters.mjs가 검사). 데이터는 src/data/worldChampions.js.
//  · 위→아래가 시간 순서다. 정통 계보(lane C)는 가운데 한 줄, 분열기(1993~2006)는 왼쪽(L)·오른쪽(R) 두 줄로 갈라졌다가 통합 챔피언 노드로 합쳐진다.
//  · 챔피언 노드(CH_W×CH_H) 옆에 "탈락한 도전자" 위성 노드(SAT_W×SAT_H)를 둔다. 가운데 줄은 좌우로 번갈아, 왼쪽 줄은 바깥(왼쪽), 오른쪽 줄은 바깥(오른쪽)으로 쌓는다.
//  · 같은 도전자가 한 챔피언에게 여러 번 졌으면(치고린 1889·1892) 위성 노드 하나에 해(years)를 모은다.
//  · 반환 좌표는 모두 캔버스 좌상단 기준(PAD 여백 포함). nodes[].x·y는 노드 좌상단.
export const MT = { TOUR_W: 224, TOUR_H: 88, TOUR_GAP: 24, TOUR_COL_GAP: 100, PL_W: 124, PL_H: 30, PL_GAP: 10, FAN_GAP: 36, FAN_ARC: 80, FAN_MIN_R: 90, ED_W: 76, ED_H: 34, ED_GAP: 12, CH_W: 224, CH_H: 88, SAT_W: 150, SAT_H: 46, SAT_STEP: 58, SAT_GAP: 30, ROW_GAP: 56, LANE_DX: 360, PAD: 70, TOP_PAD: 70, LABEL_W: 220, LABEL_H: 26, LABEL_GAP: 14 };

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

export function layoutMasters(champions, transfers, splitRows, upcoming, tournaments = [], editions = {}, firsts = {}) {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const splitIds = new Set(splitRows.flat().filter(Boolean));
  const nodes = [], edges = [], champNode = new Map();
  let y = MT.TOP_PAD;
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
  // 오른쪽 대회 열 — 개최 연도를 챔피언 행의 높이에 맞추되(기준점 보간), 챔피언 블록 크기로 키운 대회 블록(허브) 오른쪽에 "첫 에디션 참가자 노드"가 오른쪽 180° 방사형으로 펼쳐지고
  // (firsts[id] = { players: [이름…] }), 그 오른쪽으로 다음 연도 에디션 칩이 연도순으로 이어진다(editions[id] = 연도 배열). 펼침 공간만큼 다음 대회가 아래로 밀려 서로 겹치지 않는다.
  let rail = null;
  if (tournaments.length) {
    const anchors = champions.filter((c) => c.lane !== "R").map((c) => ({ year: c.from, y: champNode.get(c.id).y + MT.CH_H / 2 })).sort((a, b) => a.year - b.year);
    if (upNode) anchors.push({ year: 2026.9, y: upNode.y + upNode.h / 2 });
    const colX = nodes.reduce((m, n) => Math.max(m, n.x + n.w), -Infinity) + MT.TOUR_COL_GAP;
    const rad = (d) => (d * Math.PI) / 180;
    // 반지름 R의 호(-FAN_ARC~+FAN_ARC) 위에 n개의 PL_W×PL_H 노드를 겹치지 않게 순서대로 놓는다. 불가능하면 null.
    const fan = (n, R) => {
      const out = []; let th = -MT.FAN_ARC;
      for (let i = 0; i < n; i++) {
        for (;;) {
          if (th > MT.FAN_ARC + 1e-9) return null;
          const cx = R * Math.cos(rad(th)), cy = R * Math.sin(rad(th));
          if (!out.some((q) => Math.abs(cx - q.cx) < MT.PL_W + MT.PL_GAP && Math.abs(cy - q.cy) < MT.PL_H + MT.PL_GAP)) { out.push({ cx, cy }); break; }
          th += 0.1;
        }
      }
      return out;
    };
    const fanOf = (n) => { if (!n) return { R: 0, pts: [] }; let lo = MT.FAN_MIN_R, hi = 3000; if (fan(n, lo)) return { R: lo, pts: fan(n, lo) }; while (hi - lo > 2) { const mid = (lo + hi) / 2; if (fan(n, mid)) hi = mid; else lo = mid; } return { R: hi, pts: fan(n, hi) }; };
    let prevBottom = -Infinity;
    const sorted = tournaments.map((tr, i) => ({ tr, i })).sort((a, b) => a.tr.from - b.tr.from || a.i - b.i);
    const tourNodes = [];
    for (const { tr } of sorted) {
      const names = (firsts[tr.id] && firsts[tr.id].players) || [];
      const { R, pts } = fanOf(names.length);
      const halfH = names.length ? Math.max(MT.TOUR_H / 2, Math.max(...pts.map((p) => Math.abs(p.cy))) + MT.PL_H / 2) : MT.TOUR_H / 2;
      const anchorY = yearToY(anchors, tr.from);
      const cy = Math.max(anchorY, prevBottom + MT.TOUR_GAP + halfH);
      prevBottom = cy + halfH;
      const hub = { id: "tour:" + tr.id, kind: "tour", tour: tr, x: colX, y: cy - MT.TOUR_H / 2, w: MT.TOUR_W, h: MT.TOUR_H, anchorY };
      nodes.push(hub); tourNodes.push(hub);
      const fcx = colX + MT.TOUR_W + MT.FAN_GAP + MT.PL_W / 2;       // 방사 중심(허브 오른쪽)
      let right = colX + MT.TOUR_W;
      names.forEach((nm, i) => {
        const p = pts[i], pn = { id: "pl:" + tr.id + ":" + i, kind: "player", tourId: tr.id, tour: tr, name: nm, year: firsts[tr.id].y, x: fcx + p.cx - MT.PL_W / 2, y: cy + p.cy - MT.PL_H / 2, w: MT.PL_W, h: MT.PL_H };
        nodes.push(pn); edges.push({ kind: "fan", from: hub.id, to: pn.id }); right = Math.max(right, pn.x + pn.w);
      });
      const firstY = (firsts[tr.id] && firsts[tr.id].y) || null;
      const later = ((editions[tr.id] || []).filter((y) => y !== firstY));
      const years = names.length ? later : [firstY || tr.from, ...later.filter((y) => y !== (firstY || tr.from))];
      let ex = right + MT.FAN_GAP; const rowY = cy - MT.ED_H / 2;
      years.sort((a, b) => a - b).forEach((yr) => { nodes.push({ id: "ed:" + tr.id + ":" + yr, kind: "edition", tourId: tr.id, tour: tr, year: yr, x: ex, y: rowY, w: MT.ED_W, h: MT.ED_H }); ex += MT.ED_W + MT.ED_GAP; });
      if (years.length) edges.push({ kind: "row", from: hub.id, to: hub.id, tour: tr, x1: right, x2: ex - MT.ED_GAP, y: cy });
    }
    const first = tourNodes[0], last = tourNodes[tourNodes.length - 1];
    rail = { x: colX - 28, y1: first.y + first.h / 2, y2: last.y + last.h / 2 };
    for (const n of tourNodes) edges.push({ kind: "tour", from: n.id, to: n.id });
  }
  // 좌표를 양수로 옮긴다.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.w); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + n.h); }
  // 열 이름 라벨("역대 세계 챔피언"·"주요 대회") — 각 열 맨 위 노드 위쪽에 가운데 맞춰 놓는다(오프닝 트리의 금색 오프닝 이름과 같은 자리 개념).
  const labels = [];
  { const first = champNode.get(champions[0].id); labels.push({ id: "champs", key: "champs", x: first.x + first.w / 2 - MT.LABEL_W / 2, y: first.y - MT.LABEL_GAP - MT.LABEL_H, w: MT.LABEL_W, h: MT.LABEL_H }); }
  { const tn = nodes.filter((n) => n.kind === "tour"); if (tn.length) labels.push({ id: "tours", key: "tours", x: tn[0].x + tn[0].w / 2 - MT.LABEL_W / 2, y: tn[0].y - MT.LABEL_GAP - MT.LABEL_H, w: MT.LABEL_W, h: MT.LABEL_H }); }
  for (const l of labels) { minX = Math.min(minX, l.x); maxX = Math.max(maxX, l.x + l.w); minY = Math.min(minY, l.y); }
  const dx = MT.PAD - minX, dy = MT.TOP_PAD - minY;
  for (const l of labels) { l.x += dx; l.y += dy; }
  for (const n of nodes) { n.x += dx; n.y += dy; }
  if (rail) { rail.x += dx; rail.y1 += dy; rail.y2 += dy; }
  for (const e of edges) if (e.kind === "row") { e.x1 += dx; e.x2 += dx; e.y += dy; }
  const byNodeId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) { e.a = byNodeId.get(e.from); e.b = byNodeId.get(e.to); }
  const width = maxX - minX + MT.PAD * 2, height = maxY - minY + MT.TOP_PAD + MT.PAD;
  return { nodes, edges, labels, rail, width, height, centerX: dx, byNodeId };
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
