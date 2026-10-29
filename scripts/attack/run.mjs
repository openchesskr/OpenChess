#!/usr/bin/env node
/** 모의 공격 하네스(v0.7.0 보안 강화). 일회용 PostgreSQL에 supabase-setup.sql을 올리고, 공격자(anon·일반 로그인 계정) 신분으로
 *  실제 공격을 시도해 뚫리는지 확인한다. 라이브 DB·운영 서버에는 접속하지 않는다.
 *    npm run attack                        전체 실행(하나라도 뚫리면 종료 코드 1)
 *    npm run attack -- --only BUG-107,D4   일부만
 *    npm run attack -- --list              목록만
 *  필요: PostgreSQL 서버 바이너리(Vercel 빌드에는 넣지 않는다 — prebuild가 아니라 수동·CI 실행). */
import { Sandbox } from "./sandbox.mjs";
import dbP1 from "./attacks/db-p1.mjs";
import dbP2 from "./attacks/db-p2.mjs";
import dbHolds from "./attacks/db-holds.mjs";
import apiAttacks from "./attacks/api.mjs";
import regress from "./attacks/db-regress.mjs";
import economy from "./attacks/db-economy.mjs";
import chatCards from "./attacks/db-chat-cards.mjs";
import { idForNo } from "./ids.mjs";
const PID = idForNo(111111);
// 라인 3개짜리 퍼즐: e4 → (e5 Nf3) | (c5 Nf3) | (e6 d4)
const PUZZLE_DATA = JSON.stringify({ orig: true, id: PID, tree: { children: [{ san: "e4", children: [{ san: "e5", children: [{ san: "Nf3" }] }, { san: "c5", children: [{ san: "Nf3" }] }, { san: "e6", children: [{ san: "d4" }] }] }] } });

const args = process.argv.slice(2);
const only = (args.includes("--only") ? args[args.indexOf("--only") + 1] : "").split(",").filter(Boolean);
const ALL = [...dbP1, ...dbP2, ...apiAttacks, ...dbHolds, ...regress, ...economy, ...chatCards];
if (args.includes("--list")) { for (const a of ALL) console.log(a.id.padEnd(9), a.kind.padEnd(7), a.title); process.exit(0); }

export const U = { victim: "11111111-1111-1111-1111-111111111111", mallory: "22222222-2222-2222-2222-222222222222", bob: "33333333-3333-3333-3333-333333333333", dev: "44444444-4444-4444-4444-444444444444" };
const sb = new Sandbox();
let code = 0;
try {
  sb.boot({ log: (m) => console.log("· " + m) });
  const seed = sb.admin(`
    insert into auth.users(id,email,raw_user_meta_data) values
      ('${U.victim}','victim@example.com','{"username":"victim"}'),
      ('${U.mallory}','mallory@example.com','{"username":"mallory"}'),
      ('${U.bob}','bob@example.com','{"username":"bob"}'),
      ('${U.dev}','dev@example.com','{"username":"openchesskr"}');
    insert into auth.identities(user_id,provider) values ('${U.victim}','email'),('${U.bob}','google');
    insert into public.friend_edges(from_uid,to_uid,status) values ('${U.victim}','${U.bob}','accepted');
    insert into public.chat_messages(from_uid,to_uid,body) values ('${U.victim}','${U.bob}','안녕 밥');
    insert into public.puzzles(no,data,creator_uid,creator_username) values (111111,'${PUZZLE_DATA}','${U.victim}','victim');
    insert into public.pvp_games(white_uid,black_uid,sans,status,time_control,game_type) values ('${U.mallory}','${U.victim}','[]','active','600-0','chess');
    insert into public.pvp_games(white_uid,black_uid,sans,status,time_control,game_type) values ('${U.victim}','${U.bob}','[]','active','600-0','chess');
    insert into public.user_progress(id,progress) values ('${U.victim}','{"coins":777}');
  `);
  if (!seed.ok) throw new Error("시드 실패: " + seed.err);
  const ctx = { sb, U, game: { mine: 1, others: 2 } };
  const rows = [];
  // 공격마다 깨끗한 상태에서 시작하도록, 공격이 바꿀 수 있는 고정 데이터를 되돌린다(앞 공격의 흔적이 뒤 공격 판정을 오염시키지 않게).
  const reset = () => sb.admin(`
    update public.pvp_games set status='active', sans='[]'::jsonb, result_reason=null;
    update public.puzzles set data='${PUZZLE_DATA}'::jsonb, solves=0, likes=0, reposts=0, shares=0 where no=111111;
    delete from public.puzzles where no<>111111;
    delete from public.puzzle_likes; delete from public.puzzle_reposts; delete from public.puzzle_solve_events;
    delete from public.daily_puzzle_cache; delete from public.reviewed_games;
    update public.profiles set pub='{}'::jsonb;
    delete from public.user_progress where id<>'${U.victim}';
    delete from public.chat_messages where from_uid<>'${U.victim}';
    update public.chat_messages set body='안녕 밥';
    delete from public.notifications; delete from public.text_translations;
    delete from public.friend_edges where not (from_uid='${U.victim}' and to_uid='${U.bob}');
    delete from public.app_content;
    delete from public.economy_ledger; delete from public.economy_claims; delete from public.economy_anomalies; delete from public.economy; delete from public.rate_limits;
    delete from public.user_progress where id<>'${U.victim}';
    update public.profiles set pub='{}'::jsonb;
  `);
  for (const a of ALL) {
    if (only.length && !only.some((o) => a.id === o || a.id.startsWith(o))) continue;
    const rs = reset(); if (!rs.ok) throw new Error("초기화 실패: " + rs.err);
    let res;
    try { res = await a.run(ctx); } catch (e) { res = { breached: null, evidence: "실행 오류: " + (e.message || e) }; }
    rows.push({ a, res });
    const tag = res.breached === null ? "⚪ ERROR    " : res.breached ? "🔴 BREACHED " : "🟢 BLOCKED  ";
    console.log(`${tag}${a.id.padEnd(8)} ${a.title}\n             ↳ ${res.evidence}`);
  }
  const breached = rows.filter((r) => r.res.breached === true), errors = rows.filter((r) => r.res.breached === null);
  console.log(`\n=== 공격 ${rows.length}건: 뚫림 ${breached.length} / 막힘 ${rows.length - breached.length - errors.length} / 오류 ${errors.length} ===`);
  if (breached.length) console.log("뚫린 항목: " + breached.map((r) => r.a.id).join(", "));
  code = breached.length || errors.length ? 1 : 0;
} catch (e) {
  console.error("하네스 실패:", e.message); code = 2;
} finally { sb.stop(); }
process.exit(code);
