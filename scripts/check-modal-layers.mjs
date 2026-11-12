#!/usr/bin/env node
/** (v0.6.8, BUG-105 재발 방지) 팝업이 화면 내용 위에 제대로 뜨는지 코드 규칙으로 지킨다.
 *  사고: 로그인 팝업(z-index 80)이 도감의 검색창 줄(z-index 80, 나중에 그려짐)에 가려져 "로그인" 제목 위로 검색창·새로고침 버튼이 겹쳐 보였다.
 *  ① 도감(CollectionTab) 최상위는 isolation: "isolate"로 안쪽 z-index를 가둔다.
 *  ② 로그인(AuthModal)의 바깥 층은 z-index 90 이상이다.
 *  ③ (v0.7.5, BUG-156) 프로필 편집(ProfileEditSheet)은 /user 페이지보다 위 층에서 열린다.
 */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../src/" + f, import.meta.url), "utf8");
const fails = [];
if (!/isolation: "isolate"/.test(rd("app/dex.jsx"))) fails.push("app/dex.jsx: 도감 최상위에 isolation: \"isolate\"가 없음 — 안쪽 z-index가 팝업 위로 올라올 수 있음");
const shell = rd("app/shell.jsx"); const a = shell.indexOf("export function AuthModal");
const authZ = (shell.slice(a, a + 12000).match(/position: "fixed", inset: 0[^}]*?zIndex: (\d+)/) || [])[1];
if (!(Number(authZ) >= 90)) fails.push("app/shell.jsx: AuthModal 바깥 층 zIndex가 90 미만(" + authZ + ")");
// (v0.7.5, BUG-156) 프로필 편집은 /user 페이지(전체 화면, position fixed) 위에서 열린다 — 편집 화면 z-index가 /user 페이지보다 높아야 한다.
const social = rd("app/social.jsx"); const b = social.indexOf("export function UserProfilePage");
const userZ = Number((social.slice(b, b + 40000).match(/position: "fixed", inset: 0, zIndex: (\d+), background: T\.paper/) || [])[1]);
const pe = rd("app/profileEdit.jsx");
const profZ = Number((pe.match(/export const PROFILE_EDIT_Z = (\d+)/) || [])[1]);
if (!userZ) fails.push("app/social.jsx: UserProfilePage 전체 화면 층의 zIndex를 찾지 못함");
if (!profZ || !(profZ > userZ)) fails.push("app/profileEdit.jsx: PROFILE_EDIT_Z(" + profZ + ")가 /user 페이지 층(" + userZ + ")보다 높지 않음 — 편집 화면이 페이지 밑에 숨는다");
if (!/zIndex: PROFILE_EDIT_Z\b/.test(pe)) fails.push("app/profileEdit.jsx: 바깥 층이 PROFILE_EDIT_Z를 쓰지 않음");
if (!/<ProfileEditSheet\b/.test(rd("App.jsx"))) fails.push("App.jsx: 프로필 편집이 ProfileEditSheet로 열리지 않음");
if (fails.length) { console.error("check-modal-layers 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-modal-layers: 도감은 층을 가두고, 로그인은 z-index " + authZ + ", 프로필 편집(" + profZ + ")은 /user 페이지(" + userZ + ") 위");
