#!/usr/bin/env node
/** (v0.5.7, BUG-022 재발 방지) supabase-setup.sql의 update 권한 검사.
 *   · chat_messages는 "수신자 읽음 처리"용 update 정책(auth.uid() = to_uid)에 테이블 전체 update 권한이 붙어, 수신자가 남이 보낸
 *     메시지 본문을 REST로 고칠 수 있었다. 수신자(to_uid)가 update하는 정책이 있는 테이블은 update를 컬럼 단위로만 줘야 한다.
 *   · 컬럼 단위 update grant는 그 앞에서 테이블 전체 update를 revoke해야 실제로 제한이 먹는다(이미 전체 권한이 있으면 무의미).
 *   · (BUG-023) 누구나 쓰는 정책(insert with check (true), update using (true) with check (true))은 허용 목록에 있는 표만 —
 *     새로 이런 정책을 만들면 공유 데이터를 아무나 덮어쓸 수 있으니, 정말 필요하면 이유와 함께 목록에 올릴 것.
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-sql-grants.mjs
 */
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8")
  .split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const problems = [];
const stmts = sql.split(";").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);

// 테이블별로 문장 순서대로: 전체 update grant / revoke / 컬럼 update grant
const state = {}; // table -> { full: bool, column: bool, recipientUpdate: bool }
const st = (t) => (state[t] = state[t] || { full: false, column: false, recipientUpdate: false });
for (const s of stmts) {
  let m;
  if ((m = /^grant ([a-z, ]+) on (?:table )?public\.(\w+) to /i.exec(s)) && /\bupdate\b/i.test(m[1]) && !/\(/.test(m[1])) st(m[2]).full = true;
  else if ((m = /^grant update \(([^)]+)\) on (?:table )?public\.(\w+) to /i.exec(s))) {
    const t = st(m[2]);
    if (t.full) problems.push(m[2] + ": 컬럼 단위 update grant(" + m[1] + ") 앞에 테이블 전체 update 권한이 남아 있음 — 먼저 revoke update");
    t.column = true;
  } else if ((m = /^revoke (?:all|[a-z, ]*\bupdate\b[a-z, ]*) on (?:table )?public\.(\w+) from /i.exec(s))) st(m[1]).full = false;
  else if ((m = /^create policy "[^"]+" on public\.(\w+) for update using \((.*?)\)(?: with check|$)/i.exec(s)) && /to_uid/.test(m[2])) st(m[1]).recipientUpdate = true;
}
for (const [t, v] of Object.entries(state)) {
  if (v.recipientUpdate && v.full) problems.push(t + ": 수신자(to_uid)가 update하는 정책이 있는데 update 권한이 테이블 전체에 열려 있음 — 수신자가 보낸 사람의 내용을 고칠 수 있다");
}
// 누구나 쓰는 정책 — 허용 목록: puzzles(update — data만 컬럼 grant로 열림, 크라우드소싱 퍼즐 보정),
// daily_puzzle_cache(insert — 날짜별 캐시, 서버가 같은 날짜를 한 번만 받음).
const OPEN_WRITE_OK = new Set(["puzzles", "daily_puzzle_cache"]);
for (const s of stmts) {
  const m = /^create policy "[^"]+" on public\.(\w+) for (insert|update|all)\b(.*)$/i.exec(s);
  if (!m) continue;
  const open = /with check \(true\)/i.test(m[3]) && (m[2].toLowerCase() === "insert" || /using \(true\)/i.test(m[3]));
  if (open && !OPEN_WRITE_OK.has(m[1])) problems.push(m[1] + ": 누구나 쓰는 " + m[2] + " 정책(true) — 공유 데이터를 아무나 덮어쓸 수 있다. RPC로 좁히거나 허용 목록에 이유와 함께 추가");
}
// 알려진 예외: notifications는 수신자 본인만 보는 알림함이라(다른 사람 화면에 안 보임) 전체 update를 허용한다.
const ALLOW = new Set(["notifications"]);
const real = problems.filter((p) => !ALLOW.has(p.split(":")[0]));
if (real.length) {
  console.error("✗ sql grants check 실패:\n  " + real.join("\n  "));
  process.exit(1);
}
console.log("✓ sql grants check: 수신자 update 정책 테이블은 컬럼 단위 권한만, 컬럼 grant 앞엔 전체 update revoke");
