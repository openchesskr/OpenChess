// (v0.6.3) 순서 표기 — 영어는 6th·1st·22nd, 스페인어는 6.º, 그 외 언어는 번역문이 숫자만 받는다(第6代·第6任·6대).
export function enOrdinal(n) {
  const m100 = n % 100; if (m100 >= 11 && m100 <= 13) return n + "th";
  return n + ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
}
export function ordinalParam(n, lang) { return lang === "en" ? enOrdinal(n) : lang === "es" ? n + ".º" : n; }
