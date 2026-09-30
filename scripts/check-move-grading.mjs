#!/usr/bin/env node
/** (v0.5.9, BUG-036·BUG-037 재발 방지) 수 등급(탁월·유일 등) 판정 회귀 검사.
 *   · BUG-036: isSacrifice의 포크 예외(forkForcedTheOtherSide)가 "원래 안전했던(SEE 0) 기물"까지 포크의 다른 쪽으로 쳐서,
 *     11...Bxc6 같은 교환 희생이 탁월에서 빠졌다.
 *   · BUG-037: 등급 규칙이 App.jsx 10곳에 복사돼 있었고 유일한 수는 일부에만 있었다(분석 탭에서 직접 둔 수·FEN 모드·퍼즐 풀이엔 없음,
 *     분석 탭 후보 블록은 다른 정의 + 승부가 기운 위치 완화에 가려짐).
 *  검사 — ① 실제 대국 사례의 isSacrifice 기대값, ② gradeMoveKind 규칙 사례, ③ App.jsx가 등급 규칙을 다시 복사하지 않았는지
 *  (tierOf 직접 호출·["best","excellent","good"] 승격 패턴 금지 — 규칙은 src/lib/moveQuality.js gradeMoveKind 하나).
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-move-grading.mjs
 */
import { readFileSync } from "node:fs";
import { boardOfRoot, parseFenFull } from "../src/lib/chessRules.js";
import { isSacrifice, gradeMoveKind } from "../src/lib/moveQuality.js";

const fails = [];

// ① isSacrifice — [이름, 시작 FEN(없으면 표준), 수순(마지막 수가 판정 대상), 기대값]
const SAC_CASES = [
  ["BUG-036 11...Bxc6 교환 희생(Qd4가 f6·d6도 겨누지만 둘 다 원래 안전)", null, "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bc4 b5 Bd5 Ra7 Nc6 Nxc6 Bxc6+ Bd7 Qd4 Qb8 Be3 Bxc6", true],
  ["8.Bxe6 비숍-폰 두 개 교환 희생", null, "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bc4 e6 O-O Nbd7 Bxe6", true],
  ["6...Bxf5 퀸을 잡으며 나이트 방치 — 희생 아님", null, "e4 e5 d4 exd4 Qxd4 Nc6 Qd5 Nf6 Qf5 d5 exd5 Bxf5", false],
  ["16.O-O-O 캐슬링으로 나이트 방치", null, "e4 e5 Nf3 Nc6 Bc4 h6 d4 d6 dxe5 dxe5 Qxd8+ Nxd8 Nxe5 Be6 Bb5+ c6 Be2 f6 Ng6 Rh7 Nxf8 Kxf8 b3 Nf7 Bb2 f5 Nd2 fxe4 Nxe4 Bf5 O-O-O", true],
  ["6...h5 폰 이동으로 비숍 방치", null, "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O Bg4 h3 h5", true],
  ["진짜 포크(체크+룩) — 킹을 피해 룩을 내줌은 희생 아님", "r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1", "Kd7", false],
  ["진짜 포크(체크+룩) — 반대쪽으로 피해도 희생 아님", "r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1", "Kf7", false],
];
for (const [name, fen, line, want] of SAC_CASES) {
  const sans = line.split(" ");
  const root = fen ? parseFenFull(fen) : null;
  const startWhite = root ? root.turn === "w" : true;
  const color = ((sans.length - 1) % 2 === 0) === startWhite ? "w" : "b";
  let got;
  try { got = isSacrifice(boardOfRoot(root, sans.slice(0, -1)), sans[sans.length - 1], color); } catch (e) { got = "오류: " + e.message; }
  if (got !== want) fails.push("isSacrifice — " + name + ": 기대 " + want + ", 실제 " + got);
}

// ② gradeMoveKind 규칙
const no = () => false, yes = () => true;
const G = [
  ["2순위와 1.5점 차이 → 유일", { loss: 0, matched: true, bestCp: 30, playedCp: 30, secondCp: -120, isSac: no }, "only"],
  ["BUG-037 승부가 기운 위치(+3)에서도 2순위와 차이가 크면 유일", { loss: 0, matched: true, bestCp: 300, playedCp: 300, secondCp: 150, isSac: no }, "only"],
  ["2순위 평가를 모르면(undefined) 유일 판정 안 함", { loss: 0, matched: true, bestCp: 30, playedCp: 30, secondCp: undefined, isSac: no }, "best"],
  ["2순위와 차이가 작으면 최선", { loss: 0, matched: true, bestCp: 30, playedCp: 30, secondCp: -50, isSac: no }, "best"],
  ["단순 되잡기는 유일 아님", { loss: 0, matched: true, bestCp: 30, playedCp: 30, secondCp: -200, isSac: no, singleRecapture: yes }, "best"],
  ["6점 이상 이긴 위치는 유일 아님", { loss: 0, matched: true, bestCp: 700, playedCp: 700, secondCp: 400, isSac: no }, "best"],
  ["2순위도 +2점 이상이면 유일 아님", { loss: 0, matched: true, bestCp: 450, playedCp: 450, secondCp: 250, isSac: no }, "best"],
  ["희생 + 최선 → 탁월(유일보다 우선)", { loss: 0, matched: true, bestCp: -28, playedCp: -28, secondCp: -200, isSac: yes }, "brilliant"],
  ["BUG-036 11...Bxc6 브라우저 리뷰 값(-0.66) → 탁월", { loss: 0, matched: true, bestCp: -66, playedCp: -66, secondCp: -69, isSac: yes }, "brilliant"],
  ["희생이어도 둔 뒤 -1.0 미만이면 탁월 아님", { loss: 20, matched: false, bestCp: -100, playedCp: -120, isSac: yes }, "excellent"],
  ["두기 전 2점 이상 지고 있으면 탁월 아님", { loss: 0, matched: true, bestCp: -250, playedCp: -250, isSac: yes }, "best"],
  ["직전 자기 희생을 잇는 수는 탁월 아님", { loss: 0, matched: true, bestCp: 50, playedCp: 50, isSac: yes, priorSac: true }, "best"],
  ["1순위가 아니면 손실이 작아도 우수", { loss: 5, matched: false, bestCp: 30, playedCp: 25, isSac: no }, "excellent"],
  ["승부가 기운 위치의 부정확은 좋은 수로 완화", { loss: 90, matched: false, bestCp: 400, playedCp: 310, isSac: no }, "good"],
  ["상대 실수를 응징 못 하면 놓친 수", { loss: 150, matched: false, bestCp: 180, playedCp: 30, isSac: no, oppJustErred: true }, "miss"],
  ["언더프로모션은 탁월", { loss: 0, matched: true, bestCp: 50, playedCp: 50, isSac: no, san: "e8=N" }, "brilliant"],
];
for (const [name, args, want] of G) {
  const got = gradeMoveKind(args);
  if (got !== want) fails.push("gradeMoveKind — " + name + ": 기대 " + want + ", 실제 " + got);
}

// ③ App.jsx에 등급 규칙 복사 금지
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8").split("\n");
app.forEach((l, i) => {
  const code = l.replace(/\/\/.*$/, "");
  if (/\btierOf\s*\(/.test(code)) fails.push("src/App.jsx:" + (i + 1) + " — tierOf를 직접 부른다. 수 등급은 gradeMoveKind(src/lib/moveQuality.js)로만 매길 것");
  if (/\["best",\s*"excellent",\s*"good"\]\.includes\(/.test(code)) fails.push("src/App.jsx:" + (i + 1) + " — 탁월 승격 규칙을 직접 복사했다. gradeMoveKind로 매길 것");
  if (/\bkind\s*=\s*"only"/.test(code)) fails.push("src/App.jsx:" + (i + 1) + " — 유일한 수를 직접 매긴다. gradeMoveKind로 매길 것");
});

if (fails.length) {
  console.error("✗ 수 등급 판정 검사 실패 (BUG-036·037 재발 방지):\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("✓ 수 등급 판정 검사 통과 (희생 " + SAC_CASES.length + "건 · 등급 규칙 " + G.length + "건 · App.jsx 규칙 복사 없음)");
