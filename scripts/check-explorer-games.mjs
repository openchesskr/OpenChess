#!/usr/bin/env node
/** (v0.7.8, 사용자 요청) 집중 분석 유저 통계 "전체 통계" — Lichess 최고 레이팅·최근 대국을 서버가 받아 OpenChess DB에 쌓는 경로 검사.
 *   ① 수순 검증(api/_lib/explorer.js parseExplorerMoves): 실제로 둘 수 있는 SAN만, 최대 60수, 시작 포지션은 빈 값.
 *   ② Lichess 응답 정리(cleanExplorer): 모양이 틀린 대국 id·레이팅·결과는 버리고, top/recent에 같이 있으면 한 번만(top).
 *   ③ 화면 값(explorerView): 쌓인 대국 + 새로 받은 대국을 id로 합치고 최고 레이팅 순. 새로 받은 값이 없으면 쌓인 집계를 쓴다.
 *   ④ 6시간 안에는 Lichess를 다시 부르지 않는다(needsRefresh). ⑤ 쓰기는 서버 전용 RPC(explorer_record) — 브라우저 허용 목록에 없다.
 *  실행: node scripts/check-explorer-games.mjs (prebuild) */
import { readFileSync } from "node:fs";
import { parseExplorerMoves, cleanExplorer, explorerView, needsRefresh, EXPLORER_REFRESH_MS, cleanGamePgn } from "../api/_lib/explorer.js";
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rd = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// ①
ok(JSON.stringify(parseExplorerMoves("")) === JSON.stringify({ sans: [], uci: "" }), "빈 수순은 시작 포지션");
{ const p = parseExplorerMoves("e4,e5,Nf3,Nc6,Bb5,a6,Ba4,Nf6,O-O,Nxe4,d4,exd4,Re1,d5,Nxd4,Bd6,Nxc6,Bxh2+");
  ok(p && p.uci.split(",").length === 18 && p.uci.startsWith("e2e4,e7e5,g1f3") && p.uci.endsWith("d6h2") && p.uci.includes("e1g1"), "SAN 수순 → UCI(캐슬링 e1g1 포함)"); }
ok(parseExplorerMoves("e4,e4") === null, "둘 수 없는 수는 거부");
ok(parseExplorerMoves("e4,<script>") === null, "이상한 글자는 거부");
ok(parseExplorerMoves(Array(61).fill("Nf3").join(",")) === null, "60수를 넘으면 거부");
ok(parseExplorerMoves(123) === null, "문자열이 아니면 거부");
// ②
{ const c = cleanExplorer({ white: 10, draws: 5, black: 7, moves: [{ san: "Kh1", white: 3, draws: 1, black: 2 }, { san: "<x>", white: 1 }],
    topGames: [{ id: "abcd1234", white: { name: "A", rating: 2900 }, black: { name: "B", rating: 2850 }, winner: "white", speed: "blitz", month: "2024-05", uci: "g1h1" }, { id: "../etc", white: {}, black: {} }],
    recentGames: [{ id: "abcd1234", white: { name: "A", rating: 2900 }, black: { name: "B", rating: 2850 } }, { id: "zzzz9999", white: { name: "C", rating: 99999 }, black: { name: "D", rating: 1500 }, winner: "draw?", month: "May" }] });
  ok(c.white === 10 && c.draws === 5 && c.black === 7, "전체 승·무·패");
  ok(c.moves.length === 1 && c.moves[0].san === "Kh1", "다음 수 통계는 모양이 맞는 것만");
  ok(c.games.length === 2 && c.games[0].id === "abcd1234" && c.games[0].source === "top", "같은 대국은 한 번만(top 우선), 이상한 id는 버림");
  const z = c.games.find((g) => g.id === "zzzz9999");
  ok(z && z.white_rating === null && z.winner === null && z.month === null && z.source === "recent", "말이 안 되는 레이팅·결과·달은 비움"); }
ok(cleanExplorer(null) === null && cleanExplorer("x") === null, "응답이 객체가 아니면 null");
// ③
{ const stored = { position: { white: 1, draws: 2, black: 3, moves: [{ san: "e4", white: 1, draws: 0, black: 0 }], fetched_at: new Date().toISOString() }, stored: 41,
    games: [{ game_id: "aaaa1111", white_name: "X", white_rating: 2000, black_name: "Y", black_rating: 2100, winner: "black", source: "recent", month: "2023-01" }] };
  const v1 = explorerView(stored, null);
  ok(v1.totals.white === 1 && v1.totals.black === 3 && v1.moves.length === 1 && v1.games.length === 1 && v1.games[0].id === "aaaa1111" && v1.stored === 41, "새로 받은 값이 없으면 쌓인 집계·대국");
  const v2 = explorerView(stored, { white: 9, draws: 9, black: 9, moves: [], games: [{ id: "bbbb2222", white_name: "P", white_rating: 2700, black_name: "Q", black_rating: 2600, source: "top" }, { id: "aaaa1111", white_name: "X", white_rating: 2000 }] });
  ok(v2.totals.white === 9 && v2.games.length === 2 && v2.games[0].id === "bbbb2222", "새 대국과 쌓인 대국을 id로 합쳐 최고 레이팅 순");
  ok(explorerView(null, null).games.length === 0, "아무것도 없으면 빈 목록"); }
// ④
ok(needsRefresh(null) && needsRefresh({ position: { fetched_at: "x" } }), "쌓인 값이 없으면 Lichess에서 받는다");
ok(!needsRefresh({ position: { fetched_at: new Date(Date.now() - 60e3).toISOString() } }) && needsRefresh({ position: { fetched_at: new Date(Date.now() - EXPLORER_REFRESH_MS - 1).toISOString() } }), "6시간 안에는 다시 받지 않는다");
// ⑤ 연결
const api = rd("api/_lib/explorerGames.js"), lich = rd("api/lichess.js"), sql = rd("supabase-setup.sql"), an = rd("src/app/analysis.jsx");
ok(/parseExplorerMoves\(\(req\.query \|\| \{\}\)\.moves\)/.test(api) && /if \(!parsed\) \{ res\.status\(400\)/.test(api), "서버가 수순을 검증하지 않음");
ok(/rateLimited\(env, \[\["explorer:ip:"/.test(api) && /\["explorer:upstream", 600, 3600\]/.test(api), "IP당·Lichess 호출 한도가 없음");
ok(/topGames: "4", recentGames: "4"/.test(api) && /explorer\.lichess\.org\/lichess\?/.test(api), "Lichess 탐색기(lichess DB)의 최고 레이팅·최근 대국을 받지 않음");
ok(/rpc\(env, "explorer_record"/.test(api) && /needsRefresh\(stored\)/.test(api), "새로 받은 대국을 쌓지 않음(또는 6시간 간격을 지키지 않음)");
ok(/create table if not exists public\.explorer_games/.test(sql) && /primary key \(pos_key, game_id\)/.test(sql) && /revoke all on public\.explorer_games from public, anon, authenticated;/.test(sql), "explorer_games 표·권한 차단이 없음");
const acl = (/do \$acl\$([\s\S]*?)end \$acl\$/.exec(sql) || [""])[0];
ok(!/explorer_record|explorer_read/.test(acl), "explorer_record·explorer_read가 브라우저 허용 목록에 있음(서버 전용이어야 함)");
ok(/<ExplorerStatsCard path=\{\[\.\.\.sans, san\]\}/.test(an) && /fetch\(apiUrl\("\/api\/lichess\?games=1&moves=" \+ encodeURIComponent\(key\)\)\)/.test(an) && /if \(\(req\.query \|\| \{\}\)\.games === "1"\) return explorerGamesHandler\(req, res\);/.test(lich), "집중 분석 유저 통계에 전체 통계 블록이 없음");
const myIdx = an.indexOf('t("내 통계")'), exIdx = an.indexOf("<ExplorerStatsCard "), masterIdx = an.indexOf('t("마스터 통계")}</span>');
ok(myIdx > 0 && exIdx > myIdx && masterIdx > exIdx, "전체 통계 블록은 내 통계 블록 아래(유저 통계 페이지 안)에 있어야 함");
// ⑥ (v0.7.9, 사용자 요청) 대국은 Lichess로 보내지 않고 PGN으로 저장해 OpenChess 안에서 보기·리뷰. 화면: 설명·쌓인 판수 없음, 추천/최근 섹션, 레이팅 숨김
{ const pgn = '[Event "Rated Blitz game"]\n[Site "https://lichess.org/abcd1234"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n[WhiteElo "2900"]\n[Variant "Standard"]\n[Annotator "x\\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0\n';
  const c = cleanGamePgn(pgn, "abcd1234");
  ok(c && c.sans.join(" ") === "e4 e5 Nf3 Nc6 Bb5" && /\[Site "https:\/\/lichess\.org\/abcd1234"\]/.test(c.pgn) && !/Annotator/.test(c.pgn) && /1\. e4 e5 2\. Nf3 Nc6 3\. Bb5/.test(c.pgn), "PGN 정리: 수순 재생·정해진 머리글만·Site는 그 대국");
  ok(cleanGamePgn(pgn.replace("Standard", "Chess960"), "abcd1234") === null, "변형 체스 PGN 거부");
  ok(cleanGamePgn('[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n1. Kb1 *', "abcd1234") === null, "시작 포지션 지정 PGN 거부");
  ok(cleanGamePgn("1. e4 e4 *", "abcd1234") === null && cleanGamePgn("", "abcd1234") === null, "불법 수·빈 PGN 거부");
  ok(cleanGamePgn(pgn, "../etc/x") === null, "이상한 대국 id 거부"); }
{ const h = rd("api/_lib/explorerGames.js"), lj = rd("api/lichess.js");
  ok(/if \(\(req\.query \|\| \{\}\)\.gpgn === "1"\) return explorerPgnHandler\(req, res\);/.test(lj), "api/lichess.js가 ?gpgn=1을 기보 처리기로 넘기지 않음");
  ok(/if \(!EXPLORER_GAME_ID_RE\.test\(id\)\)/.test(h) && /if \(!row \|\| !row\.known\) \{ res\.status\(404\)/.test(h), "기보 처리기: id 검증·쌓인 대국만(임의 id 중계 금지)");
  ok(/"explorer-pgn:ip:" \+ clientIp\(req\), 30, 60/.test(h) && /"explorer-pgn:upstream", 300, 3600/.test(h), "기보 처리기 호출 한도");
  ok(/cleanGamePgn\(await up\.text\(\), id\)/.test(h) && /explorer_pgn_save/.test(h), "받은 PGN을 검증·정리한 뒤 저장"); }
ok(/create table if not exists public\.explorer_game_pgns/.test(sql) && /revoke all on public\.explorer_game_pgns from public, anon, authenticated;/.test(sql) && /if not exists \(select 1 from public\.explorer_games where game_id = p_game\) then return false;/.test(sql), "explorer_game_pgns 표·저장 함수(쌓인 대국만)");
ok(!/explorer_pgn_read|explorer_pgn_save/.test(acl), "explorer_pgn_*가 브라우저 허용 목록에 있음(서버 전용이어야 함)");
{ const i = an.indexOf("function ExplorerStatsCard("), card = an.slice(an.indexOf("function ExplorerGameRow("), an.indexOf("// 통계 요약 카드", i));
  ok(!/lichess\.org/.test(card), "전체 통계 대국이 lichess.org로 연결됨(사용자 요청으로 금지)");
  ok(!/OpenChess에 쌓인 대국|Lichess 전체 대국 기준/.test(card), "전체 통계 머리의 설명·쌓인 판수 문구가 다시 들어옴");
  ok(/t\("추천 대국"\)/.test(card) && /t\("최근 대국"\)/.test(card), "추천 대국·최근 대국 섹션");
  ok(/<MasterPlayerLine plain noRating side="w"/.test(card) && /<MasterPlayerLine plain noRating side="b"/.test(card), "전체 통계 대국은 레이팅을 숨김");
  ok(/<Search size=\{13\} \/>/.test(card) && /<BestMoveJumpButton /.test(card) && /<MasterPgnBox /.test(card), "보기·리뷰 버튼과 기보 펼침(마스터 통계 행과 같게)");
  ok(/onOpenGame=\{onOpenMyGame\} onOpenReview=\{onOpenMyGameAnalyze\}/.test(an), "보기·리뷰가 내 통계와 같은 경로로 열리지 않음"); }
if (fails.length) { console.error("✗ check-explorer-games 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-explorer-games: 전체 통계 — 수순 검증, Lichess 응답 정리, 쌓인 대국 합치기, 6시간 간격, 서버 전용 쓰기, PGN 저장·OpenChess 안에서 보기·리뷰, 추천/최근 섹션");
