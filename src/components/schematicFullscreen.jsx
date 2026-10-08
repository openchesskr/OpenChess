// (v0.6.4) 모식도(도감 오프닝 트리·마스터 트리·퍼즐 모식도) 전체 화면 보기.
//  · 상태만 바꾸고 모식도 컴포넌트는 그대로 둔다 — 팬·확대 상태, 선택, 불러온 데이터가 전체 화면 전환에도 유지된다.
//    전체 화면은 박스에 CSS 클래스(.schematic-fs, index.css)를 붙여 화면 전체(position: fixed)로 키우는 방식이다.
//  · 버튼은 모식도 왼쪽 위 하나: 평소엔 전체 화면 아이콘, 전체 화면 중엔 같은 크기·같은 자리의 ✕. Esc·안드로이드 뒤로가기(히스토리 항목 하나를 쌓아 popstate로 닫음)도 된다.
//  · position: fixed는 변형(transform)·filter 등이 있는 조상 안에서는 화면이 아니라 그 조상 기준이 된다(퍼즐 풀이 화면의 좌우 슬라이드가 그랬다).
//    전체 화면 동안만 그런 조상에 .schematic-fs-unx(index.css)를 붙여 변형을 풀고, 닫으면 되돌린다.
//  · 전체 화면 중에는 뒤쪽 페이지가 스크롤되지 않게 body 스크롤을 잠근다.
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { Maximize2, X } from "lucide-react";
import { T } from "../lib/theme.js";
import { t } from "../lib/i18n.js";

const MARK = "schfs";
const screensOf = () => { try { return (window.history.state && window.history.state.screens) || []; } catch { return []; } };

export function useSchematicFullscreen() {
  const [fs, setFs] = useState(false);
  const pushedRef = useRef(false);
  const open = useCallback(() => {
    setFs(true);
    try { const cur = screensOf(); if (!cur.includes(MARK)) { window.history.pushState({ ...(window.history.state || {}), screens: [...cur, MARK] }, "", window.location.pathname + window.location.search); pushedRef.current = true; } } catch { /* 히스토리 없이도 UI로 닫을 수 있다 */ }
  }, []);
  const close = useCallback(() => {
    setFs(false);
    if (pushedRef.current) { pushedRef.current = false; try { if (screensOf().includes(MARK)) window.history.back(); } catch { /* ignore */ } }
  }, []);
  const toggle = useCallback(() => (fs ? close() : open()), [fs, open, close]);
  useEffect(() => {
    if (!fs) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const onPop = () => { if (!screensOf().includes(MARK)) { pushedRef.current = false; setFs(false); } };   // 뒤로가기로 마커가 빠지면 닫는다
    window.addEventListener("keydown", onKey); window.addEventListener("popstate", onPop);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("popstate", onPop); document.body.style.overflow = prev; };
  }, [fs, close]);
  useLayoutEffect(() => {
    if (!fs) return;
    const box = document.querySelector(".schematic-fs"), marked = [];
    for (let el = box && box.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.transform !== "none" || cs.filter !== "none" || cs.perspective !== "none" || (cs.backdropFilter && cs.backdropFilter !== "none") || /paint|layout|strict|content/.test(cs.contain || "") || /transform|perspective|filter/.test(cs.willChange || "")) { el.classList.add("schematic-fs-unx"); marked.push(el); }
    }
    return () => { for (const el of marked) el.classList.remove("schematic-fs-unx"); };
  }, [fs]);
  // 컴포넌트가 전체 화면 중에 사라지면(탭 이동 등) 쌓아 둔 히스토리 항목이 남지 않게 정리한다.
  useEffect(() => () => { if (pushedRef.current) { pushedRef.current = false; try { if (screensOf().includes(MARK)) window.history.back(); } catch { /* ignore */ } } }, []);
  return { fs, open, close, toggle, boxClass: fs ? "schematic-fs" : undefined };
}

/* 모식도 박스 왼쪽 위의 버튼 하나 — 평소엔 전체 화면 아이콘, 전체 화면 중엔 같은 크기·같은 자리의 ✕(닫기). 박스 안(position: relative/fixed)에 둔다. */
export function SchematicFsButton({ fs, onToggle }) {
  const label = fs ? t("전체 화면 닫기") : t("전체 화면");
  return (
    <button className="no-pan" onClick={onToggle} onPointerDown={(e) => e.stopPropagation()} title={label} aria-label={label}
      style={{ position: "absolute", top: fs ? "calc(env(safe-area-inset-top) + 10px)" : 6, left: fs ? 10 : 6, zIndex: 70, width: 28, height: 28, padding: 0, borderRadius: 8, border: "1px solid #DCCBA8", background: "rgba(255,255,255,.92)", color: T.inkSoft, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: fs ? "0 2px 8px rgba(0,0,0,.2)" : "none" }}>
      {fs ? <X size={16} /> : <Maximize2 size={14} />}
    </button>
  );
}
