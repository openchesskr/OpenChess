// 모의 공격 샌드박스: 일회용 PostgreSQL 클러스터에 Supabase 환경(anon/authenticated/service_role 역할,
// auth.uid(), 기본 권한)을 흉내 내고 supabase-setup.sql을 그대로 올린다. 라이브 DB·네트워크에는 접속하지 않는다.
import { spawnSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, readdirSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 54329;
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

function pgBin() {
  for (const v of existsSync("/usr/lib/postgresql") ? readdirSync("/usr/lib/postgresql").sort().reverse() : []) {
    const b = `/usr/lib/postgresql/${v}/bin`;
    if (existsSync(b + "/initdb")) return b;
  }
  return "";   // PATH에 있는 것을 쓴다
}
const BIN = pgBin();
const bin = (n) => (BIN ? BIN + "/" + n : n);
// root는 postgres를 직접 못 띄우므로 postgres 계정으로 실행한다.
const asPg = (cmd) => (isRoot ? `su postgres -s /bin/bash -c ${JSON.stringify(cmd)}` : cmd);

export const STUB = `
create schema if not exists auth;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role authenticator noinherit login; grant anon, authenticated, service_role to authenticator;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, provider text);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
create publication supabase_realtime;
create schema if not exists cron;
create function cron.schedule(text, text, text) returns bigint language sql as 'select 1::bigint';
create function cron.schedule(text, text) returns bigint language sql as 'select 1::bigint';
create function cron.unschedule(text) returns boolean language sql as 'select true';
grant usage on schema public, auth to anon, authenticated, service_role;
-- Supabase 프로젝트의 기본 권한: public 스키마에 새로 생기는 테이블·함수·시퀀스에 세 역할 전부 권한이 붙는다.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export class Sandbox {
  constructor() { this.dir = ""; this.up = false; }
  psql(sql, { db = "oc", user = "postgres" } = {}) {
    const r = spawnSync(asPg(`${bin("psql")} -X -q -At -v ON_ERROR_STOP=1 -h /tmp -p ${PORT} -U ${user} -d ${db}`),
      { input: sql, shell: true, encoding: "utf8", maxBuffer: 64 << 20 });
    const err = (r.stderr || "").split("\n").filter((l) => !/^(NOTICE|psql:.*NOTICE|WARNING):/.test(l) && !/^(DETAIL|CONTEXT|HINT):/.test(l.trim()) || /ERROR/.test(l)).join("\n").trim();
    return { ok: r.status === 0, out: (r.stdout || "").trim(), err };
  }
  boot({ setupSql = join(process.cwd(), "supabase-setup.sql"), log = () => {} } = {}) {
    this.dir = mkdtempSync(join(tmpdir(), "oc-attack-"));
    if (isRoot) { chmodSync(this.dir, 0o755); execSync(`chown postgres ${this.dir}`); }
    const run = (c) => execSync(asPg(c), { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    run(`${bin("initdb")} -D ${this.dir}/data -A trust -U postgres`);
    run(`${bin("pg_ctl")} -D ${this.dir}/data -o "-p ${PORT} -k /tmp -c listen_addresses=''" -l ${this.dir}/pg.log -w start`);
    this.up = true;
    let r = this.psql("create database oc", { db: "postgres" });
    if (!r.ok) throw new Error("create database 실패: " + r.err);
    r = this.psql(STUB);
    if (!r.ok) throw new Error("Supabase 환경 흉내 실패: " + r.err);
    log("supabase-setup.sql 적용 중…");
    const setup = readFileSync(setupSql, "utf8");
    r = this.psql(setup);   // 한 번 적용
    if (!r.ok) throw new Error("supabase-setup.sql 적용 실패: " + r.err);
    r = this.psql(setup);   // 문서대로 '여러 번 실행해도 안전'한지도 함께 확인
    if (!r.ok) throw new Error("supabase-setup.sql 두 번째 적용 실패: " + r.err);
    return this;
  }
  /** role(anon|authenticated|service_role)·uid 신분으로 sql 실행. 한 트랜잭션, 오류 시 {ok:false}. */
  as(role, uid, sql, { rollback = false } = {}) {
    const claims = JSON.stringify(uid ? { sub: uid, role } : { role });
    const r = this.psql(`begin;\nset local role ${role};\nselect set_config('request.jwt.claims', '${claims}', true);\n${sql}\n${rollback ? "rollback;" : "commit;"}`);
    r.out = r.out.split("\n").slice(1).join("\n");   // 첫 줄은 set_config의 출력
    return r;
  }
  /** 슈퍼유저(테스트 준비·결과 확인용) */
  admin(sql) { return this.psql(sql); }
  stop() {
    if (this.up) { try { execSync(asPg(`${bin("pg_ctl")} -D ${this.dir}/data -m immediate stop`), { stdio: "ignore" }); } catch { } this.up = false; }
    if (this.dir) { try { rmSync(this.dir, { recursive: true, force: true }); } catch { } }
  }
}
