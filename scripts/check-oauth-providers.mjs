#!/usr/bin/env node
/** (v0.7.9, BUG-193 재발 방지) 소셜 로그인 버튼은 Supabase Auth에 실제로 켜진 제공자만 보여 준다.
 *  · enabledFromSettings / visibleProviders 순수 함수 시험(GoTrue /auth/v1/settings 응답 모양)
 *  · 로그인 창(shell.jsx)·계정 센터(settings.jsx)가 authOAuthStart/연결 버튼을 useOAuthProviders 결과로 가려 그리는지 소스 검사
 *  대시보드에서 끈 제공자 버튼을 누르면 GoTrue 400 JSON 화면으로 사이트를 벗어난다. 실행: node scripts/check-oauth-providers.mjs
 */
import { readFileSync } from "node:fs";
const { enabledFromSettings, visibleProviders, OAUTH_PROVIDERS } = await import("../src/lib/authProviders.js");
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const fails = [];
const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(name + ": " + JSON.stringify(got) + " ≠ " + JSON.stringify(want)); };

eq("설정: google만 켜짐", enabledFromSettings({ external: { google: true, apple: false, facebook: false, email: true } }), { google: true, apple: false, facebook: false });
eq("설정: 문자열 true는 꺼진 것으로", enabledFromSettings({ external: { google: "true", apple: true } }), { google: false, apple: true, facebook: false });
eq("설정: external 없음 → 판단 불가", enabledFromSettings({ disable_signup: false }), null);
eq("설정: null → 판단 불가", enabledFromSettings(null), null);
eq("보이기: 불러오는 중엔 Google만", visibleProviders(undefined), ["google"]);
eq("보이기: 판단 불가면 모두(예전 동작)", visibleProviders(null), OAUTH_PROVIDERS);
eq("보이기: 켜진 것만", visibleProviders({ google: true, apple: false, facebook: true }), ["google", "facebook"]);

const shell = rd("src/app/shell.jsx");
for (const p of OAUTH_PROVIDERS) {
  const calls = [...shell.matchAll(new RegExp('onClick=\\{\\(\\) => authOAuthStart\\("' + p + '"\\)\\}', "g"))];
  if (!calls.length) fails.push("shell.jsx: " + p + " 로그인 버튼을 찾지 못함");
  for (const m of calls) if (!shell.slice(Math.max(0, m.index - 80), m.index).includes('oauthShown.includes("' + p + '") && <button')) fails.push("shell.jsx: " + p + " 로그인 버튼이 켜짐 여부(oauthShown)와 상관없이 그려짐");
}
if (!/const oauthShown = useOAuthProviders\(\)/.test(shell)) fails.push("shell.jsx AuthModal: useOAuthProviders 호출 없음");
const settings = rd("src/app/settings.jsx");
if (!/ACCOUNT_CENTER_PROVIDERS\.filter\(\(p\) => oauthShown\.includes\(p\.key\) \|\| identities\.some/.test(settings)) fails.push("settings.jsx 계정 센터: 켜진 수단·이미 연결된 수단만 보여 주는 필터가 없음");

if (fails.length) { console.error("✗ check-oauth-providers 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-oauth-providers: 소셜 로그인 버튼(" + OAUTH_PROVIDERS.join("·") + ")은 Supabase에 켜진 것만, 계정 센터는 켜졌거나 이미 연결된 것만");
