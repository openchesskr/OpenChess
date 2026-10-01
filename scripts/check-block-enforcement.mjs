#!/usr/bin/env node
/** (v0.6.0, 스토어 심사 대비) 차단은 "서로 연락 불가"를 서버가 강제해야 한다. 사용자끼리 연락이 시작되는 모든 서버 경로가
 *  chat_blocked_between을 거치는지, 그 함수가 쓰이는 곳보다 먼저 정의되는지 검사한다(클라이언트만 막으면 REST로 우회 가능).
 *  새 "상대에게 무언가를 보내는" RPC·정책을 만들면 아래 CONTACT_PATHS에 추가한다.
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-block-enforcement.mjs
 */
import { readFileSync } from "node:fs";
import { readAppSource } from "./lib/appSource.mjs";

const sql = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
const fails = [];
const CONTACT_PATHS = [
  { label: "friend_request", re: /create or replace function public\.friend_request\(/ },
  { label: "friend_request_by_mid", re: /create or replace function public\.friend_request_by_mid\(/ },
  { label: "pvp_invite_friend", re: /create or replace function public\.pvp_invite_friend\(/ },
  { label: "chat insert own 정책", re: /create policy "chat insert own"/ },
];
const defAt = sql.search(/create or replace function public\.chat_blocked_between\(/);
if (defAt < 0) fails.push("chat_blocked_between 정의 없음");
for (const { label, re } of CONTACT_PATHS) {
  const at = sql.search(re);
  if (at < 0) { fails.push(label + " 정의를 찾지 못함(이름이 바뀌었으면 이 검사도 갱신)"); continue; }
  if (defAt >= 0 && at < defAt) fails.push(label + "이(가) chat_blocked_between 정의보다 앞에 있음(첫 실행에서 실패)");
  const end = sql.indexOf("\n$$;", at) >= 0 ? Math.min(...[sql.indexOf("\n$$;", at), sql.indexOf("\ncreate policy", at + 10)].filter((n) => n > 0)) : at + 3000;
  if (!/chat_blocked_between\(/.test(sql.slice(at, end))) fails.push(label + "에 차단 확인(chat_blocked_between)이 없음");
}
// 친구 추천도 차단 관계를 제외해야 한다.
const sug = sql.indexOf("create or replace function public.friend_suggestions");
if (sug < 0 || !/user_blocks/.test(sql.slice(sug, sql.indexOf("$$;", sug)))) fails.push("friend_suggestions가 차단 관계를 제외하지 않음");
// 클라이언트: 설정에 차단 목록, 프로필에 신고·차단 메뉴(스토어 심사 요건).
const app = readAppSource();
if (!/<UserSafetyMenu\b/.test(app)) fails.push("프로필 화면에 UserSafetyMenu(신고·차단) 없음");
if (!/<BlockListSheet\b/.test(app)) fails.push("설정에 BlockListSheet(차단 목록) 없음");
if (fails.length) { console.error("check-block-enforcement 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-block-enforcement: 연락 경로 4곳 + 친구 추천이 차단을 서버에서 강제, 프로필 신고·차단과 차단 목록 UI 있음");
