#!/usr/bin/env node
/** (v0.6.3, 앱 출시 준비 3단계) 앱 연결 안전장치 — 시스템 브라우저 로그인·딥링크·앱 링크 파일·엔진 내려받기
 *  ① 딥링크·로그인 복귀 분석(parseDeepLink·parseAuthFragment)이 앱 스킴·앱 링크·오류·복구 링크를 맞게 가른다.
 *  ② 엔진 내려받기(진행률·크기 검증·상태 전이)가 가짜 Capacitor 플러그인으로 정상·실패 경로 모두 맞게 동작한다.
 *  ③ 앱 링크 파일(public/.well-known)·vercel.json(rewrite 제외·Content-Type·엔진 CORS)·앱 식별자 일치·앱 번들 스크립트 연결.
 *  ④ OAuth 시작·워커 생성이 새 헬퍼를 거친다(앱에서 웹뷰 로그인이 구글에 막히는 회귀 방지).
 *  앱 링크 파일의 자리표시자(TEAMID·REPLACE_)는 출시 전에 실제 값으로 바꿔야 한다 — 검사는 경고만 한다. 실행: node scripts/check-app-links.mjs */
import { readFileSync, existsSync } from "node:fs";
const fails = [], warns = [];
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };

// ① 딥링크
const { parseDeepLink, parseAuthFragment, APP_SCHEME, NATIVE_AUTH_REDIRECT, isNativeApp, oauthRedirectUrl } = await import("../src/lib/nativeApp.js");
eq(parseDeepLink("kr.openchess.app://auth/callback#access_token=a&refresh_token=r"), { kind: "auth", hash: "access_token=a&refresh_token=r", query: "" }, "앱 스킴 로그인 복귀");
eq(parseDeepLink("https://openchess.kr/auth/callback#access_token=a")?.kind, "auth", "앱 링크 로그인 복귀");
eq(parseDeepLink("https://openchess.kr/user/ABCDE1234?x=1"), { kind: "route", path: "/user/ABCDE1234?x=1" }, "앱 링크 경로");
eq(parseDeepLink("kr.openchess.app://puzzle/abcdef-12"), { kind: "route", path: "/puzzle/abcdef-12" }, "앱 스킴 경로");
eq(parseDeepLink("https://evil.example/auth/callback#access_token=a"), null, "다른 도메인은 거부");
eq(parseDeepLink("https://openchess.kr.evil.example/x"), null, "접두 일치 도메인은 거부");
eq(parseDeepLink("javascript:alert(1)"), null, "다른 스킴은 거부");
eq(parseDeepLink("not a url"), null, "잘못된 주소는 거부");
eq(parseAuthFragment("access_token=a&refresh_token=r&type=recovery"), { kind: "recovery", session: { access_token: "a", refresh_token: "r" } }, "복구 링크");
eq(parseAuthFragment("access_token=a")?.kind, "session", "세션");
eq(parseAuthFragment("error=access_denied&error_description=Email+exists")?.message, "Email exists", "오류 설명");
eq(parseAuthFragment(""), null, "빈 조각");
eq(APP_SCHEME, "kr.openchess.app", "앱 스킴");
eq(isNativeApp(), false, "웹(Capacitor 없음)은 앱이 아님");

// ② 엔진 내려받기 — 가짜 Capacitor
const store = new Map(); const ls = new Map();
globalThis.window = { location: { href: "http://localhost/", origin: "http://localhost", pathname: "/" }, localStorage: { getItem: (k) => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v) } };
const manifest = { full18: { dir: "18", files: [{ name: "boot-single.js", size: 10 }, { name: "a-part-0.wasm", size: 100 }] } };
let corrupt = false;
const FS = {
  getUri: async ({ path }) => ({ uri: "file:///data/" + path }),
  rmdir: async ({ path }) => { for (const k of [...store.keys()]) if (k.startsWith(path + "/")) store.delete(k); },
  downloadFile: async ({ url, path }) => { const n = url.split("/").pop(); const f = manifest.full18.files.find((x) => x.name === n); store.set(path, corrupt ? f.size - 1 : f.size); },
  stat: async ({ path }) => { if (!store.has(path)) throw new Error("nf"); return { size: store.get(path) }; },
  writeFile: async ({ path }) => { store.set(path, 1); },
  addListener: async () => ({ remove() { } }),
};
window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "android", convertFileSrc: (u) => u.replace("file://", "http://localhost/_capacitor_file_"), Plugins: { Filesystem: FS } };
globalThis.fetch = async () => ({ ok: true, json: async () => manifest });
const ed = await import("../src/lib/engineDownload.js");
eq(ed.manifestTotalBytes(manifest.full18), 110, "총 크기");
eq(ed.downloadProgress(manifest.full18, { "boot-single.js": 10, "a-part-0.wasm": 50 }), 60 / 110, "진행률");
eq(ed.downloadProgress(manifest.full18, { "a-part-0.wasm": 9999 }), 100 / 110, "진행률은 파일 크기를 넘지 않음");
eq(ed.isSameOriginUrl("http://localhost/_capacitor_file_/x.js", "http://localhost/"), true, "같은 출처");
eq(ed.isSameOriginUrl("https://cdn.jsdelivr.net/x.js", "http://localhost/"), false, "다른 출처");
const profiles = { full17: { urls: ["/engine/17/boot-single.js#a.wasm"] }, full18: { urls: ["/engine/18/boot-single.js"], mtUrl: "/engine/18/mt.js" } };
await ed.initDownloadedEngines(profiles);
eq(ed.engineUsable("lite"), true, "Lite는 항상 사용 가능");
eq(ed.engineUsable("full18"), false, "앱: 내려받기 전엔 큰 엔진 사용 불가");
eq(ed.engineNeedsDownload("full18"), true, "앱: 내려받기 필요");
corrupt = true; eq(await ed.downloadEngine("full18"), false, "깨진 파일(크기 불일치)은 실패");
eq(ed.engineDownloadState("full18").status, "error", "실패 상태"); eq(ed.engineUsable("full18"), false, "실패하면 쓸 수 없음");
eq(JSON.parse(ls.get("occ_engine_dl_v1") || "{}").full18, undefined, "실패는 완료로 기록되지 않음");
corrupt = false; eq(await ed.downloadEngine("full18"), true, "정상 내려받기");
eq(ed.engineUsable("full18"), true, "내려받은 뒤 사용 가능");
eq(profiles.full18.urls, ["http://localhost/_capacitor_file_/data/engine/18/boot-single.js"], "워커 주소가 기기 저장소 파일로 바뀜");
eq(profiles.full18.mtUrl, undefined, "앱은 멀티스레드 주소를 지움");
eq(await ed.deleteDownloadedEngine("full18"), true, "삭제"); eq(ed.engineUsable("full18"), false, "삭제하면 다시 내려받기 필요");
delete window.Capacitor; eq(ed.engineUsable("full18"), true, "웹은 항상 사용 가능(기존 동작)");
eq(oauthRedirectUrl(), "http://localhost/", "웹 로그인 복귀 주소는 현재 페이지");
window.Capacitor = { isNativePlatform: () => true, Plugins: {} }; eq(oauthRedirectUrl(), NATIVE_AUTH_REDIRECT, "앱 로그인 복귀 주소는 앱 스킴");

// ③ 앱 링크 파일·배포 설정
const aasaTxt = existsSync(new URL("../public/.well-known/apple-app-site-association", import.meta.url)) ? read("public/.well-known/apple-app-site-association") : null;
const alTxt = existsSync(new URL("../public/.well-known/assetlinks.json", import.meta.url)) ? read("public/.well-known/assetlinks.json") : null;
if (!aasaTxt) fails.push("public/.well-known/apple-app-site-association 없음"); if (!alTxt) fails.push("public/.well-known/assetlinks.json 없음");
try {
  const aasa = JSON.parse(aasaTxt), id = aasa.applinks.details[0].appIDs[0];
  if (!id.endsWith("." + APP_SCHEME)) fails.push("AASA appID가 앱 식별자(" + APP_SCHEME + ")와 다름: " + id);
  if (/^TEAMID\./.test(id)) warns.push("AASA의 TEAMID를 Apple 팀 ID로 바꿔야 함(출시 전)");
  const comps = aasa.applinks.details[0].components; if (!comps.some((c) => c["/"] === "/api/*" && c.exclude)) fails.push("AASA가 /api/*를 앱 링크에서 제외하지 않음");
} catch (e) { fails.push("AASA 형식 오류: " + e.message); }
try {
  const al = JSON.parse(alTxt)[0]; if (al.target.package_name !== APP_SCHEME) fails.push("assetlinks package_name이 앱 식별자와 다름");
  if (al.target.sha256_cert_fingerprints.some((x) => /REPLACE/.test(x))) warns.push("assetlinks의 SHA256 지문을 릴리스 키 값으로 바꿔야 함(출시 전)");
} catch (e) { fails.push("assetlinks 형식 오류: " + e.message); }
const vj = JSON.parse(read("vercel.json"));
if (!/\.well-known/.test(vj.rewrites[0].source)) fails.push("vercel.json rewrite가 /.well-known/을 제외하지 않음(앱 링크 파일이 index.html로 바뀜)");
for (const f of ["apple-app-site-association", "assetlinks.json"]) {
  const h = vj.headers.find((x) => x.source.includes(f)); if (!h || !h.headers.some((x) => x.key === "Content-Type" && x.value === "application/json")) fails.push("vercel.json에 " + f + " Content-Type(application/json) 헤더 없음");
}
const eng = vj.headers.find((x) => x.source === "/engine/(.*)"); if (!eng || !eng.headers.some((x) => x.key === "Access-Control-Allow-Origin")) fails.push("vercel.json /engine/ 에 CORS 헤더 없음(앱이 엔진 목록을 못 받음)");
const pkg = JSON.parse(read("package.json")); if (!/prune-app-engines/.test(pkg.scripts["build:app"] || "")) fails.push("package.json build:app이 큰 엔진을 빼지 않음");
if (!existsSync(new URL("../scripts/prune-app-engines.mjs", import.meta.url))) fails.push("scripts/prune-app-engines.mjs 없음");
if (!/engine\/manifest\.json/.test(read("scripts/copy-engine.mjs"))) fails.push("copy-engine.mjs가 manifest.json을 만들지 않음");

// ④ 연결
const shell = read("src/app/shell.jsx"), settings = read("src/app/settings.jsx"), common = read("src/app/common.jsx"), app = read("src/App.jsx");
if (!/startOAuthNavigation\(SB_URL \+ "\/auth\/v1\/authorize/.test(shell)) fails.push("authOAuthStart가 startOAuthNavigation을 거치지 않음 — 앱에서 웹뷰 로그인으로 돌아가면 구글이 막음");
if (/window\.location\.href = SB_URL \+ "\/auth\/v1\/authorize/.test(shell)) fails.push("shell.jsx에 웹뷰 이동 방식 로그인이 남아 있음");
if (!/startOAuthNavigation\(j\.url\)/.test(settings) || /window\.location\.origin \+ window\.location\.pathname/.test(settings)) fails.push("계정 연결(linkIdentityRedirect)이 앱 로그인 경로를 쓰지 않음");
for (const [n, src] of [["shell.jsx", shell], ["common.jsx", common]]) if (!/isSameOriginUrl\(url\)\) w = new Worker\(url\)/.test(src)) fails.push(n + " 워커 생성이 같은 출처 주소(내려받은 엔진)를 직접 쓰지 않음");
if (!/listenDeepLinks\(/.test(app) || !/initDownloadedEngines\(ENGINE_PROFILES\)/.test(app)) fails.push("App.jsx에 딥링크 수신·내려받은 엔진 연결이 없음");

if (warns.length) console.warn("⚠ check-app-links 경고(출시 전 처리):\n  " + warns.join("\n  "));
if (fails.length) { console.error("✖ check-app-links 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-app-links: 딥링크·로그인 복귀 분석, 엔진 내려받기 상태 전이, 앱 링크 파일·배포 설정, 앱 로그인·워커 연결이 유지된다");
