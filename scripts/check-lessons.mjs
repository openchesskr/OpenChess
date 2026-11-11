#!/usr/bin/env node
/** (v0.7.5) 새 레슨 커리큘럼(src/lib/lessons/) 검사 — 틀린 레슨은 학습자가 진행할 수 없으므로 빌드에서 막는다.
 *   · 레슨 id가 겹치지 않고 서버 보상 규칙(영문·숫자·_-, 40자)에 맞으며, 모든 레슨이 아는 단계에 속한다
 *   · 모든 포지션(FEN)이 합법(chess.js)이고, read의 강조 칸·tap의 정답 칸이 비어 있지 않다
 *   · move: 힌트 수가 첫 목표를 만족하고, 응수(reply)가 합법이며, 이후 목표마다 그것을 만족하는 수가 실제로 있다. uci 목표의 수는 모두 합법
 *   · choice: 정답 번호가 보기 범위 안
 *   · 서버(supabase-setup.sql economy_params의 seedChapters)가 모든 레슨 id를 같은 보상으로 알고 있다 — 모르면 코인을 못 받는다
 *   · 진행 규칙: 처음엔 첫 레슨만 열리고, 끝내면 다음 레슨이 열린다
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-lessons.mjs
 */
import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { allLessons, STAGES, LESSON_REWARD } from "../src/lib/lessons/curriculum.js";
import { playUci, goalMet, tapAnswer, readMarks, legalTargets } from "../src/lib/lessons/engine.js";
import { normalizeLessonState, markLessonDone, lessonStatus, nextLesson, lessonSummary } from "../src/lib/lessons/progress.js";

const fails = [];
const lessons = allLessons();
const ids = new Set(); let steps = 0, moves = 0;
const fenOk = (fen, where) => { try { new Chess(fen); return true; } catch (e) { fails.push(where + ": 잘못된 FEN " + fen + " (" + e.message + ")"); return false; } };
for (const l of lessons) {
  const where = l.id;
  if (ids.has(l.id)) fails.push("레슨 id 중복: " + l.id); ids.add(l.id);
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(l.id)) fails.push(where + ": 서버 보상 규칙에 맞지 않는 id");
  if (!STAGES.some((s) => s.id === l.stage)) fails.push(where + ": 모르는 단계 " + l.stage);
  if (!l.title() || !l.sub()) fails.push(where + ": 제목·부제 없음");
  const st = l.steps();
  if (!st.length) fails.push(where + ": 스텝 없음");
  st.forEach((s, i) => {
    steps++;
    const w = where + "#" + (i + 1);
    if (!s.say) fails.push(w + ": 안내 문장 없음");
    if (s.fen && !fenOk(s.fen, w)) return;
    if (s.kind === "read") { if ((s.marksFrom || s.marks) && !readMarks(s).length) fails.push(w + ": 강조 칸이 비어 있음"); }
    else if (s.kind === "tap") { if (!s.fen) fails.push(w + ": tap에 FEN 없음"); else if (!tapAnswer(s).size) fails.push(w + ": tap 정답 칸이 비어 있음"); }
    else if (s.kind === "choice") { if (!Array.isArray(s.options) || s.answer < 0 || s.answer >= s.options.length) fails.push(w + ": choice 정답 번호가 보기 밖"); }
    else if (s.kind === "move") {
      if (!s.fen || !Array.isArray(s.line) || !s.line.length) { fails.push(w + ": move에 FEN·목표 없음"); return; }
      let fen = s.fen;
      s.line.forEach((g, j) => {
        const wj = w + " 목표" + (j + 1);
        if (g.goal.uci) for (const u of g.goal.uci) if (!playUci(fen, u)) fails.push(wj + ": 정답 수 " + u + "가 합법이 아님");
        // 이 목표를 만족하는 수(첫 목표는 힌트, 이후는 아무 수)를 찾는다
        let pick = null;
        if (j === 0) { pick = s.hint ? playUci(fen, s.hint) : null; if (!pick || !goalMet(g.goal, pick)) fails.push(wj + ": 힌트 " + s.hint + "가 목표를 만족하지 않음"); }
        else { const c = new Chess(fen); for (const m of c.moves({ verbose: true })) { const p = playUci(fen, m.from + m.to + (m.promotion || "")); if (p && goalMet(g.goal, p)) { pick = p; break; } } if (!pick) fails.push(wj + ": 목표를 만족하는 수가 없음"); }
        if (!pick) return;
        moves++;
        fen = pick.fen;
        if (g.reply) { const r = playUci(fen, g.reply); if (!r) { fails.push(wj + ": 응수 " + g.reply + "가 합법이 아님"); return; } fen = r.fen; }
        else if (j < s.line.length - 1) fails.push(wj + ": 다음 목표가 있는데 응수가 없음");
      });
    } else fails.push(w + ": 모르는 스텝 종류 " + s.kind);
  });
}
// 몇 가지 판정 자체의 회귀 검사
{
  const ok = (cond, label) => { if (!cond) fails.push("판정: " + label); };
  ok(goalMet({ mate: true }, playUci("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", "a1a8")), "백랭크 메이트를 메이트로 판정");
  ok(!goalMet({ mate: true }, playUci("7k/8/5QK1/8/8/8/8/8 w - - 0 1", "f6f7")), "스테일메이트를 메이트로 보지 않음");
  ok(goalMet({ safe: true }, playUci("r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3", "d8e7")), "Qe7은 f7 메이트를 막음");
  ok(!goalMet({ safe: true }, playUci("r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3", "a7a6")), "a6은 f7 메이트를 막지 못함");
  ok(legalTargets("k7/4r3/8/8/3K4/8/8/8 w - - 0 1", "d4").every((s) => s[0] !== "e"), "킹은 공격받는 e파일로 못 감");
  ok(goalMet({ promote: "q" }, playUci("8/4P1k1/8/8/8/8/8/4K3 w - - 0 1", "e7e8q")), "퀸 승격 판정");
}
// 진행 규칙
{
  let st = normalizeLessonState(null);
  if (lessonStatus(st, lessons[0].id) !== "current" || lessonStatus(st, lessons[1].id) !== "locked") fails.push("진행: 처음엔 첫 레슨만 열려야 함");
  st = markLessonDone(st, lessons[0].id);
  if (lessonStatus(st, lessons[1].id) !== "current" || nextLesson(st).id !== lessons[1].id) fails.push("진행: 첫 레슨을 끝내면 두 번째가 열려야 함");
  const sum = lessonSummary(st); if (sum.claimed !== 1 || sum.totalChapters !== lessons.length) fails.push("진행: 요약 수치 오류");
  if (normalizeLessonState({ done: { x: 5, ["y".repeat(50)]: 1 } }).done["y".repeat(50)]) fails.push("진행: 너무 긴 id를 걸러야 함");
}
// (v0.7.5, 사용자 요청) 단계 색·아이콘은 수 등급 좋음 → 우수 → 최선 → 유일 → 탁월 순서 그대로
{ const want = ["good", "excellent", "best", "only", "brilliant"]; if (STAGES.map((s) => s.grade).join() !== want.join()) fails.push("단계 등급 순서가 좋음·우수·최선·유일·탁월이 아님: " + STAGES.map((s) => s.grade).join()); }
// 레슨 아이콘: 화면(app/lessons.jsx)이 아이콘 전체가 아니라 쓰는 것만 가져오므로, 커리큘럼의 아이콘 이름이 LESSON_ICONS에 있어야 한다(없으면 빈 동그라미로 보인다)
{
  const ui = readFileSync(new URL("../src/app/lessons.jsx", import.meta.url), "utf8");
  const m = /export const LESSON_ICONS = \{([^}]*)\}/.exec(ui);
  const have = new Set(m ? m[1].split(",").map((x) => x.trim()).filter(Boolean) : []);
  if (!m) fails.push("app/lessons.jsx에서 LESSON_ICONS를 찾지 못함");
  for (const l of lessons) {
    if (l.icon.startsWith("piece:")) { if (!"PNBRQK".includes(l.icon.slice(6)) || l.icon.length !== 7) fails.push(l.id + ": 기물 아이콘 이름 오류 " + l.icon); }
    else if (!have.has(l.icon)) fails.push(l.id + ": 아이콘 " + l.icon + "을 app/lessons.jsx LESSON_ICONS에 추가할 것");
  }
}
// 서버 보상 목록과 대조
{
  const sql = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
  const m = /"seedChapters":\s*(\{[^}]*\})/.exec(sql);
  if (!m) fails.push("supabase-setup.sql에서 seedChapters를 찾지 못함");
  else {
    const seed = JSON.parse(m[1]);
    for (const l of lessons) if (seed[l.id] !== LESSON_REWARD) fails.push("서버 seedChapters에 " + l.id + " 보상 " + LESSON_REWARD + "이 없음(" + seed[l.id] + ")");
    for (const k of Object.keys(seed)) if (!ids.has(k)) fails.push("서버 seedChapters에 커리큘럼에 없는 레슨 " + k);
  }
}
if (fails.length) { console.error("✗ check-lessons 실패 (" + fails.length + "건)\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-lessons: 단계 " + STAGES.length + "개 · 레슨 " + lessons.length + "개 · 스텝 " + steps + "개(수 두기 목표 " + moves + "개)가 모두 합법이고 정답·힌트·응수가 맞으며, 서버 보상 목록과 일치한다");
