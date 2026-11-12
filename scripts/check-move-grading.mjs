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
import { isSacrifice, gradeMoveKind, pvLosesMaterial, pvRegainsMaterial, sacrificeCaptureUci, sacPoisonVerdict, sacEvalCp, ownPriorMoveWasSacrifice } from "../src/lib/moveQuality.js";

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
  // (v0.7.5 BUG-160, 사용자 제보 openchess.kr/review/187046570186) 32.a5 — Rd3가 노리는 e3 비숍을 그대로 두고 퀸사이드 폰을 민다
  ["BUG-160 32.a5 — e3 비숍을 방치(희생)", null, "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 g3 Nf6 Bg2 Be7 O-O O-O f4 d6 Kh1 Nxd4 Bxd4 e5 Be3 Bg4 Qd2 Rac8 h3 Be6 f5 Bc4 Rf2 b5 b3 Bxb3 Nxb5 axb5 cxb3 Rfd8 Rc1 Qb7 Rxc8 Rxc8 g4 Nxe4 Kg1 d5 Bxe4 dxe4 g5 f6 gxf6 Bxf6 Qd6 Qc6 Qb4 Rd8 a4 bxa4 bxa4 Rd3 a5", true],
  // 33.Rb2 — 32...Bh4가 Rf2를 노릴 때 Re2면 룩과 e3 비숍을 다 지키는데, Rb2로 비숍을 내준다(포크의 당연한 귀결이 아니라 스스로 고른 희생)
  ["BUG-160 33.Rb2 — 모두 지키는 수(Re2)가 있는데 비숍을 내줌", null, "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 g3 Nf6 Bg2 Be7 O-O O-O f4 d6 Kh1 Nxd4 Bxd4 e5 Be3 Bg4 Qd2 Rac8 h3 Be6 f5 Bc4 Rf2 b5 b3 Bxb3 Nxb5 axb5 cxb3 Rfd8 Rc1 Qb7 Rxc8 Rxc8 g4 Nxe4 Kg1 d5 Bxe4 dxe4 g5 f6 gxf6 Bxf6 Qd6 Qc6 Qb4 Rd8 a4 bxa4 bxa4 Rd3 a5 Bh4 Rb2", true],
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
// ②-2 (BUG-060) 독이 든 희생 판정 — a: 둔 직후 평가(상대 차례 관점), c: 따 간 포지션 평가(둔 쪽 차례 관점). 메이트(±1e5로 뭉개짐)끼리의 비교가 gain 0이 되어 가짜 희생으로 판정되던 버그.
const POISON = [
  ["BUG-060 22.Bg8+ — 이미 메이트가 보이는 포지션(상대 메이트 4)에서 따 가면(Kxg8) 곧장 2수 메이트 → 독이 든 희생", { mate: -4 }, { mate: 2 }, false, true],
  ["따 가면 오히려 내가 메이트 당하면 희생이 아니다", { cp: 120 }, { mate: -3 }, false, false],
  ["이득이 크면(≥3점) 독이 든 희생", { cp: -120 }, { cp: 350 }, false, true],
  ["따 가도 평가가 그대로(이득 <1점)면 가짜 희생", { cp: -100 }, { cp: -50 }, false, false],
  ["중간 이득이라도 따 간 뒤 기물을 되찾으면 희생이 아니다", { cp: -50 }, { cp: 180 }, true, false],
  ["중간 이득이고 되찾지 못하면 희생", { cp: -50 }, { cp: 180 }, false, true],
  ["이미 메이트(상대 메이트 5)인데 따 간 뒤 평범한 +9점이면 따 가는 쪽이 낫다 → 희생 아님", { mate: -5 }, { cp: 900 }, false, false],
  // (v0.7.5 BUG-160) 새 규칙 — [이름, a, c, 되찾음, 기대, 되찾는 첫 수가 체크]
  ["BUG-160 되찾지 못하면 이득이 작아도(+0.2) 보상이 있는 진짜 희생(예: 21...Bxf2+)", { cp: 30 }, { cp: -8 }, false, true],
  ["BUG-160 되찾지 못해도 따 간 뒤 둔 쪽이 더 나빠지면 희생 아님(이득 < 0)", { cp: 30 }, { cp: -60 }, false, false],
  ["BUG-160 32.a5(SF18 Lite d20) — 체크 전술(Qb8+)로 되찾고 따 가면 0.7점 손해 → 희생", { cp: 70 }, { cp: 0 }, true, true, true],
  ["BUG-160 14.Kf1 유형 — 평범한 교환(Qxd5)으로 되찾고 0.8점 손해 → 지켜진 기물(희생 아님)", { cp: -35 }, { cp: 117 }, true, false, false],
  ["BUG-160 체크 전술로 되찾아도 손해가 0.5점 미만이면 희생 아님(예: 17...Nxb2 Bxb2 Bxc3+)", { cp: 0 }, { cp: 20 }, true, false, true],
  ["BUG-160 되찾더라도 따 가면 2점 이상 손해면 희생(예: 22...Nxf4)", { cp: -30 }, { cp: 250 }, true, true, false],
];
for (const [name, a, c, regains, want, firstCheck] of POISON) {
  const got = sacPoisonVerdict(a, c, () => regains, () => !!firstCheck);
  if (got !== want) fails.push("sacPoisonVerdict — " + name + ": 기대 " + want + ", 실제 " + got);
}
// BUG-060 전 과정(정적 판정 → 엔진 수순 → 독이 든 희생 → 등급) — 실제 Stockfish 18 기록값으로 22.Bg8+가 탁월로 매겨지는지
{
  const line = "e4 e6 d4 Nf6 Bd3 d6 c4 c6 Nc3 c5 d5 exd5 exd5 Be7 Nf3 O-O Qc2 g6 Bh6 Re8 O-O-O a5 h4 Bf8 Bg5 Be7 Rdg1 a4 g4 a3 h5 axb2+ Kb1 Qa5 a4 Na6 hxg6 fxg6 Bxg6 Nb4 Bxh7+ Kh8".split(" ");
  const san = "Bg8+", board = boardOfRoot(null, line), after = applySan(board, san, "w");
  const a = { mate: -4, pv: "h8g7 g5f6 g7f6 c2h7 c8f5 h7f5 f6g7 f5f7".split(" ") };   // 둔 직후(흑 차례): 흑이 Kg7로 받지 않는다
  const c = { mate: 2, pv: "c2g6 g8f8 g5h6".split(" ") };                             // Kxg8 뒤(백 차례): Qg6! Kf8 Bh6#
  if (!isSacrifice(board, san, "w")) fails.push("22.Bg8+ — 정적 희생 판정이 거짓");
  if (pvLosesMaterial(board, after, a.pv, "w")) fails.push("22.Bg8+ — 엔진 수순에서 기물을 잃는 것으로 나옴(기록값은 흑이 받지 않는 수순)");
  const capUci = sacrificeCaptureUci(board, san, "w");
  if (capUci !== "h8g8") fails.push("22.Bg8+ — 따 가는 수가 Kxg8(h8g8)이 아님: " + capUci);
  const verdict = sacPoisonVerdict(a, c, () => false);
  if (verdict !== true) fails.push("22.Bg8+ — 독이 든 희생으로 확인되지 않음(BUG-060)");
  const bestCp = 1e5, playedCp = -sacEvalCp(a);   // 최선수(Qg6, 메이트 4)와 같은 메이트권 — 손실 0, 1순위는 아님
  const kind = gradeMoveKind({ loss: Math.max(0, bestCp - playedCp), matched: false, bestCp, playedCp, secondCp: undefined, isSac: () => verdict, priorSac: ownPriorMoveWasSacrifice([...line, san], "w", null), san });
  if (kind !== "brilliant") fails.push("22.Bg8+ — 탁월한 수여야 하는데 " + kind);
}
// (v0.7.5 BUG-160) 실제 Stockfish 19 Lite(depth 18) 기록값 — 33.Rb2 뒤 엔진 수순에서 흑이 e3 비숍을 실제로 가져간다(①), 32.a5는 Rxe3 Qb8+로 되찾는 체크 전술(②)
{
  const g = "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 g3 Nf6 Bg2 Be7 O-O O-O f4 d6 Kh1 Nxd4 Bxd4 e5 Be3 Bg4 Qd2 Rac8 h3 Be6 f5 Bc4 Rf2 b5 b3 Bxb3 Nxb5 axb5 cxb3 Rfd8 Rc1 Qb7 Rxc8 Rxc8 g4 Nxe4 Kg1 d5 Bxe4 dxe4 g5 f6 gxf6 Bxf6 Qd6 Qc6 Qb4 Rd8 a4 bxa4 bxa4 Rd3".split(" ");
  const b32 = boardOfRoot(null, g), a32 = applySan(b32, "a5", "w");
  if (sacrificeCaptureUci(b32, "a5", "w") !== "d3e3") fails.push("32.a5 — 따 가는 수가 Rxe3(d3e3)이 아님: " + sacrificeCaptureUci(b32, "a5", "w"));
  if (pvLosesMaterial(b32, a32, "h7h5 f2e2 g8h7 g1h2 d3c3 h2g2 f6d8 g2g1".split(" "), "w")) fails.push("32.a5 — 흑이 받지 않는 기록 수순을 기물 손실로 봤다");
  const b33 = boardOfRoot(null, [...g, "a5", "Bh4"]), a33 = applySan(b33, "Rb2", "w");
  if (!pvLosesMaterial(b33, a33, "h7h6 b4b6 c6d7 b6g6 d3e3 b2b8 h4d8 g6e6".split(" "), "w")) fails.push("33.Rb2 — 기록 수순(…Rxe3)에서 비숍을 내주는 것을 못 봤다");
  const kind = gradeMoveKind({ loss: 20, matched: false, bestCp: -17, playedCp: -37, secondCp: -27, isSac: () => true, san: "Rb2" });
  if (kind !== "brilliant") fails.push("33.Rb2 — 희생 확인 뒤 탁월이어야 하는데 " + kind);
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
  // (v0.7.5, 사용자 요청) 강제 수(합법 수 하나뿐 → 2순위 수 없음 = null)는 유일한 수가 아니다
  ["강제 수(2순위 수 없음, null)는 유일한 수 아님 → 최선", { loss: 0, matched: true, bestCp: 30, playedCp: 30, secondCp: null, isSac: no }, "best"],
  ["강제 수는 지고 있는 위치(-1.5)에서도 유일한 수 아님", { loss: 0, matched: true, bestCp: -150, playedCp: -150, secondCp: null, isSac: no }, "best"],
  ["2순위와 차이가 작으면 최선", { loss: 0, matched: true, bestCp: 30, playedCp: 30, secondCp: -50, isSac: no }, "best"],
  ["단순 되잡기는 유일 아님", { loss: 0, matched: true, bestCp: 30, playedCp: 30, secondCp: -200, isSac: no, singleRecapture: yes }, "best"],
  ["6점 이상 이긴 위치는 유일 아님", { loss: 0, matched: true, bestCp: 700, playedCp: 700, secondCp: 400, isSac: no }, "best"],
  ["2순위도 +2점 이상이면 유일 아님", { loss: 0, matched: true, bestCp: 450, playedCp: 450, secondCp: 250, isSac: no }, "best"],
  ["희생 + 최선 → 탁월(유일보다 우선)", { loss: 0, matched: true, bestCp: -28, playedCp: -28, secondCp: -200, isSac: yes }, "brilliant"],
  ["BUG-036 11...Bxc6 브라우저 리뷰 값(-0.66) → 탁월", { loss: 0, matched: true, bestCp: -66, playedCp: -66, secondCp: -69, isSac: yes }, "brilliant"],
  ["(v0.7.3) 희생이고 둔 뒤 -1.4(하한 -1.5 안쪽)면 탁월", { loss: 20, matched: false, bestCp: -100, playedCp: -140, isSac: yes }, "brilliant"],
  ["희생이어도 둔 뒤 -1.5 미만이면 탁월 아님", { loss: 20, matched: false, bestCp: -140, playedCp: -170, isSac: yes }, "excellent"],
  ["두기 전 2점 이상 지고 있으면 탁월 아님", { loss: 0, matched: true, bestCp: -250, playedCp: -250, isSac: yes }, "best"],
  ["(v0.7.3) 직전 자기 희생을 잇는 수도 희생이면 탁월", { loss: 0, matched: true, bestCp: 50, playedCp: 50, isSac: yes, priorSac: true }, "brilliant"],
  ["직전 희생을 잇는 수라도 희생이 아니면(회수 수) 탁월 아님", { loss: 0, matched: true, bestCp: 50, playedCp: 50, isSac: no, priorSac: true }, "best"],
  ["1순위가 아니면 손실이 작아도 우수", { loss: 5, matched: false, bestCp: 30, playedCp: 25, isSac: no }, "excellent"],
  // (v0.7.3, 사용자 요청) 승부가 난 평가치(±4점 이상)에서는 유일한 수·블런더류를 매기지 않는다
  ["+4.5 위치는 2순위와 차이가 커도 유일 아님", { loss: 0, matched: true, bestCp: 450, playedCp: 450, secondCp: 100, isSac: no }, "best"],
  ["+3.9 위치(상한 안쪽)는 2순위와 차이가 크면 유일", { loss: 0, matched: true, bestCp: 390, playedCp: 390, secondCp: 100, isSac: no }, "only"],
  ["이기고 있다가 +9 → +6이 돼도 블런더·실수 아님(좋은 수)", { loss: 300, matched: false, bestCp: 900, playedCp: 600, isSac: no }, "good"],
  ["메이트 → +7(여전히 크게 이김)도 실수 아님", { loss: 99300, matched: false, bestCp: 100000, playedCp: 700, isSac: no }, "good"],
  ["이미 -6점으로 진 위치에서 -9점이 돼도 블런더 아님", { loss: 300, matched: false, bestCp: -600, playedCp: -900, isSac: no }, "good"],
  ["이긴 위치(+5)를 +0.5로 날리면(둔 뒤 4점 미만) 여전히 문제 수", { loss: 450, matched: false, bestCp: 500, playedCp: 50, isSac: no }, "mistake"],
  ["+3.5 → +1.0(손실 2.5)은 예전처럼 한 단계 완화된 실수", { loss: 250, matched: false, bestCp: 350, playedCp: 100, isSac: no }, "mistake"],
  ["승부가 난 위치(+4.5)에선 놓친 수도 매기지 않음", { loss: 150, matched: false, bestCp: 600, playedCp: 450, isSac: no, oppJustErred: true }, "good"],
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
// (BUG-060) 독이 든 희생 판정 규칙은 sacPoisonVerdict(src/lib/moveQuality.js) 한 곳 — common.jsx가 이득(gain)·메이트 비교를 다시 구현하면(SAC_POISON_* 직접 사용) 실패
{
  const common = readFileSync(new URL("../src/app/common.jsx", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n").replace(/\/\/.*$/gm, "");
  if (/SAC_POISON_(MIN|BIG)_GAIN_CP/.test(common)) fails.push("src/app/common.jsx — 독이 든 희생 임계값(SAC_POISON_*)을 직접 쓴다. sacPoisonVerdict로만 판정할 것");
  if (!/sacPoisonVerdict\(/.test(common)) fails.push("src/app/common.jsx — confirmSacrifice가 sacPoisonVerdict를 쓰지 않는다");
}
// (BUG-038) 정적 희생 판정만으로 탁월을 매기는 곳은 gradeMoveKindConfirmed 안의 한 곳뿐이어야 한다(나머지는 엔진 확인을 거친다).
const rawSac = app.filter((l) => { const c = l.replace(/\/\/.*$/, ""); return /isSac:\s*\(\)\s*=>\s*isSacrifice\(/.test(c) && !/sacVerdict\(/.test(c); }).length;
if (rawSac !== 1) fails.push("src/App.jsx — 엔진 확인 없이 isSacrifice로 탁월을 매기는 곳이 " + rawSac + "곳(허용 1곳: gradeMoveKindConfirmed). gradeMoveKindConfirmed·sacCheckSync를 쓸 것");

// (v0.7.5, 사용자 요청) 강제 수는 유일한 수가 아니다 — 저장된 예전 결과도 읽을 때 바로잡는다(fixForcedOnlyMoves)
{
  const { fixForcedOnlyMoves } = await import("../src/lib/moveQuality.js");
  // 1.e4 f5 2.Qh5+ g6 — 2...g6는 흑의 유일한 합법 수(f7이 비었지만 h5 퀸이 g6을 거쳐 f7을 겨눠 Kf7도 불가)라 강제 수다.
  const r = { moves: [{ san: "e4", kind: "book" }, { san: "f5", kind: "mistake" }, { san: "Qh5+", kind: "best" }, { san: "g6", kind: "only" }, { san: "Qxg6+", kind: "only" }] };
  fixForcedOnlyMoves(r);
  if (r.moves[3].kind !== "best") fails.push("fixForcedOnlyMoves — 강제 수 2...g6(합법 수 하나)이 유일한 수로 남음");
  if (r.moves[4].kind !== "only") fails.push("fixForcedOnlyMoves — 합법 수가 여럿인 3.Qxg6+까지 바꿈");
  const fen = { moves: [{ san: "Ke2", kind: "only" }] }; fixForcedOnlyMoves(fen);
  if (fen.moves[0].kind !== "only") fails.push("fixForcedOnlyMoves — 시작 포지션이 아닌 결과를 건드림");
  for (const f of ["src/app/reviewCache.js", "src/app/profile.jsx", "src/app/recentPerf.jsx", "src/app/common.jsx"]) if (!/fixForcedOnlyMoves\(/.test(readFileSync(new URL("../" + f, import.meta.url), "utf8"))) fails.push(f + " — 저장된 리뷰 결과를 읽을 때 fixForcedOnlyMoves를 거치지 않음");
}
if (fails.length) {
  console.error("✗ 수 등급 판정 검사 실패 (BUG-036·037·038 재발 방지):\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("✓ 수 등급 판정 검사 통과 (희생 " + SAC_CASES.length + "건 · 엔진 확인 " + (PV_CASES.length + 3 + POISON.length + 1) + "건 · 등급 규칙 " + G.length + "건 · App.jsx 규칙 복사 없음)");
