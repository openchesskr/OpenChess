// (v0.7.1) 채팅 퀴즈·오프닝 룰렛 카드 — 새 컬럼(chat_messages.quiz·roulette)과 답 표(chat_quiz_answers)가 새 구멍이 되지 않는지.
// 모두 kind "hold"(breached=true면 방어가 뚫렸거나, 정상 기능이 깨진 것). 시드: victim(보낸 사람) → bob(받는 사람)은 친구, mallory는 둘과 무관.
const QUIZ = JSON.stringify({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", opts: [{ san: "e4", cp: 30 }, { san: "d4", cp: 25 }, { san: "a3", cp: -20 }], best: "e4" });
const first = (r) => (r.err || "").split("\n")[0].replace(/^ERROR:\s*/, "");
// 퀴즈 카드 하나를 victim → bob으로 만들어 id를 돌려준다(공격이 끝나면 지운다 — 다른 공격의 판정을 오염시키지 않게).
const withQuiz = (sb, U, fn) => {
  const id = sb.admin(`insert into public.chat_messages(from_uid,to_uid,quiz) values ('${U.victim}','${U.bob}','${QUIZ}'::jsonb) returning id`).out.split("\n")[0].trim();
  try { return fn(id); } finally { sb.admin(`delete from public.chat_messages where quiz is not null or roulette is not null`); }
};
export default [
  { id: "Q1", kind: "hold", title: "퀴즈를 낸 사람(victim)이 자기 퀴즈에 답 삽입",
    async run({ sb, U }) {
      return withQuiz(sb, U, (id) => { const r = sb.as("authenticated", U.victim, `insert into public.chat_quiz_answers(message_id,uid,san) values (${id},'${U.victim}','e4');`); return { breached: r.ok, evidence: r.ok ? "삽입됨" : "거부: " + first(r) }; });
    } },
  { id: "Q2", kind: "hold", title: "대화와 무관한 계정(mallory)이 남의 퀴즈에 답 삽입",
    async run({ sb, U }) {
      return withQuiz(sb, U, (id) => { const r = sb.as("authenticated", U.mallory, `insert into public.chat_quiz_answers(message_id,uid,san) values (${id},'${U.mallory}','e4');`); return { breached: r.ok, evidence: r.ok ? "삽입됨" : "거부: " + first(r) }; });
    } },
  { id: "Q3", kind: "hold", title: "정상 기능 유지: 퀴즈를 받은 사람(bob)이 답을 낼 수 있고, 보낸 사람은 그 답을 읽을 수 있음",
    async run({ sb, U }) {
      return withQuiz(sb, U, (id) => {
        const w = sb.as("authenticated", U.bob, `insert into public.chat_quiz_answers(message_id,uid,san) values (${id},'${U.bob}','d4');`);
        const read = sb.as("authenticated", U.victim, `select san from public.chat_quiz_answers where message_id=${id};`);
        const okAll = w.ok && read.ok && read.out.trim() === "d4";
        return { breached: !okAll, evidence: okAll ? "답 저장·보낸 사람 열람 정상" : "깨짐: 쓰기=" + (w.ok ? "ok" : first(w)) + ", 읽기=" + (read.ok ? read.out : first(read)) };
      });
    } },
  { id: "Q4", kind: "hold", title: "받은 사람이 이미 낸 답을 바꾸거나 지움(정답을 본 뒤 고쳐 내기)",
    async run({ sb, U }) {
      return withQuiz(sb, U, (id) => {
        sb.as("authenticated", U.bob, `insert into public.chat_quiz_answers(message_id,uid,san) values (${id},'${U.bob}','d4');`);
        const up = sb.as("authenticated", U.bob, `update public.chat_quiz_answers set san='e4' where message_id=${id};`);
        const del = sb.as("authenticated", U.bob, `delete from public.chat_quiz_answers where message_id=${id};`);
        const again = sb.as("authenticated", U.bob, `insert into public.chat_quiz_answers(message_id,uid,san) values (${id},'${U.bob}','e4');`);
        const now = sb.admin(`select san from public.chat_quiz_answers where message_id=${id}`).out.trim();
        return { breached: now !== "d4" || again.ok, evidence: now === "d4" && !again.ok ? "답은 d4 그대로(수정·삭제·재제출 거부)" : "답이 바뀜/재제출됨: " + now };
      });
    } },
  { id: "Q5", kind: "hold", title: "mallory가 victim·bob의 대화 속 퀴즈 답을 읽음",
    async run({ sb, U }) {
      return withQuiz(sb, U, (id) => {
        sb.admin(`insert into public.chat_quiz_answers(message_id,uid,san) values (${id},'${U.bob}','d4')`);
        const r = sb.as("authenticated", U.mallory, `select count(*) from public.chat_quiz_answers;`);
        return { breached: r.ok && Number(r.out) > 0, evidence: r.ok ? "보이는 행: " + r.out : "거부: " + first(r) };
      });
    } },
  { id: "Q6", kind: "hold", title: "터무니없이 큰 퀴즈·룰렛 payload(대화방을 무겁게 만들기)",
    async run({ sb, U }) {
      const big = JSON.stringify({ fen: "x".repeat(5000) });
      const r1 = sb.as("authenticated", U.victim, `insert into public.chat_messages(from_uid,to_uid,quiz) values ('${U.victim}','${U.bob}','${big}'::jsonb);`);
      const r2 = sb.as("authenticated", U.victim, `insert into public.chat_messages(from_uid,to_uid,roulette) values ('${U.victim}','${U.bob}','${JSON.stringify({ reel: Array(2000).fill("abcdef") })}'::jsonb);`);
      const r3 = sb.as("authenticated", U.victim, `insert into public.chat_messages(from_uid,to_uid,quiz) values ('${U.victim}','${U.bob}','[1,2,3]'::jsonb);`);
      sb.admin(`delete from public.chat_messages where quiz is not null or roulette is not null`);
      return { breached: r1.ok || r2.ok || r3.ok, evidence: (r1.ok || r2.ok || r3.ok) ? "들어감: " + [r1.ok && "큰 퀴즈", r2.ok && "큰 룰렛", r3.ok && "배열 퀴즈"].filter(Boolean).join(", ") : "모두 거부(크기·모양 제약)" };
    } },
  { id: "Q7", kind: "hold", title: "친구가 아닌 계정이 퀴즈·룰렛 카드를 victim에게 전송",
    async run({ sb, U }) {
      const r1 = sb.as("authenticated", U.mallory, `insert into public.chat_messages(from_uid,to_uid,quiz) values ('${U.mallory}','${U.victim}','${QUIZ}'::jsonb);`);
      const r2 = sb.as("authenticated", U.mallory, `insert into public.chat_messages(from_uid,to_uid,roulette) values ('${U.mallory}','${U.victim}','{"ply":2}'::jsonb);`);
      sb.admin(`delete from public.chat_messages where quiz is not null or roulette is not null`);
      return { breached: r1.ok || r2.ok, evidence: r1.ok || r2.ok ? "전송됨" : "거부: " + first(r1) };
    } },
  { id: "Q8", kind: "hold", title: "퀴즈 카드를 chat_edit_message로 텍스트로 바꿔 정답 조작",
    async run({ sb, U }) {
      return withQuiz(sb, U, (id) => {
        const r = sb.as("authenticated", U.victim, `select public.chat_edit_message(${id}, '조작됨');`);
        const b = sb.admin(`select coalesce(body,'') from public.chat_messages where id=${id}`).out.trim();
        return { breached: b === "조작됨", evidence: b === "조작됨" ? "본문이 바뀜" : "그대로(수정 불가)" + (r.ok ? "" : ": " + first(r)) };
      });
    } },
];
