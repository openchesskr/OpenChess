#!/usr/bin/env node
/** (v0.5.7, BUG-029·BUG-031 재발 방지) supabase-setup.sql은 "빈 프로젝트에 처음 실행"과 "이미 있는 프로젝트에 다시 실행" 둘 다 안전해야 한다.
 *   · BUG-029: 뒤에서 add column으로 붙는 컬럼(puzzles.likes, profiles.mid)을 앞의 정책·함수·인덱스가 먼저 써서, 새 프로젝트 첫 실행에서
 *     정책·검색 함수·인덱스 4개가 만들어지지 않았다.
 *   · BUG-031: 컬럼 기본값으로 쓰는 함수(gen_mid)를 "drop function … cascade"로 지워, 두 번째 실행부터 profiles.mid 기본값이 사라졌다
 *     (add column if not exists는 컬럼이 있으면 건너뛰어 기본값을 다시 걸지 않는다).
 *  검사 — ① 컬럼 기본값으로 쓰는 함수는 cascade로 drop하지 않는다, ② add column으로만 생기는 컬럼은 그 문장보다 앞에서
 *  (그 표를 대상으로 하는 정책·인덱스, 그 표를 from/join하는 함수 본문에서) 쓰지 않는다.
 *  DB로 직접 확인하려면: 빈 DB에 파일을 두 번 실행해 두 번의 카탈로그(기본값·정책·트리거·인덱스·함수·권한)가 같은지 비교한다(BUGS.md 참고).
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-sql-order.mjs
 */
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
const lines = sql.split("\n");
const code = lines.map((l) => l.replace(/--.*$/, "")); // 주석 제거(줄 단위)
const fails = [];

// ① 기본값 함수의 cascade drop
const defaultFns = new Set([...sql.matchAll(/default\s+public\.(\w+)\s*\(/gi)].map((m) => m[1].toLowerCase()));
code.forEach((l, i) => {
  const m = /drop\s+function\s+if\s+exists\s+public\.(\w+)\s*\([^)]*\)\s+cascade/i.exec(l);
  if (m && defaultFns.has(m[1].toLowerCase())) fails.push("supabase-setup.sql:" + (i + 1) + " — " + m[1] + "()는 컬럼 기본값으로 쓰인다. cascade로 drop하면 기본값이 사라지고 다시 걸리지 않는다(create or replace만 쓸 것)");
});

// ② 컬럼이 처음 생기는 줄 — create table 안의 정의, 또는 가장 이른 add column
const tableCols = {}; // table -> Map(col -> line)
const note = (t, c, i) => { t = t.toLowerCase(); c = c.toLowerCase(); (tableCols[t] = tableCols[t] || new Map()); if (!tableCols[t].has(c) || tableCols[t].get(c) > i) tableCols[t].set(c, i); };
for (let i = 0; i < code.length; i++) {
  const ct = /create\s+table\s+if\s+not\s+exists\s+public\.(\w+)\s*\(/i.exec(code[i]);
  if (ct) {
    for (let j = i + 1; j < code.length && !/^\s*\)\s*;/.test(code[j]); j++) {
      const cm = /^\s*(\w+)\s+(bigint|int|integer|smallint|text|uuid|jsonb|json|boolean|timestamptz|timestamp|date|real|double|numeric|bigserial|serial|char|varchar)\b/i.exec(code[j]);
      if (cm) note(ct[1], cm[1], i);
    }
  }
  for (const m of code[i].matchAll(/alter\s+table\s+public\.(\w+)\s+add\s+column\s+if\s+not\s+exists\s+(\w+)/gi)) note(m[1], m[2], i);
}
// 문장 단위로 앞선 사용 찾기 — 정책(on public.T)·인덱스(on public.T)·함수 본문(from/join public.T)
const addedLater = []; // [table, col, line] — create table에 없고 add column으로만 생기는 컬럼
for (const [t, cols] of Object.entries(tableCols)) for (const [c, line] of cols) {
  const inCreate = new RegExp("create\\s+table\\s+if\\s+not\\s+exists\\s+public\\." + t + "\\s*\\(", "i");
  const createIdx = code.findIndex((l) => inCreate.test(l));
  if (createIdx >= 0 && line > createIdx) addedLater.push([t, c, line]);
}
const stmtAt = (i) => { let s = "", j = i; while (j < code.length) { s += code[j] + "\n"; if (/;\s*$/.test(code[j]) && !/\$\$/.test(s.replace(/\$\$[\s\S]*?\$\$/g, ""))) break; j++; } return s; };
for (let i = 0; i < code.length; i++) {
  const l = code[i];
  const pol = /create\s+policy\s+.*?\son\s+public\.(\w+)/i.exec(l);
  const idx = /create\s+(?:unique\s+)?index\s+.*?\son\s+public\.(\w+)/i.exec(l);
  const fn = /create\s+or\s+replace\s+function\s+public\.\w+/i.test(l);
  if (!pol && !idx && !fn) continue;
  const text = stmtAt(i);
  // plpgsql 본문은 만들 때 컬럼을 확인하지 않고(실행할 때 확인) language sql 본문만 만들 때 확인하므로, 함수는 sql 함수만 본다.
  if (fn && !/language\s+sql/i.test(text)) continue;
  const targets = pol ? [pol[1]] : idx ? [idx[1]] : [...text.matchAll(/(?:from|join|update|into)\s+public\.(\w+)/gi)].map((m) => m[1]);
  for (const t of new Set(targets.map((x) => x.toLowerCase()))) {
    for (const [tt, c, line] of addedLater) {
      if (tt !== t || line <= i) continue;
      if (new RegExp("\\b" + c + "\\b", "i").test(text)) fails.push("supabase-setup.sql:" + (i + 1) + " — public." + t + "." + c + "는 " + (line + 1) + "행에서야 add column으로 생기는데 여기서 먼저 쓴다(새 프로젝트 첫 실행에서 실패). 컬럼 추가를 앞으로 옮길 것");
    }
  }
}

if (fails.length) {
  console.error("✖ check-sql-order: " + fails.length + "건\n  · " + [...new Set(fails)].join("\n  · "));
  process.exit(1);
}
console.log("✔ check-sql-order: 컬럼은 쓰이기 전에 생기고, 기본값 함수는 cascade로 지우지 않는다");
