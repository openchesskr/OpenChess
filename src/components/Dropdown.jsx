// (v0.6.5) 사이트 자체 드롭다운 — 언어 선택(LangPicker)과 같은 모양의 선택 상자. 브라우저 기본 <select>는 기기마다 모양이 달라 쓰지 않는다.
//  · options: [{ value, label }]  · size: "md"(설정 탭 전폭) | "sm"(대회 머리글 등 좁은 자리)
//  · 눌러서 펼치고, 바깥을 누르거나 Esc로 닫는다. ↑↓/Home/End로 항목을 옮기고 Enter로 고른다. 펼치면 선택 항목이 보이도록 스크롤한다.
import React, { useState, useEffect, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";

export default function Dropdown({ value, options, onChange, ariaLabel, id, size = "md", align = "left", minListWidth, style }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const box = useRef(null), listRef = useRef(null);
  const cur = options.find((o) => o.value === value) || options[0];
  const small = size === "sm";
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = Math.max(0, options.findIndex((o) => o.value === value)); setHi(k);
    const el = listRef.current && listRef.current.children[k]; if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (v) => { setOpen(false); if (v !== value) onChange(v); };
  const onKey = (e) => {
    if (!open) { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); const n = Math.min(options.length - 1, Math.max(0, hi + (e.key === "ArrowDown" ? 1 : -1))); setHi(n);
      const el = listRef.current && listRef.current.children[n]; if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Home" || e.key === "End") { e.preventDefault(); const n = e.key === "Home" ? 0 : options.length - 1; setHi(n); const el = listRef.current && listRef.current.children[n]; if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter" && hi >= 0) { e.preventDefault(); pick(options[hi].value); }
  };
  return (
    <div ref={box} onKeyDown={onKey} style={{ position: "relative", width: small ? "auto" : "100%", display: small ? "inline-block" : "block", ...style }}>
      <button type="button" id={id} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen((v) => !v)} className="press"
        style={{ display: "flex", alignItems: "center", gap: small ? 4 : 10, width: "100%", height: small ? 26 : "auto", padding: small ? "0 6px 0 8px" : "10px 12px", borderRadius: small ? 7 : 10, cursor: "pointer", textAlign: "left",
          background: "#fff", border: (small ? "1px solid " : "1.5px solid ") + (open ? "#C49A50" : "#C9B58C"), color: "#2A1A0E", fontWeight: small ? 800 : 700, fontSize: small ? 12 : 12.5, whiteSpace: "nowrap", boxSizing: "border-box" }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{cur ? cur.label : ""}</span>
        <ChevronDown size={small ? 13 : 16} style={{ flexShrink: 0, transition: "transform .18s", transform: open ? "rotate(180deg)" : "none", opacity: .75 }} />
      </button>
      {open && (
        <ul ref={listRef} role="listbox" aria-label={ariaLabel} style={{ position: "absolute", zIndex: 80, top: "calc(100% + 4px)", ...(align === "right" ? { right: 0 } : { left: 0 }), minWidth: Math.max(minListWidth || 0, small ? 72 : 0), ...(small ? {} : { right: 0 }),
          margin: 0, padding: 5, listStyle: "none", background: "#FFFBF2", border: "1px solid #DCCBA8", borderRadius: 11, boxShadow: "0 14px 32px rgba(20,10,4,.35)", maxHeight: 260, overflowY: "auto" }}>
          {options.map((o, i) => {
            const on = o.value === value;
            return (
              <li key={String(o.value)} role="option" aria-selected={on}>
                <button type="button" onClick={() => pick(o.value)} onMouseEnter={() => setHi(i)} className="press"
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: small ? "6px 8px" : "9px 10px", borderRadius: 7, border: "none", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap", fontSize: small ? 12 : 12.5, fontWeight: on ? 800 : 600, color: "#2A1A0E", background: on ? "rgba(196,154,80,.22)" : i === hi ? "rgba(196,154,80,.1)" : "transparent" }}>
                  <span style={{ flex: 1 }}>{o.label}</span>
                  {on && <Check size={14} style={{ color: "#A8842F" }} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
