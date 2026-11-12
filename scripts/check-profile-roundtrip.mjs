#!/usr/bin/env node
/** (v0.7.5, BUG-157 재발 방지) 공개 프로필(pub)로 서버에 올리는 "사용자가 고치는 프로필 필드"는, 로그인·세션 복원 때 서버 값으로 되돌려 받아야 한다.
 *  사고: 세션 복원 경로가 pub.bio를 읽지 않아, 다른 기기에서 고친 소개가 이 기기의 예전 값으로 다시 올라가 덮어써졌다.
 *  App.jsx의 publishProfile(...) 객체에 들어 있는 편집 필드가 두 복원 경로(세션 복원 setProfile((p) => …)·로그인 setProfile({ … }))에 모두 나오는지 검사한다.
 *  실행: node scripts/check-profile-roundtrip.mjs (prebuild) */
import { readFileSync } from "node:fs";
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const fails = [];
// 사용자가 프로필 편집에서 바꾸는 필드(공개 프로필 키 → 복원할 때 읽는 pub 키)
const EDITABLE = { nickname: "nickname", photo: "photo", bio: "bio", chesscom: "chesscom", firstMoves: "firstMoves", displayId: "displayId", featuredTitles: "featuredPick" };
const pubLine = app.split("\n").find((l) => l.includes("publishProfile(uid, user, {")) || "";
const sessionLine = app.split("\n").find((l) => l.includes("const pub = acc.pub || {}") && l.includes("setProfile((p) =>")) || "";
const loginLine = app.split("\n").find((l) => l.includes("const pub = acc.pub || {}; setProfile({")) || "";
if (!pubLine) fails.push("publishProfile 호출을 찾지 못함");
if (!sessionLine) fails.push("세션 복원 경로(setProfile((p) => …))를 찾지 못함");
if (!loginLine) fails.push("로그인 경로(setProfile({ … }))를 찾지 못함");
for (const [field, pubKey] of Object.entries(EDITABLE)) {
  const published = new RegExp("\\b" + field + ": profile\\." + field + "|\\b" + pubKey + ":").test(pubLine) || pubLine.includes("profile." + field);
  if (!published) continue;
  for (const [name, line] of [["세션 복원", sessionLine], ["로그인", loginLine]]) if (line && !line.includes("pub." + pubKey)) fails.push(name + " 경로가 pub." + pubKey + "를 읽지 않음 — " + field + "가 서버 값으로 복원되지 않고 이 기기의 예전 값이 다시 올라간다");
}
if (fails.length) { console.error("✗ check-profile-roundtrip 실패 (" + fails.length + "건)\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-profile-roundtrip: 공개 프로필로 올리는 편집 필드가 세션 복원·로그인 두 경로에서 모두 서버 값으로 복원된다");
