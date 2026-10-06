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

/* 외부 주소 열기 — 앱은 시스템 브라우저(Custom Tabs·SFSafariViewController), 웹은 새 탭.
   preferApp: 그 주소를 처리하는 다른 앱(예: chess.com 앱 링크)이 있으면 그 앱으로 바로 연다(AppLauncher). 없거나 실패하면 브라우저로. */
export async function openExternal(url, opts) {
  if (isNativeApp()) {
    const l = opts && opts.preferApp ? nativePlugin("AppLauncher") : null;
    if (l && typeof l.openUrl === "function") { try { const r = await l.openUrl({ url }); if (!r || r.completed !== false) return true; } catch { /* 아래 폴백 */ } }
    const b = nativePlugin("Browser");
    if (b && typeof b.open === "function") { try { await b.open({ url }); return true; } catch { /* 아래 폴백 */ } }
  }
  try { window.open(url, "_blank", "noopener,noreferrer"); return true; } catch { return false; }
}

/* mailto:·tel: 열기 — 앱은 기본 메일 앱(AppLauncher, 없으면 웹뷰 기본 처리), 웹은 현재 위치 이동(OS가 메일 앱을 연다). 시스템 브라우저(Browser)는 이런 스킴을 못 연다. */
export async function openMailto(url) {
  if (isNativeApp()) {
    const l = nativePlugin("AppLauncher");
    if (l && typeof l.openUrl === "function") { try { await l.openUrl({ url }); return true; } catch { /* 아래 폴백 */ } }
  }
  try { window.location.href = url; return true; } catch { return false; }
}

/* (v0.6.4) 링크 클릭 분류 — 앱 웹뷰 안에서 <a>를 눌렀을 때 어떻게 처리할지 정한다. 순수 함수(테스트 대상).
   · mailto:/tel: → "mail"(메일·전화 앱으로)
   · 다른 출처 http(s) → "external"(시스템 브라우저로. 그대로 두면 웹뷰가 남의 사이트로 넘어가 앱 화면이 사라진다)
   · 같은 출처 + target=_blank → "site"(앱 안이 아니라 대표 사이트 주소로 브라우저에서 열기 — 열려 있던 모달·입력 상태를 지키려고)
   · 그 밖(같은 출처 일반 이동·#앵커·javascript: 등) → "none"(건드리지 않음) */
export function classifyLinkClick(href, target, appOrigin, siteOrigin = "https://openchess.kr") {
  let u, base;
  try { base = new URL(appOrigin); u = new URL(String(href || ""), base); } catch { return { action: "none" }; }
  if (u.protocol === "mailto:" || u.protocol === "tel:") return { action: "mail", url: u.href };
  // 앱 웹뷰의 출처는 안드로이드 https://localhost, iOS capacitor://localhost처럼 http(s)가 아닐 수 있어 URL.origin(비표준 스킴은 "null") 대신 스킴·호스트를 직접 비교한다.
  const sameApp = u.protocol === base.protocol && u.host === base.host;
  if (!sameApp && u.protocol !== "http:" && u.protocol !== "https:") return { action: "none" };
  if (!sameApp) return { action: "external", url: u.href };
  if (target === "_blank") return { action: "site", url: siteOrigin + u.pathname + u.search + u.hash };
  return { action: "none" };
}
/* 앱에서만: 문서 전체의 링크 클릭을 가로채 classifyLinkClick 결과대로 연다. 웹에서는 아무 일도 하지 않는다(해제 함수만 돌려줌). */
export function installNativeLinkGuard() {
  if (!isNativeApp() || typeof document === "undefined") return () => { };
  const onClick = (e) => {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey) return;
    const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || a.hasAttribute("download")) return;
    const c = classifyLinkClick(a.getAttribute("href"), a.getAttribute("target"), window.location.protocol + "//" + window.location.host);
    if (c.action === "none") return;
    e.preventDefault();
    if (c.action === "mail") openMailto(c.url); else openExternal(c.url, { preferApp: a.dataset && a.dataset.preferApp === "1" });
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}

/* (v0.6.4) 안드로이드 하드웨어 뒤로가기 — 웹뷰 히스토리(앱의 화면 스택 pushScreen·popstate)를 먼저 되감고, 더 되감을 곳이 없을 때만 아래 규칙을 쓴다.
   반환: "back"(history.back) | "home"(홈 탭으로) | "hint"(한 번 더 누르면 종료 안내) | "exit"(앱 종료). 순수 함수(테스트 대상).
   armedAt: 직전에 "hint"를 낸 시각(ms, 없으면 0). 2초 안에 다시 누르면 종료. */
export const BACK_EXIT_WINDOW_MS = 2000;
export function decideBackAction({ canGoBack, tab, homeTab, now, armedAt }) {
  if (canGoBack) return "back";
  if (tab && homeTab && tab !== homeTab) return "home";
  return armedAt && now - armedAt <= BACK_EXIT_WINDOW_MS ? "exit" : "hint";
}
/* 뒤로가기 버튼 리스너. handler({canGoBack})를 부른다. 리스너를 등록하면 Capacitor의 기본 동작(웹뷰 뒤로가기·종료)이 꺼지므로 handler가 모두 책임진다. 웹에서는 아무 일도 안 한다. */
export function listenBackButton(handler) {
  if (!isNativeApp()) return () => { };
  const app = nativePlugin("App");
  if (!app || typeof app.addListener !== "function") return () => { };
  let off = null, dead = false;
  try {
    const p = app.addListener("backButton", (ev) => { try { handler({ canGoBack: !!(ev && ev.canGoBack) }); } catch { } });
    Promise.resolve(p).then((h) => { if (dead) { try { h && h.remove && h.remove(); } catch { } } else off = h; }).catch(() => { });
  } catch { }
  return () => { dead = true; try { off && off.remove && off.remove(); } catch { } };
}
export function exitApp() { const app = nativePlugin("App"); try { if (app && typeof app.exitApp === "function") app.exitApp(); } catch { } }

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
