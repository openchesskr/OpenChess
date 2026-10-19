// 보안 강화가 정상 기능을 망가뜨리지 않았는지 확인하는 항목(kind: "hold" — breached=true면 '기능이 깨짐').
const NO_PERM = /permission denied|does not exist|must be owner/i;
const TABLES_FOR_GUEST = ["puzzles", "profiles", "move_notes_with_votes", "move_notes", "app_content", "daily_puzzle_cache", "daily_puzzle_picks", "puzzle_solvers", "puzzle_likes", "puzzle_reposts", "reviewed_games", "legacy_like_counts", "presence", "minigame_stats", "master_games_dev", "daily_puzzle_themes", "daily_puzzles_dev", "attack_positions", "game_analyses", "puzzle_line_solve_times", "puzzle_solve_events"];

function smoke(sb, role, uid) {
  const fns = sb.admin(`select p.proname || '|' || coalesce(string_agg(format_type(t,null), ',' order by ord), '')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    left join lateral unnest(p.proargtypes::oid[]) with ordinality u(t, ord) on true
    where n.nspname='public' and p.prokind='f' and has_function_privilege('${role}', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
    group by p.oid, p.proname order by 1`).out.split("\n").filter(Boolean);
  const bad = [];
  for (const row of fns) {
    const [name, types] = row.split("|");
    const args = types ? types.split(",").map((ty) => `null::${ty}`).join(", ") : "";
    const r = sb.as(role, uid, `select public.${name}(${args});`, { rollback: true });   // 계정 삭제 같은 함수가 공용 시드를 지우지 않게 되돌린다
    if (!r.ok && NO_PERM.test(r.err)) bad.push(name + ": " + r.err.split("\n")[0].replace(/^ERROR:\s*/, ""));
  }
  return { n: fns.length, bad };
}

export default [
  { id: "R1", kind: "hold", title: "정상 기능 유지: 비로그인 방문자가 읽는 표·뷰·함수가 권한 오류 없이 동작",
    async run({ sb, U }) {
      sb.admin(`insert into public.puzzles(no,data) values (5,'{"a":1}') on conflict do nothing`);
      const errs = [];
      for (const t of TABLES_FOR_GUEST) { const r = sb.as("anon", null, `select count(*) from public.${t};`); if (!r.ok) errs.push(t + ": " + r.err.split("\n")[0]); }
      for (const q of ["select count(*) from public.search_puzzles_prefix('1', 5)", "select count(*) from public.profiles_search_by_mid_prefix('1', 5)", "select count(*) from public.puzzle_rank('day', 5)", "select count(*) from public.leaderboard_top(5)", "select public.username_available('zzz')", "select public.puzzle_solve(5)"]) {
        const r = sb.as("anon", null, q); if (!r.ok) errs.push(q.slice(0, 50) + ": " + r.err.split("\n")[0]);
      }
      return { breached: errs.length > 0, evidence: errs.length ? "깨짐: " + errs.join(" | ") : `비로그인 조회 ${TABLES_FOR_GUEST.length}개 표·뷰 + 함수 6개 정상` };
    } },
  { id: "R2", kind: "hold", title: "정상 기능 유지: 브라우저 역할(anon·로그인)이 실행 가능한 모든 함수가 권한 오류 없이 도달(null 인자 스모크)",
    async run({ sb, U }) {
      const a = smoke(sb, "anon", null), b = smoke(sb, "authenticated", U.victim);
      const bad = [...a.bad.map((x) => "anon." + x), ...b.bad.map((x) => "auth." + x)];
      return { breached: bad.length > 0, evidence: bad.length ? "권한 오류: " + bad.join(" | ") : `anon ${a.n}개·로그인 ${b.n}개 함수 모두 권한 오류 없음` };
    } },
  { id: "R3", kind: "hold", title: "정상 기능 유지: 로그인 사용자의 일상 동작(좋아요·퍼즐 공유·접속 표시·친구 요청·채팅)",
    async run({ sb, U }) {
      const errs = [];
      const run = (label, role, uid, q) => { const r = sb.as(role, uid, q); if (!r.ok) errs.push(label + ": " + r.err.split("\n")[0]); };
      run("좋아요", "authenticated", U.bob, `select * from public.puzzle_like_toggle(111111);`);
      run("리포스트", "authenticated", U.bob, `select * from public.puzzle_repost_toggle(111111);`);
      run("접속 표시", "authenticated", U.bob, `select public.touch_presence();`);
      run("친구 요청", "authenticated", U.mallory, `select public.friend_request('bob');`);
      run("채팅 전송", "authenticated", U.bob, `insert into public.chat_messages(from_uid,to_uid,body) values ('${U.bob}','${U.victim}','hi');`);
      run("생성자 선점", "authenticated", U.bob, `select public.puzzle_claim_creator(111111);`);
      run("편집자 정책(콘텐츠 쓰기는 거부가 정상)", "anon", null, `select count(*) from public.app_content;`);
      return { breached: errs.length > 0, evidence: errs.length ? "깨짐: " + errs.join(" | ") : "일상 동작 7종 정상" };
    } },
];
