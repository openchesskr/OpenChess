// (v0.6.5) 데스크톱 도킹 창 — 채팅·검색·친구 창을 Google Hangouts 채팅창처럼 화면 아래쪽에 여러 개 나란히 띄워 두고,
//  배경 화면(분석·퍼즐 등)을 계속 쓰면서 창을 끌어 옮기거나 접고 닫을 수 있다. 창은 배경을 막지 않는다(백드롭 없음).
//  · 도킹: 오른쪽 아래부터 왼쪽으로 쌓인다(새 창이 가장 왼쪽). 제목 줄을 누르면 접고/펼치고, 끌면 자유롭게 띄운 창(float)이 되며, 제목 줄을 두 번 누르면 다시 도킹한다.
//  · 창 목록(종류·상대·접힘·위치)은 sessionStorage에 두어 새로고침해도 이어진다(탭을 닫으면 사라짐). 화면 폭이 모자라면 오래된 창부터 접는다.
//  · 모바일·좁은 화면(900px 미만)·터치 기기에서는 enabled=false — 기존 전체 화면 모달을 그대로 쓴다.
//  창 안 내용은 호출부가 renderBody(win)로 그리므로 항상 최신 props를 쓴다(이 파일은 창 틀·배치·상태만 맡는다).
import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Minus, ChevronUp } from "lucide-react";
import { T } from "../lib/theme.js";
import { t } from "../lib/i18n.js";

export const DOCK_MIN_VIEWPORT = 900;
const W_FULL = 340, W_MIN = 210, GAP = 10, EDGE = 16, TITLE_H = 40, BODY_H = 460, Z0 = 60, KEY = "occ_dock_v1";

export const canDock = () => typeof window !== "undefined" && window.innerWidth >= DOCK_MIN_VIEWPORT && !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
const loadWins = () => { try { const v = JSON.parse(window.sessionStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter((w) => w && w.id && w.type) : []; } catch { return []; } };
const saveWins = (w) => { try { window.sessionStorage.setItem(KEY, JSON.stringify(w)); } catch { /* 저장 불가 환경 — 새로고침 복원만 포기 */ } };
const TRANS = "height .18s ease, right .18s ease";
const heightOf = (w, vh) => (w.min ? TITLE_H : Math.min(BODY_H + TITLE_H, vh - 24));
const clampPos = (p, w, vh, vwid) => ({ x: Math.max(0, Math.min(p.x, vwid - W_FULL)), y: Math.max(0, Math.min(p.y, vh - heightOf(w, vh))) });

/** 도킹된 창들의 가로 폭 합이 화면에 안 들어가면 가장 오래된 펼친 창부터 접고, 그래도 안 되면 가장 오래된 도킹 창을 닫는다(방금 연 창은 보호). */
export function fitDock(list, vw, protectId) {
  let out = list.map((w) => ({ ...w }));
  const width = () => { const d = out.filter((w) => !w.float); return d.reduce((a, w) => a + (w.min ? W_MIN : W_FULL), 0) + GAP * Math.max(0, d.length - 1); };
  const limit = vw - EDGE * 2;
  while (width() > limit) {
    const k = out.findIndex((w) => !w.float && !w.min && w.id !== protectId);
    if (k >= 0) { out[k].min = true; continue; }
    const c = out.findIndex((w) => !w.float && w.id !== protectId);
    if (c < 0) break;
    out.splice(c, 1);
  }
  return out;
}

export function useDockWindows() {
  const [enabled, setEnabled] = useState(canDock);
  const [wins, setWins] = useState(() => (canDock() ? loadWins() : []));
  const zRef = useRef(1);
  useEffect(() => { const on = () => setEnabled(canDock()); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  useEffect(() => { saveWins(wins); }, [wins]);
  const upd = useCallback((id, patch) => setWins((l) => l.map((w) => (w.id === id ? { ...w, ...(typeof patch === "function" ? patch(w) : patch) } : w))), []);
  const open = useCallback((spec) => setWins((l) => {
    const i = l.findIndex((w) => w.id === spec.id);
    if (i >= 0) { const next = l.map((w, k) => (k === i ? { ...w, ...spec, min: false, z: ++zRef.current } : w)); return fitDock(next, window.innerWidth, spec.id); }
    return fitDock([...l, { ...spec, min: false, float: null, z: ++zRef.current }], window.innerWidth, spec.id);
  }), []);
  const close = useCallback((id) => setWins((l) => l.filter((w) => w.id !== id)), []);
  const toggleMin = useCallback((id) => setWins((l) => { const next = l.map((w) => (w.id === id ? { ...w, min: !w.min, z: ++zRef.current } : w)); return fitDock(next, window.innerWidth, id); }), []);
  const focus = useCallback((id) => upd(id, () => ({ z: ++zRef.current })), [upd]);
  const setFloat = useCallback((id, pos) => upd(id, () => ({ float: pos, z: ++zRef.current })), [upd]);
  const redock = useCallback((id) => setWins((l) => fitDock(l.map((w) => (w.id === id ? { ...w, float: null, min: false, z: ++zRef.current } : w)), window.innerWidth, id)), []);
  const has = useCallback((id) => wins.some((w) => w.id === id), [wins]);
  return { enabled, wins, open, close, toggleMin, focus, setFloat, redock, has };
}

function Frame({ win, title, children, dock, right }) {
  const ref = useRef(null), drag = useRef(null);
  const vh = typeof window !== "undefined" ? window.innerHeight : 800, vwid = typeof window !== "undefined" ? window.innerWidth : 1200;
  const floating = !!win.float;
  const onDown = (e) => {
    if (e.button !== 0 || e.target.closest("[data-nodrag]")) return;
    const r = ref.current.getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 일부 환경에서 지원 안 함 */ }
    dock.focus(win.id);
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    // (v0.6.8) 끄는 동안은 React 상태를 거치지 않고 창 요소의 위치만 직접 바꾼다. 매 포인터 이벤트마다 앱 전체를 다시 그리던 때는 내용물이 창 틀보다 늦게 따라와 어긋나 보였다. 놓을 때 한 번만 상태에 저장한다.
    d.pos = clampPos({ x: d.ox + dx, y: d.oy + dy }, win, vh, vwid);
    const el = ref.current; if (!el) return;
    el.style.transition = "none"; el.style.right = "auto"; el.style.bottom = "auto";
    el.style.left = d.pos.x + "px"; el.style.top = d.pos.y + "px";
  };
  const onUp = () => {
    const d = drag.current; drag.current = null; if (!d) return;
    if (!d.moved) { dock.toggleMin(win.id); return; }
    if (ref.current) ref.current.style.transition = TRANS;
    if (d.pos) dock.setFloat(win.id, d.pos);
  };
  const h = heightOf(win, vh);
  const pos = floating ? { left: win.float.x, top: win.float.y } : { right, bottom: 0 };
  return (
    <section ref={ref} role="dialog" aria-label={title} onPointerDown={() => dock.focus(win.id)}
      style={{ position: "fixed", ...pos, zIndex: floating ? Math.min(79, Z0 + 1 + (win.z % 18)) : Z0, transition: TRANS, width: win.min && !floating ? W_MIN : W_FULL, height: h, display: "flex", flexDirection: "column",
        background: T.paper, border: "1px solid #5A4630", borderBottom: floating ? "1px solid #5A4630" : "none", borderRadius: floating ? 12 : "12px 12px 0 0", overflow: "hidden", boxShadow: "0 10px 34px -8px rgba(0,0,0,.55)" }}>
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={(e) => { if (!e.target.closest("[data-nodrag]")) dock.redock(win.id); }}
        title={floating ? t("두 번 누르면 아래에 다시 붙음") : undefined}
        style={{ height: TITLE_H, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 6px 0 12px", background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, cursor: "grab", touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <button data-nodrag onClick={() => dock.toggleMin(win.id)} aria-label={win.min ? t("창 펼치기") : t("창 접기")} title={win.min ? t("창 펼치기") : t("창 접기")} className="press"
          style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", color: T.ivory, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{win.min ? <ChevronUp size={15} /> : <Minus size={15} />}</button>
        <button data-nodrag onClick={() => dock.close(win.id)} aria-label={t("닫기")} title={t("닫기")} className="press"
          style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", color: T.ivory, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
      </div>
      {/* 접어도 내용은 지우지 않는다 — 쓰던 입력·스크롤·실시간 구독이 그대로 남는다. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: win.min ? "none" : "flex", flexDirection: "column" }}>{children}</div>
    </section>
  );
}

/** 창 틀 모음. renderBody(win) → 창 안 내용, titleOf(win) → 제목 문자열. 호출부(App)가 enabled일 때만 그린다.
 *  모든 창을 같은 부모 아래 fixed로 두고 도킹 위치만 계산해 넣는다 — 끌어서 띄우거나 다시 붙여도 창이 다시 만들어지지 않아 채팅 입력·스크롤이 그대로 남는다. */
export function DockHost({ dock, renderBody, titleOf }) {
  if (!dock.enabled || !dock.wins.length) return null;
  let acc = EDGE; const rightOf = {};
  for (const w of dock.wins) if (!w.float) { rightOf[w.id] = acc; acc += (w.min ? W_MIN : W_FULL) + GAP; }
  return <>{dock.wins.map((w) => <Frame key={w.id} win={w} title={titleOf(w)} dock={dock} right={rightOf[w.id]}>{renderBody(w)}</Frame>)}</>;
}
