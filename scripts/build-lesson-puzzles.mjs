#!/usr/bin/env node
/** (v0.7.9, 사용자 요청·BUG-199) 학습 탭 "추가 학습"의 OpenChess 테마 퍼즐 은행 — src/data/lessonPuzzleBank.json을 만든다.
 *  예전 추가 학습은 Lichess 테마 퍼즐(서버가 lichess.org에서 받아 쌓음)과 OpenChess 공개 퍼즐 중 메이트 모양이 맞는 것뿐이라,
 *  Lichess를 못 받으면(차단·한도·빈 저장소) 스모더드 메이트처럼 드문 테마는 아무것도 나오지 않았고, Lichess에 맞는 테마가 없는 레슨은 지원하지 못했다.
 *  이제 모든 레슨이 앱에 들어 있는 고유 퍼즐을 갖는다:
 *   ① 레슨 문제의 대칭 변형(좌우 반전·색 바꿈 — src/lib/lessons/variants.js): 같은 개념, 다른 모양. 목표가 메이트·체크처럼 정답이 여럿이면 모두 정답으로 받는다.
 *   ② 메이트 패턴 레슨은 실제 마스터 대국의 메이트 수순(src/data/attackPositions.json, 테마 분류: scripts/lib/mateThemes.mjs)에서 같은 모양을 고른다.
 *   ③ 오프닝 레퍼토리 레슨은 그 주요 수순의 여러 지점에서 "다음 수순은?" 문제를 만든다.
 *  모든 퍼즐은 chess.js로 끝까지 다시 두어 확인한다. 형식: { [레슨 id]: [[fen, "SAN SAN …", 출처, 정답 목록?]] }
 *   - SAN은 학습자 수와 상대 응수가 번갈아. 출처: "v"(레슨 변형) · "g:<대국>"(마스터 대국) · "o"(오프닝 수순).
 *   - 정답 목록(있으면): 학습자 수마다 받아 주는 SAN 배열(없으면 그 수만). 마지막 수가 메이트면 다른 메이트 수도 정답(lessonPuzzles.puzzleMoveOk).
 *  실행: node scripts/build-lesson-puzzles.mjs (check-theme-puzzles가 은행이 최신인지·모든 레슨이 퍼즐을 갖는지 검사한다)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";
import { allLessons } from "../src/lib/lessons/curriculum.js";
import { variantsOf, solveGoal, goalAnswers } from "../src/lib/lessons/variants.js";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = "src/data/lessonPuzzleBank.json";
export const BANK_MAX = 10;   // 레슨당 최대

// 메이트 패턴 레슨 → 마스터 대국 메이트 테마(attackPositions의 3번째 칸). mateMax: 메이트까지 학습자 수.
const MASTER = {
  m_smothered: { th: ["smotheredMate"], mateMax: 3 }, m_arabian: { th: ["arabianMate"], mateMax: 2 }, m_boden: { th: ["bodenMate"], mateMax: 2 },
  m_backrank: { th: ["backRankMate"], mateMax: 2 }, m_corridor: { th: ["backRankMate"], mateMax: 2, skip: 8 }, m_epaulette: { th: ["epauletteMate", "dovetailMate"], mateMax: 2 },
  m_anastasia: { th: ["anastasiaMate", "hookMate"], mateMax: 3 }, t_doublecheck: { th: ["doubleCheckMate"], mateMax: 2 },
  n_mate1: { th: ["queenMate", "rookMate"], mateMax: 1 }, r_mate: { th: ["rookMate", "queenMate"], mateMax: 1, skip: 20 }, n_checks: { th: ["queenMate", "rookMate"], mateMax: 2, minMate: 2 },
  b_queensac: { th: ["queenMate"], mateMax: 3, minMate: 2, sac: true }, m_h7: { th: ["hookMate", "queenMate"], mateMax: 2, minMate: 2, skip: 5 },
  e_rookmate: { th: ["rookMate"], mateMax: 3, minMate: 2, few: 6 }, m_queen: { th: ["queenMate"], mateMax: 3, minMate: 2, few: 5 }, m_ladder: { th: ["rookMate"], mateMax: 3, minMate: 2, few: 6, skip: 3 },
  b_board: { th: ["rookMate"], mateMax: 1, few: 6 }, r_check: { th: ["rookMate", "queenMate"], mateMax: 1, skip: 40 }, z_foolsmate: { th: ["queenMate"], mateMax: 1, skip: 60 },
};

const sanLine = (fen, ucis) => {
  const c = new Chess(fen), out = [];
  for (const u of ucis) { let m; try { m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { return null; } if (!m) return null; out.push(m.san); }
  return { sans: out, end: c };
};

// ① 레슨 변형
function lessonVariants(l) {
  const out = [], seen = new Set();
  for (const s of l.steps()) {
    if (s.kind !== "move" || s.review || !s.line || !s.line.length) continue;
    for (const v of variantsOf(s)) {
      if (seen.has(v.fen)) continue;
      const c = new Chess(v.fen), sans = [], oks = [];
      let bad = false;
      for (const g of v.line) {
        const u = solveGoal(c.fen(), g.goal); if (!u) { bad = true; break; }
        const alts = g.goal && !g.goal.uci && v.line.length === 1 ? goalAnswers(c.fen(), g.goal) : null;   // 여러 수 문제는 다른 정답이 뒤 응수를 깨뜨릴 수 있어 한 수 문제만
        const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); sans.push(m.san); oks.push(alts && alts.length > 1 ? alts : null);
        if (g.reply) { const r = c.move({ from: g.reply.slice(0, 2), to: g.reply.slice(2, 4), promotion: g.reply[4] }); if (!r) { bad = true; break; } sans.push(r.san); }
      }
      if (bad || !sans.length) continue;
      seen.add(v.fen);
      out.push(oks.some(Boolean) ? [v.fen, sans.join(" "), "v", oks] : [v.fen, sans.join(" "), "v"]);
    }
  }
  return out;
}

// ② 마스터 대국 메이트
const ATTACK = JSON.parse(readFileSync(ROOT + "src/data/attackPositions.json", "utf8"));
const pieceCount = (fen) => fen.split(" ")[0].replace(/[^A-Za-z]/g, "").length;
function masterMates(cfg) {
  const rows = ATTACK.filter((r) => {
    const th = String(r[2]).split(" "), n = (String(r[1]).split(" ").length + 1) / 2;
    if (!cfg.th.some((x) => th.includes(x)) || n > cfg.mateMax || n < (cfg.minMate || 1)) return false;
    if (cfg.few && pieceCount(r[0]) > cfg.few) return false;
    return true;
  }).sort((a, b) => a[1].split(" ").length - b[1].split(" ").length || (a[0] < b[0] ? -1 : 1));
  const out = [];
  for (const r of rows.slice(cfg.skip || 0)) {
    const L = sanLine(r[0], String(r[1]).split(" ")); if (!L || !L.end.isCheckmate()) continue;
    if (cfg.sac && !/^Q.*x/.test(L.sans[0])) continue;   // 퀸 새크리파이스로 시작하는 메이트만
    out.push([r[0], L.sans.join(" "), "g:" + String(r[3] || "").slice(0, 60)]);
    if (out.length >= 6) break;
  }
  return out;
}

// ③ 오프닝 수순
function openingSteps(l) {
  const sans = String(l.line || "").split(" ").filter(Boolean); if (sans.length < 2) return [];
  const me = l.side === "b" ? 1 : 0, out = [], c = new Chess();
  const fens = [];
  for (let i = 0; i < sans.length; i++) { if (i % 2 === me) fens.push([c.fen(), sans.slice(i, i + 3).filter((_, k) => k < 3)]); if (!c.move(sans[i])) return []; }
  for (const [fen, rest] of fens.slice(-4)) {
    const L = sanLine(fen, (() => { const d = new Chess(fen); return rest.map((s) => { const m = d.move(s); return m ? m.from + m.to + (m.promotion || "") : "x"; }); })());
    if (L) out.push([fen, L.sans.slice(0, rest.length % 2 ? rest.length : rest.length - 1).join(" "), "o"]);
  }
  return out;
}

export function buildBank() {
  const bank = {};
  for (const l of allLessons()) {
    // 레슨 자신의 변형이 먼저, 그다음 마스터 대국 메이트(메이트 패턴 레슨은 둘을 번갈아)
    let list = l.motif ? openingSteps(l) : lessonVariants(l);
    if (MASTER[l.id]) { const ms = masterMates(MASTER[l.id]), mix = []; for (let i = 0; i < Math.max(list.length, ms.length); i++) { if (list[i]) mix.push(list[i]); if (ms[i]) mix.push(ms[i]); } list = mix; }
    const seen = new Set();
    bank[l.id] = list.filter((p) => (seen.has(p[0]) ? false : (seen.add(p[0]), true))).slice(0, BANK_MAX);
  }
  return bank;
}

if (import.meta.url === "file://" + process.argv[1]) {
  const bank = buildBank();
  const json = "{\n" + Object.entries(bank).map(([k, v]) => JSON.stringify(k) + ":" + JSON.stringify(v)).join(",\n") + "\n}\n";
  writeFileSync(ROOT + OUT, json);
  const n = Object.values(bank).map((v) => v.length);
  console.log("✔ " + OUT + ": 레슨 " + n.length + "개 · 퍼즐 " + n.reduce((a, b) => a + b, 0) + "개 · 퍼즐 없는 레슨 " + n.filter((x) => !x).length + "개 · " + Math.round(json.length / 1024) + "KB");
}
