import { idForNo } from "../ids.mjs";
// P1 모의 공격 — 각 항목은 breached=true면 "공격 성공(취약)". 수정 뒤에는 전부 false(막힘)여야 한다.
export default [
  { id: "BUG-107", kind: "attack", title: "비로그인(anon)으로 아이디 → 이메일 수집",
    async run({ sb }) {
      const r = sb.as("anon", null, `select public.email_for_username('victim');`);
      const leaked = r.ok && /@/.test(r.out);
      return { breached: leaked, evidence: leaked ? `anon이 victim의 이메일을 받음: ${r.out}` : `거부/빈 응답 (${r.err || r.out || "빈 값"})` };
    } },
  { id: "BUG-107b", kind: "attack", title: "로그인한 일반 계정도 email_for_username으로 타인 이메일 조회 · 서버(service_role)는 정상 조회",
    async run({ sb, U }) {
      const r = sb.as("authenticated", U.mallory, `select public.email_for_username('victim');`);
      const svc = sb.as("service_role", null, `select public.email_for_username('victim');`);
      const leaked = r.ok && /@/.test(r.out);
      return { breached: leaked || !/@/.test(svc.out), evidence: leaked ? "일반 계정이 이메일을 받음: " + r.out : `일반 계정 거부(${r.err.split("\n")[0]}) · 서버 호출은 정상(${svc.out})` };
    } },
  { id: "BUG-108", kind: "attack", title: "일반 로그인 계정이 서버 전용 pvp_finish_verified로 대국 결과를 직접 확정",
    async run({ sb, U, game }) {
      const r = sb.as("authenticated", U.mallory, `select status from public.pvp_finish_verified(${game.mine}, 'white_won');`);
      const a = sb.as("anon", null, `select status from public.pvp_finish_verified(${game.mine}, 'white_won');`);
      const st = sb.admin(`select status from public.pvp_games where id=${game.mine}`).out;
      const svc = sb.as("service_role", null, `select status from public.pvp_finish_verified(${game.others}, 'draw');`);
      return { breached: st === "white_won" || a.ok || !svc.ok, evidence: st === "white_won" ? "mallory가 자기 대국을 white_won(자기 승리)으로 확정함" : `일반 계정·anon 거부(${r.err.split("\n")[0]}) · 서버(service_role) 호출은 ${svc.ok ? "정상" : "실패!"}` };
    } },
  { id: "ACL-1", kind: "attack", title: "함수 권한 감사: 서버 전용·내부 함수(_로 시작, rate_limit_hit 등)를 anon/authenticated가 실행할 수 있는가",
    async run({ sb }) {
      const r = sb.admin(`select string_agg(p.proname || '(' || role || ')', ', ') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        cross join (values ('anon'),('authenticated')) v(role)
        where n.nspname='public' and p.prokind='f' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
          and has_function_privilege(v.role, p.oid, 'execute')
          and (p.proname like '\\_%' or p.proname in ('pvp_finish_verified','email_for_username','rate_limit_hit','handle_new_user','gen_mid'))`);
      return { breached: !!r.out, evidence: r.out ? "브라우저가 실행 가능한 내부 함수: " + r.out : "내부·서버 전용 함수는 브라우저 역할이 실행 불가" };
    } },
  { id: "BUG-109a", kind: "attack", title: "puzzle_like_toggle에 피해자 uid를 넣어 남의 명의로 좋아요",
    async run({ sb, U }) {
      const old = sb.as("authenticated", U.mallory, `select * from public.puzzle_like_toggle(111111, '${U.victim}');`);   // 옛 시그니처(uid 인자)
      sb.as("authenticated", U.mallory, `select * from public.puzzle_like_toggle(111111);`);                              // 새 시그니처는 호출자 본인 명의
      const forged = sb.admin(`select count(*) from public.puzzle_likes where no=111111 and uid='${U.victim}'`).out;
      const mine = sb.admin(`select count(*) from public.puzzle_likes where no=111111 and uid='${U.mallory}'`).out;
      return { breached: forged !== "0", evidence: forged !== "0" ? "victim 명의 좋아요가 기록됨" : `위조 불가(옛 호출: ${old.ok ? "성공?!" : "거부"}) · 정상 호출은 본인 명의로 기록됨(${mine}건)` };
    } },
  { id: "BUG-109b", kind: "attack", title: "puzzle_repost_toggle에 피해자 uid를 넣어 남의 명의로 리포스트",
    async run({ sb, U }) {
      const old = sb.as("authenticated", U.mallory, `select * from public.puzzle_repost_toggle(111111, '${U.victim}');`);
      sb.as("authenticated", U.mallory, `select * from public.puzzle_repost_toggle(111111);`);
      const forged = sb.admin(`select count(*) from public.puzzle_reposts where no=111111 and uid='${U.victim}'`).out;
      const mine = sb.admin(`select count(*) from public.puzzle_reposts where no=111111 and uid='${U.mallory}'`).out;
      return { breached: forged !== "0", evidence: forged !== "0" ? "victim 명의 리포스트가 기록됨" : `위조 불가(옛 호출: ${old.ok ? "성공?!" : "거부"}) · 정상 호출은 본인 명의로 기록됨(${mine}건)` };
    } },
  { id: "BUG-109c", kind: "attack", title: "비로그인(anon)이 좋아요 토글 호출",
    async run({ sb }) {
      const r = sb.as("anon", null, `select * from public.puzzle_like_toggle(111111);`);
      const n = sb.admin(`select count(*) from public.puzzle_likes`).out;
      return { breached: r.ok || n !== "0", evidence: r.ok ? "호출 성공" : "거부: " + (r.err.split("\n")[0] || "권한 없음") };
    } },
  { id: "BUG-110", kind: "attack", title: "비로그인(anon)이 REST update로 퍼즐 내용(data) 덮어쓰기",
    async run({ sb }) {
      const r = sb.as("anon", null, `update public.puzzles set data='{"pwned":true}' where no=111111;`);
      const d = sb.admin(`select data from public.puzzles where no=111111`).out;
      return { breached: /pwned/.test(d), evidence: /pwned/.test(d) ? `퍼즐 111111의 data가 ${d}로 바뀜` : `데이터 그대로 (${r.ok ? "0행 변경" : "거부: " + r.err.split("\n")[0]})` };
    } },
  { id: "BUG-110b", kind: "attack", title: "일반 계정이 puzzle_share_put으로 기존 퍼즐 본문 교체·생성자 탈취 시도",
    async run({ sb, U }) {
      sb.as("authenticated", U.mallory, `select public.puzzle_share_put(111111, '{"id":"${idForNo(111111)}","pwned":true,"themes":["punish"],"creator_uid":"${U.mallory}"}'::jsonb);`);
      const d = sb.admin(`select data::text || ' / creator=' || coalesce(creator_uid::text,'') from public.puzzles where no=111111`).out;
      return { breached: /pwned/.test(d) || d.includes(U.mallory), evidence: /pwned/.test(d) ? "본문이 바뀜: " + d : "본문·생성자 그대로: " + d };
    } },
  { id: "BUG-110c", kind: "attack", title: "puzzle_share_put으로 임의 테마 문자열·거대한 data 주입",
    async run({ sb }) {
      sb.as("anon", null, `select public.puzzle_share_put(111111, '{"id":"${idForNo(111111)}","themes":["<script>alert(1)</script>","punish"]}'::jsonb);`);
      const big = sb.as("anon", null, `select public.puzzle_share_put(222222, jsonb_build_object('id','${idForNo(222222)}','junk', (select string_agg(md5(i::text), '') from generate_series(1,12000) i)));`);
      const d = sb.admin(`select data::text from public.puzzles where no=111111`).out;
      const n = sb.admin(`select count(*) from public.puzzles where no=222222`).out;
      return { breached: /script/.test(d) || n !== "0", evidence: `테마 주입 ${/script/.test(d) ? "성공" : "차단"} · 대용량(약 380KB) 저장 ${n !== "0" ? "성공" : "거부(" + big.err.split("\n")[0] + ")"}` };
    } },
  { id: "BUG-110d", kind: "hold", title: "정상 경로 유지: 비로그인·일반 계정이 새 퍼즐 공유 + 테마 합치기가 되는지",
    async run({ sb, U }) {
      const a = sb.as("anon", null, `select public.puzzle_share_put(333333, '{"id":"${idForNo(333333)}","themes":["punish"]}'::jsonb);`);
      const b = sb.as("authenticated", U.mallory, `select public.puzzle_share_put(333333, '{"id":"${idForNo(333333)}","themes":["sacrifice"]}'::jsonb);`);
      const d = sb.admin(`select data->'themes' from public.puzzles where no=333333`).out;
      const ok = a.ok && b.ok && /punish/.test(d) && /sacrifice/.test(d);
      return { breached: !ok, evidence: ok ? "새 퍼즐 공유와 테마 합치기 정상: " + d : `정상 동작 실패(anon:${a.ok} auth:${b.ok} themes:${d})` };
    } },
  { id: "BUG-121a", kind: "attack", title: "puzzle_share_put으로 id와 맞지 않는 임의 번호를 가짜 내용으로 선점(first-writer squatting)",
    async run({ sb }) {
      const r = sb.as("anon", null, `select public.puzzle_share_put(444444, '{"id":"not-the-matching-id","fake":true}'::jsonb);`);
      const n = sb.admin(`select count(*) from public.puzzles where no=444444`).out;
      return { breached: n !== "0", evidence: n !== "0" ? "임의 번호 444444가 가짜 내용으로 선점됨" : "거부: " + r.err.split("\n")[0] };
    } },
  { id: "BUG-121b", kind: "attack", title: "비로그인이 p_public=false로 비공개 퍼즐을 올려 번호를 숨긴 채 선점",
    async run({ sb }) {
      sb.as("anon", null, `select public.puzzle_share_put(555555, '{"id":"${idForNo(555555)}"}'::jsonb, false);`);
      const v = sb.admin(`select is_public from public.puzzles where no=555555`).out;
      return { breached: v === "f", evidence: v === "f" ? "비공개로 저장됨" : "공개로 저장됨(비로그인의 비공개 지정은 무시)" };
    } },
];
