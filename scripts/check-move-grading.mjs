#!/usr/bin/env node
/** (v0.5.9, BUG-036·BUG-037·BUG-038 재발 방지) 수 등급(탁월·유일 등) 판정 회귀 검사.
 *   · BUG-036: isSacrifice의 포크 예외(forkForcedTheOtherSide)가 "원래 안전했던(SEE 0) 기물"까지 포크의 다른 쪽으로 쳐서,
 *     11...Bxc6 같은 교환 희생이 탁월에서 빠졌다.
 *   · BUG-037: 등급 규칙이 App.jsx 10곳에 복사돼 있었고 유일한 수는 일부에만 있었다(분석 탭에서 직접 둔 수·FEN 모드·퍼즐 풀이엔 없음,
 *     분석 탭 후보 블록은 다른 정의 + 승부가 기운 위치 완화에 가려짐).
 *  검사 — ① 실제 대국 사례의 isSacrifice 기대값, ② gradeMoveKind 규칙 사례, ③ App.jsx가 등급 규칙을 다시 복사하지 않았는지
 *  (tierOf 직접 호출·["best","excellent","good"] 승격 패턴 금지 — 규칙은 src/lib/moveQuality.js gradeMoveKind 하나).
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-move-grading.mjs
 */
import { readFileSync } from "node:fs";
import { readAppSource } from "./lib/appSource.mjs";
import { boardOfRoot, parseFenFull } from "../src/lib/chessRules.js";
import { applySan } from "../src/lib/chessRules.js";
import { isSacrifice, gradeMoveKind, pvLosesMaterial, pvRegainsMaterial, sacrificeCaptureUci } from "../src/lib/moveQuality.js";

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

// ①-2 (BUG-038) 희생의 엔진 확인 — 실제 Stockfish 수순(둔 뒤 포지션부터)으로 "실제로 내주는가"와 "상대가 따 가는 수"를 검사한다.
const PV_CASES = [
  ["11...Bxc6 — Qxa7 Qxa7 Bxa7로 룩을 실제로 내준다", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bc4 b5 Bd5 Ra7 Nc6 Nxc6 Bxc6+ Bd7 Qd4 Qb8 Be3 Bxc6", "d4a7 b8a7 e3a7 f6e4 c3e4 c6e4 e1g1 e8d7", true, "d4a7"],
  ["14.Kf1 — e5 나이트가 공짜 같지만 퀸 교환 뒤 되찾아 실제로는 안 내준다(가짜 희생)", "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O h3 Na5 Nxe5 Nxb3 axb3 Bb7 d3 d5 exd5 Qxd5 Qf3 Bd6 Kf1", "f8b8 f3d5 f6d5 c1d2 c7c5 b1c3 d5b4 a1c1", false, "d6e5"],
];
for (const [name, line, pv, want, wantCap] of PV_CASES) {
  const sans = line.split(" ");
  const color = (sans.length - 1) % 2 === 0 ? "w" : "b";
  const before = boardOfRoot(null, sans.slice(0, -1)), san = sans[sans.length - 1];
  if (!isSacrifice(before, san, color)) fails.push("엔진 확인 사례 — " + name + ": 정적 희생 판정이 먼저 참이어야 한다");
  const got = pvLosesMaterial(before, applySan(before, san, color), pv.split(" "), color);
  if (got !== want) fails.push("pvLosesMaterial — " + name + ": 기대 " + want + ", 실제 " + got);
  const cap = sacrificeCaptureUci(before, san, color);
  if (cap !== wantCap) fails.push("sacrificeCaptureUci — " + name + ": 기대 " + wantCap + ", 실제 " + cap);
}
// ② 14.Kf1 …Bxe5 뒤 엔진 수순(Qxd5 Nxd5 Rxe5)으로 기물을 그대로 되찾는다 → 독이 든 희생이 아니다(평가는 +1.29로 올라도)
{
  const sans = PV_CASES[1][1].split(" ");
  const before = boardOfRoot(null, sans.slice(0, -1));
  const afterCap = applySan(applySan(before, "Kf1", "w"), "Bxe5", "b");
  if (!pvRegainsMaterial(before, afterCap, "f3d5 f6d5 e1e5 c7c5 b1c3 d5b4 e5e2 a8c8".split(" "), "w")) fails.push("pvRegainsMaterial — 14.Kf1 …Bxe5 Qxd5 Nxd5 Rxe5로 되찾는 것을 못 봤다");
  // 따 간 뒤 되찾지 못하는 수순(아무것도 안 잡음)이면 되찾지 못한 것
  if (pvRegainsMaterial(before, afterCap, "c1d2 f8e8 b1c3 c7c5".split(" "), "w")) fails.push("pvRegainsMaterial — 되찾지 못한 수순을 되찾았다고 봤다");
}
// 평범한 퀸 교환(상대가 먼저 잡고 내가 곧바로 되잡음)의 순간적인 차이는 손해가 아니다
{
  const sans = "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nxd4 Qxd4".split(" ");
  const before = boardOfRoot(null, sans.slice(0, -1)), after = applySan(before, "Qxd4", "w");
  if (pvLosesMaterial(before, after, ["d8f6", "d4f6", "g8f6"], "w")) fails.push("pvLosesMaterial — 되잡는 평범한 교환을 손해로 봤다");
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
const app = readAppSource().split("\n");
app.forEach((l, i) => {
  const code = l.replace(/\/\/.*$/, "");
  if (/\btierOf\s*\(/.test(code)) fails.push("src/App.jsx:" + (i + 1) + " — tierOf를 직접 부른다. 수 등급은 gradeMoveKind(src/lib/moveQuality.js)로만 매길 것");
  if (/\["best",\s*"excellent",\s*"good"\]\.includes\(/.test(code)) fails.push("src/App.jsx:" + (i + 1) + " — 탁월 승격 규칙을 직접 복사했다. gradeMoveKind로 매길 것");
  if (/\bkind\s*=\s*"only"/.test(code)) fails.push("src/App.jsx:" + (i + 1) + " — 유일한 수를 직접 매긴다. gradeMoveKind로 매길 것");
});
// (BUG-038) 정적 희생 판정만으로 탁월을 매기는 곳은 gradeMoveKindConfirmed 안의 한 곳뿐이어야 한다(나머지는 엔진 확인을 거친다).
const rawSac = app.filter((l) => { const c = l.replace(/\/\/.*$/, ""); return /isSac:\s*\(\)\s*=>\s*isSacrifice\(/.test(c) && !/sacVerdict\(/.test(c); }).length;
if (rawSac !== 1) fails.push("src/App.jsx — 엔진 확인 없이 isSacrifice로 탁월을 매기는 곳이 " + rawSac + "곳(허용 1곳: gradeMoveKindConfirmed). gradeMoveKindConfirmed·sacCheckSync를 쓸 것");

if (fails.length) {
  console.error("✗ 수 등급 판정 검사 실패 (BUG-036·037·038 재발 방지):\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("✓ 수 등급 판정 검사 통과 (희생 " + SAC_CASES.length + "건 · 엔진 확인 " + (PV_CASES.length + 3) + "건 · 등급 규칙 " + G.length + "건 · App.jsx 규칙 복사 없음)");
