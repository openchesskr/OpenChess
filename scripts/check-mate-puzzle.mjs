#!/usr/bin/env node
/** (v0.7.7, 사용자 요청) "게임 끝내기"(checkmate) 퍼즐 테마와 중복 방지 안전장치 검사.
 *  ① 후보(src/lib/matePuzzle.js mateCandidates): 둘 차례가 강제 메이트를 갖고 실제로 이어 간 수만, 메이트 인 2 이상, 같은 수순은 하나의 seq로 묶음.
 *  ② 중복 판정(mateDuplicateVerdict): 같은 체크메이트 장면(mateKey)에 같거나 더 긴 퍼즐이 있거나 상한(2개)이면 거부 — 클라이언트(src/lib)와 서버(api)가 같은 규칙.
 *  ③ 서버(api/puzzle-share.js mateInfo·validatePuzzle): 모든 정답 끝이 실제 체크메이트여야 하고, mateKey·mateLen은 서버가 계산해 덮어쓴다(위조 무시), 메이트 인 1 거부.
 *  ④ 연결: 테마 목록(PUZZLE_THEME_KEYS)·만들기 화면·트리 생성(requireMate)·SQL 테마 허용 목록·mateKey 색인.
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-mate-puzzle.mjs */
import { readFileSync } from "node:fs";
import * as lib from "../src/lib/matePuzzle.js";
import * as api from "../api/puzzle-share.js";
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// ① 후보 — evalDisp는 백 관점 { mate, win, plies } (plies: 체크메이트까지 남은 반수)
{
  const sans = ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"];
  const ev = [{ cp: 30 }, { cp: 20 }, { cp: 10 }, { cp: 0 }, { mate: 2, win: "w", plies: 3 }, { mate: 1, win: "w", plies: 2 }, { mate: 1, win: "w", plies: 1 }, { mate: 0, win: "w", plies: 0 }];
  const c = lib.mateCandidates({ evalDisp: ev }, sans);
  ok(c.length === 1 && c[0].ply === 4 && c[0].san === "Bc4" && c[0].mateIn === 2, "메이트 인 2 후보(Bc4)만 남아야 함(메이트 인 1인 Qxf7#은 제외): " + JSON.stringify(c));
  // 메이트를 놓친 수는 후보가 아니다
  const ev2 = ev.slice(); ev2[5] = { cp: 50 };
  ok(lib.mateCandidates({ evalDisp: ev2 }, sans).length === 0, "실제로 둔 수가 메이트를 이어 가지 못했는데 후보가 됨");
  // 상대가 메이트를 가진 포지션에서 둔 수는 후보가 아니다(둘 차례 기준)
  const ev3 = ev.slice(); ev3[4] = { mate: -2, win: "b", plies: 4 };
  ok(lib.mateCandidates({ evalDisp: ev3 }, sans).every((x) => x.ply !== 4), "상대가 메이트를 가진 포지션의 수가 후보가 됨");
  // 긴 수순은 하나의 seq로 묶임
  const s4 = ["a", "b", "c", "d", "e", "f", "g", "h#"];
  const e4 = [{ mate: 4, win: "w", plies: 7 }, { mate: 3, win: "w", plies: 6 }, { mate: 3, win: "w", plies: 5 }, { mate: 2, win: "w", plies: 4 }, { mate: 2, win: "w", plies: 3 }, { mate: 1, win: "w", plies: 2 }, { mate: 1, win: "w", plies: 1 }, { mate: 0, win: "w", plies: 0 }];
  const c4 = lib.mateCandidates({ evalDisp: e4 }, s4);
  ok(c4.map((x) => x.ply).join(",") === "0,2,4" && new Set(c4.map((x) => x.seq)).size === 1, "같은 메이트 수순의 수(0·2·4)가 한 seq로 묶이지 않음: " + JSON.stringify(c4));
  ok(lib.mateCandidates({ evalDisp: [{ mate: 9, win: "w", plies: 17 }] }, ["a"]).length === 0, "메이트 인 9 이상(너무 김)이 후보가 됨");
}
// ② 중복 판정 — 두 구현이 같은 결과
for (const [existing, len, want] of [[[], 3, true], [[{ id: "a", mateLen: 5 }], 3, false], [[{ id: "a", mateLen: 5 }], 5, false], [[{ id: "a", mateLen: 3 }], 5, true], [[{ id: "a", mateLen: 3 }, { id: "b", mateLen: 5 }], 7, false]]) {
  const a = lib.mateDuplicateVerdict(existing, len).ok, b = api.mateDuplicateVerdict(existing, len).ok;
  ok(a === want && b === want, "중복 판정이 다름: " + JSON.stringify({ existing, len, want, lib: a, api: b }));
}
ok(lib.MATE_PUZZLE_MIN_PLIES === api.MATE_PUZZLE_MIN_PLIES && lib.MATE_KEY_MAX_PUZZLES === api.MATE_KEY_MAX_PUZZLES, "클라이언트·서버의 메이트 퍼즐 상수가 다름");

// ③ 서버 검증
{
  const mk = (id, extra) => ({ id, themes: ["checkmate"], ...extra });
  const good = mk("g1", { setupSans: ["e4", "e5", "Bc4", "Nc6"], tree: { children: [{ san: "Qh5", children: [{ san: "Nf6", children: [{ san: "Qxf7#", children: [] }] }] }] }, mateKey: "forged", mateLen: 99 });
  ok(api.validatePuzzle(api.puzzleNoOf("g1"), good) === null, "정상 메이트 인 2 퍼즐이 거부됨");
  ok(good.mateKey === "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b" && good.mateLen === 3, "서버가 mateKey·mateLen을 직접 계산해 덮어쓰지 않음(위조값 유지): " + good.mateKey + " / " + good.mateLen);
  const notMate = mk("g2", { setupSans: ["e4", "e5"], tree: { children: [{ san: "Nf3", children: [] }] } });
  ok(/checkmate/.test(api.validatePuzzle(api.puzzleNoOf("g2"), notMate) || ""), "체크메이트로 끝나지 않는 게임 끝내기 퍼즐이 통과");
  const oneMove = mk("g3", { setupSans: ["e4", "e5", "Bc4", "Nc6", "Qh5"], mistakeSan: "Nf6", tree: { children: [{ san: "Qxf7#", children: [] }] } });
  ok(/too short/.test(api.validatePuzzle(api.puzzleNoOf("g3"), oneMove) || ""), "메이트 인 1 퍼즐이 통과");
  ok(api.MATE_PUZZLE_MAX_PLIES === lib.MATE_PUZZLE_MAX_PLIES, "클라이언트·서버의 최대 반수가 다름");
  const other = { id: "g4", themes: ["punish"], setupSans: ["e4"], tree: { children: [{ san: "e5", children: [] }] }, mateKey: "x", mateLen: 3 };
  api.validatePuzzle(api.puzzleNoOf("g4"), other);
  ok(other.mateKey === undefined && other.mateLen === undefined, "게임 끝내기가 아닌 퍼즐의 mateKey가 남음(다른 테마로 중복 상한을 막을 수 있다)");
}

// ③-1 (보안) mateKey·checkmate 테마를 붙여도 lines·solution 합법성 검사를 건너뛸 수 없다
{
  const ill = { id: "b1", themes: ["punish"], setupSans: ["e4"], lines: [{ solution: ["Ke2", "Qh4"] }], mateKey: "x", mateLen: 9 };   // 흑 차례에 Ke2는 불법
  ok(api.validatePuzzle(api.puzzleNoOf("b1"), ill) === "illegal lines", "mateKey를 붙인 불법 lines 퍼즐이 통과(합법성 검사 우회)");
  const ill2 = { id: "b2", setupSans: ["e4"], solution: ["Ke2"], mateLen: 3 };
  ok(api.validatePuzzle(api.puzzleNoOf("b2"), ill2) === "illegal solution", "mateLen을 붙인 불법 solution 퍼즐이 통과(합법성 검사 우회)");
}
// ③-2 서버 핸들러: 같은 체크메이트 장면의 더 긴 퍼즐이 있으면 409 duplicate_mate, 없으면 저장
{
  Object.assign(process.env, { VITE_SUPABASE_URL: "https://sb.test", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc" });
  const prev = globalThis.fetch; let existing = [], saved = 0;
  globalThis.fetch = async (u) => {
    u = String(u);
    const j = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes("/rpc/rate_limit_hit")) return j(false);
    if (u.includes("/auth/v1/user")) return j({ id: "u1" });
    if (u.includes("/rest/v1/puzzles?") && u.includes("mateKey")) return j(existing);
    if (u.includes("/rpc/puzzle_share_put_verified")) { saved++; return j(null); }
    return j({});
  };
  const body = () => ({ id: "h1", themes: ["checkmate"], setupSans: ["e4", "e5", "Bc4", "Nc6"], tree: { children: [{ san: "Qh5", children: [{ san: "Nf6", children: [{ san: "Qxf7#", children: [] }] }] }] } });
  const call = async (auth = true) => { const out = { code: 0, body: null }; const res = { status(c) { out.code = c; return this; }, json(b) { out.body = b; }, setHeader() { } }; await api.default({ method: "POST", headers: auth ? { authorization: "Bearer tok" } : {}, body: { no: api.puzzleNoOf("h1"), data: body() } }, res); return out; };
  let r = await call(false);
  ok(r.code === 401 && saved === 0, "게스트가 게임 끝내기 퍼즐을 올릴 수 있음: " + JSON.stringify(r));
  existing = [{ id: "other", mateLen: "5" }];
  r = await call();
  ok(r.code === 409 && r.body && r.body.error === "duplicate_mate" && saved === 0, "더 긴 같은 장면 퍼즐이 있는데 서버가 저장함: " + JSON.stringify(r));
  existing = [{ id: "h1", mateLen: "3" }];   // 자기 자신(같은 id)은 중복으로 세지 않는다
  r = await call();
  ok(r.code === 200 && saved === 1, "같은 id(자기 자신)를 중복으로 셈: " + JSON.stringify(r));
  globalThis.fetch = prev;
}
// ④ 연결
const common = rd("src/app/common.jsx"), puzzle = rd("src/app/puzzle.jsx"), share = rd("api/puzzle-share.js"), sql = rd("supabase-setup.sql");
ok(/export const PUZZLE_THEME_KEYS = \[[^\]]*"checkmate"/.test(common) && /k === "checkmate" \? t\("게임 끝내기"\)/.test(common), "테마 목록에 게임 끝내기(checkmate)가 없음");
ok(/checkmate: \{[^}]*requireMate: true/.test(common), "게임 끝내기 생성 옵션(requireMate)이 없음");
ok(/if \(requireMate && children\)[\s\S]{0,300}\/#\$\/\.test\(n\.san\)/.test(common), "genPuzzleTree가 체크메이트로 끝나지 않는 가지를 잘라 내지 않음");
ok(/mateCandidates\(pcAnalyzeResult, pcParsed\.sans\)/.test(puzzle), "퍼즐 만들기 화면이 체크메이트 수순 후보를 보여 주지 않음");
ok(/mateDuplicateVerdict\(await mateKeyPuzzles\(info\.mateKey\), info\.mateLen\)[\s\S]{0,400}setPcExisting/.test(puzzle), "퍼즐 만들기 화면이 같은 체크메이트 장면의 기존 퍼즐을 확인하지 않음");
ok(/if \(data\.mateKey\)[\s\S]{0,2000}duplicate_mate/.test(share), "서버가 같은 체크메이트 장면의 중복을 거부하지 않음");
ok(/jsonb_array_elements_text\(coalesce\(v_old -> 'themes'[^\n]*'checkmate'\)\s*union\s*select t from jsonb_array_elements_text\(coalesce\(p_data -> 'themes', '\[\]'::jsonb\)\) as t where t in \('punish', 'advantage', 'sacrifice'\)\s*\) x;/.test(sql), "SQL 테마 합치기: 저장된 checkmate를 지우거나, 들어온 checkmate를 확인 없이 붙임(보안)");
ok(/select=data->>id,data->>mateLen&or=\(is_public\.eq\.true,creator_uid\.eq\." \+ encodeURIComponent\(user\.id\) \+ "\)&data->>mateKey=/.test(share) && !/existingId/.test(share) && /if \(!user\) \{ res\.status\(401\)\.json\(\{ error: "login_required" \}\)/.test(share), "서버 중복 조회가 일부만 세거나 기존 id를 돌려주거나 게스트 업로드를 받음(보안)");
ok(/if p_public and v_key is not null[\s\S]{0,600}pg_advisory_xact_lock\(hashtext\('mate:' \|\| v_key\)\)[\s\S]{0,600}raise exception 'duplicate_mate'/.test(sql) && /and \(not v_exists or v_old is null or v_old = '\{\}'::jsonb or \(p_actor is not null and public\.is_content_editor\(p_actor\)\)\) then\s*perform pg_advisory_xact_lock\(hashtext\('mate:' \|\| \(p_data ->> 'mateKey'\)\)\)[\s\S]{0,600}raise exception 'duplicate_mate'/.test(sql), "비공개 → 공개 전환으로 게임 끝내기 중복 규칙을 우회할 수 있음(puzzle_set_visibility 재검사 없음)");
ok(/insert into public\.puzzles\(no, data, is_public, creator_uid\) values \(p_no, p_data, coalesce\(p_public, true\), p_actor\)/.test(sql), "새 퍼즐 저장 때 생성자를 함께 기록하지 않음");
ok(/create index if not exists idx_puzzles_mate_key/.test(sql), "mateKey 색인이 없음");

if (fails.length) { console.error("✖ check-mate-puzzle 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-mate-puzzle: 게임 끝내기 후보(메이트 인 2 이상·수순 묶음), 체크메이트 장면 중복 방지(클라이언트·서버 같은 규칙, 서버 재계산), 화면·생성·SQL 연결이 유지된다");
