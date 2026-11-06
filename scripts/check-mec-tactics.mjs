#!/usr/bin/env node
/** (v0.7.2) MEC 전술 탐지(src/lib/mecTactics.js) 회귀 검사.
 *   · 고정 포지션: 포크·핀·스큐어·디스커버드 공격/체크·백랭크·승격·통과폰·메이트 위협이 정확히 잡히고, 잡히면 안 되는 포지션(상대 비숍이 잡을 수 있는 포크 등)은 안 잡힌다
 *   · 나쁜 수 설명(B): 상대의 메이트 허용, 핀에 걸린 기물 이동 / 놓친 수(C): 체크메이트·포크
 *   · 실제 대국 표본: 포크는 대상 칸의 기물을 이 수로 둔 기물이 실제로 잡을 수 있고, 절대 핀은 핀 걸린 기물이 줄 밖으로 못 나가며, 체크 계열은 체크 상태와 일치하는지 — 탐지기와 다른 방식(수 생성기)으로 교차 검증
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-mec-tactics.mjs
 */
import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { decodeMoves } from "../src/lib/moveCodec.js";
import { moveTactics, replyTactics, pinnedMoveFact, bestMoveTactic } from "../src/lib/mecTactics.js";

const fails = [];
const kinds = (fen, san) => moveTactics(fen, san).map((t) => t.kind);
const has = (label, fen, san, kind, want = true) => { const k = kinds(fen, san); if (k.includes(kind) !== want) fails.push(label + ": " + san + " → [" + k.join(",") + "] " + (want ? "에 " + kind + " 없음" : "에 " + kind + " 있음")); };

// 고정 포지션
has("포크", "r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1", "Nc7+", "fork");
has("포크(잡힐 수 있으면 아님)", "r2bk3/8/8/3N4/8/8/8/4K3 w - - 0 1", "Nc7+", "fork", false);
has("절대 핀", "4k3/8/2n5/8/8/8/4B3/4K3 w - - 0 1", "Bb5", "pinAbs");
has("스큐어(킹 앞, 뒤에 퀸)", "4q3/8/8/8/4k3/8/8/R5K1 w - - 0 1", "Re1+", "skewer");
has("디스커버드 공격", "4k3/8/8/3q4/8/8/3N4/3RK3 w - - 0 1", "Nf3", "discoveredAttack");
has("디스커버드 체크", "4k3/8/8/8/8/8/4N3/4R1K1 w - - 0 1", "Nf4", "discoveredCheck");
has("백랭크 체크", "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", "Ra8+", "backRank");
has("통과폰", "4k3/8/8/8/4P3/8/8/4K3 w - - 0 1", "e5", "passedPawn");
has("승격", "4k3/P7/8/8/8/8/8/4K3 w - - 0 1", "a8=Q+", "promotion");
has("메이트 위협", "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", "h3", "mateThreat");
has("조용한 첫 수에는 전술 없음", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "e4", "fork", false);
// B·C
const rm = replyTactics("3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1");
if (!rm || rm.kind !== "mate" || rm.san !== "Rd1#") fails.push("B: 상대의 메이트 허용 탐지 실패 " + JSON.stringify(rm));
const pm = pinnedMoveFact("4k3/8/8/b7/8/2B5/8/4Q1K1 w - - 0 1", "Bd4");
if (!pm || pm.exposed !== "q") fails.push("B: 핀에 걸린 기물 이동 탐지 실패 " + JSON.stringify(pm));
if (pinnedMoveFact("4k3/8/8/b7/8/2B5/8/4Q1K1 w - - 0 1", "Bb4")) fails.push("B: 핀 줄 위로 움직인 수를 핀 무시로 판정");
const bm = bestMoveTactic("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", "Rd8#");
if (!bm || bm.kind !== "mate") fails.push("C: 놓친 체크메이트 탐지 실패");
const bf = bestMoveTactic("r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1", "Nc7+");
if (!bf || bf.kind !== "fork") fails.push("C: 놓친 포크 탐지 실패");

// 실제 대국 교차 검증
const ROOT = new URL("../", import.meta.url).pathname;
const games = [];
for (const f of ["norway", "candidates", "dortmund"]) {
  const d = JSON.parse(readFileSync(ROOT + "src/data/tournaments/" + f + ".json", "utf8"));
  games.push(...d.eds.flatMap((e) => e.g).filter((g) => typeof g[5] === "string" && g[5].length > 60).slice(0, 25));
}
const line = (a, b) => { // a와 b를 잇는 직선 위(양 끝 제외) 칸들
  const fa = a.charCodeAt(0) - 97, ra = +a[1], fb = b.charCodeAt(0) - 97, rb = +b[1];
  const df = Math.sign(fb - fa), dr = Math.sign(rb - ra), out = [];
  for (let f = fa + df, r = ra + dr; f !== fb || r !== rb; f += df, r += dr) out.push(String.fromCharCode(97 + f) + r);
  return out;
};
let n = 0, nt = 0;
for (const g of games) {
  const sans = decodeMoves(g[5]).slice(0, 80);
  for (let p = 0; p < sans.length; p++) {
    const c = new Chess(); for (let i = 0; i < p; i++) c.move(sans[i]);
    const fen = c.fen(); const mv = c.move(sans[p]); n++;
    const opp = mv.color === "w" ? "b" : "w";
    for (const t of moveTactics(fen, sans[p])) {
      nt++;
      const tag = (p % 2 ? Math.floor(p / 2) + 1 + "..." : Math.floor(p / 2) + 1 + ".") + sans[p] + " [" + t.kind + "]";
      // 전술 시각화(review.jsx playTacticAnimation)가 읽는 칸 좌표가 전부 있고 올바른 칸 이름인지
      const NEED = { fork: ["to", "targets"], pinAbs: ["s", "x", "y"], pinRel: ["s", "x", "y"], skewer: ["s", "x", "y"], discoveredAttack: ["from", "slider", "target"], discoveredCheck: ["from", "checker", "king"], doubleCheck: ["king", "checkers"], backRank: ["to", "king"], mateThreat: ["king", "mateFrom", "mateTo"], promotion: ["from", "to"], passedPawn: ["to", "goal"] };
      for (const key of NEED[t.kind] || []) {
        const v = t.squares && t.squares[key]; const arr = Array.isArray(v) ? v : [v];
        if (!arr.length || arr.some((x) => !/^[a-h][1-8]$/.test(String(x)))) fails.push("연출 좌표 누락·오류(" + key + "): " + tag + " " + JSON.stringify(t.squares));
      }
      if (t.kind === "fork") {
        // 수 생성기로 확인: 차례를 내게 돌렸을 때 이 기물이 대상 칸의 기물을 실제로 잡을 수 있어야 한다(킹 대상은 제외)
        const parts = c.fen().split(" "); parts[1] = mv.color; parts[3] = "-";
        let flip; try { flip = new Chess(parts.join(" ")); } catch { continue; }
        const caps = new Set(flip.moves({ square: mv.to, verbose: true }).filter((m) => m.captured).map((m) => m.to));
        for (const tg of t.targets) if (tg.type !== "k" && !caps.has(tg.sq)) fails.push("포크 대상을 실제로 잡을 수 없음: " + tag + " " + tg.sq);
        if (t.targets.length < 2) fails.push("포크 대상 2개 미만: " + tag);
      } else if (t.kind === "pinAbs") {
        const { s, x, y } = t.squares; const allowed = new Set([...line(s, y), s]);
        for (const m of c.moves({ square: x, verbose: true })) if (!allowed.has(m.to)) fails.push("절대 핀인데 줄 밖으로 움직일 수 있음: " + tag + " " + m.san);
      } else if (t.kind === "doubleCheck") { if (!c.isCheck()) fails.push("더블 체크인데 체크가 아님: " + tag); }
      else if (t.kind === "discoveredCheck") { if (!c.isCheck() || c.attackers(t.squares.king, mv.color).includes(mv.to)) fails.push("디스커버드 체크 판정 불일치: " + tag); }
      else if (t.kind === "backRank") { if (!c.isCheck()) fails.push("백랭크 체크인데 체크가 아님: " + tag); }
      else if (t.kind === "promotion") { if (!mv.promotion) fails.push("승격 판정 불일치: " + tag); }
      else if (t.kind === "mateThreat") {
        const parts = c.fen().split(" "); parts[1] = mv.color; parts[3] = "-"; const flip = new Chess(parts.join(" "));
        const mate = flip.moves({ verbose: true }).some((m) => { const x = new Chess(parts.join(" ")); x.move(m.san); return x.isCheckmate(); });
        if (!mate || c.isCheck()) fails.push("메이트 위협 판정 불일치: " + tag);
      }
    }
  }
}
if (fails.length) { console.error("✗ MEC 전술 탐지 오류 " + fails.length + "건\n" + fails.slice(0, 15).map((x) => "  - " + x).join("\n")); process.exit(1); }
console.log("✓ MEC 전술 탐지: 고정 포지션·B·C 통과, 실제 대국 " + n + "수에서 전술 " + nt + "건 교차 검증 통과");
