// (v0.6.6) 통계 플랫폼 분리 토글(OpenChess / chess.com) — 프로필 카드(social.jsx)와 집중 분석의 "내 통계"가 같이 쓴다.
import { t } from "../lib/i18n.js";

export function StatsViewToggle({ value, onChange, scale = 1 }) {
  const s = (n) => Math.round(n * scale);
  return (
    <div className="flex items-center" style={{ padding: s(2), borderRadius: s(9), background: "rgba(0,0,0,.08)", border: "1px solid #DCCBA8", gap: s(2), flexShrink: 0 }}>
      {[["oc", "OpenChess", t("OpenChess 통계")], ["cc", "chess.com", t("Chess.com 통계")]].map(([key, label, aria]) => (
        <button key={key} onClick={() => onChange(key)} aria-label={aria} title={aria} aria-pressed={value === key} className="press" style={{ height: s(26), padding: "0 " + s(8) + "px", borderRadius: s(7), border: "none", cursor: "pointer", background: value === key ? "#fff" : "transparent", boxShadow: value === key ? "0 1px 4px rgba(0,0,0,.28)" : "none", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background .15s ease", fontSize: s(11), fontWeight: 800, letterSpacing: "-.02em", whiteSpace: "nowrap", color: value === key ? "#3B2A1A" : "rgba(59,42,26,.55)" }}>{label}</button>
      ))}
    </div>
  );
}
