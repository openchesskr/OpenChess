// (v0.6.0, 다국어) 국기가 붙은 언어 선택 상자. 눌러서 펼치고 고르면 저장 후 새로고침한다(setLang).
// 설정 탭(기본형)과 정적 페이지 머리글(compact: 작은 알약 모양, 오른쪽 정렬)이 함께 쓴다.
import React, { useState, useEffect, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { LANGS, lang, setLang } from "../lib/i18n.js";
import Flag from "./Flag.jsx";

export default function LangPicker({ compact = false, style }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = LANGS.find((l) => l.code === lang) || LANGS[0];
  const pick = (code) => { setOpen(false); if (code !== lang) setLang(code); };
  const dark = compact; // 머리글은 어두운 배경 위
  return (
    <div ref={box} style={{ position: "relative", width: compact ? "auto" : "100%", ...style }}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label="Language" onClick={() => setOpen((v) => !v)} className="press"
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: compact ? "6px 10px" : "11px 14px", borderRadius: compact ? 999 : 12, cursor: "pointer", textAlign: "left",
          background: dark ? "rgba(0,0,0,.25)" : "#fff", border: "1.5px solid " + (open ? "#C49A50" : dark ? "rgba(196,154,80,.5)" : "#E4D5B6"), color: dark ? "#ECCB86" : "#2A1A0E", fontWeight: 700, fontSize: compact ? 12.5 : 14 }}>
        <Flag code={cur.code} width={compact ? 18 : 26} />
        <span lang={cur.code} style={{ flex: 1, minWidth: 0 }}>{cur.name}</span>
        <ChevronDown size={compact ? 14 : 17} style={{ flexShrink: 0, transition: "transform .18s", transform: open ? "rotate(180deg)" : "none", opacity: .75 }} />
      </button>
      {open && (
        <ul role="listbox" aria-label="Language" style={{ position: "absolute", zIndex: 80, top: "calc(100% + 6px)", ...(compact ? { right: 0, minWidth: 190 } : { left: 0, right: 0 }), margin: 0, padding: 6, listStyle: "none",
          background: "#FFFBF2", border: "1px solid #DCCBA8", borderRadius: 12, boxShadow: "0 14px 32px rgba(20,10,4,.35)", maxHeight: 320, overflowY: "auto" }}>
          {LANGS.map((l) => {
            const on = l.code === lang;
            return (
              <li key={l.code} role="option" aria-selected={on}>
                <button type="button" lang={l.code} onClick={() => pick(l.code)} className="press"
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 10px", borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: on ? 800 : 600, color: "#2A1A0E", background: on ? "rgba(196,154,80,.22)" : "transparent" }}>
                  <Flag code={l.code} width={26} />
                  <span style={{ flex: 1 }}>{l.name}</span>
                  {on && <Check size={16} style={{ color: "#A8842F" }} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
