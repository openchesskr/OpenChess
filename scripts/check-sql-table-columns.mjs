#!/usr/bin/env node
/** (v0.5.9, BUG-035 재발 방지) supabase-setup.sql의 "create table if not exists" 블록 안에 나중에 컬럼을 끼워 넣기만 하면,
 *  그 표가 이미 있는 기존 프로젝트에서는 파일을 다시 실행해도 컬럼이 생기지 않는다(표가 있으면 블록 전체를 건너뜀).
 *  pvp_invites.game_type이 이렇게 빠져 운영 DB에서 pvp_invite_friend가 매번 42703(column does not exist)으로 실패했다 —
 *  plpgsql 함수는 만들 때 컬럼을 확인하지 않아 SQL 실행은 오류 없이 끝나 알아채지 못했다.
 *
 *  검사 — scripts/sql-table-baseline.json에 표마다 "처음 만들어질 때의 컬럼"을 적어 두고,
 *   ① 기준에 없는(나중에 블록에 추가된) 컬럼은 반드시 "alter table public.T add column if not exists C"가 함께 있어야 한다.
 *   ② 새 표를 만들면 기준 파일에도 그 표의 컬럼을 추가해야 한다(그래야 ①이 이후 추가분을 잡는다).
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-sql-table-columns.mjs
 */
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
const baseline = JSON.parse(readFileSync(new URL("./sql-table-baseline.json", import.meta.url), "utf8"));
const fails = [];

const re = /create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/gi;
let m, count = 0;
while ((m = re.exec(sql))) {
  count++;
  const table = m[1].toLowerCase();
  const line = sql.slice(0, m.index).split("\n").length;
  const cols = [];
  for (let l of m[2].split("\n")) {
    l = l.replace(/--.*$/, "").trim();
    const c = /^([a-z_][a-z0-9_]*)\s+[a-z]/i.exec(l);
    if (c && !/^(primary|unique|check|constraint|foreign|exclude)$/i.test(c[1])) cols.push(c[1].toLowerCase());
  }
  const base = baseline[table];
  if (!base) { fails.push("supabase-setup.sql:" + line + " — 새 표 public." + table + "를 scripts/sql-table-baseline.json에 추가할 것: \"" + table + "\":" + JSON.stringify(cols)); continue; }
  for (const c of cols) {
    if (base.includes(c)) continue;
    const add = new RegExp("alter\\s+table\\s+(?:if\\s+exists\\s+)?public\\." + table + "\\s+add\\s+column\\s+if\\s+not\\s+exists\\s+" + c + "\\b", "i");
    if (!add.test(sql)) fails.push("supabase-setup.sql:" + line + " — public." + table + "." + c + "는 create table 블록에만 있어 기존 프로젝트에서는 다시 실행해도 생기지 않는다. \"alter table public." + table + " add column if not exists " + c + " ...\"를 추가할 것");
  }
}
if (count === 0) fails.push("supabase-setup.sql에서 create table 블록을 하나도 찾지 못했다 — 검사 정규식을 확인할 것");

if (fails.length) {
  console.error("✗ SQL 표 컬럼 검사 실패 (BUG-035 재발 방지):\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("✓ SQL 표 컬럼 검사 통과 (" + count + "개 표)");
