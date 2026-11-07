#!/usr/bin/env node
/** (v0.7.3 재발 방지) 유산 흐름: 만들기는 /review에서만, 마법사·고유 진입 연출은 없다.
 *  ① LegacyManageModal(마법사)이 코드에 다시 생기지 않는다. ② LegacyRevealScreen은 암석판 확대(charge)·기보 타이핑(typing) 없이 곧바로 board로 시작한다.
 *  ③ ReviewPage가 onSaveLegacy로 "유산으로 남기기"를 제공하고(내 수·최선/유일/탁월만), App이 그 핸들러를 연결한다.
 *  실행: node scripts/check-legacy-flow.mjs (prebuild로 자동 실행) */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const fails = [];
const all = ["src/app/social.jsx", "src/app/profile.jsx", "src/App.jsx", "src/app/review.jsx", "src/app/common.jsx"].map(rd).join("\n");
if (/<LegacyManageModal|function LegacyManageModal/.test(all)) fails.push("유산 마법사(LegacyManageModal)가 다시 생김 — 유산은 /review에서만 만든다");
const prof = rd("src/app/profile.jsx");
const reveal = (prof.match(/export function LegacyRevealScreen[\s\S]*?\n}\n/) || [""])[0];
if (!reveal) fails.push("LegacyRevealScreen을 찾지 못함");
else {
  if (!/const phase = "board"/.test(reveal)) fails.push("LegacyRevealScreen: 곧바로 board로 시작해야 함(고유 진입 연출 금지)");
  if (/"charge"|"typing"|typingStage|LegacyShatterToken/.test(reveal)) fails.push("LegacyRevealScreen: 암석판 확대·기보 타이핑 진입 연출이 다시 들어옴");
}
const rv = rd("src/app/review.jsx");
if (!/onSaveLegacy/.test(rv) || !/legacyAction/.test(rv)) fails.push("ReviewPage: '유산으로 남기기'(onSaveLegacy/legacyAction)가 없음");
if (!/\["best", "only", "brilliant"\]\.includes\(m\.kind\)/.test(rv)) fails.push("ReviewPage: 유산은 최선·유일·탁월 수에서만 만들 수 있어야 함");
if (!/\(m\.ply % 2 === 0\) !== \(game\.color === "w"\)/.test(rv)) fails.push("ReviewPage: 내가 둔 수에서만 유산을 만들 수 있어야 함");
if (!/fenRoot \|\|/.test((rv.match(/const legacyAction = useMemo[\s\S]*?\n  \}, \[/) || [""])[0])) fails.push("ReviewPage: FEN 시작 대국은 유산 대상에서 빠져야 함");
if (!/onSaveLegacy=\{saveLegacyFromReview\}/.test(rd("src/App.jsx"))) fails.push("App: ReviewPage에 onSaveLegacy를 연결하지 않음");
if (fails.length) { console.error("✗ legacy-flow check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ legacy-flow check: 유산은 /review에서 생성 · 마법사·고유 진입 연출 없음");
