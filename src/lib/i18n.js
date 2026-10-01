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
// 브라우저(OS) 언어 목록을 앞에서부터 보고, 지원하는 언어가 없으면 접속한 시간대로 짐작한 뒤, 그래도 모르면 영어.
const TZ_LANG = { "Asia/Kolkata": "hi", "Asia/Calcutta": "hi", "Asia/Tokyo": "ja", "Asia/Seoul": "ko", "Asia/Shanghai": "zh", "Asia/Chongqing": "zh", "Asia/Harbin": "zh", "Asia/Urumqi": "zh", "Europe/Madrid": "es", "Atlantic/Canary": "es", "Africa/Ceuta": "es" };
function detectFromBrowser() {
  const list = (typeof navigator !== "undefined" && (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language])) || [];
  for (const raw of list) {
    const c = String(raw || "").toLowerCase().split("-")[0];
    if (CODES.includes(c)) return c;
  }
  let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { }
  if (TZ_LANG[tz]) return TZ_LANG[tz];
  if (/^America\/(Mexico_City|Bogota|Lima|Santiago|Argentina|Buenos_Aires|Caracas|Montevideo|Guayaquil|La_Paz|Asuncion)/.test(tz)) return "es";
  return "en"; // 지원하지 않는 언어권은 영어
}
// 처음 방문(저장된 선택도, 이전 방문 흔적도 없음)이면 접속자의 브라우저 언어를 따른다. 이때는 "자동"으로 표시해 두고,
// 사용자가 직접 고르기 전까지는 접속할 때마다 브라우저 언어를 다시 확인한다(기기 언어를 바꾸면 따라감).
// 이미 쓰던 사용자는 한국어를 유지한다(영어 OS를 쓰는 기존 사용자가 갑자기 영어를 보지 않도록).
const AUTO_KEY = "occ_lang_auto";
function resolveLang() {
  if (typeof window === "undefined") return DEFAULT_LANG;
  let l = readStored();
  let auto = false; try { auto = window.localStorage.getItem(AUTO_KEY) === "1"; } catch { }
  if (l && !auto) return l;
  if (l && auto) { const d = detectFromBrowser(); try { window.localStorage.setItem(LANG_PREF_KEY, d); } catch { } return d; }
  const fresh = !hasPriorVisit();
  l = fresh ? detectFromBrowser() : DEFAULT_LANG;
  try { window.localStorage.setItem(LANG_PREF_KEY, l); if (fresh) window.localStorage.setItem(AUTO_KEY, "1"); } catch { }
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

// 한국어 조사 표지: "{0:이/가}" — 한국어일 때만 앞 값의 받침에 맞는 조사를 붙인다. 다른 언어 번역에서는 그냥 "{0}"로 쓴다(표지는 무시).
function batchimOf(w) { // 0: 받침 없음, 1: 받침 있음, 2: ㄹ 받침
  const last = w[w.length - 1]; const ch = w.charCodeAt(w.length - 1);
  if (ch >= 48 && ch <= 57) return "178".includes(last) ? 2 : "036".includes(last) ? 1 : 0; // 읽는 소리: 영·삼·육 / 일·칠·팔
  if (ch < 0xAC00 || ch > 0xD7A3) return 0; // 한글 밖(영문 등)은 받침 없는 쪽
  const j = (ch - 0xAC00) % 28; return j === 0 ? 0 : j === 8 ? 2 : 1;
}
// 복수형: 번역문에서 "{0|move|moves}" — 앞 값이 하나일 때/아닐 때의 단어를 고른다(영어·스페인어: 1만 단수, 힌디어: 0과 1이 단수, 일본어·중국어는 단수 형태 하나).
function pluralPick(n, one, other) { const x = Number(n); if (lang === "ja" || lang === "zh" || lang === "ko") return one; if (lang === "hi") return x === 0 || x === 1 ? one : other; return x === 1 ? one : other; }
function josaAttach(v, josa) { const [a, b] = josa.split("/"); const bt = batchimOf(v); return v + (a === "으로" ? (bt === 1 ? "으로" : "로") : (bt ? a : b)); }
function fmt(s, params) {
  if (!params.length) return s;
  return s.replace(/\{(\d+)\|([^|}]*)\|([^}]*)\}/g, (m, i, a, b) => (i < params.length ? pluralPick(params[i], a, b) : m))
    .replace(/\{(\d+)(?::([^}]*))?\}/g, (m, i, josa) => {
      if (i >= params.length) return m;
      const v = String(params[i]);
      if (josa && lang === DEFAULT_LANG) return josaAttach(v, josa);
      return v;
    });
}
/** 번역. 한국어일 때는 원문 그대로(자리표시자만 채움). */
export function t(key, ...params) {
  let s = key;
  if (lang !== DEFAULT_LANG) { const v = catalog[key]; if (v == null) { if (missing.size < 5000) missing.add(key); } else s = v; }
  return fmt(s, params);
}
/** 문장 중간에 끼워 쓸 때: 영어·스페인어는 첫 글자를 소문자로("Queen"→"queen", "Dama"→"dama"). 나머지 언어는 그대로. 고유명사(오프닝 이름·사용자 이름)에는 쓰지 말 것. */
export function lcLatin(s) { return (lang === "en" || lang === "es") && typeof s === "string" && s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
/** 번역 + JSX 끼워 넣기. 자리표시자 자리에 React 노드를 그대로 넣은 Fragment를 돌려준다. */
export function tx(key, ...params) {
  const s = lang !== DEFAULT_LANG && catalog[key] != null ? catalog[key] : key;
  if (lang !== DEFAULT_LANG && catalog[key] == null && missing.size < 5000) missing.add(key);
  // 복수형·한국어 조사 표지도 t()와 똑같이 처리한다. 자리에 들어가는 값이 JSX(<b>{n}</b> 등)여도 안에 든 숫자·글자를 읽어 판단한다.
  const plain = (p) => (p == null || typeof p === "boolean" ? "" : typeof p === "object" ? (Array.isArray(p) ? p : [p.props && p.props.children]).map(plain).join("") : String(p));
  const resolved = s.replace(/\{(\d+)\|([^|}]*)\|([^}]*)\}/g, (m, i, a, b) => (+i < params.length ? pluralPick(plain(params[+i]), a, b) : m));
  const parts = resolved.split(/(\{\d+(?::[^}]*)?\})/);
  return createElement(Fragment, null, ...parts.map((p, i) => {
    const m = /^\{(\d+)(?::([^}]*))?\}$/.exec(p);
    if (!m) return p;
    const v = params[+m[1]];
    if (m[2] && lang === DEFAULT_LANG && (typeof v === "string" || typeof v === "number")) return josaAttach(String(v), m[2]);
    return createElement(Fragment, { key: i }, v);
  }));
}
/** 언어별 숫자·날짜 서식(인도는 hi-IN의 10만·천만 단위 구분). */
export function fmtNum(n, opts) { try { return new Intl.NumberFormat(langInfo.locale, opts).format(n); } catch { return String(n); } }
export function fmtDate(d, opts) { try { return new Date(d).toLocaleString(langInfo.locale, opts); } catch { return String(d); } }
export function fmtDateOnly(d, opts) { try { return new Date(d).toLocaleDateString(langInfo.locale, opts); } catch { return String(d); } }
/** 언어를 바꾸고 새로고침한다(모듈 최상위 문자열까지 전부 새 언어로 다시 만들기 위해). */
export function setLang(code) {
  if (!CODES.includes(code) || code === lang) return;
  try { window.localStorage.setItem(LANG_PREF_KEY, code); window.localStorage.removeItem(AUTO_KEY); } catch { }
  window.location.reload();
}
