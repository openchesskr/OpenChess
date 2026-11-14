#!/usr/bin/env node
/** (v0.6.4, BUG-061 재발 방지) 계정 탈퇴가 "모든 데이터 영구 삭제"라는 방침대로 동작하는지 SQL을 정적으로 검사한다.
 *  탈퇴는 7일 유예 후 purge_due_account_deletions → _erase_account가 auth.users 행을 지우고 나머지는 외래키 cascade에 맡기는 구조라, 새 표·컬럼이 이 흐름에서 빠지면 조용히 개인정보가 남는다.
 *   ① 사용자(auth.users)를 참조하는 모든 컬럼은 on delete cascade이거나, 아래 SET_NULL_OK에 이유와 함께 등록된 것만 set null이다.
 *   ② 사용자를 가리키는 이름(uid·user_id·owner·*_by)의 컬럼이 외래키 없이 선언되면 실패 — 탈퇴해도 행이 남는다.
 *   ③ 아이디(username) 사본을 따로 저장하는 컬럼은 (a) 그 행 자체가 사용자 cascade로 지워지거나 (b) _erase_account가 직접 정리하는 표여야 한다.
 *   ④ _erase_account가 진행 중 대국 기권 처리 → 만든 퍼즐 삭제 → auth.users 삭제 순서를 지킨다.
 *   ⑤ (v0.7.2) 7일 유예 구조: request/cancel/my_account_deletion·purge 함수, 매시간 cron, 유예 계정 숨김 정책, 플래그 보호 트리거, 클라이언트가 새 RPC만 부른다.
 *   ⑥ 로그인 없이 열리는 삭제 안내 페이지(/account-deletion)가 라우팅돼 있다(Google Play 데이터 삭제 주소).
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-account-deletion.mjs */
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
const fails = [];

// 사용자가 지워져도 행을 남기는(set null) 컬럼 — 남겨도 되는 이유가 있는 것만 등록한다. 새로 추가하려면 개인정보가 남지 않는지 먼저 확인할 것.
const SET_NULL_OK = {
  "puzzle_solve_events.uid": "풀이 통계 — 사용자 식별 정보 없는 집계용 기록(uid만 비움)",
  "puzzle_line_solve_times.uid": "풀이 시간 통계 — uid만 비움",
  "master_games_dev.created_by": "개발자 콘텐츠의 작성자 표시",
  "daily_puzzle_themes.created_by": "개발자 콘텐츠의 작성자 표시",
  "daily_puzzles_dev.created_by": "개발자 콘텐츠의 작성자 표시",
  "attack_positions.created_by": "개발자 콘텐츠의 작성자 표시",
  "puzzles.creator_uid": "퍼즐은 _erase_account가 직접 지운다(남은 행은 탈퇴 전 데이터)",
  "pvp_games.draw_offered_by": "탈퇴한 쪽 칸만 비운다(대국 행은 상대 기록으로 남음, BUG-065)",
  "pvp_games.rematch_offered_by": "탈퇴한 쪽 칸만 비운다(대국 행은 상대 기록으로 남음, BUG-065)",
  "pvp_games.white_uid": "상대의 대국 기록(기보) 보존 — 탈퇴한 쪽 칸만 비움(BUG-065). 두 사람 모두 탈퇴한 대국은 _erase_account가 지운다",
  "pvp_games.black_uid": "상대의 대국 기록(기보) 보존 — 탈퇴한 쪽 칸만 비움(BUG-065). 두 사람 모두 탈퇴한 대국은 _erase_account가 지운다",
};
// (v0.7.7 BUG-064) 외래키 없이 사용자 uid를 값으로 남기는 컬럼 — 보관 기간이 정해져 있고 정리 함수·cron이 있어야 한다.
//  방침(개인정보처리방침 "신고 내역은 처리 완료 후 일정 기간 보관 후 삭제")에 따라 탈퇴 뒤에도 기간 동안 남는 표. 표 → 정리 함수(매일 cron).
const RETAINED_TABLES = { user_reports: "purge_old_reports" };
for (const [tbl, fn] of Object.entries(RETAINED_TABLES)) {
  if (!new RegExp("create or replace function public\\." + fn + "\\(\\)[\\s\\S]*?delete from public\\." + tbl).test(sql)) fails.push(tbl + ": 탈퇴 후 보관하는 표인데 정리 함수 " + fn + "가 행을 지우지 않음 — 영구히 남는다");
  if (!new RegExp("cron\\.schedule\\([\\s\\S]{0,200}?public\\." + fn + "\\(\\)").test(sql)) fails.push(tbl + ": 정리 함수 " + fn + "를 실행하는 cron이 없음");
}
// 아이디 사본 컬럼: 표 → 이유. 표 자체가 cascade로 지워지면 자동 통과, 아니면 여기에 등록하고 _erase_account가 지워야 한다.
const USERNAME_COPY_HANDLED_BY_FUNCTION = { puzzles: ["creator_username"] };

// 표 선언 파싱: create table … ( … ); + alter table … add column …
const tables = new Map(); // name -> [{col, type, rest}]
for (const m of sql.matchAll(/create table if not exists (?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const cols = [];
  for (const line of m[2].split("\n")) { const c = /^\s*(\w+)\s+(uuid|text|bigint|jsonb|int|integer|numeric|boolean|timestamptz|date)\b(.*)$/.exec(line); if (c) cols.push({ col: c[1], type: c[2], rest: c[3] }); }
  tables.set(m[1], cols);
}
for (const m of sql.matchAll(/alter table (?:if exists )?(?:public\.)?(\w+) add column if not exists (\w+) (uuid|text|bigint)\b([^;]*);/g)) {
  if (!tables.has(m[1])) tables.set(m[1], []);
  tables.get(m[1]).push({ col: m[2], type: m[3], rest: m[4] });
}
const refsUser = (r) => /references auth\.users/.test(r);
const cascades = (r) => /on delete cascade/.test(r);
const usedSetNull = new Set();
for (const [tbl, cols] of tables) {
  if (tbl in RETAINED_TABLES) continue;
  for (const { col, type, rest } of cols) {
    const key = tbl + "." + col;
    if (refsUser(rest)) {
      if (cascades(rest)) continue;
      if (/on delete set null/.test(rest)) { usedSetNull.add(key); if (!(key in SET_NULL_OK)) fails.push(key + ": on delete set null인데 SET_NULL_OK에 없음 — 탈퇴 후 개인정보가 남지 않는지 확인하고 등록하거나 cascade로 바꿀 것"); continue; }
      fails.push(key + ": auth.users를 참조하지만 on delete 동작이 없음(탈퇴 자체가 막힘)");
      continue;
    }
    if (type === "uuid" && /(^|_)(uid|user_id|owner|owner_uid|created_by|creator)$|_uid$|_by$/.test(col) && !/references/.test(rest)) fails.push(key + ": 사용자를 가리키는 컬럼인데 외래키가 없음 — 탈퇴해도 행이 남는다(auth.users(id) on delete cascade로 선언할 것)");
  }
}
for (const k of Object.keys(SET_NULL_OK)) if (!usedSetNull.has(k)) fails.push("SET_NULL_OK의 " + k + "가 SQL에 없음 — 목록에서 지울 것");

// ③ 아이디 사본
for (const [tbl, cols] of tables) {
  const copies = cols.filter((c) => c.type === "text" && /username$/.test(c.col) && c.col !== "username");
  if (!copies.length || tbl in RETAINED_TABLES) continue;
  const rowCascades = cols.some((c) => refsUser(c.rest) && cascades(c.rest));
  for (const c of copies) {
    if (rowCascades) continue;
    if ((USERNAME_COPY_HANDLED_BY_FUNCTION[tbl] || []).includes(c.col)) continue;
    fails.push(tbl + "." + c.col + ": 아이디 사본이 탈퇴 후에도 남는다 — 행이 사용자 cascade로 지워지게 하거나 _erase_account가 정리하게 하고 USERNAME_COPY_HANDLED_BY_FUNCTION에 등록할 것");
  }
}

// ④ 탈퇴 함수 본문
const fm = /create or replace function public\._erase_account\(p_uid uuid\)[\s\S]*?\n(?:end|\$\$)[\s\S]*?\$\$;/.exec(sql);
const body = fm ? fm[0] : "";
if (!body) fails.push("_erase_account 함수가 없음");
else {
  const iResign = body.search(/update public\.pvp_games[\s\S]*?status = case[\s\S]*?where status = 'active'/), iPuz = body.search(/delete from public\.puzzles where creator_uid = v_me/), iUser = body.search(/delete from auth\.users where id = v_me/);
  if (iResign < 0) fails.push("_erase_account가 진행 중인 대국을 기권 처리하지 않음 — 상대 화면에서 결과 없이 사라지고 레이팅이 반영되지 않는다");
  if (iPuz < 0) fails.push("_erase_account가 내가 만든 퍼즐을 지우지 않음 — 작성자 아이디가 남고 누구나 작성자가 될 수 있다");
  if (iUser < 0) fails.push("_erase_account가 auth.users 행을 지우지 않음");
  if (iResign >= 0 && iUser >= 0 && iResign > iUser) fails.push("대국 기권 처리가 auth.users 삭제보다 뒤에 있음 — 이미 cascade로 지워진 뒤라 소용없다");
  if (iPuz >= 0 && iUser >= 0 && iPuz > iUser) fails.push("퍼즐 삭제가 auth.users 삭제보다 뒤에 있음 — creator_uid가 이미 비워져 찾을 수 없다");
}

// ⑤ 7일 유예 구조
for (const fn of ["request_account_deletion", "cancel_account_deletion", "my_account_deletion", "purge_due_account_deletions"]) {
  if (!new RegExp("create or replace function public\\." + fn + "\\(").test(sql)) fails.push(fn + " 함수가 없음 — 유예 후 말소 흐름이 끊긴다");
}
if (/create or replace function public\.delete_own_account/.test(sql)) fails.push("delete_own_account(즉시 삭제)가 다시 생겼음 — 탈퇴는 유예 요청으로만 가능해야 한다");
if (!/cron\.schedule\(\s*'account_deletion_purge_hourly'[\s\S]*?purge_due_account_deletions\(\)/.test(sql)) fails.push("유예 만료 계정을 말소하는 cron(account_deletion_purge_hourly)이 없음 — 요청만 쌓이고 영구히 삭제되지 않는다");
if (!/create policy "profiles select all" on public\.profiles for select using \(deletion_scheduled_at is null or id = auth\.uid\(\)\)/.test(sql)) fails.push("profiles 조회 정책이 탈퇴 유예 계정을 숨기지 않음");
if (!/new\.deletion_scheduled_at := old\.deletion_scheduled_at/.test(sql) || !/oc\.allow_deletion_flag/.test(sql)) fails.push("_profiles_pub_guard가 deletion_scheduled_at 직접 변경을 막지 않음 — 클라이언트가 유예를 임의로 풀거나 걸 수 있다");
const settingsSrc = readFileSync(new URL("../src/app/settings.jsx", import.meta.url), "utf8");
if (/delete_own_account/.test(settingsSrc) || !/request_account_deletion/.test(settingsSrc) || !/cancel_account_deletion/.test(settingsSrc)) fails.push("settings.jsx가 request_account_deletion·cancel_account_deletion을 쓰지 않음");
if (!/my_account_deletion/.test(readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"))) fails.push("App.jsx가 로그인 후 my_account_deletion을 조회하지 않음 — 유예 중 계정에 취소 창이 뜨지 않는다");

// ⑤-2 (v0.7.7 BUG-136) 유예 중인 계정은 서버가 새 행동을 막고, SECURITY DEFINER 조회(정책 우회)에서도 숨긴다.
{
  const fnBody = (name) => { const m = sql.match(new RegExp("create or replace function public\\." + name + "\\([\\s\\S]*?\\$\\$;")); return m ? m[0] : ""; };
  if (!/deletion_scheduled_at is not null/.test(fnBody("chat_blocked_between"))) fails.push("chat_blocked_between이 탈퇴 유예 계정을 연락 불가로 보지 않음(BUG-136) — 친구 요청·도전장·채팅이 서버에서 막히지 않는다");
  for (const fn of ["pvp_queue_join", "puzzle_like_toggle", "puzzle_repost_toggle", "legacy_like_toggle", "legacy_repost_toggle"]) if (!/my_deletion_pending\(\)/.test(fnBody(fn))) fails.push(fn + "가 탈퇴 유예 중인 호출자를 막지 않음(BUG-136)");
  for (const fn of ["friend_accept", "pvp_invite_respond"]) if (!/chat_blocked_between\(/.test(fnBody(fn))) fails.push(fn + "가 유예·차단 관계를 확인하지 않음(BUG-136)");
  for (const pol of ["likes insert", "reposts insert", "move notes insert", "legacy likes insert", "reactions insert", "poll votes insert", "quiz answers insert"]) {
    const m = sql.match(new RegExp('create policy "' + pol + '"[^;]*;'));
    if (!m || !/not public\.my_deletion_pending\(\)/.test(m[0])) fails.push('정책 "' + pol + '"가 탈퇴 유예 계정의 쓰기를 막지 않음(BUG-136)');
  }
  for (const fn of ["friend_suggestions", "minigame_leaderboard", "profile_recent_games"]) if (!/deletion_scheduled_at is (not )?null/.test(fnBody(fn))) fails.push(fn + "(SECURITY DEFINER)가 탈퇴 유예 계정을 숨기지 않음(BUG-136)");
  if (!/'my_deletion_pending'/.test(sql)) fails.push("my_deletion_pending이 함수 허용 목록에 없음 — 이 함수를 부르는 정책이 permission denied로 깨진다");
  const iCol = sql.indexOf("add column if not exists deletion_scheduled_at"), iUse = sql.indexOf("create or replace function public.chat_blocked_between");
  if (iCol < 0 || iCol > iUse) fails.push("deletion_scheduled_at 컬럼이 chat_blocked_between보다 뒤에 생김 — 처음 실행 때 함수 생성이 실패한다");
}

// ⑥ 삭제 안내 페이지
const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
if (!/"\/account-deletion"/.test(main)) fails.push("src/main.jsx에 /account-deletion 라우트가 없음(스토어 데이터 삭제 주소)");
if (!/DELETION\b/.test(readFileSync(new URL("../src/LegalPage.jsx", import.meta.url), "utf8"))) fails.push("LegalPage에 삭제 안내 내용이 없음");

if (fails.length) { console.error("✖ check-account-deletion 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-account-deletion: 사용자 참조 컬럼이 모두 cascade이거나 등록된 예외이고, 탈퇴 함수가 대국·퍼즐을 먼저 정리하며, 삭제 안내 페이지가 연결돼 있다");
