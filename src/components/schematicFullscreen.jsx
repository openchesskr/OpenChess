// (v0.6.4) 모식도(도감 오프닝 트리·마스터 트리·퍼즐 모식도) 전체 화면 보기.
//  · 상태만 바꾸고 모식도 컴포넌트는 그대로 둔다 — 팬·확대 상태, 선택, 불러온 데이터가 전체 화면 전환에도 유지된다.
//    전체 화면은 박스에 CSS 클래스(.schematic-fs, index.css)를 붙여 화면 전체(position: fixed)로 키우는 방식이다.
//  · 닫기: 왼쪽 위 ✕ 버튼, 확대 컨트롤 옆 축소 아이콘, Esc, 안드로이드 뒤로가기(히스토리 항목 하나를 쌓아 popstate로 닫음).
//  · 전체 화면 중에는 뒤쪽 페이지가 스크롤되지 않게 body 스크롤을 잠근다.
import { useState, useEffect, useCallback, useRef } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
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
  // 컴포넌트가 전체 화면 중에 사라지면(탭 이동 등) 쌓아 둔 히스토리 항목이 남지 않게 정리한다.
  useEffect(() => () => { if (pushedRef.current) { pushedRef.current = false; try { if (screensOf().includes(MARK)) window.history.back(); } catch { /* ignore */ } } }, []);
  return { fs, open, close, toggle, boxClass: fs ? "schematic-fs" : undefined };
}

/* 확대·축소 컨트롤 묶음 안에 넣는 토글 버튼(다른 컨트롤 버튼과 같은 22×22). */
export function SchematicFsToggle({ fs, onToggle }) {
  const label = fs ? t("전체 화면 닫기") : t("전체 화면");
  return (
    <button onClick={onToggle} title={label} aria-label={label} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
      {fs ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
    </button>
  );
}

/* 전체 화면일 때만 보이는 닫기 버튼 — 모식도 박스 안(왼쪽 위)에 둔다. 박스가 화면 전체라 안전 영역을 피해 놓는다. */
export function SchematicFsClose({ fs, onClose }) {
  if (!fs) return null;
  return (
    <button className="no-pan" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} title={t("전체 화면 닫기")} aria-label={t("전체 화면 닫기")}
      style={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 10px)", left: 10, zIndex: 70, height: 34, padding: "0 12px 0 9px", borderRadius: 10, border: "1px solid #DCCBA8", background: "rgba(255,255,255,.94)", color: T.ink, fontWeight: 800, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, boxShadow: "0 2px 8px rgba(0,0,0,.2)" }}>
      <X size={16} />{t("닫기")}
    </button>
  );
}
