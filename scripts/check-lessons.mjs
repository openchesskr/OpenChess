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
import { allLessons, STAGES, LESSON_REWARD, REPERTOIRE_STAGE, orderProblems } from "../src/lib/lessons/curriculum.js";
import { t } from "../src/lib/i18n.js";
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
        const h = g.hint || (j === 0 ? s.hint : null);   // 목표별 힌트(오프닝 레슨) 또는 첫 목표의 스텝 힌트
        if (h) { pick = playUci(fen, h); if (!pick || !goalMet(g.goal, pick)) { fails.push(wj + ": 힌트 " + h + "가 목표를 만족하지 않음"); pick = null; } }
        else if (j === 0) fails.push(wj + ": 첫 목표에 힌트가 없음");
        if (!pick && !h && j > 0) { const c = new Chess(fen); for (const m of c.moves({ verbose: true })) { const p = playUci(fen, m.from + m.to + (m.promotion || "")); if (p && goalMet(g.goal, p)) { pick = p; break; } } if (!pick) fails.push(wj + ": 목표를 만족하는 수가 없음"); }
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
//  (v0.7.5) 그 다음 6단계 오프닝 레파토리는 수 등급 "이론(책)"
//  (v0.7.7, 사용자 요청) 7~9단계(전술 심화·중반 전략·엔드게임 심화)는 남은 등급 놓친 수·부정확·실수
//  (v0.7.7, 사용자 요청 "레슨 더") 10단계(체크메이트 패턴)는 마지막 등급 블런더
//  (v0.7.8, 사용자 요청) 레슨 트리 재설계 — 등급의 상징대로: 이론(규칙·기초 이론) → 좋음(좋은 습관) → 부정확 → 실수(흔한 실수) → 블런더(두면 안 되는 실수·약점) → 놓친 수 → 우수(기본 전술) → 최선(전략) → 유일(정확한 엔드게임) → 탁월(희생·메이트 패턴) → 마지막은 항상 오프닝 레파토리(이론 수 변형)
{ const want = ["book", "good", "inaccuracy", "mistake", "blunder", "miss", "excellent", "excellent", "best", "only", "brilliant", "book"]; if (STAGES.map((s) => s.grade).join() !== want.join()) fails.push("단계 등급 순서가 설계와 다름: " + STAGES.map((s) => s.grade).join()); }
if (STAGES[STAGES.length - 1].id !== REPERTOIRE_STAGE || STAGES[STAGES.length - 1].variant !== "repertoire") fails.push("오프닝 레파토리 단계가 마지막이 아님");
{ const lastNonOpening = lessons.map((l) => l.stage).lastIndexOf(STAGES[STAGES.length - 2].id), firstOpening = lessons.findIndex((l) => l.stage === REPERTOIRE_STAGE); if (firstOpening < 0 || firstOpening < lastNonOpening) fails.push("오프닝별 레슨이 레슨 경로의 가장 마지막이 아님"); }
{ const p = orderProblems(); for (const k of ["missing", "dup", "unknown"]) if (p[k].length) fails.push("레슨 트리(ORDER) " + k + ": " + p[k].join(", ")); }
// (v0.7.7, 사용자 요청 "레슨 분량을 더") 6단계(오프닝, 자동 생성) 밖의 레슨은 스텝이 5개 이상, 오프닝 레슨은 6개(설명 → 두기 → 계획 → 이름 → 첫 수 → 설명 없이 복습)
for (const l of lessons) { const n = l.steps().length, min = l.stage === REPERTOIRE_STAGE ? 7 : 8; if (n < min) fails.push(l.id + ": 스텝 " + n + "개 — 레슨 분량이 너무 짧음(" + min + "개 이상)"); }
if (lessons.length < 130) fails.push("레슨 수가 줄었음: " + lessons.length + "개(130개 이상이어야 함)");
// 오프닝 레슨: 수마다 설명이 있고(MEC 또는 보충), 이름 맞히기 보기가 서로 다르며 정답이 그 오프닝 이름이다
for (const l of lessons.filter((x) => x.stage === REPERTOIRE_STAGE)) {
  const st = l.steps().filter((x) => !x.recap), mv = st.find((x) => x.kind === "move"), ch = st.find((x) => x.kind === "choice");   // (v0.7.9) 맨 앞 복습 문제(recap)는 지난 레슨 것
  if (!mv || !ch) { fails.push(l.id + ": 오프닝 레슨에 수 두기·이름 맞히기 스텝이 없음"); continue; }
  mv.line.forEach((g, j) => { if (!g.hint) fails.push(l.id + " 목표" + (j + 1) + ": 힌트 없음"); if (g.say.includes(t("이 오프닝의 다음 수를 두세요."))) fails.push(l.id + " 목표" + (j + 1) + ": MEC 설명이 없는 수 — 수순을 바꾸거나 보충 설명을 넣을 것"); });
  if (new Set(ch.options).size !== ch.options.length) fails.push(l.id + ": 이름 보기 중복");
  if (ch.options[ch.answer] !== l.title()) fails.push(l.id + ": 이름 맞히기 정답이 레슨 이름과 다름");
}
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
// (v0.7.5) 오프닝 레슨은 레슨 경로 배경의 대표 기물·대표 수(app/lessons.jsx OPENING_HERO)가 있어야 하고, 대표 수가 실제 수순에 그 진영의 수로 들어 있어야 한다(금색 강조가 빠지지 않게)
{
  const ui = readFileSync(new URL("../src/app/lessons.jsx", import.meta.url), "utf8");
  const m = /export const OPENING_HERO = \{([\s\S]*?)\n\};/.exec(ui);
  if (!m) fails.push("app/lessons.jsx에서 OPENING_HERO를 찾지 못함");
  const hero = {}; if (m) for (const x of m[1].matchAll(/(\w+): \{ piece: "([PNBRQK])", color: "([wb])", sig: "([^"]+)", aim: "([a-h][1-8])" \}/g)) hero[x[1]] = { color: x[3], sig: x[4] };
  for (const l of lessons.filter((x) => x.stage === REPERTOIRE_STAGE)) {
    const h = hero[l.motif]; if (!h) { fails.push(l.id + ": OPENING_HERO에 " + l.motif + " 없음"); continue; }
    if (!String(l.line).split(" ").some((san, i) => san.replace(/[+#]/g, "") === h.sig && (i % 2 ? "b" : "w") === h.color)) fails.push(l.id + ": 대표 수 " + h.sig + "가 수순에 없음");
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
// (v0.8.0, 사용자 요청 — v0.7.9 방침을 뒤집음) 레슨의 체스 개념 용어는 한국어에서 고유어·한자어로 — 영어 발음 표기가 다시 들어오면 실패
//  (캔디데이트 무브 → 후보 수, 익스체인지 새크리파이스 → 교환 희생 등). 기물 이름(킹·퀸·룩·비숍·나이트·폰), 규칙 이름(체크·체크메이트·캐슬링·
//  프로모션·앙파상·스테일메이트), 대국 단계(오프닝·미들게임·엔드게임), 포지션, 사람·오프닝 이름(필리도르·루세나·아나스타샤·시칠리안 등)은 그대로 둔다.
{
  const { readFileSync: rf, readdirSync: rd } = await import("node:fs");
  const files = [...rd(new URL("../src/lib/lessons/", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => "src/lib/lessons/" + f), "src/lib/lessonPuzzles.js"];
  const lessonSrc = files.map((f) => rf(new URL("../" + f, import.meta.url), "utf8")).join("\n");
  const strs = [...lessonSrc.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]).filter((x) => /[가-힣]/.test(x));
  const OLD = ["캔디데이트", "새크리파이스", "익스체인지", "디스커버드", "아이솔레이티드", "패스드 폰", "더블 폰", "더블폰", "더블 체크", "더블 어택", "퍼페추얼", "포크", "스큐어", "오퍼지션", "템포",
    "오픈 파일", "스퀘어", "프로필락시스", "디플렉션", "디코이", "오버로딩", "인터메조", "엑스레이", "아웃포스트", "브레이크스루", "어드밴티지", "트랩드", "추크츠방", "언더프로모션",
    "스모더드", "풀스 메이트", "스칼라스", "백랭크", "코리도", "리무빙", "디펜더", "인터피어런스", "어트랙션", "클리어런스", "콰이어트", "컷오프", "익스포즈드", "이퀄리티", "어드밴스드",
    "배드 비숍", "굿 비숍", "그릭 기프트", "마이너 피스", "래더", "크러싱", "레이스"];
  const PIN = /(^|[^가-힣])핀([^가-힣]|$|[은을이의과도만에으])/;
  for (const w of OLD) { const hit = strs.find((x) => x.includes(w)); if (hit) fails.push("레슨 용어는 고유어·한자어로(영어 발음 표기 \"" + w + "\"): " + hit.slice(0, 50)); }
  { const hit = strs.find((x) => PIN.test(x)); if (hit) fails.push("레슨 용어는 고유어·한자어로(영어 발음 표기 \"핀\" → 고정): " + hit.slice(0, 50)); }
}

// (v0.7.9, 사용자 요청) 가르친 뒤 묻기 — 객관식 질문은 ① 바로 앞 스텝이 설명(read, 대화 포함)이거나 ② 정답의 낱말 절반 이상이 이미 그 레슨에서
//  나온 것이어야 한다(제목·설명·수 안내·직접 둔 수 포함). 설명 없이 상식으로 풀게 하는 질문이 생기면 curriculumTalkData.js의 TEACH에 설명을 넣을 것.
{
  const strip = (w) => w.replace(/[.,·?!'"()…:「」]/g, "").replace(/(으로|에서|에게|까지|부터|이라|이다|입니다|합니다|하는|하면|해야|으면|은|는|이|가|을|를|과|와|로|에|의|도|만|한|된|할|해)$/, "");
  const words = (x) => String(x).split(/\s+/).map(strip).filter((w) => w.length >= 2);
  const untaught = [];
  for (const l of lessons) {
    let ctx = l.title() + " " + l.sub(), prev = null;
    for (const s of l.body()) {
      if (s.kind === "choice" && !s.review) {
        const ws = words(s.options[s.answer]), hit = ws.filter((w) => ctx.includes(w)).length;
        if (!(prev && prev.kind === "read") && ws.length && hit / ws.length < 0.5) untaught.push(l.id + ": \"" + s.say + "\" (정답 \"" + s.options[s.answer] + "\")");
        ctx += " " + s.options[s.answer];
      }
      ctx += " " + (s.say || "");
      if (s.line && s.fen) { try { const c = new Chess(s.fen); for (const g of s.line) { if (g.say) ctx += " " + g.say; const u = g.goal && g.goal.uci ? g.goal.uci[0] : g.hint; if (u) { const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); if (m) ctx += " " + m.san; } if (g.reply) { const r = c.move({ from: g.reply.slice(0, 2), to: g.reply.slice(2, 4), promotion: g.reply[4] }); if (r) ctx += " " + r.san; } } } catch { /* 합법성은 위에서 검사 */ } }
      prev = s;
    }
  }
  for (const u of untaught) fails.push("설명 전에 묻는 질문 — " + u);
}

// (v0.7.9, 사용자 요청) 레슨 연계 — 첫 레슨을 뺀 모든 레슨에 지난 레슨과 이어지는 대사(LINK)가 있고, 여는 대화에 지난 레슨 복습 문제가 있다.
//  대화 데이터(curriculumTalkData.js·번역)는 scripts/lessonTalk/*.json에서 만든 최신본이어야 한다.
{
  const { LINK, TEACH } = await import("../src/lib/lessons/curriculumTalk.js");
  lessons.forEach((l, i) => {
    if (i && !LINK[l.id]) fails.push(l.id + ": 지난 레슨과 이어지는 대사(LINK)가 없음 — scripts/lessonTalk/에 추가");
    if (i && !l.steps().some((s) => s.recap)) fails.push(l.id + ": 여는 대화에 지난 레슨 복습 문제가 없음");
  });
  for (const id of [...Object.keys(LINK), ...Object.keys(TEACH)]) if (!lessons.some((l) => l.id === id)) fails.push("레슨 대화 데이터에 없는 레슨 id: " + id);
  for (const [id, qs] of Object.entries(TEACH)) { const l = lessons.find((x) => x.id === id); if (!l) continue; const n = l.body().filter((s) => s.kind === "choice" && !s.review).length; for (const k of Object.keys(qs)) if (+k >= n) fails.push(id + ": TEACH " + k + "번 질문이 없음(질문 " + n + "개)"); }
  const { execFileSync } = await import("node:child_process");
  try { execFileSync(process.execPath, [new URL("./build-lesson-talk.mjs", import.meta.url).pathname, "--check"], { stdio: "pipe" }); }
  catch (e) { fails.push(String(e.stderr || e.message).trim()); }
}

// (v0.7.9, 사용자 요청) 레슨 하나는 최소 1분 — 여는 대화(복습)를 뺀 본문만으로 예상 시간이 LESSON_MIN_SECONDS 이상(lessons/duration.js).
{
  const { lessonSeconds, LESSON_MIN_SECONDS } = await import("../src/lib/lessons/duration.js");
  for (const l of lessons) { const sec = lessonSeconds(l.body()); if (sec < LESSON_MIN_SECONDS) fails.push(l.id + ": 예상 " + sec + "초 — 레슨이 1분보다 짧음(curriculumPractice.js에 연습 문제를 더할 것)"); }
}
if (fails.length) { console.error("✗ check-lessons 실패 (" + fails.length + "건)\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-lessons: 단계 " + STAGES.length + "개 · 레슨 " + lessons.length + "개 · 스텝 " + steps + "개(수 두기 목표 " + moves + "개)가 모두 합법이고 정답·힌트·응수가 맞으며, 서버 보상 목록과 일치한다");
