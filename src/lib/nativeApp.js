// (v0.6.3, 앱 출시 준비 3단계) 네이티브 앱(Capacitor 웹뷰) 환경 판별과 시스템 브라우저·딥링크 연결.
//  · 웹에서는 모든 함수가 기존 동작(같은 창 이동·window.open)으로 폴백한다 — 웹 동작은 바뀌지 않는다.
//  · Capacitor 패키지를 번들에 넣지 않고 앱이 주입하는 전역 `window.Capacitor.Plugins`만 읽는다
//    (0.9.0에서 래퍼를 붙일 때 @capacitor/app·@capacitor/browser 플러그인을 설치하면 그대로 연결된다).
export const APP_SCHEME = "kr.openchess.app";
// OAuth 복귀 주소: 앱에서는 커스텀 스킴으로 돌아온다(앱 링크 검증과 무관하게 항상 앱이 열림).
// Supabase 대시보드 Redirect URLs에 `kr.openchess.app://**`를 등록해야 한다(SETUP_OAUTH.md 참고).
export const NATIVE_AUTH_REDIRECT = APP_SCHEME + "://auth/callback";

function cap() { try { return (typeof window !== "undefined" && window.Capacitor) || null; } catch { return null; } }
export function isNativeApp() { const c = cap(); try { return !!(c && typeof c.isNativePlatform === "function" && c.isNativePlatform()); } catch { return false; } }
export function nativePlugin(name) { const c = cap(); try { return (c && c.Plugins && c.Plugins[name]) || null; } catch { return null; } }
export function nativePlatform() { const c = cap(); try { return (c && c.getPlatform && c.getPlatform()) || "web"; } catch { return "web"; } }

/* OAuth 복귀 주소 — 앱은 커스텀 스킴, 웹은 현재 페이지. */
export function oauthRedirectUrl() {
  if (isNativeApp()) return NATIVE_AUTH_REDIRECT;
  const webRedirect = window.location.origin + window.location.pathname;   // 웹 로그인 복귀는 현재 출처가 필요하다
  return webRedirect;
}

/* 외부 주소 열기 — 앱은 시스템 브라우저(Custom Tabs·SFSafariViewController), 웹은 새 탭. */
export async function openExternal(url) {
  const b = nativePlugin("Browser");
  if (isNativeApp() && b && typeof b.open === "function") { try { await b.open({ url }); return true; } catch { /* 아래 폴백 */ } }
  try { window.open(url, "_blank", "noopener,noreferrer"); return true; } catch { return false; }
}

/* 로그인 페이지로 보내기 — 앱은 시스템 브라우저(구글은 웹뷰 로그인을 막음), 웹은 같은 창 이동. */
export async function startOAuthNavigation(url) {
  if (isNativeApp()) { if (await openExternal(url)) return; }
  window.location.href = url;
}

/* 시스템 브라우저 닫기(로그인 복귀 후) — iOS는 직접 닫아야 하고 Android는 무시된다. */
export async function closeExternalBrowser() {
  const b = nativePlugin("Browser");
  try { if (b && typeof b.close === "function") await b.close(); } catch { }
}

/* 딥링크 주소 분석. 지원: 앱 스킴(kr.openchess.app://auth/callback#…) · 유니버설/앱 링크(https://openchess.kr/경로?…).
   반환: { kind: "auth", hash } | { kind: "route", path } | null. 순수 함수(테스트 대상). */
export function parseDeepLink(rawUrl, siteHost = "openchess.kr") {
  let u;
  try { u = new URL(String(rawUrl || "")); } catch { return null; }
  const frag = u.hash ? u.hash.slice(1) : "";
  if (u.protocol === APP_SCHEME + ":") {
    // 스킴 주소는 host가 곧 첫 경로 조각이다(kr.openchess.app://auth/callback → host=auth).
    if (u.host === "auth") return { kind: "auth", hash: frag, query: u.search ? u.search.slice(1) : "" };
    const path = "/" + u.host + u.pathname.replace(/^\/+/, "/").replace(/\/$/, "");
    return { kind: "route", path: path + u.search };
  }
  if (u.protocol === "https:" && (u.hostname === siteHost || u.hostname === "www." + siteHost)) {
    if (u.pathname === "/auth/callback") return { kind: "auth", hash: frag, query: u.search ? u.search.slice(1) : "" };
    return { kind: "route", path: u.pathname + u.search };
  }
  return null;
}

/* (v0.6.3) 딥링크로 돌아온 로그인 결과(URL 조각 "access_token=…&refresh_token=…" 또는 "error_description=…") 분석.
   반환: { kind: "session", session } | { kind: "recovery", session } | { kind: "error", message } | null. 순수 함수(테스트 대상). */
export function parseAuthFragment(fragment) {
  try {
    const p = new URLSearchParams(String(fragment || "").replace(/^[#?]/, ""));
    const at = p.get("access_token");
    if (at) {
      const session = { access_token: at, refresh_token: p.get("refresh_token") || null };
      return { kind: p.get("type") === "recovery" ? "recovery" : "session", session };
    }
    const err = p.get("error_description") || p.get("error");
    return err ? { kind: "error", message: err } : null;
  } catch { return null; }
}
/* 앱이 딥링크로 열릴 때(실행 중·콜드 스타트 모두) handler(url)을 부른다. 해제 함수를 돌려준다. 웹에서는 아무 일도 안 한다. */
export function listenDeepLinks(handler) {
  if (!isNativeApp()) return () => { };
  const app = nativePlugin("App");
  if (!app || typeof app.addListener !== "function") return () => { };
  let off = null, dead = false;
  try {
    const p = app.addListener("appUrlOpen", (ev) => { try { if (ev && ev.url) handler(ev.url); } catch { } });
    Promise.resolve(p).then((h) => { if (dead) { try { h && h.remove && h.remove(); } catch { } } else off = h; }).catch(() => { });
  } catch { }
  // 앱이 링크로 처음 켜진 경우(콜드 스타트)의 주소.
  try { if (typeof app.getLaunchUrl === "function") Promise.resolve(app.getLaunchUrl()).then((r) => { if (!dead && r && r.url) handler(r.url); }).catch(() => { }); } catch { }
  return () => { dead = true; try { off && off.remove && off.remove(); } catch { } };
}
