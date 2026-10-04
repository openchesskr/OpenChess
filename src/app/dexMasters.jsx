// (v0.6.3) 도감 "마스터" — 역대 세계 체스 챔피언 모식도.
// 위→아래가 시간 순서(1886 → 현재)이고, 챔피언 노드 옆에는 그 챔피언에게 도전했다가 타이틀전에서 탈락한 마스터가 붙는다.
// 1993~2006 분열기에는 정통 계보가 PCA→클래식(왼쪽)·FIDE(오른쪽) 두 줄로 갈라졌다가 통합전에서 다시 합쳐진다.
// 데이터: src/data/worldChampions.js · 배치: src/lib/masterTreeLayout.js · 팬/줌: 오프닝 모식도와 같은 기하 함수(src/lib/schematicGeometry.js).
import React, { useRef, useState, useEffect, useCallback, useLayoutEffect } from "react";
import { Crown, X } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { t, lang } from "../lib/i18n.js";
import { CHAMPIONS, TRANSFERS, SPLIT_ROWS, UPCOMING } from "../data/worldChampions.js";
import { MT, clampMasterPan, layoutMasters, transferPath } from "../lib/masterTreeLayout.js";
import { useFitPanelHeight } from "../lib/dexPanel.js";
import { SCHEMATIC_ZOOM_LABEL_BASE, SCHEMATIC_ZOOM_STEP, SCHEMATIC_DRAG_MULT, anchoredZoomPan, schematicZoomLabel, snapSchematicZoom } from "../lib/schematicGeometry.js";

const LAYOUT = layoutMasters(CHAMPIONS, TRANSFERS, SPLIT_ROWS, UPCOMING);
const BY_ID = new Map(CHAMPIONS.map((c) => [c.id, c]));
const LANE_COLOR = { C: T.brass, L: "#5B8DB8", R: "#C0624F" };
const personName = (p) => (lang === "ko" && p.ko ? p.ko : (p.name || p.opp));
const TAG_LABEL = () => ({ PCA: "PCA", FIDE: "FIDE", CLASSIC: t("클래식") });
const numText = (c) => (c.no ? t("{0}대", c.no) + (c.reign ? " " + t("{0}기", c.reign) : "") : "");
const reignText = (c) => c.from + "–" + (c.to == null ? "" : c.to);
const KIND_LABEL = () => ({ tournament: t("토너먼트"), forfeit: t("몰수승"), split: t("분열"), unify: t("통합전"), knockout: t("녹아웃"), vacated: t("반납") });
const edgeLabel = (tr) => { const k = KIND_LABEL()[tr.kind]; return tr.y + (k ? " · " + k : "") + (tr.score ? " · " + tr.score : ""); };

function CountryChip({ cc, dark }) {
  return <span style={{ fontSize: 9, fontWeight: 800, fontFamily: SITE_FONT, letterSpacing: ".04em", padding: "1px 5px", borderRadius: 5, background: dark ? "rgba(236,203,134,.16)" : "rgba(60,40,20,.08)", color: dark ? T.brassHi : T.inkSoft }}>{cc}</span>;
}

function ChampNode({ n, onPick, picked }) {
  const c = n.champ, color = LANE_COLOR[n.lane], current = c.to == null;
  return (
    <button className="no-pan press" onClick={() => onPick({ type: "champ", id: c.id })} aria-label={personName(c) + " " + numText(c) + " " + reignText(c)}
      style={{ position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, boxSizing: "border-box", padding: "7px 12px", textAlign: "left", cursor: "pointer", borderRadius: 14,
        border: "2px solid " + color, background: "linear-gradient(180deg," + T.ebony3 + "," + T.ebony + ")", color: T.ivoryHi,
        boxShadow: picked ? "0 0 0 3px rgba(236,203,134,.55), 0 6px 16px rgba(0,0,0,.35)" : current ? "0 0 14px 2px rgba(236,203,134,.5)" : "0 3px 8px rgba(0,0,0,.28)" }}>
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 3 }}>
        <span className="flex items-center gap-1" style={{ minWidth: 0 }}>
          {c.no && <span style={{ fontSize: 9.5, fontWeight: 900, padding: "1px 6px", borderRadius: 5, background: T.brass, color: "#241509", whiteSpace: "nowrap" }}>{numText(c)}</span>}
          <span style={{ fontSize: 10.5, fontWeight: 800, color: T.brassHi, fontFamily: SITE_FONT, whiteSpace: "nowrap" }}>{reignText(c)}</span>
        </span>
        <span className="flex items-center gap-1">
          {c.tag && <span style={{ fontSize: 8.5, fontWeight: 900, padding: "1px 5px", borderRadius: 5, background: color, color: "#fff" }}>{TAG_LABEL()[c.tag]}</span>}
          <CountryChip cc={c.cc} dark />
        </span>
      </div>
      <div className="flex items-center gap-1" style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {current && <Crown size={13} color={T.brassHi} fill={T.brassHi} style={{ flexShrink: 0 }} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{personName(c)}</span>
      </div>
    </button>
  );
}

function SatNode({ n, onPick, picked }) {
  const s = n.sat;
  return (
    <button className="no-pan press" onClick={() => onPick({ type: "sat", id: n.id })} aria-label={personName(s) + " " + s.years.join(", ")}
      style={{ position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, boxSizing: "border-box", padding: "5px 10px", textAlign: "left", cursor: "pointer", borderRadius: 11,
        border: "1.5px solid " + (picked ? T.brass : "#C9B58C"), background: "#fff", color: T.ink, boxShadow: picked ? "0 0 0 3px rgba(196,154,80,.35)" : "0 1px 4px rgba(60,40,20,.12)" }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{personName(s)}</div>
      <div className="flex items-center justify-between gap-1" style={{ marginTop: 2 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.inkSoft, fontFamily: SITE_FONT }}>{s.years.join(" · ")}</span>
        <CountryChip cc={s.cc} />
      </div>
    </button>
  );
}

function UpcomingNode({ n }) {
  const u = n.upcoming;
  return (
    <div style={{ position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, boxSizing: "border-box", padding: "5px 10px", borderRadius: 11, border: "2px dashed " + T.brass, background: "rgba(196,154,80,.1)", color: T.ink }}>
      <div className="flex items-center justify-between gap-1">
        <span style={{ fontSize: 9.5, fontWeight: 900, color: T.brass, letterSpacing: ".04em" }}>{t("2026 타이틀전 · 예정")}</span>
        <CountryChip cc={u.cc} />
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{personName(u)}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.inkSoft, fontFamily: SITE_FONT }}>{u.date}</div>
    </div>
  );
}

/* 선택한 노드의 상세 — 챔피언: 획득·상실·방어전 / 도전자: 도전 기록. */
function DetailCard({ pick, onClose }) {
  let title = "", sub = "", cc = "", rows = [], blocks = [];
  if (pick.type === "champ") {
    const c = BY_ID.get(pick.id);
    title = personName(c); sub = lang === "ko" ? c.name : ""; cc = c.cc;
    const ins = TRANSFERS.filter((x) => x.to === c.id && !x.loser && x.kind !== "vacated"), outs = TRANSFERS.filter((x) => x.from === c.id && x.kind !== "split");
    blocks.push({ head: t("재위"), lines: [(c.no ? t("{0}대 세계 챔피언", c.no) + (c.reign ? " (" + t("{0}기", c.reign) + ")" : "") : t("FIDE 세계 챔피언(분열기)")), reignText(c) + (c.tag ? " · " + TAG_LABEL()[c.tag] : "")] });
    if (ins.length) blocks.push({ head: t("타이틀 획득"), lines: ins.map((x) => edgeLabel(x) + " · " + personName(BY_ID.get(x.from))) });
    if (c.defenses.length) blocks.push({ head: t("타이틀전 기록"), lines: c.defenses.map((d) => d.y + " · " + personName(d) + " · " + d.score + (d.won ? " · " + t("등극") : d.draw ? " · " + t("무승부") : d.tourney ? " · " + t("토너먼트") : "")) });
    if (outs.length) blocks.push({ head: t("타이틀 상실"), lines: outs.map((x) => edgeLabel(x) + " · " + personName(BY_ID.get(x.to))) });
    if (c.to == null) blocks.push({ head: t("다음 타이틀전"), lines: [UPCOMING.date + " · " + personName(UPCOMING)] });
  } else {
    const n = LAYOUT.byNodeId.get(pick.id), s = n.sat, c = BY_ID.get(n.champId);
    title = personName(s); sub = lang === "ko" ? s.name : ""; cc = s.cc;
    blocks.push({ head: t("세계선수권 도전 기록"), lines: s.matches.map((d) => d.y + " · " + personName(c) + " · " + d.score + (d.draw ? " · " + t("무승부") : d.tourney ? " · " + t("토너먼트") : " · " + t("패"))) });
  }
  return (
    <div className="no-pan" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}
      style={{ position: "absolute", top: 44, right: 8, zIndex: 65, width: 290, maxWidth: "calc(100% - 16px)", maxHeight: "calc(100% - 56px)", overflowY: "auto", borderRadius: 14, background: T.paper, border: "1px solid #DCCBA8", boxShadow: "0 12px 30px -8px rgba(0,0,0,.45)", padding: 14 }}>
      <div className="flex items-start justify-between gap-2" style={{ marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, lineHeight: 1.25 }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: T.inkSoft, fontFamily: SITE_FONT, marginTop: 1 }}>{sub}</div>}
        </div>
        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          <CountryChip cc={cc} />
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 24, height: 24, borderRadius: 7, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
        </div>
      </div>
      {blocks.map((b, i) => (
        <div key={i} style={{ marginTop: i ? 10 : 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: T.brass, marginBottom: 3 }}>{b.head}</div>
          {b.lines.map((l, j) => <div key={j} style={{ fontSize: 12, fontWeight: 600, color: T.ink, lineHeight: 1.5, fontFamily: SITE_FONT }}>{l}</div>)}
        </div>
      ))}
      <div style={{ fontSize: 9.5, color: T.inkSoft, marginTop: 12 }}>{t("점수는 챔피언–도전자 순. 괄호는 타이브레이크")}</div>
    </div>
  );
}

export function MastersSchematic({ vertical, tabsSlot }) {
  const boxRef = useRef(null);
  const panelH = useFitPanelHeight(boxRef, vertical);
  // 좁은 화면(모바일)은 챔피언 + 양옆 도전자가 한 화면에 들어오도록 75%(0.5625)로 시작한다.
  const baseZ = vertical ? SCHEMATIC_ZOOM_LABEL_BASE * 0.75 : SCHEMATIC_ZOOM_LABEL_BASE;
  const [view, setView] = useState({ x: 0, y: 0, z: baseZ });
  const viewRef = useRef(view); viewRef.current = view;
  const [pick, setPick] = useState(null);
  const dragRef = useRef(null), movedRef = useRef(false);
  const rect = () => (boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 640, height: 640, left: 0, top: 0 });
  const clamp = (p, z) => { const r = rect(); return clampMasterPan(p, z, r.width, r.height, LAYOUT); };
  const apply = useCallback((p, z) => setView({ ...clamp(p, z), z }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomBy = useCallback((dz, ax, ay) => {
    const v = viewRef.current, r = rect(), nz = snapSchematicZoom(v.z + dz); if (nz === v.z) return;
    const a = anchoredZoomPan(v, v.z, nz, ax != null ? ax : r.width / 2, ay != null ? ay : r.height / 2);
    apply(a, nz);
  }, [apply]);
  const toTop = useCallback(() => { const r = rect(), z = viewRef.current.z; apply({ x: r.width / 2 - LAYOUT.centerX * z, y: 0 }, z); }, [apply]);
  useLayoutEffect(() => { toTop(); }, [panelH]); // eslint-disable-line react-hooks/exhaustive-deps
  // 휠은 세로 이동, Ctrl/⌘+휠은 확대·축소(브라우저 페이지 스크롤은 막는다 — 네이티브 리스너로 passive:false).
  useEffect(() => {
    const el = boxRef.current; if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) { const r = el.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? SCHEMATIC_ZOOM_STEP : -SCHEMATIC_ZOOM_STEP, e.clientX - r.left, e.clientY - r.top); return; }
      apply({ x: v.x - e.deltaX, y: v.y - e.deltaY }, v.z);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [apply, zoomBy]);
  const onPointerDown = (e) => {
    if (e.target.closest && e.target.closest(".no-pan")) return;
    dragRef.current = { px: e.clientX, py: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y }; movedRef.current = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
  };
  const onPointerMove = (e) => {
    const d = dragRef.current; if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!movedRef.current && Math.hypot(dx, dy) < 4) return;
    movedRef.current = true; apply({ x: d.vx + dx * SCHEMATIC_DRAG_MULT, y: d.vy + dy * SCHEMATIC_DRAG_MULT }, viewRef.current.z);
  };
  const onPointerUp = () => { dragRef.current = null; };
  const { nodes, edges, width, height } = LAYOUT;
  const champEdges = edges.filter((e) => e.kind === "transfer");
  const hint = t("위에서 아래로 시간순. 챔피언 옆은 타이틀전에서 탈락한 도전자");
  return (
    <div>
      <div style={{ display: "flex", alignItems: vertical ? "flex-start" : "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: vertical ? "wrap" : "nowrap" }}>
        {tabsSlot}
        <div style={{ minWidth: 0, flex: 1, textAlign: vertical ? "left" : "right" }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: T.brassHi }}>{t("역대 세계 챔피언")}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, marginTop: 1 }}>{hint}</div>
        </div>
      </div>
      <div ref={boxRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClickCapture={(e) => { if (movedRef.current) { e.stopPropagation(); e.preventDefault(); movedRef.current = false; } }}
        style={{ position: "relative", overflow: "hidden", overscrollBehavior: "contain", height: panelH, borderRadius: 12, border: "1px solid #DCCBA8", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", cursor: dragRef.current ? "grabbing" : "grab",
          background: "repeating-linear-gradient(45deg, rgba(196,154,80,.09) 0, rgba(196,154,80,.09) 1px, transparent 1px, transparent 26px), repeating-linear-gradient(-45deg, rgba(196,154,80,.09) 0, rgba(196,154,80,.09) 1px, transparent 1px, transparent 26px), #FBF5E8" }}>
        <div className="no-pan flex" style={{ position: "absolute", top: 6, right: 6, zIndex: 60, gap: 3, background: "rgba(255,255,255,.9)", borderRadius: 8, border: "1px solid #DCCBA8", padding: 2 }}>
          <button onClick={() => zoomBy(-SCHEMATIC_ZOOM_STEP)} title={t("축소")} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 900, cursor: "pointer", fontSize: 14 }}>－</button>
          <button onClick={() => zoomBy(baseZ - viewRef.current.z)} title={t("초기화")} style={{ padding: "0 6px", height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 800, cursor: "pointer", fontSize: 9.5, fontFamily: SITE_FONT }}>{schematicZoomLabel(view.z)}</button>
          <button onClick={() => zoomBy(SCHEMATIC_ZOOM_STEP)} title={t("확대")} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 900, cursor: "pointer", fontSize: 14 }}>＋</button>
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, width, height, transform: "translate(" + view.x + "px," + view.y + "px) scale(" + view.z + ")", transformOrigin: "0 0", willChange: "transform" }}>
          <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
            {edges.filter((e) => e.kind === "sat").map((e, i) => {
              const a = e.a, b = e.b, ay = a.y + a.h / 2, by = b.y + b.h / 2;
              const ax = e.side === "L" ? a.x : a.x + a.w, bx = e.side === "L" ? b.x + b.w : b.x;
              return <line key={"s" + i} x1={ax} y1={ay} x2={bx} y2={by} stroke="#C9B58C" strokeWidth={1.6} />;
            })}
            {edges.filter((e) => e.kind === "upcoming").map((e, i) => { const p = transferPath(e.a, e.b); return <path key={"u" + i} d={p.d} fill="none" stroke={T.brass} strokeWidth={2} strokeDasharray="5 5" />; })}
            {champEdges.map((e, i) => {
              const p = transferPath(e.a, e.b), lane = e.b.lane !== "C" ? e.b.lane : e.a.lane;
              return <path key={"t" + i} d={p.d} fill="none" stroke={e.t.loser ? "#C9B58C" : LANE_COLOR[lane] || T.brass} strokeWidth={3} strokeLinecap="round" strokeDasharray={e.t.loser ? "6 6" : undefined} />;
            })}
          </svg>
          {champEdges.filter((e) => !e.t.loser && (e.t.score || e.t.kind !== "match")).map((e, i) => {
            const p = transferPath(e.a, e.b);
            return <span key={"l" + i} style={{ position: "absolute", left: p.lx, top: p.ly, transform: "translate(-50%,-50%)", fontSize: 10.5, fontWeight: 800, fontFamily: SITE_FONT, whiteSpace: "nowrap", padding: "2px 8px", borderRadius: 999, background: "#fff", border: "1px solid #DCCBA8", color: T.ink, boxShadow: "0 1px 3px rgba(60,40,20,.15)" }}>{edgeLabel(e.t)}</span>;
          })}
          {nodes.map((n) => n.kind === "champ" ? <ChampNode key={n.id} n={n} onPick={setPick} picked={pick && pick.id === n.id} />
            : n.kind === "sat" ? <SatNode key={n.id} n={n} onPick={setPick} picked={pick && pick.id === n.id} /> : <UpcomingNode key={n.id} n={n} />)}
        </div>
        {pick && <DetailCard pick={pick} onClose={() => setPick(null)} />}
      </div>
      <div className="flex items-center gap-3" style={{ marginTop: 8, flexWrap: "wrap", fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>
        {[["C", t("정통 계보")], ["L", t("PCA·클래식(1993–2006)")], ["R", t("FIDE(1993–2006)")]].map(([k, lb]) => (
          <span key={k} className="flex items-center gap-1"><span style={{ width: 14, height: 4, borderRadius: 2, background: LANE_COLOR[k] }} />{lb}</span>
        ))}
      </div>
    </div>
  );
}
