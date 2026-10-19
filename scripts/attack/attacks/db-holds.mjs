// "방어가 유지되는지" 확인하는 공격 — 지금 막혀 있어야 하고(breached=false), 나중에 뚫리면 회귀다.
const deny = (r) => !r.ok;
export default [
  { id: "D1", kind: "hold", title: "anon이 비공개 테이블(user_progress·chat·notifications·bot_games·user_reports·text_translations) 읽기",
    async run({ sb }) {
      const leaks = [];
      for (const t of ["user_progress", "chat_messages", "notifications", "bot_games", "user_reports", "text_translations", "friend_edges", "pvp_invites"]) {
        const r = sb.as("anon", null, `select count(*) from public.${t};`);
        if (r.ok && Number(r.out) > 0) leaks.push(`${t}(${r.out}행)`);
      }
      return { breached: leaks.length > 0, evidence: leaks.length ? "읽힘: " + leaks.join(", ") : "전부 0행 또는 권한 거부" };
    } },
  { id: "D2", kind: "hold", title: "다른 계정(mallory)이 victim의 user_progress(코인·진행도) 읽기",
    async run({ sb, U }) {
      const r = sb.as("authenticated", U.mallory, `select progress from public.user_progress where id='${U.victim}';`);
      return { breached: r.ok && r.out.includes("777"), evidence: r.out ? "읽힘: " + r.out : "0행" };
    } },
  { id: "D3", kind: "hold", title: "다른 계정이 victim 프로필 수정",
    async run({ sb, U }) {
      sb.as("authenticated", U.mallory, `update public.profiles set pub='{"hacked":1}' where id='${U.victim}';`);
      const p = sb.admin(`select pub from public.profiles where id='${U.victim}'`).out;
      return { breached: /hacked/.test(p), evidence: /hacked/.test(p) ? "victim 프로필이 바뀜" : "그대로" };
    } },
  { id: "D4", kind: "hold", title: "친구가 아닌 계정이 victim에게 채팅 전송",
    async run({ sb, U }) {
      const r = sb.as("authenticated", U.mallory, `insert into public.chat_messages(from_uid,to_uid,body) values ('${U.mallory}','${U.victim}','스팸');`);
      return { breached: r.ok, evidence: r.ok ? "전송됨" : "거부: " + r.err.split("\n")[0] };
    } },
  { id: "D5", kind: "hold", title: "다른 사람 명의(from_uid 위조)로 채팅 전송",
    async run({ sb, U }) {
      const r = sb.as("authenticated", U.bob, `insert into public.chat_messages(from_uid,to_uid,body) values ('${U.mallory}','${U.victim}','위조');`);
      return { breached: r.ok, evidence: r.ok ? "위조 전송됨" : "거부: " + r.err.split("\n")[0] };
    } },
  { id: "D6", kind: "hold", title: "알림 위조: 관계 없는 계정이 victim에게 friend_request 알림 삽입",
    async run({ sb, U }) {
      const r = sb.as("authenticated", U.mallory, `insert into public.notifications(to_uid,kind) values ('${U.victim}','friend_request');`);
      return { breached: r.ok, evidence: r.ok ? "삽입됨" : "거부: " + r.err.split("\n")[0] };
    } },
  { id: "D7", kind: "hold", title: "채팅 수신자(bob)가 victim이 보낸 메시지 본문 수정(BUG-022)",
    async run({ sb, U }) {
      sb.as("authenticated", U.bob, `update public.chat_messages set body='변조됨' where from_uid='${U.victim}';`);
      const b = sb.admin(`select body from public.chat_messages where from_uid='${U.victim}' limit 1`).out;
      return { breached: b === "변조됨", evidence: b === "변조됨" ? "본문이 변조됨" : "본문 그대로: " + b };
    } },
  { id: "D8", kind: "hold", title: "REST로 puzzles.solves 카운터 직접 수정",
    async run({ sb, U }) {
      const r = sb.as("authenticated", U.mallory, `update public.puzzles set solves=999999 where no=111111;`);
      const n = sb.admin(`select solves from public.puzzles where no=111111`).out;
      return { breached: Number(n) === 999999, evidence: r.ok ? "solves=" + n : "거부: " + r.err.split("\n")[0] };
    } },
  { id: "D9", kind: "hold", title: "대국 당사자가 pvp_finish로 스스로 승리 선언",
    async run({ sb, U, game }) {
      const r = sb.as("authenticated", U.mallory, `select status from public.pvp_finish(${game.mine}, 'white_won');`);
      const st = sb.admin(`select status from public.pvp_games where id=${game.mine}`).out;
      return { breached: st === "white_won", evidence: r.ok ? "상태=" + st : "거부: " + r.err.split("\n")[0] };
    } },
  { id: "D10", kind: "hold", title: "대국 참가자가 아닌 계정이 pvp_move로 남의 대국에 수 두기",
    async run({ sb, U, game }) {
      const r = sb.as("authenticated", U.mallory, `select pvp_move(${game.others}, 'e4');`);
      const s = sb.admin(`select sans from public.pvp_games where id=${game.others}`).out;
      return { breached: s !== "[]", evidence: r.ok ? "sans=" + s : "거부: " + r.err.split("\n")[0] };
    } },
  { id: "D11", kind: "hold", title: "일반 계정이 공유 콘텐츠(app_content) 쓰기",
    async run({ sb, U }) {
      const r = sb.as("authenticated", U.mallory, `insert into public.app_content(key,value) values ('global','{"codev":["mallory"]}') on conflict (key) do update set value=excluded.value;`);
      return { breached: r.ok, evidence: r.ok ? "쓰기 성공(편집자 승격 가능)" : "거부: " + r.err.split("\n")[0] };
    } },
  { id: "D12", kind: "hold", title: "일반 계정이 text_translations(번역 캐시)에 번역 위조 삽입",
    async run({ sb, U }) {
      const r = sb.as("authenticated", U.mallory, `insert into public.text_translations(hash,target,translated,same) values ('deadbeef','ko','위조',false);`);
      return { breached: r.ok, evidence: r.ok ? "삽입됨" : "거부: " + r.err.split("\n")[0] };
    } },
  { id: "D13", kind: "hold", title: "다른 계정 삭제(delete_own_account는 본인만) · 타인 uid로 친구 수락 위조",
    async run({ sb, U }) {
      const r = sb.as("authenticated", U.mallory, `select public.friend_accept('${U.victim}');`);
      const n = sb.admin(`select count(*) from public.friend_edges where (from_uid='${U.mallory}' or to_uid='${U.mallory}') and status='accepted'`).out;
      return { breached: n !== "0", evidence: n !== "0" ? "친구 관계가 만들어짐" : "친구 관계 없음 (" + (r.ok ? r.out : r.err.split("\n")[0]) + ")" };
    } },
  { id: "BUG-119", kind: "attack", title: "진행 중 대국 열람: 비로그인 · 대국자와 친구가 아닌 로그인 계정이 대국자 uid·수순을 읽기 / 친구의 관전은 유지",
    async run({ sb, U }) {
      // 시드: 대국 1 = mallory(백) vs victim(흑), 대국 2 = victim(백) vs bob(흑). victim-bob은 친구.
      const anon = sb.as("anon", null, `select count(*) from public.pvp_games;`).out;
      const stranger = sb.as("authenticated", U.dev, `select count(*) from public.pvp_games;`).out;            // dev는 아무와도 친구 아님
      const mallory = sb.as("authenticated", U.mallory, `select count(*) from public.pvp_games where id=2;`).out;   // mallory는 victim/bob과 친구 아님(1번 대국 참가자일 뿐)
      sb.admin(`insert into public.friend_edges(from_uid,to_uid,status) values ('${U.dev}','${U.bob}','accepted') on conflict do nothing`);
      const friend = sb.as("authenticated", U.dev, `select count(*) from public.pvp_games where id=2;`).out;      // dev는 bob(대국자)의 친구 → 관전 가능
      const mine = sb.as("authenticated", U.victim, `select count(*) from public.pvp_games;`).out;               // 참가자는 자기 대국 모두
      return { breached: anon !== "0" || stranger !== "0" || mallory !== "0" || friend !== "1" || mine !== "2", evidence: `비로그인 ${anon}건·낯선 로그인 ${stranger}건·친구 아닌 계정이 남의 대국 ${mallory}건 읽음(모두 0이어야 함) · 대국자의 친구가 관전 ${friend}건 · 참가자 본인 ${mine}건` };
    } },
];
