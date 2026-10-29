#!/usr/bin/env node
/** (v0.7.1, BUG-130) 유산 항목 검증 검사(src/lib/legacyEntry.js) + 화면 연결.
 *   · 남이 써 넣은 모양이 틀린 유산(문자열 아닌 수·범위 밖 moveIndex·불법 수순·과대 길이)은 throw 없이 null
 *   · 정상 항목은 그대로 통과하고 playCount·beforeCount·side는 안전한 값으로 고친다
 *   · 남의 프로필·채팅 공유로 들어오는 유산이 화면에 닿기 전에 반드시 검증을 거친다
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-legacy-entry.mjs
 */
import { readFileSync } from "node:fs";
import { normalizeLegacyEntry, normalizeLegacies, normalizeLegacyHistory, LEGACY_MAX_PLIES } from "../src/lib/legacyEntry.js";

const fails = [];
const ok = (label, cond) => { if (!cond) fails.push(label); };
const good = { sans: ["e4", "e5", "Nf3", "Nc6", "Bb5"], moveIndex: 4, playCount: 1, beforeCount: 2, kinds: ["book", "book", "book", "book", "best"], side: "b", savedAt: 1 };
const safe = (label, v) => { try { ok(label + " → null", normalizeLegacyEntry(v) === null); } catch (e) { fails.push(label + " 에서 throw: " + e.message); } };

ok("정상 항목 통과", JSON.stringify(normalizeLegacyEntry(good)) === JSON.stringify(good));
ok("체크·메이트 기호와 캐슬링 통과", !!normalizeLegacyEntry({ sans: ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"], moveIndex: 6 }));
ok("구버전(필드 없음) 기본값", (() => { const r = normalizeLegacyEntry({ sans: ["e4", "e5"], moveIndex: 0 }); return r && r.side === "w" && r.beforeCount === 0 && r.playCount === 2 && r.kinds === null; })());
ok("범위 밖 playCount·beforeCount는 고침", (() => { const r = normalizeLegacyEntry({ ...good, playCount: 99, beforeCount: -3, side: "<x>" }); return r && r.playCount === 1 && r.beforeCount === 0 && r.side === "w"; })());
ok("kinds 길이가 다르면 버림", normalizeLegacyEntry({ ...good, kinds: ["best"] }).kinds === null);
for (const [label, v] of [
  ["null", null], ["문자열", "e4"], ["배열", []], ["sans 없음", { moveIndex: 0 }],
  ["숫자 수", { ...good, sans: [1, 2] }], ["null 수", { ...good, sans: [null] }], ["객체 수", { ...good, sans: [{}] }],
  ["불법 수순", { ...good, sans: ["e4", "e4"], moveIndex: 0 }], ["읽을 수 없는 수", { ...good, sans: ["zz"], moveIndex: 0 }],
  ["moveIndex 범위 밖", { ...good, moveIndex: 5 }], ["moveIndex 음수", { ...good, moveIndex: -1 }], ["moveIndex 소수", { ...good, moveIndex: 1.5 }], ["moveIndex 문자열", { ...good, moveIndex: "4" }],
  ["너무 긴 수순", { ...good, sans: Array(LEGACY_MAX_PLIES + 1).fill("Nf3"), moveIndex: 0 }], ["긴 문자열 수", { ...good, sans: ["e4".repeat(50)], moveIndex: 0 }],
]) safe(label, v);
ok("묶음: 잘못된 칸만 빈 칸", (() => { const r = normalizeLegacies({ best: good, only: { sans: [1] }, brilliant2: good }); return r.best && r.only === null && r.brilliant2; })());
ok("묶음: 모양이 틀리면 null", normalizeLegacies("x") === null && normalizeLegacies([good]) === null);
ok("이력: 잘못된 항목은 뺌", (() => { const r = normalizeLegacyHistory([{ slotKey: "best", entry: good }, { slotKey: "only", entry: { sans: [{}] } }, null, 5]); return r.length === 1; })());

// 화면 연결 — 남의 데이터가 들어오는 두 곳
const profile = readFileSync(new URL("../src/app/profile.jsx", import.meta.url), "utf8");
const social = readFileSync(new URL("../src/app/social.jsx", import.meta.url), "utf8");
ok("프로필 유산 줄(LegacyStoneRow)이 legacies·history를 검증", /function LegacyStoneRow\(\{ legacies: rawLegacies, history: rawHistory[\s\S]{0,400}normalizeLegacies\(rawLegacies\)[\s\S]{0,200}normalizeLegacyHistory\(rawHistory\)/.test(profile));
ok("채팅 유산 공유 미리보기가 검증", /normalizeLegacyEntry\(pub\.legacies && pub\.legacies\[slot\]\)/.test(social));

if (fails.length) { console.error("✗ 유산 항목 검증 검사 실패(src/lib/legacyEntry.js):"); fails.forEach((x) => console.error("  · " + x)); process.exit(1); }
console.log("✓ legacy entry check: 모양이 틀린 유산은 throw 없이 거르고, 프로필·채팅 공유 입력이 검증을 거친다");
