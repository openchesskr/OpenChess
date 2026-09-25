#!/usr/bin/env node
/** (v0.5.5 재발 방지, BUGS.md BUG-001) 테이블 한 행을 돌려주는 RPC의 NULL 반환 검사.
 *
 *  supabase-setup.sql에서 `returns public.<테이블>`(한 행)이면서 본문에 `return null;`이 있는 함수를 모두 찾고,
 *  src/ 안에서 그 함수를 sbRpc("이름", ...)로 직접 부르는 곳이 있으면 실패한다 — 그런 RPC는 sbRpcRow로 불러야 한다
 *  (PostgREST가 NULL 행을 "모든 필드가 null인 객체"로 보내, `if (row)`가 이를 실제 행으로 오인한다).
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-rpc-null-rows.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = new URL("..", import.meta.url).pathname;
const sql = fs.readFileSync(path.join(root, "supabase-setup.sql"), "utf8");
const nullable = new Set();
const re = /create or replace function public\.(\w+)\([^$]*?\)\s*returns\s+(setof\s+)?public\.\w+\b[\s\S]*?\$\$([\s\S]*?)\$\$;/gi;
for (const m of sql.matchAll(re)) {
  if (!m[2] && /return\s+null\s*;/i.test(m[3])) nullable.add(m[1]);
}

const offenders = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|mjs|tsx?)$/.test(e.name)) {
      fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        for (const m of line.matchAll(/\bsbRpc\(\s*["'`](\w+)["'`]/g)) {
          if (nullable.has(m[1])) offenders.push(path.relative(root, p) + ":" + (i + 1) + "  " + m[1]);
        }
      });
    }
  }
};
walk(path.join(root, "src"));

if (offenders.length) {
  console.error("✗ NULL 행을 돌려줄 수 있는 RPC를 sbRpc로 직접 부르고 있어요 — sbRpcRow로 바꿔 주세요(BUGS.md BUG-001):");
  offenders.forEach((o) => console.error("  " + o));
  process.exit(1);
}
console.log("✓ rpc null-row check: " + nullable.size + "개 함수(" + [...nullable].join(", ") + ") 모두 sbRpcRow로 호출");
