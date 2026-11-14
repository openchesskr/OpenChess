// (v0.7.7) 탈퇴 관련 모의 공격·정상 기능 확인 — BUG-136(유예 중 계정), BUG-064(신고 보관), BUG-065(상대 기보 보존).
// breached=true면 공격 성공(취약) 또는 정상 기능이 깨짐(kind: hold).
const pend = (sb, uid) => sb.admin(`select set_config('oc.allow_deletion_flag','1',false); update public.profiles set deletion_scheduled_at = now() + interval '7 days' where id='${uid}';`);
const first = (r) => (r.err || "").split("\n")[0].replace(/^ERROR:\s*/, "").slice(0, 50);

export default [
  { id: "BUG-136", kind: "attack", title: "탈퇴 유예 중인 계정이 API를 직접 불러 친구 요청·채팅·대국 매칭·좋아요·수 설명을 계속 함",
    async run({ sb, U }) {
      pend(sb, U.victim);
      const tries = {
        "친구 요청": sb.as("authenticated", U.victim, `select public.friend_request('mallory') as r;`),
        "채팅": sb.as("authenticated", U.victim, `insert into public.chat_messages(from_uid,to_uid,body) values ('${U.victim}','${U.bob}','유예 중');`),
        "대국 매칭": sb.as("authenticated", U.victim, `select id from public.pvp_queue_join('600-0','chess');`),
        "도전장": sb.as("authenticated", U.victim, `select id from public.pvp_invite_friend('${U.bob}','600-0','chess');`),
        "좋아요": sb.as("authenticated", U.victim, `select * from public.puzzle_like_toggle(111111);`),
        "수 설명": sb.as("authenticated", U.victim, `insert into public.move_notes(uid, move_key, body) values ('${U.victim}', 'x', '유예 중');`),
      };
      const through = Object.entries(tries).filter(([k, r]) => r.ok && !(k === "친구 요청" && /blocked/.test(r.out))).map(([k]) => k);
      return { breached: through.length > 0, evidence: through.length ? "통과: " + through.join(", ") : "6가지 모두 거부(" + Object.entries(tries).map(([k, r]) => k + "=" + (r.ok ? r.out.trim() : first(r))).join(" · ") + ")" };
    } },
  { id: "BUG-136b", kind: "attack", title: "탈퇴 유예 중인 상대에게 다른 사용자가 채팅·친구 요청을 보내거나, 추천·랭킹·대국 목록에 유예 계정이 보임",
    async run({ sb, U }) {
      pend(sb, U.victim);
      const chat = sb.as("authenticated", U.bob, `insert into public.chat_messages(from_uid,to_uid,body) values ('${U.bob}','${U.victim}','hi');`);
      const fr = sb.as("authenticated", U.mallory, `select public.friend_request('victim');`);
      sb.admin(`insert into public.friend_edges(from_uid,to_uid,status) values ('${U.mallory}','${U.bob}','accepted') on conflict do nothing`);
      const sug = sb.as("authenticated", U.mallory, `select count(*) from public.friend_suggestions(20) where id='${U.victim}';`);
      sb.admin(`insert into public.minigame_stats(uid,game,rating,rated_games) values ('${U.victim}','coord',1500,5) on conflict do nothing`);
      const lb = sb.as("authenticated", U.bob, `select count(*) from public.minigame_leaderboard('coord','rating','all',50) where uid='${U.victim}';`);
      sb.admin(`insert into public.pvp_games(white_uid,black_uid,sans,status,time_control,game_type) values ('${U.victim}','${U.bob}','["e4"]','white_won','600-0','chess')`);
      const games = sb.as("authenticated", U.mallory, `select count(*) from public.profile_recent_games('${U.victim}', 50, 0);`);
      const opp = sb.as("authenticated", U.bob, `select count(*) from public.profile_recent_games('${U.bob}', 50, 0) where opp_name is not null;`);
      const leaks = [];
      if (chat.ok) leaks.push("채팅 전송됨");
      if (!/blocked|notfound/.test(fr.out || "")) leaks.push("친구 요청 " + (fr.out || first(fr)));
      if (sug.out.trim() !== "0") leaks.push("친구 추천에 보임");
      if (lb.out.trim() !== "0") leaks.push("미니게임 랭킹에 보임");
      if (games.out.trim() !== "0") leaks.push("대국 목록 " + games.out.trim() + "건 보임");
      if (opp.out.trim() !== "0") leaks.push("상대 이름 보임");
      return { breached: leaks.length > 0, evidence: leaks.length ? leaks.join(", ") : "채팅·친구 요청 거부, 추천·랭킹·대국 목록·상대 이름 모두 숨김" };
    } },
  { id: "BUG-136c", kind: "hold", title: "정상 기능 유지: 탈퇴를 취소하면 친구 요청·채팅·매칭이 다시 되고, 본인은 유예 중에도 자기 대국 목록을 봄",
    async run({ sb, U }) {
      pend(sb, U.victim);
      const own = sb.as("authenticated", U.victim, `select count(*) from public.profile_recent_games('${U.victim}', 50, 0);`);
      const cancel = sb.as("authenticated", U.victim, `select public.cancel_account_deletion();`);
      const errs = [];
      if (!own.ok) errs.push("본인 대국 목록: " + first(own));
      if (!cancel.ok) errs.push("취소: " + first(cancel));
      const chat = sb.as("authenticated", U.victim, `insert into public.chat_messages(from_uid,to_uid,body) values ('${U.victim}','${U.bob}','다시');`);
      if (!chat.ok) errs.push("채팅: " + first(chat));
      const fr = sb.as("authenticated", U.victim, `select public.friend_request('mallory');`);
      if (!fr.ok || !/pending|accepted/.test(fr.out)) errs.push("친구 요청: " + (fr.out || first(fr)));
      const like = sb.as("authenticated", U.victim, `select * from public.puzzle_like_toggle(111111);`);
      if (!like.ok) errs.push("좋아요: " + first(like));
      const note = sb.as("authenticated", U.bob, `insert into public.move_notes(uid, move_key, body) values ('${U.bob}', 'x', '일반 사용자 수 설명');`);
      if (!note.ok) errs.push("일반 사용자 수 설명: " + first(note));   // 정책이 부르는 my_deletion_pending 실행 권한(허용 목록) 확인
      return { breached: errs.length > 0, evidence: errs.length ? "깨짐: " + errs.join(" | ") : "취소 후 채팅·친구 요청·좋아요 정상, 일반 사용자 수 설명 정상, 유예 중 본인 조회 정상" };
    } },
  { id: "BUG-064", kind: "hold", title: "신고 보관: 신고당한 사람이 탈퇴해도 신고(메시지 사본·아이디)가 남아 개발자가 볼 수 있고, 보관 기간이 지나면 지워짐",
    async run({ sb, U }) {
      // 말소는 되돌릴 수 없어 한 트랜잭션 안에서 확인하고 rollback한다(뒤 공격의 공용 시드를 지키기 위해).
      const r = sb.admin(`begin;
        set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${U.victim}","role":"authenticated"}', true);
        select public.user_report('${U.mallory}', null, 'abuse', '괴롭힘') is not null;
        reset role;
        select public._erase_account('${U.mallory}');
        select count(*) from public.user_reports where target_uid = '${U.mallory}';
        set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${U.dev}","role":"authenticated"}', true);
        select target_username from public.reports_for_dev(50) limit 1;
        reset role;
        update public.user_reports set status = 'done', resolved_at = now() - interval '13 months';
        select public.purge_old_reports();
        select count(*) from public.user_reports;
        rollback;`);
      if (!r.ok) return { breached: true, evidence: "실행 실패: " + first(r) };
      const out = r.out.split("\n").filter((l) => l !== "" && !l.startsWith("{"));
      const [made, kept, devName, purged, left] = out;
      const ok = made === "t" && kept === "1" && devName === "mallory" && purged === "1" && left === "0";
      return { breached: !ok, evidence: ok ? "탈퇴 뒤에도 신고 1건 보관·개발자 열람(아이디 mallory), 처리 후 13개월 지난 신고는 정리됨" : "기대와 다름: " + out.join(" / ") };
    } },
  { id: "BUG-065", kind: "hold", title: "상대 기보 보존: 한 사람이 탈퇴해도 상대의 끝난 대국은 남고, 빈 칸으로 재대결·새 대국은 만들 수 없음",
    async run({ sb, U }) {
      const r = sb.admin(`begin;
        insert into public.pvp_games(white_uid,black_uid,sans,status,time_control,game_type) values ('${U.mallory}','${U.bob}','["e4","e5"]','black_won','600-0','chess');
        select public._erase_account('${U.mallory}');
        select count(*) from public.pvp_games where white_uid is null and black_uid = '${U.bob}';
        set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${U.bob}","role":"authenticated"}', true);
        select count(*) from public.profile_recent_games('${U.bob}', 50, 0) where kind = 'pvp';
        select count(*) from public.pvp_games where white_uid is null;
        reset role;
        rollback;`);
      if (!r.ok) return { breached: true, evidence: "실행 실패: " + first(r) };
      const [kept, listed, visible] = r.out.split("\n").filter((l) => l !== "" && !l.startsWith("{") && l !== "");
      const insertNull = sb.admin(`insert into public.pvp_games(white_uid,black_uid,status) values (null,'${U.bob}','active');`);
      const both = sb.admin(`begin; insert into public.pvp_games(white_uid,black_uid,sans,status) values ('${U.mallory}','${U.dev}','["d4"]','draw'); select public._erase_account('${U.mallory}'); select public._erase_account('${U.dev}');
        select count(*) from public.pvp_games where white_uid is null and black_uid is null; rollback;`);
      const orphan = (both.out || "").split("\n").filter((l) => /^\d+$/.test(l)).pop();
      const ok = Number(kept) >= 1 && Number(listed) >= 1 && Number(visible) >= 1 && !insertNull.ok && orphan === "0";
      return { breached: !ok, evidence: ok ? `탈퇴 후 상대 대국 ${kept}건 보존·목록 ${listed}건 표시, 빈 칸 진행 대국 생성 거부(${first(insertNull)}), 양쪽 탈퇴 대국은 삭제` : `기대와 다름: 보존 ${kept}, 목록 ${listed}, 조회 ${visible}, 빈 칸 생성 ${insertNull.ok ? "허용됨" : "거부"}, 양쪽 탈퇴 잔여 ${orphan} ${both.ok ? "" : first(both)}` };
    } },
];
