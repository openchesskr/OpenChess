// P1 모의 공격 — 각 항목은 breached=true면 "공격 성공(취약)". 수정 뒤에는 전부 false(막힘)여야 한다.
export default [
  { id: "BUG-107", kind: "attack", title: "비로그인(anon)으로 아이디 → 이메일 수집",
    async run({ sb }) {
      const r = sb.as("anon", null, `select public.email_for_username('victim');`);
      const leaked = r.ok && /@/.test(r.out);
      return { breached: leaked, evidence: leaked ? `anon이 victim의 이메일을 받음: ${r.out}` : `거부/빈 응답 (${r.err || r.out || "빈 값"})` };
    } },
  { id: "BUG-108", kind: "attack", title: "일반 로그인 계정이 서버 전용 pvp_finish_verified로 대국 결과를 직접 확정",
    async run({ sb, U, game }) {
      const r = sb.as("authenticated", U.mallory, `select status from public.pvp_finish_verified(${game.mine}, 'white_won');`);
      const st = sb.admin(`select status from public.pvp_games where id=${game.mine}`).out;
      return { breached: st === "white_won", evidence: st === "white_won" ? "mallory가 자기 대국을 white_won(자기 승리)으로 확정함" : `거부됨 (${r.err.split("\n")[0] || "상태 " + st})` };
    } },
  { id: "BUG-109a", kind: "attack", title: "puzzle_like_toggle에 피해자 uid를 넣어 남의 명의로 좋아요",
    async run({ sb, U }) {
      sb.as("authenticated", U.mallory, `select * from public.puzzle_like_toggle(111111, '${U.victim}');`);
      const n = sb.admin(`select count(*) from public.puzzle_likes where no=111111 and uid='${U.victim}'`).out;
      return { breached: n === "1", evidence: n === "1" ? "victim이 누르지 않은 좋아요가 victim 명의로 기록됨" : "좋아요가 victim 명의로 생기지 않음" };
    } },
  { id: "BUG-109b", kind: "attack", title: "puzzle_repost_toggle에 피해자 uid를 넣어 남의 명의로 리포스트",
    async run({ sb, U }) {
      sb.as("authenticated", U.mallory, `select * from public.puzzle_repost_toggle(111111, '${U.victim}');`);
      const n = sb.admin(`select count(*) from public.puzzle_reposts where no=111111 and uid='${U.victim}'`).out;
      return { breached: n === "1", evidence: n === "1" ? "victim 명의 리포스트가 기록됨" : "victim 명의 리포스트 없음" };
    } },
  { id: "BUG-110", kind: "attack", title: "비로그인(anon)이 REST update로 퍼즐 내용(data) 덮어쓰기",
    async run({ sb }) {
      sb.as("anon", null, `update public.puzzles set data='{"pwned":true}' where no=111111;`);
      const d = sb.admin(`select data from public.puzzles where no=111111`).out;
      return { breached: /pwned/.test(d), evidence: /pwned/.test(d) ? `퍼즐 111111의 data가 ${d}로 바뀜` : "데이터 그대로" };
    } },
];
