// P2 모의 공격 — breached=true면 공격 성공(취약).
export default [
  { id: "BUG-111", kind: "attack", title: "anon이 일일 퍼즐 캐시 미래 날짜를 선점해 내용 오염",
    async run({ sb }) {
      sb.as("anon", null, `insert into public.daily_puzzle_cache(date,data) values (current_date + 40, '{"fake":"puzzle"}');`);
      const n = sb.admin(`select count(*) from public.daily_puzzle_cache where date = current_date + 40`).out;
      return { breached: n === "1", evidence: n === "1" ? "anon이 40일 뒤 일일 퍼즐을 임의 내용으로 심음" : "삽입 거부" };
    } },
  { id: "BUG-112a", kind: "attack", title: "anon이 puzzle_solve를 반복 호출해 풀이 수(인기 랭킹) 부풀리기",
    async run({ sb }) {
      const call = "select public.puzzle_solve(111111);\n".repeat(50);
      sb.as("anon", null, call);
      const n = Number(sb.admin(`select solves from public.puzzles where no=111111`).out);
      return { breached: n >= 50, evidence: `비로그인 50회 호출 후 solves=${n}` };
    } },
  { id: "BUG-112b", kind: "attack", title: "anon이 풀이 기록(puzzle_solve_events)에 uid 없는 행 대량 삽입",
    async run({ sb }) {
      sb.as("anon", null, `insert into public.puzzle_solve_events(no,uid) select 111111, null from generate_series(1,2000);`);
      const n = Number(sb.admin(`select count(*) from public.puzzle_solve_events`).out);
      return { breached: n >= 2000, evidence: `익명이 한 번에 ${n}행 삽입(제한 없음)` };
    } },
  { id: "BUG-112c", kind: "attack", title: "anon이 퍼즐 테이블에 거대한 data(수 MB)를 가진 퍼즐 대량 삽입",
    async run({ sb }) {
      sb.as("anon", null, `insert into public.puzzles(no,data) select 900000+g, jsonb_build_object('junk', (select string_agg(md5(i::text || g::text), '') from generate_series(1,16000) i)) from generate_series(1,5) g;`);
      const sz = sb.admin(`select coalesce(pg_size_pretty(sum(length(data::text))),'0') from public.puzzles where no>900000`).out;
      const n = sb.admin(`select count(*) from public.puzzles where no>900000`).out;
      return { breached: Number(n) > 0, evidence: Number(n) > 0 ? `익명이 퍼즐 ${n}개(약 ${sz}) 삽입 — 크기·개수 제한 없음` : "REST 직접 삽입 거부(퍼즐 공유는 puzzle_share_put 경유, 크기 상한 있음)" };
    } },
  { id: "BUG-113", kind: "attack", title: "일반 계정이 자기 프로필 pub.xp를 조작해 리더보드 1위 차지",
    async run({ sb, U }) {
      sb.as("authenticated", U.mallory, `update public.profiles set pub = jsonb_build_object('xp', 999999999999) where id='${U.mallory}';`);
      const top = sb.as("anon", null, `select username from public.leaderboard_top(1);`).out;
      return { breached: top === "mallory", evidence: `조작 후 리더보드 1위=${top} (서버가 xp를 검증하지 않음)` };
    } },
  { id: "BUG-113b", kind: "attack", title: "일반 계정이 user_progress에 코인·보유 스킨을 임의로 써넣기",
    async run({ sb, U }) {
      sb.as("authenticated", U.mallory, `insert into public.user_progress(id,progress) values ('${U.mallory}','{"coins":999999999}') on conflict (id) do update set progress=excluded.progress;`);
      const c = sb.admin(`select progress->>'coins' from public.user_progress where id='${U.mallory}'`).out;
      return { breached: c === "999999999", evidence: `서버가 코인 ${c}를 그대로 저장함 (뽑기 비용을 서버가 확인하지 않음)` };
    } },
  { id: "BUG-115", kind: "attack", title: "anon이 아직 리뷰되지 않은 chess.com 대국 번호에 가짜 기보를 선점",
    async run({ sb }) {
      const r = sb.as("anon", null, `select public.reviewed_game_put(123456789, '{"moves":["e4","e5","Qh5","Nc6","Bc4","Nf6","Qxf7#"],"fake":true}'::jsonb);`);
      const n = sb.admin(`select count(*) from public.reviewed_games where cc_id=123456789 and data->>'fake'='true'`).out;
      return { breached: n === "1", evidence: n === "1" ? "가짜 기보가 공유 리뷰 캐시에 저장됨(실제 chess.com 기보와 대조 없음)" : `거부 (${r.out || r.err})` };
    } },
  { id: "BUG-117", kind: "attack", title: "anon이 account_providers로 이메일 가입 여부·방식 열거",
    async run({ sb }) {
      const a = sb.as("anon", null, `select public.account_providers('victim@example.com');`).out;
      const b = sb.as("anon", null, `select public.account_providers('nobody@example.com');`).out;
      return { breached: a !== b, evidence: `가입자: ${a} / 비가입자: ${b} → ${a !== b ? "응답이 달라 가입 여부가 드러남" : "구분 불가"}` };
    } },
  { id: "BUG-118", kind: "attack", title: "anon이 개발자 계정 여부·콘텐츠 편집자 여부 조회",
    async run({ sb, U }) {
      const a = sb.as("anon", null, `select public.is_content_editor('${U.dev}');`).out;
      const b = sb.as("anon", null, `select public._is_dev_account('${U.dev}');`);
      const leaked = a === "t" || b.out === "t";
      return { breached: leaked, evidence: leaked ? `is_content_editor=${a}, _is_dev_account=${b.ok ? b.out : "거부"} — 누가 관리자인지 외부에 노출` : "anon은 두 함수 모두 실행 불가" };
    } },
];
