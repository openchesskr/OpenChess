#!/usr/bin/env node
/** (v0.6.3, 외부 공유 UI 정리) 공유 UI가 다시 제각각이 되지 않게 지키는 검사.
 *  ① src/lib/share.js: 복사(클립보드 → 폴백)·Web Share 결과 구분(공유/취소/미지원/오류)·바로가기 URL 인코딩·메일 링크.
 *  ② 연결: navigator.share·navigator.clipboard.writeText·공유 서비스 주소는 lib/share.js 밖에서 직접 쓰지 않는다(공유 UI는 ShareLinkBlock 하나).
 *     공유 시트(퍼즐·리뷰·유산)는 ShareSheetFrame + FriendSendList를 쓰고 친구 목록 조회를 따로 복사해 두지 않는다.
 *  실행: node scripts/check-share-ui.mjs */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const fails = [];
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };

// ① 순수 로직 — 가짜 navigator·document
const g = globalThis;
const mk = (nav, doc) => { Object.defineProperty(g, "navigator", { value: nav, configurable: true }); g.document = doc; };
const share = await import("../src/lib/share.js");
mk({}, undefined); eq(share.canWebShare(), false, "share 없는 환경"); eq(await share.webShare({ url: "x" }), "unsupported", "미지원");
mk({ share: async () => { } }, undefined); eq(await share.webShare({ url: "x" }), "shared", "공유 성공");
mk({ share: async () => { const e = new Error("c"); e.name = "AbortError"; throw e; } }, undefined); eq(await share.webShare({ url: "x" }), "cancelled", "취소는 오류가 아님");
mk({ share: async () => { throw new Error("boom"); } }, undefined); eq(await share.webShare({ url: "x" }), "error", "오류");
mk({ clipboard: { writeText: async () => { } } }, undefined); eq(await share.copyText("a"), true, "클립보드 복사");
let copied = null; const ta = { style: {}, setAttribute() { }, select() { }, setSelectionRange() { } };
mk({ clipboard: { writeText: async () => { throw new Error("denied"); } } }, { createElement: () => ta, body: { appendChild() { }, removeChild() { } }, execCommand: (c) => { copied = ta.value; return c === "copy"; } });
eq(await share.copyText("link"), true, "클립보드 거부 시 textarea 폴백"); eq(copied, "link", "폴백이 값을 복사");
mk({}, { createElement: () => ta, body: { appendChild() { }, removeChild() { } }, execCommand: () => false }); eq(await share.copyText("x"), false, "모두 실패하면 false");
const T = share.shareTargets("https://openchess.kr/puzzle/123456-1?a=1&b=2", "퍼즐 & 문구");
eq(T.map((x) => x.id), ["kakaostory", "x", "facebook", "email"], "바로가기 목록");
if (!T[1].href.includes("url=https%3A%2F%2Fopenchess.kr%2Fpuzzle%2F123456-1%3Fa%3D1%26b%3D2") || !T[1].href.includes("%20%26%20")) fails.push("X 주소 인코딩 오류: " + T[1].href);
if (/&b=2(?!%)/.test(T[2].href.split("u=")[1])) fails.push("페이스북 주소에 인코딩되지 않은 &가 있음");
if (!T[3].href.startsWith("mailto:?subject=") || !T[3].mail) fails.push("이메일 링크 형식 오류");
eq(share.shareTargets("u", "").find((x) => x.id === "x").href.includes("&text="), false, "문구가 없으면 text 파라미터 생략");

// ② 연결
const files = []; (function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(n) && files.push(p); } })("src");
for (const f of files) {
  if (f.endsWith("lib/share.js")) continue;
  const src = readFileSync(f, "utf8");
  src.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    if (/navigator\.share\(/.test(code) || /navigator\.canShare\(/.test(code)) fails.push(f + ":" + (i + 1) + " — navigator.share 직접 호출. lib/share.js(webShare·canWebShareFiles)를 쓸 것");
    if (/story\.kakao\.com|facebook\.com\/sharer|twitter\.com\/intent|x\.com\/intent/.test(code)) fails.push(f + ":" + (i + 1) + " — 공유 서비스 주소 직접 사용. shareTargets()를 쓸 것");
  });
}
const common = readFileSync("src/app/common.jsx", "utf8"), review = readFileSync("src/app/review.jsx", "utf8"), social = readFileSync("src/app/social.jsx", "utf8");
for (const [name, src, re] of [["PuzzleShareSheet", common, /export function PuzzleShareSheet\([\s\S]*?\n}\n/], ["ReviewShareSheet", review, /function ReviewShareSheet\([\s\S]*$/], ["LegacyShareSheet", social, /function LegacyShareSheet\([\s\S]*?\n}\n/]]) {
  const m = src.match(re); if (!m) { fails.push(name + " 정의를 찾지 못함"); continue; }
  if (!/<ShareSheetFrame/.test(m[0])) fails.push(name + "이 ShareSheetFrame을 쓰지 않음");
  if (!/<FriendSendList/.test(m[0])) fails.push(name + "이 FriendSendList를 쓰지 않음");
  if (/friendEdges\(/.test(m[0])) fails.push(name + "이 친구 목록 조회를 따로 복사해 둠 — FriendSendList를 쓸 것");
}
if (!/export function InviteLinkBox[\s\S]*?<ShareLinkBlock/.test(common)) fails.push("InviteLinkBox가 ShareLinkBlock을 쓰지 않음");
if (fails.length) { console.error("✖ check-share-ui 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-share-ui: 복사 폴백·공유 결과 구분·바로가기 인코딩, 공유 시트 3종과 친구 초대가 공통 컴포넌트를 쓴다");
