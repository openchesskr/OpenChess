#!/usr/bin/env node
/** (v0.6.5) 사용자 글 자동 번역(수 설명·프로필 소개글)의 안전장치 검사(prebuild).
 *  ① 범위: 번역하는 종류는 note·bio뿐 — 채팅은 번역하지 않기로 한 범위다. 서버(api/translate.js)·클라이언트(ugcText.js)의 종류 목록이 같고 "chat"이 없다.
 *     서버 핸들러를 가짜 fetch로 실제 실행해 kind "chat"이 Gemini·DB를 부르기 전에 400으로 거부되는지 확인한다.
 *  ② 채팅 화면 격리: 채팅 파일(chatPlus·chatApi·chatCommands)은 번역 모듈을 가져오지 않고, social.jsx의 <UgcText>는 kind가 리터럴 "note"·"bio"이며
 *     채팅 말풍선·패널·초대 카드 같은 채팅 함수 안에 있지 않다.
 *  ③ 서버 동작: 로그인 필요, 수 설명 [[…]] 수순 표지가 번역에서 빠지면 원문을 돌려주고 저장하지 않음, 정상 번역은 저장, 저장된 번역은 Gemini를 다시 부르지 않음.
 *  ④ 순수 로직: [[…]] 보호·복원, 번역이 필요 없는 글(대상 언어 글자로만 쓰임·기보뿐) 걸러내기.
 *  ⑤ 설정: 언어 카드에 켜기/끄기 토글이 있고 요청 경로가 그 설정(ugcTranslateAvailable)을 거친다. 기본은 켬.
 *  실행: node scripts/check-ugc-translate.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { UGC_KINDS, protectTokens, restoreTokens, needsTranslation } from "../src/lib/ugcText.js";
const require = createRequire(import.meta.url);
const parser = require("@babel/parser"); const traverse = require("@babel/traverse").default;
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const fails = [];
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };

// ① 종류 목록
const api = rd("api/translate.js");
const kindsSrc = /const KINDS = new Set\(\[([^\]]*)\]\)/.exec(api);
const serverKinds = kindsSrc ? kindsSrc[1].split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean) : [];
eq(serverKinds.sort(), [...UGC_KINDS].sort(), "서버 KINDS와 클라이언트 UGC_KINDS가 다름");
if ([...serverKinds, ...UGC_KINDS].some((k) => /chat|message|msg/i.test(k))) fails.push("번역 종류에 채팅이 들어 있음 — 채팅 메시지는 번역하지 않는다");

// ② 채팅 격리
for (const f of ["src/components/chatPlus.jsx", "src/lib/chatApi.js", "src/lib/chatCommands.js"]) {
  if (/ugcTranslate|UgcText|ugcText/.test(rd(f))) fails.push(f + ": 채팅 파일이 사용자 글 번역 모듈을 사용함");
}
const CHAT_FN = /Chat|Bubble|Message|Msg|Invite|Poll|Reaction/i;
for (const f of ["src/app/social.jsx", "src/app/learn.jsx"]) {
  const ast = parser.parse(rd(f), { sourceType: "module", plugins: ["jsx"] });
  traverse(ast, {
    JSXOpeningElement(p) {
      if (p.node.name.name !== "UgcText") return;
      const kind = p.node.attributes.find((a) => a.name && a.name.name === "kind");
      const v = kind && kind.value && kind.value.type === "StringLiteral" ? kind.value.value : null;
      if (!UGC_KINDS.includes(v)) fails.push(f + ":" + p.node.loc.start.line + " <UgcText>의 kind가 리터럴 note·bio가 아님");
      const fn = p.findParent((x) => (x.isFunctionDeclaration() || x.isVariableDeclarator()) && (x.parentPath.isProgram() || x.parentPath.parentPath?.isProgram() || x.parentPath.parentPath?.isExportNamedDeclaration()));
      const name = fn && (fn.node.id ? fn.node.id.name : "");
      if (name && CHAT_FN.test(name)) fails.push(f + ":" + p.node.loc.start.line + " <UgcText>가 채팅 함수(" + name + ") 안에 있음 — 채팅은 번역하지 않는다");
    },
  });
}

// ③ 서버 동작 — 가짜 환경에서 핸들러를 실제로 실행
process.env.VITE_SUPABASE_URL = "https://sb.test"; process.env.VITE_SUPABASE_ANON_KEY = "anon"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.GEMINI_API_KEY = "gk";
const { default: handler } = await import("../api/translate.js");
const calls = []; let cacheRows = [], geminiReply = null, upserts = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push(url.replace(/\?.*/, "").replace(/https?:\/\/[^/]+/, ""));
  const j = (b, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => b });
  if (url.includes("/auth/v1/user")) return j({ id: "u1" });
  if (url.includes("/rest/v1/text_translations") && (init.method || "GET") === "GET") return j(cacheRows);
  if (url.includes("/rest/v1/text_translations") && init.method === "POST") { upserts.push(JSON.parse(init.body)); return j([]); }
  if (url.includes("/rest/v1/text_translations") && init.method === "DELETE") return j([]);
  if (url.includes("generativelanguage")) return j({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiReply) }] } }] });
  throw new Error("예상 밖 호출: " + url);
};
const run = async (body, token = "tok") => { let out = { code: 0, body: null }; const res = { status(c) { out.code = c; return this; }, json(b) { out.body = b; } }; await handler({ method: "POST", headers: token ? { authorization: "Bearer " + token } : {}, body }, res); return out; };
let r = await run({ kind: "chat", target: "en", texts: ["안녕"] }); calls.length = 0;
r = await run({ kind: "chat", target: "en", texts: ["안녕"] });
eq([r.code, calls.length], [400, 0], "채팅(kind=chat)이 거부되지 않거나 외부 호출이 일어남");
r = await run({ kind: "note", target: "en", texts: ["안녕"] }, "");
eq(r.code, 401, "비로그인 요청이 거부되지 않음");
r = await run({ kind: "note", target: "xx", texts: ["안녕"] }); eq(r.code, 400, "지원하지 않는 언어가 거부되지 않음");
r = await run({ kind: "note", target: "en", texts: ["a".repeat(401)] }); eq(r.code, 400, "너무 긴 글이 거부되지 않음");
// 정상 번역 + 저장
calls.length = 0; upserts = []; cacheRows = [];
geminiReply = { items: [{ index: 0, same_language: false, translation: "Good move. See ⟦0⟧" }] };
r = await run({ kind: "note", target: "en", texts: ["좋은 수. ⟦0⟧ 참고"] });
eq([r.code, r.body && r.body.items[0].translated, upserts.length], [200, "Good move. See ⟦0⟧", 1], "정상 번역이 반환·저장되지 않음");
// 수순 표지가 빠지면 원문 + 저장 안 함
upserts = []; geminiReply = { items: [{ index: 0, same_language: false, translation: "Good move. See" }] };
r = await run({ kind: "note", target: "en", texts: ["좋은 수. ⟦0⟧ 참고"] });
eq([r.body.items[0].translated, r.body.items[0].failed, upserts.length], ["좋은 수. ⟦0⟧ 참고", true, 0], "자리표시자 누락 번역이 폐기되지 않음");
// 이미 저장된 번역은 Gemini를 다시 안 부름
calls.length = 0; cacheRows = null;
const { createHash } = await import("node:crypto");
cacheRows = [{ hash: createHash("sha256").update("저장됨").digest("hex").slice(0, 40), translated: "Saved", same: false }];
r = await run({ kind: "bio", target: "en", texts: ["저장됨"] });
eq([r.body.items[0].translated, calls.some((c) => c.includes("generativelanguage"))], ["Saved", false], "저장된 번역을 쓰지 않고 Gemini를 다시 부름");

// ④ 순수 로직
const p = protectTokens("좋은 수 [[12.e5 Nf3]] 와 [[1.d4 d5]]");
eq(p.text, "좋은 수 ⟦0⟧ 와 ⟦1⟧", "수순 표지 보호");
eq(restoreTokens(p.text, p.saved), "좋은 수 [[12.e5 Nf3]] 와 [[1.d4 d5]]", "수순 표지 복원");
eq(needsTranslation("좋은 수입니다", "ko"), false, "한국어 글을 한국어 화면에서 번역하려 함");
eq(needsTranslation("Great move, controls the center", "ko"), true, "영어 글을 한국어 화면에서 번역하지 않음");
eq(needsTranslation("좋은 수입니다", "en"), true, "한국어 글을 영어 화면에서 번역하지 않음");
eq(needsTranslation("12.e5 Nf3 O-O 1-0", "en"), false, "기보뿐인 글을 번역하려 함");
eq(needsTranslation("[[12.e5 Nf3]]", "en"), false, "수순 표지뿐인 글을 번역하려 함");
eq(needsTranslation("😀", "en"), false, "글자 없는 글을 번역하려 함");
eq(needsTranslation("बहुत अच्छा", "hi"), false, "힌디어 글을 힌디어 화면에서 번역하려 함");
eq(needsTranslation("a".repeat(401), "en"), false, "상한을 넘는 글을 번역하려 함");

// ⑤ 설정
const st = rd("src/app/settings.jsx");
if (!/<LangPicker \/>[\s\S]{0,400}<UgcTranslateToggle \/>/.test(st)) fails.push("settings.jsx: 언어 카드에 UgcTranslateToggle이 없음");
if (!/saveUgcTranslatePref/.test(st) || !/loadUgcTranslatePref/.test(st)) fails.push("settings.jsx: 토글이 설정 저장 함수를 쓰지 않음");
const tr = rd("src/lib/ugcTranslate.js"), uses = /export function requestTranslation[\s\S]*?ugcTranslateAvailable\(\)/.test(tr) && /export function ugcTranslateAvailable[\s\S]{0,200}loadUgcTranslatePref\(\)/.test(tr);
if (!uses) fails.push("ugcTranslate.js: 번역 요청이 설정(loadUgcTranslatePref)을 거치지 않음");
if (!/UGC_TRANSLATE_PREF_KEY\) !== "0"/.test(rd("src/lib/prefs.js"))) fails.push("prefs.js: 자동 번역 기본값이 켬이 아님");

// ⑥ Gemini 쿼터 남용 방지(BUG-072) — 로그인 없이 쓰는 scan-board도 호출 제한이 있고, translate는 로그인과 호출 제한이 있다.
const scan = rd("api/scan-board.js");
if (!/scanRateLimited\(ip\)/.test(scan) || !/res\.status\(429\)/.test(scan)) fails.push("api/scan-board.js: 호출 제한이 없음 — 누구나 공유 Gemini 쿼터를 소진시킬 수 있다");
if (!/rateLimited\(user\.id\)/.test(api)) fails.push("api/translate.js: 사용자별 호출 제한이 없음");
{ const h = { post: { method: "POST", headers: { "x-forwarded-for": "9.9.9.9" }, body: {} } }; const { default: scanHandler } = await import("../api/scan-board.js"); const codes = [];
  for (let i = 0; i < 14; i++) { const res = { status(c) { codes.push(c); return this; }, json() { } }; await scanHandler(h.post, res); }
  eq([codes.filter((c) => c === 429).length > 0, codes[0] !== 429], [true, true], "scan-board가 같은 IP의 연속 호출을 제한하지 않음"); }

if (fails.length) { console.error("✖ check-ugc-translate 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-ugc-translate: 번역은 수 설명·소개글만(채팅 거부·격리), 서버 로그인·수순 표지 보호·저장 재사용, 설정 토글 연결이 유지된다");
