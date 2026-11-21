#!/usr/bin/env node
/** (v0.7.4 재발 방지) 유산 게시물 모델(src/lib/legacyPosts.js): 추가·중복·상한·크기·옛 슬롯 호환·저장함 검증.
 *  실행: node scripts/check-legacy-posts.mjs (prebuild로 자동 실행) */
import { addPost, removePost, listPosts, findPost, kindOfPost, LEGACY_MAX_POSTS, toggleSaved, isSaved, normalizeSaved, SAVED_MAX } from "../src/lib/legacyPosts.js";
import { legacyPath, parseLegacyPath } from "../src/lib/legacyPosts.js";
import { normalizeLegacies } from "../src/lib/legacyEntry.js";
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const SANS = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7".split(" ");
const mk = (i, kind = "best") => ({ sans: SANS, moveIndex: i % 9, playCount: 3, beforeCount: 0, kinds: null, side: i % 2 ? "b" : "w", kind });
// 추가
let r = addPost({}, mk(2), 1000);
ok(r.ok && /^p[a-z0-9]+$/.test(r.id) && r.map[r.id].savedAt === 1000, "추가: 게시물 아이디(p…)와 저장 시각이 붙어야 함");
ok(r.map[r.id].sans.length === 2 + 3 + 0 && r.map[r.id].sans.length <= SANS.length, "추가: 수순은 유산 수 + 재생 수까지만 잘라 담아야 함");
// 중복
ok(addPost(r.map, mk(2), 2000).reason === "dup", "같은 대국의 같은 수는 중복으로 막아야 함");
ok(findPost(r.map, SANS, 2) === r.id, "findPost가 같은 수를 찾아야 함");
// 종류 없음·불법 수순
ok(addPost({}, { ...mk(1), kind: "good" }).reason === "invalid", "종류가 best/only/brilliant가 아니면 거절");
ok(addPost({}, { ...mk(1), sans: ["e4", "e5", "Qh8"] }).reason === "invalid", "불법 수순은 거절");
// 상한
let m = {};
const long = [];
{ const base = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7".split(" ");
  for (let i = 0; i < LEGACY_MAX_POSTS + 5; i++) { const e = { sans: base.slice(0, 20), moveIndex: i % 20, playCount: 1, kind: ["best", "only", "brilliant"][i % 3], side: "w" };
    // 같은 (수순, 위치) 중복을 피하려고 끝 수를 조금씩 바꾸진 못하므로 직접 채움
    m[`k${i}`] = { ...e, savedAt: i }; }
  const f = addPost(m, { sans: ["d4", "d5", "c4", "e6"], moveIndex: 1, playCount: 2, kind: "best", side: "w" }, 9999);
  ok(!f.ok && f.reason === "full", "게시물이 " + LEGACY_MAX_POSTS + "개 이상이면 'full'로 막아야 함"); }
// 삭제
ok(!(r.id in removePost(r.map, r.id)), "삭제가 동작해야 함");
// 옛 슬롯 호환
const old = { best: { sans: SANS, moveIndex: 0, side: "w", savedAt: 5 }, only2: { sans: SANS, moveIndex: 2, side: "w", savedAt: 9 }, "bad key": { sans: SANS, moveIndex: 0 } };
const norm = normalizeLegacies(old);
ok(norm.best && norm.only2 && !("bad key" in norm), "옛 슬롯 키(best, only2)는 그대로 유효, 잘못된 키는 버려야 함");
const list = listPosts(old);
ok(list.length === 2 && list[0].id === "only2" && list[0].kind === "only" && list[1].kind === "best", "옛 슬롯은 키로 종류를 알아내고 최신순이어야 함");
ok(kindOfPost("p1", { kind: "brilliant" }) === "brilliant" && kindOfPost("p1", {}) === null, "kind 태그 우선, 없으면 null");
// 저장함
let sv = toggleSaved([], { owner: "u1", ownerName: "A", id: "best", entry: old.best }, 1);
ok(sv.length === 1 && isSaved(sv, "u1", "best"), "저장함에 담겨야 함");
ok(toggleSaved(sv, { owner: "u1", id: "best", entry: old.best }).length === 0, "다시 누르면 저장 해제");
ok(toggleSaved([], { owner: "u1", id: "bad key", entry: old.best }).length === 0 && toggleSaved([], { owner: "u1", id: "best", entry: { sans: ["zz"], moveIndex: 0 } }).length === 0, "잘못된 아이디·항목은 저장하지 않음");
let big = []; for (let i = 0; i < SAVED_MAX + 3; i++) big = toggleSaved(big, { owner: "u" + i, id: "best", entry: old.best }, i);
ok(big.length === SAVED_MAX && !isSaved(big, "u0", "best"), "저장함은 상한을 넘으면 오래된 것부터 밀려나야 함");
ok(normalizeSaved([{ owner: "x", id: "BAD", entry: old.best }, { owner: "u", id: "best", entry: old.best, savedAt: 3 }]).length === 1, "불러온 저장함은 검증을 통과한 것만");
// 공유 링크
ok(legacyPath("abcde1234", "p1abc") === "/legacy/ABCDE1234-p1abc", "링크 경로는 /legacy/<MID 대문자>-<아이디>");
{ const q = parseLegacyPath("/legacy/ABCDE1234-p1abc"); ok(q && q.mid === "ABCDE1234" && q.id === "p1abc", "링크를 읽어 mid·아이디로 되돌려야 함");
  ok(parseLegacyPath("/legacy/abcde1234-best2").id === "best2", "옛 슬롯 키 아이디도 링크로 열려야 함");
  for (const bad of ["/legacy/", "/legacy/ABCDE1234", "/legacy/ABCD1234-p1", "/legacy/ABCDE1234-P1", "/legacy/ABCDE1234-p1/x", "/user/ABCDE1234-p1"]) ok(parseLegacyPath(bad) === null, "잘못된 링크는 거절: " + bad); }
if (fails.length) { console.error("✗ legacy-posts check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ legacy-posts check: 게시물 추가·중복·상한(200)·옛 슬롯 호환·저장함 통과");
// (v0.7.9, 사용자 요청) 날짜 정보가 없는 유산에 지금 시각을 한 번 찍는다 — 이미 있는 날짜는 그대로, 바뀐 게 없으면 같은 객체
{ const { stampMissingSavedAt } = await import("../src/lib/legacyPosts.js");
  const now = 1795200000000;
  const m = { best: { sans: ["e4"], moveIndex: 0 }, p1: { sans: ["d4"], moveIndex: 0, savedAt: 1700000000000 }, p2: { sans: ["c4"], moveIndex: 0, savedAt: 0 } };
  const r = stampMissingSavedAt(m, now);
  const bad = [];
  if (r.best.savedAt !== now || r.p2.savedAt !== now || r.p1.savedAt !== 1700000000000) bad.push("날짜 없는 유산만 지금 시각으로 채워야 함");
  if (stampMissingSavedAt(r, now + 5) !== r) bad.push("이미 다 채워졌으면 같은 객체를 돌려줘야 함(불필요한 저장·공개 반복 방지)");
  if (stampMissingSavedAt(null) !== null) bad.push("빈 값은 그대로");
  if (bad.length) { console.error("✗ legacy-posts savedAt 검사 실패:\n  " + bad.join("\n  ")); process.exit(1); }
  console.log("✓ legacy-posts savedAt: 날짜 없는 유산만 한 번 채움"); }
