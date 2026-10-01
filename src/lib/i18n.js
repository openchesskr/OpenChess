// (v0.7.0, 다국어) 번역 엔진. 한국어 원문 문자열 자체를 키로 쓴다: t("친구 요청") → 현재 언어의 번역, 없으면 원문(한국어).
//  · 언어는 페이지를 열 때 한 번 정해진다(설정 탭에서 바꾸면 저장 후 새로고침). 그래서 모듈 최상위의 const·배열에서 t()를 써도 된다.
//  · 한국어가 아닌 언어의 번역 파일(src/lib/i18n/<code>.js)은 이 모듈이 최상위 await로 먼저 불러온다.
//    이 모듈을 import하는 모듈은 번역이 로드될 때까지 실행을 기다리므로 App의 최상위 코드는 항상 번역이 준비된 뒤 돈다.
//  · 자리표시자는 {0} {1} …. t("{0}님 차단됨", name). 번역 문장에서 자리표시자 순서는 바꿔도 된다(어순이 다른 언어를 위해).
//  · 문장 속에 JSX 요소를 넣어야 하면 tx()를 쓴다: tx("{0}에게 답장", <b>{name}</b>).
//  · 체스 용어는 src/lib/i18n/glossary.js의 표준 번역을 따라야 한다(scripts/check-i18n.mjs가 검사).
import { createElement, Fragment } from "react";

export const LANGS = [
  { code: "ko", name: "한국어", locale: "ko-KR" },
  { code: "en", name: "English", locale: "en-US" },
  { code: "hi", name: "हिन्दी", locale: "hi-IN", font: "Noto Sans Devanagari", gf: "Noto+Sans+Devanagari:wght@400;500;600;700" },
  { code: "ja", name: "日本語", locale: "ja-JP", font: "Noto Sans JP", gf: "Noto+Sans+JP:wght@400;500;700" },
  { code: "zh", name: "简体中文", locale: "zh-CN", font: "Noto Sans SC", gf: "Noto+Sans+SC:wght@400;500;700" },
  { code: "es", name: "Español", locale: "es-ES" },
];
export const DEFAULT_LANG = "ko";
export const LANG_PREF_KEY = "occ_lang";
const CODES = LANGS.map((l) => l.code);

function readStored() { try { const v = window.localStorage.getItem(LANG_PREF_KEY); return CODES.includes(v) ? v : null; } catch { return null; } }
function hasPriorVisit() { try { for (let i = 0; i < window.localStorage.length; i++) { const k = window.localStorage.key(i); if (k && k.startsWith("occ_")) return true; } } catch { } return false; }
function detectFromBrowser() {
  const list = (typeof navigator !== "undefined" && (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language])) || [];
  for (const raw of list) {
    const c = String(raw || "").toLowerCase().split("-")[0];
    if (CODES.includes(c)) return c;
  }
  return "en"; // 지원하지 않는 언어권은 영어
}
// 처음 방문(저장된 선택도, 이전 방문 흔적도 없음)이면 브라우저 언어를 따르고, 그 결과를 저장해 이후엔 고정한다.
// 이미 쓰던 사용자는 한국어를 유지한다(영어 OS를 쓰는 기존 사용자가 갑자기 영어를 보지 않도록).
function resolveLang() {
  if (typeof window === "undefined") return DEFAULT_LANG;
  let l = readStored();
  if (l) return l;
  l = hasPriorVisit() ? DEFAULT_LANG : detectFromBrowser();
  try { window.localStorage.setItem(LANG_PREF_KEY, l); } catch { }
  return l;
}

export const lang = resolveLang();
export const langInfo = LANGS.find((l) => l.code === lang) || LANGS[0];

async function loadCatalog(code) {
  switch (code) {
    case "en": return (await import("./i18n/en.js")).default;
    case "hi": return (await import("./i18n/hi.js")).default;
    case "ja": return (await import("./i18n/ja.js")).default;
    case "zh": return (await import("./i18n/zh.js")).default;
    case "es": return (await import("./i18n/es.js")).default;
    default: return {};
  }
}
let catalog = {};
try { catalog = await loadCatalog(lang); } catch { catalog = {}; }

if (typeof document !== "undefined") {
  document.documentElement.lang = lang;
  // 언어별 폰트: 한국어 외 문자(데바나가리·일본어·중국어)는 기본 폰트에 글리프가 없어 필요할 때만 불러온다.
  if (langInfo.font) {
    try {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = "https://fonts.googleapis.com/css2?family=" + langInfo.gf + "&display=swap";
      document.head.appendChild(link);
      document.documentElement.style.setProperty("--oc-lang-font", '"' + langInfo.font + '"');
    } catch { }
  }
}

export const missing = new Set(); // 번역이 없어 원문(한국어)이 그대로 나온 키 — 개발 중 확인용(window.__i18nMissing)
if (typeof window !== "undefined") window.__i18nMissing = missing;

function fmt(s, params) { return params.length ? s.replace(/\{(\d+)\}/g, (m, i) => (i < params.length ? String(params[i]) : m)) : s; }
/** 번역. 한국어일 때는 원문 그대로(자리표시자만 채움). */
export function t(key, ...params) {
  let s = key;
  if (lang !== DEFAULT_LANG) { const v = catalog[key]; if (v == null) { if (missing.size < 5000) missing.add(key); } else s = v; }
  return fmt(s, params);
}
/** 번역 + JSX 끼워 넣기. 자리표시자 자리에 React 노드를 그대로 넣은 Fragment를 돌려준다. */
export function tx(key, ...params) {
  const s = lang !== DEFAULT_LANG && catalog[key] != null ? catalog[key] : key;
  if (lang !== DEFAULT_LANG && catalog[key] == null && missing.size < 5000) missing.add(key);
  const parts = s.split(/(\{\d+\})/);
  return createElement(Fragment, null, ...parts.map((p, i) => {
    const m = /^\{(\d+)\}$/.exec(p);
    return m ? createElement(Fragment, { key: i }, params[+m[1]]) : p;
  }));
}
/** 언어별 숫자·날짜 서식(인도는 hi-IN의 10만·천만 단위 구분). */
export function fmtNum(n, opts) { try { return new Intl.NumberFormat(langInfo.locale, opts).format(n); } catch { return String(n); } }
export function fmtDate(d, opts) { try { return new Date(d).toLocaleString(langInfo.locale, opts); } catch { return String(d); } }
export function fmtDateOnly(d, opts) { try { return new Date(d).toLocaleDateString(langInfo.locale, opts); } catch { return String(d); } }
/** 언어를 바꾸고 새로고침한다(모듈 최상위 문자열까지 전부 새 언어로 다시 만들기 위해). */
export function setLang(code) {
  if (!CODES.includes(code) || code === lang) return;
  try { window.localStorage.setItem(LANG_PREF_KEY, code); } catch { }
  window.location.reload();
}
