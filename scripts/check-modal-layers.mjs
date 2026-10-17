#!/usr/bin/env node
/** (v0.6.8, BUG-105 재발 방지) 팝업이 화면 내용 위에 제대로 뜨는지 코드 규칙으로 지킨다.
 *  사고: 로그인 팝업(z-index 80)이 도감의 검색창 줄(z-index 80, 나중에 그려짐)에 가려져 "로그인" 제목 위로 검색창·새로고침 버튼이 겹쳐 보였다.
 *  ① 도감(CollectionTab) 최상위는 isolation: "isolate"로 안쪽 z-index를 가둔다.
 *  ② 로그인(AuthModal)·프로필 창(ProfileWindow)의 바깥 층은 z-index 90 이상이다.
 */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../src/" + f, import.meta.url), "utf8");
const fails = [];
if (!/isolation: "isolate"/.test(rd("app/dex.jsx"))) fails.push("app/dex.jsx: 도감 최상위에 isolation: \"isolate\"가 없음 — 안쪽 z-index가 팝업 위로 올라올 수 있음");
const shell = rd("app/shell.jsx"); const a = shell.indexOf("export function AuthModal");
const authZ = (shell.slice(a, a + 12000).match(/position: "fixed", inset: 0[^}]*?zIndex: (\d+)/) || [])[1];
if (!(Number(authZ) >= 90)) fails.push("app/shell.jsx: AuthModal 바깥 층 zIndex가 90 미만(" + authZ + ")");
const social = rd("app/social.jsx"); const b = social.indexOf("export function ProfileWindow");
const profZ = (social.slice(b, b + 6000).match(/position: "fixed", inset: 0[^}]*?zIndex: (\d+)/) || [])[1];
if (!(Number(profZ) >= 90)) fails.push("app/social.jsx: ProfileWindow 바깥 층 zIndex가 90 미만(" + profZ + ")");
if (fails.length) { console.error("check-modal-layers 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-modal-layers: 도감은 층을 가두고, 로그인·프로필 창은 z-index " + authZ + "/" + profZ);
