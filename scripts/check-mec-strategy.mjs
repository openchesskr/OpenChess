#!/usr/bin/env node
/** (v0.7.2) MEC 전략·구조 탐지(src/lib/mecStrategy.js) 회귀 검사.
 *   · 고정 포지션: 루프트·킹 앞 폰 이동·전초기지·7번째 줄 룩·폰이 열어 준 길·중앙 폰·중앙 통제·새 통과폰·겹폰·킹 활성화·킹 전진·활동성 낮은 나이트·측면 폰이 정확히 잡히고,
 *     상대 폰이 몰아낼 수 있는 자리는 전초기지가 아니며, 처음 15수 이후엔 중앙 폰 문장이 나오지 않는다
 *   · 실제 대국 표본: 탐지기와 다른 방식(chess.js attackers·직접 계산)으로 교차 검증
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-mec-strategy.mjs
 */
import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { decodeMoves } from "../src/lib/moveCodec.js";
import { strategicFact } from "../src/lib/mecStrategy.js";

const fails = [];
const is = (label, fen, san, kind, tone = "neutral") => { const f = strategicFact(fen, san, tone); if ((f && f.kind) !== kind) fails.push(label + ": " + san + " → " + (f ? f.kind : "없음") + " (기대 " + kind + ")"); };
is("루프트(킹이 아닌 쪽 폰)", "4r1k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1", "h3", "luft");
is("킹 앞 폰 이동(킹 파일 폰은 약화)", "3qr1k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1", "g4", "shield");
is("전초기지", "4k3/8/8/8/2P1P3/2N5/8/4K3 w - - 0 1", "Nd5", "outpost");
is("상대 폰이 건드리면 전초기지 아님", "4k3/8/2p5/8/2P1P3/2N5/8/4K3 w - - 0 1", "Nd5", null);
is("7번째 줄 룩", "4k3/p7/8/8/8/8/8/3RK3 w - - 0 1", "Rd7", "seventh");
is("폰이 열어 준 비숍 길", "4k3/8/8/8/8/8/3P4/2B1K3 w - - 0 1", "d4", "openLine");
is("중앙 폰", "4k3/8/8/8/8/4P3/8/4K3 w - - 0 1", "e4", "centerPawn");
is("중앙 통제", "4k3/8/8/8/8/8/2P5/4K3 w - - 0 1", "c4", "centerControl");
is("처음 15수 이후엔 중앙 폰 없음", "4k3/8/8/8/8/4P3/8/4K3 w - - 0 20", "e4", null);
is("새 통과폰", "4k3/8/8/8/2p5/3P4/8/4K3 w - - 0 1", "dxc4", "passedCreated");
is("겹폰", "4k3/3p4/8/8/8/2p5/1PP5/4K3 w - - 0 1", "bxc3", "doubled");
is("엔드게임 킹 활성화", "8/8/4k3/8/8/8/8/6K1 w - - 0 1", "Kf2", "kingActivation");
is("퀸이 있으면 킹 활성화가 아니라 킹 전진", "3qk3/8/8/8/8/8/5P2/6K1 w - - 0 1", "Kg2", "kingWalk");
is("활동성 낮은 나이트(나쁜 수에만)", "4k3/8/8/8/8/1N6/8/4K3 w - - 0 1", "Na1", "passiveMinor", "poor");
is("좋은 수에는 활동성 문장 없음", "4k3/8/8/8/8/1N6/8/4K3 w - - 0 1", "Na1", null, "good");
is("측면 폰", "4k3/8/8/8/8/8/P7/4K3 w - - 0 1", "a4", "wingSpace");

// 실제 대국 교차 검증
const ROOT = new URL("../", import.meta.url).pathname;
const games = [];
for (const f of ["norway", "candidates", "dortmund"]) {
  const d = JSON.parse(readFileSync(ROOT + "src/data/tournaments/" + f + ".json", "utf8"));
  games.push(...d.eds.flatMap((e) => e.g).filter((g) => typeof g[5] === "string" && g[5].length > 60).slice(0, 25));
}
const FILES = "abcdefgh";
const attackedCount = (c, color, sq) => { let n = 0; for (let r = 1; r <= 8; r++) for (const f of FILES) if (c.attackers(f + r, color).includes(sq)) n++; return n; };
let n = 0, nf = 0;
for (const g of games) {
  const sans = decodeMoves(g[5]).slice(0, 80);
  for (let p = 0; p < sans.length; p++) {
    const c = new Chess(); for (let i = 0; i < p; i++) c.move(sans[i]);
    const fen = c.fen(); const before = new Chess(fen); const mv = c.move(sans[p]); n++;
    const f = strategicFact(fen, sans[p], "neutral"); if (!f) continue; nf++;
    const opp = mv.color === "w" ? "b" : "w";
    const tag = (p % 2 ? Math.floor(p / 2) + 1 + "..." : Math.floor(p / 2) + 1 + ".") + sans[p] + " [" + f.kind + "]";
    if (f.kind === "outpost") {
      const pawnSupport = c.attackers(mv.to, mv.color).some((s) => c.get(s).type === "p");
      const pawnThreat = c.attackers(mv.to, opp).some((s) => c.get(s).type === "p");
      if (mv.piece !== "n" || !pawnSupport || pawnThreat) fails.push("전초기지 조건 불일치: " + tag);
    } else if (f.kind === "openLine") {
      const S = f.squares.slider; const gain = attackedCount(c, mv.color, S) - attackedCount(before, mv.color, S);
      if (mv.piece !== "p" || mv.captured || gain < 2) fails.push("열린 길 판정 불일치(공격 칸 증가 " + gain + "): " + tag);
    } else if (f.kind === "passedCreated") {
      const sq = f.squares.target; const file = FILES.indexOf(sq[0]), rank = +sq[1], dir = mv.color === "w" ? 1 : -1;
      for (let r = rank + dir; r >= 1 && r <= 8; r += dir) for (const df of [-1, 0, 1]) { const ff = file + df; if (ff < 0 || ff > 7) continue; const x = c.get(FILES[ff] + r); if (x && x.type === "p" && x.color === opp) fails.push("통과폰 앞에 상대 폰 있음: " + tag); }
    } else if (f.kind === "doubled") {
      let cnt = 0; for (let r = 1; r <= 8; r++) { const x = c.get(mv.to[0] + r); if (x && x.type === "p" && x.color === mv.color) cnt++; }
      if (cnt < 2 || !mv.captured) fails.push("겹폰 판정 불일치: " + tag);
    } else if (f.kind === "centerPawn") { if (mv.piece !== "p" || !"de".includes(mv.to[0])) fails.push("중앙 폰 판정 불일치: " + tag); }
    else if (f.kind === "seventh") { if (mv.piece !== "r" || mv.to[1] !== (mv.color === "w" ? "7" : "2")) fails.push("7번째 줄 판정 불일치: " + tag); }
    else if (f.kind === "kingActivation" || f.kind === "kingWalk") { if (mv.piece !== "k") fails.push("킹 사실인데 킹 수가 아님: " + tag); }
  }
}
if (fails.length) { console.error("✗ MEC 전략·구조 탐지 오류 " + fails.length + "건\n" + fails.slice(0, 15).map((x) => "  - " + x).join("\n")); process.exit(1); }
console.log("✓ MEC 전략·구조 탐지: 고정 포지션 통과, 실제 대국 " + n + "수 중 " + nf + "건 교차 검증 통과");
