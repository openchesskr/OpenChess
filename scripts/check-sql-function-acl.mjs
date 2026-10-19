#!/usr/bin/env node
/** (v0.7.0 보안, BUG-107·108·109·110 재발 방지) supabase-setup.sql의 함수 실행 권한과 브라우저의 DB 호출을 검사한다.
 *   · 함수 권한은 파일 끝쪽 `do $acl$` 블록의 허용 목록(v_anon·v_auth)이 최종 결정한다(목록 밖은 service_role만 실행). 이 검사가 확인하는 것:
 *     1) 목록의 이름이 모두 이 파일에 정의된 함수다(오타로 조용히 빠지는 일 방지).
 *     2) 브라우저(src)가 sbRpc·/rpc/로 부르는 함수가 전부 목록에 있다(빠지면 운영에서 permission denied).
 *     3) 서버 전용·내부 함수(pvp_finish_verified·email_for_username·rate_limit_hit·_로 시작하는 함수)는 목록에 없다.
 *     4) 호출자가 목록에 있는 SECURITY DEFINER 함수가 '행위자 uid'를 인자(p_uid 등)로 받지 않는다 — 남의 명의로 호출하는 위조 방지(BUG-109).
 *     5) puzzles 테이블은 anon·authenticated에게 insert/update grant·정책이 없다(BUG-110) — 쓰기는 puzzle_share_put RPC로만.
 *     6) 클라이언트가 puzzles를 직접 쓰거나 email_for_username을 부르지 않는다(BUG-107·110).
 *  실행: node scripts/check-sql-function-acl.mjs (prebuild) */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const raw = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
const sql = raw.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const problems = [];

const defs = new Map();   // name -> { args, definer }
for (const m of sql.matchAll(/create (?:or replace )?function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?\$(\w*)\$/gi)) {
  const head = m[0].toLowerCase();
  defs.set(m[1], { args: m[2], definer: head.includes("security definer") });
}

const block = /do \$acl\$([\s\S]*?)end \$acl\$/.exec(sql);
if (!block) problems.push("`do $acl$ … end $acl$` 함수 권한 확정 블록이 없다");
const list = (name) => {
  const m = new RegExp(name + "\\s+text\\[\\]\\s*:=\\s*array\\[([\\s\\S]*?)\\]\\s*;").exec(block ? block[1] : "");
  return m ? [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]) : null;
};
const anon = list("v_anon"), auth = list("v_auth");
if (!anon || !auth) problems.push("허용 목록(v_anon·v_auth)을 읽지 못했다");
else {
  const allowed = new Set([...anon, ...auth]);
  for (const n of allowed) if (!defs.has(n)) problems.push("허용 목록의 `" + n + "`는 이 파일에 정의된 함수가 아니다(오타·삭제된 함수?)");
  for (const n of allowed) {
    if (/^_/.test(n) || ["pvp_finish_verified", "email_for_username", "rate_limit_hit", "handle_new_user"].includes(n)) problems.push("`" + n + "`는 서버 전용·내부 함수인데 브라우저 허용 목록에 있다");
  }
  // 4) 행위자 uid 인자 금지 — 대상 uid를 받는 읽기 함수만 예외
  const TARGET_READ_OK = new Set(["profile_recent_games", "profile_rank", "is_content_editor"]);
  for (const n of allowed) {
    const d = defs.get(n);
    if (d && d.definer && /\bp_(uid|user_uid|user_id|actor|actor_uid|me)\b/.test(d.args) && !TARGET_READ_OK.has(n))
      problems.push("`" + n + "`: SECURITY DEFINER인데 행위자 uid를 인자로 받는다(" + d.args.replace(/\s+/g, " ").trim() + ") — auth.uid()를 써야 한다");
  }
  // 2) 브라우저가 부르는 함수
  const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p, out) : /\.(jsx?|mjs)$/.test(f) && out.push(p); } return out; };
  for (const f of walk("src")) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/sbRpc\(\s*["'`](\w+)["'`]|\/rpc\/(\w+)/g)) {
      const n = m[1] || m[2];
      if (!allowed.has(n)) problems.push(f + ": 브라우저가 부르는 `" + n + "`가 함수 권한 허용 목록에 없다(운영에서 permission denied)");
    }
    if (/sbRpc\(\s*["'`]email_for_username/.test(text)) problems.push(f + ": 브라우저에서 email_for_username 호출 금지(BUG-107) — /api/auth-login 사용");
    if (/sb(Insert|Upsert|Patch)\(\s*["'`](daily_puzzle_cache|reviewed_games)["'`]/.test(text)) problems.push(f + ": daily_puzzle_cache·reviewed_games 직접 쓰기 금지(BUG-111·115) — daily_puzzle_cache_put RPC·/api/review-put 사용");
    if (/sbUpsert\(\s*["'`]puzzles["'`]|sbInsert\(\s*["'`]puzzles["'`]|sbPatch\(\s*["'`]puzzles["'`]/.test(text)) problems.push(f + ": puzzles 직접 쓰기 금지(BUG-110) — puzzle_share_put RPC 사용");
  }
}
// 5) puzzles 쓰기 권한·정책
for (const s of sql.split(";").map((x) => x.replace(/\s+/g, " ").trim())) {
  if (/^grant [^;]*\b(insert|update|delete|all)\b[^;]* on (?:table )?public\.puzzles to [^;]*\b(anon|authenticated)\b/i.test(s)) problems.push("puzzles에 anon/authenticated 쓰기 grant: " + s.slice(0, 100));
  if (/^create policy "[^"]+" on public\.puzzles for (insert|update|delete|all)\b/i.test(s)) problems.push("puzzles 쓰기 정책 금지(BUG-110): " + s.slice(0, 100));
}
// 7) RLS 정책은 호출한 사용자 권한으로 함수를 실행한다 — 비로그인(anon)이 읽거나 쓸 수 있는 표의 정책이 anon에게 막힌 함수를 부르면 비로그인 방문자의 조회가 통째로 깨진다
//    (v0.7.0 개발 중 실제로 발생: puzzles 읽기 정책의 is_content_editor). 그런 표의 정책은 v_anon 목록의 함수만 쓸 수 있다.
if (anon) {
  const anonTables = new Set();
  for (const s of sql.split(";").map((x) => x.replace(/\s+/g, " ").trim())) {
    const g = /^grant ([a-z, ]+) on (?:table )?public\.(\w+) to ([a-z_, ]+)$/i.exec(s);
    if (g && /\banon\b/i.test(g[3]) && /\b(select|insert|update|delete|all)\b/i.test(g[1])) anonTables.add(g[2]);
  }
  for (const s of sql.split(";").map((x) => x.replace(/\s+/g, " ").trim())) {
    const m = /^create policy "[^"]+" on public\.(\w+) /i.exec(s);
    if (!m || !anonTables.has(m[1])) continue;
    for (const f of s.matchAll(/public\.(\w+)\s*\(/g)) if (defs.has(f[1]) && !anon.includes(f[1])) problems.push("정책(" + m[1] + ")이 anon에게 막힌 함수 `" + f[1] + "`를 부른다 — 비로그인 조회가 'permission denied'로 깨진다");
  }
}
// 블록 위치: 마지막 함수 정의보다 뒤
if (block) {
  const lastDef = Math.max(...[...sql.matchAll(/create (?:or replace )?function\s+public\.\w+/gi)].map((m) => m.index));
  if (block.index < lastDef) problems.push("함수 권한 확정 블록이 마지막 함수 정의보다 앞에 있다 — 뒤에 정의된 함수가 기본 권한을 갖게 된다");
}
// 8) 서버(api/review-put.js)의 분석 버전은 클라이언트 REVIEW_RESULT_CACHE_VERSION과 같아야 한다 — 어긋나면 모든 분석 공유가 조용히 거부된다.
{
  const v1 = /export const ANALYSIS_VERSION = (\d+)/.exec(readFileSync(new URL("../api/review-put.js", import.meta.url), "utf8"));
  const v2 = /export const REVIEW_RESULT_CACHE_VERSION = (\d+)/.exec(readFileSync(new URL("../src/app/common.jsx", import.meta.url), "utf8"));
  if (!v1 || !v2 || v1[1] !== v2[1]) problems.push("api/review-put.js ANALYSIS_VERSION(" + (v1 && v1[1]) + ")과 REVIEW_RESULT_CACHE_VERSION(" + (v2 && v2[1]) + ")이 다르다");
}
// API: 로그인 응답에 이메일을 싣지 않는다
const loginApi = readFileSync(new URL("../api/auth-login.js", import.meta.url), "utf8");
if (/json\(\s*\{[^}]*email/.test(loginApi.replace(/\/\/.*$/gm, ""))) problems.push("api/auth-login.js: 응답에 email을 싣는 것으로 보인다(BUG-107)");

if (problems.length) { console.error("✗ check-sql-function-acl 실패:\n - " + problems.join("\n - ")); process.exit(1); }
console.log("✓ check-sql-function-acl: 허용 목록 " + (anon.length + auth.length) + "개 함수, 브라우저 호출·서버 전용 분리·행위자 uid 인자·puzzles 쓰기 검사 통과");
