// (v0.7.0, 다국어) 앱 밖의 정적 페이지(/about·/faq·/privacy·/terms) 머리글에 두는 언어 선택. 바꾸면 저장 후 새로고침한다.
import React from "react";
import { LANGS, lang, setLang } from "../lib/i18n.js";

export default function LangSwitch({ style }) {
  return (
    <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)}
      style={{ padding: "7px 10px", borderRadius: 999, border: "1px solid rgba(196,154,80,.5)", background: "rgba(0,0,0,.25)", color: "#ECCB86", fontWeight: 700, fontSize: 12.5, cursor: "pointer", ...style }}>
      {LANGS.map((l) => <option key={l.code} value={l.code} style={{ color: "#1B1009" }}>{l.name}</option>)}
    </select>
  );
}
