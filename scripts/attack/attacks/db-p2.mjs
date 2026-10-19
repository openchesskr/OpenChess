import { idForNo } from "../ids.mjs";
// P2 모의 공격 — breached=true면 공격 성공(취약).
export default [
  { id: "BUG-111", kind: "attack", title: "anon·일반 계정이 일일 퍼즐 캐시에 미래/임의 날짜를 선점해 내용 오염",
    async run({ sb, U }) {
      const direct = sb.as("anon", null, `insert into public.daily_puzzle_cache(date,data) values (current_date + 40, '{"fake":"puzzle"}');`);
      const viaRpcAnon = sb.as("anon", null, `select public.daily_puzzle_cache_put(current_date, '{"id":"${idForNo(111111)}"}'::jsonb);`);
      const farFuture = sb.as("authenticated", U.mallory, `select public.daily_puzzle_cache_put(current_date + 40, '{"id":"${idForNo(111111)}"}'::jsonb);`);
      const badId = sb.as("authenticated", U.mallory, `select public.daily_puzzle_cache_put(current_date, '{"fake":"no id"}'::jsonb);`);
      const n = sb.admin(`select count(*) from public.daily_puzzle_cache`).out;
      return { breached: n !== "0", evidence: n !== "0" ? `캐시에 ${n}행이 들어감` : `직접 삽입·비로그인·범위 밖 날짜·id 없는 내용 모두 거부(${direct.err.split("\n")[0].slice(0, 40)} / ${farFuture.err.split("\n")[0].slice(0, 40)})` };
    } },
  { id: "BUG-111b", kind: "attack", title: "일일 캐시: 서버가 고른 퍼즐(daily_puzzle_picks)과 다른 id · 선정 없는 날짜 · 개발자 등록 날짜를 일반 계정이 캐시",
    async run({ sb, U }) {
      sb.admin(`insert into public.daily_puzzle_picks(date,puzzle_no) values (current_date, 111111)`);
      sb.admin(`insert into public.daily_puzzles_dev(date,pgn,sans,puzzle_ply) values (current_date - 1, '1. e4', '["e4"]', 0)`);
      const other = sb.as("authenticated", U.mallory, `select public.daily_puzzle_cache_put(current_date, '{"id":"${idForNo(222222)}","fake":true}'::jsonb);`);   // 선정과 다른 퍼즐
      const noPick = sb.as("authenticated", U.mallory, `select public.daily_puzzle_cache_put(current_date - 2, '{"id":"${idForNo(111111)}"}'::jsonb);`);        // 선정 없는 날짜
      const devDay = sb.as("authenticated", U.mallory, `select public.daily_puzzle_cache_put(current_date - 1, '{"id":"${idForNo(111111)}"}'::jsonb);`);       // 개발자 등록 날짜
      const n = sb.admin(`select count(*) from public.daily_puzzle_cache`).out;
      return { breached: n !== "0", evidence: n !== "0" ? `캐시에 ${n}행이 들어감` : `선정과 다른 id(${other.err.split("\n")[0].slice(0, 45)}) · 선정 없는 날짜 · 개발자 날짜 모두 거부` };
    } },
  { id: "BUG-111c", kind: "hold", title: "정상 경로 유지: 서버가 고른 오늘 퍼즐은 로그인 사용자가 캐시할 수 있고, 이미 있는 날짜는 그대로",
    async run({ sb, U }) {
      sb.admin(`insert into public.daily_puzzle_picks(date,puzzle_no) values (current_date, 111111)`);
      const a = sb.as("authenticated", U.bob, `select public.daily_puzzle_cache_put(current_date, '{"id":"${idForNo(111111)}","v":1}'::jsonb);`);
      const b = sb.as("authenticated", U.mallory, `select public.daily_puzzle_cache_put(current_date, '{"id":"${idForNo(111111)}","v":2}'::jsonb);`);
      const v = sb.admin(`select data->>'v' from public.daily_puzzle_cache where date=current_date`).out;
      return { breached: !(a.ok && b.ok && v === "1"), evidence: `저장 ${a.ok ? "성공" : "실패: " + a.err}, 두 번째는 무시되어 v=${v}` };
    } },
  { id: "BUG-112a", kind: "attack", title: "puzzle_solve 반복 호출로 풀이 수(인기 랭킹) 부풀리기 — 비로그인 50회 / 로그인 50회",
    async run({ sb, U }) {
      sb.as("anon", null, "select public.puzzle_solve(111111);\n".repeat(50));
      const anonN = Number(sb.admin(`select solves from public.puzzles where no=111111`).out);
      sb.as("authenticated", U.mallory, "select public.puzzle_solve(111111);\n".repeat(50));
      const total = Number(sb.admin(`select solves from public.puzzles where no=111111`).out);
      return { breached: anonN > 3 || total - anonN > 1, evidence: `비로그인 50회 → +${anonN}(상한 3/시간) · 로그인 50회 → +${total - anonN}(상한 1/시간)` };
    } },
  { id: "BUG-112b", kind: "attack", title: "풀이 기록 테이블 도배: 비로그인 삽입 · 로그인 계정의 대량 삽입 · 터무니없는 풀이 시간",
    async run({ sb, U }) {
      const anon = sb.as("anon", null, `insert into public.puzzle_solve_events(no,uid) values (111111, null);`);
      const anonLine = sb.as("anon", null, `insert into public.puzzle_line_solve_times(no,tag,uid,ms) values (111111,'x',null,5000);`);
      const flood = sb.as("authenticated", U.mallory, `insert into public.puzzle_solve_events(no,uid) select 111111, '${U.mallory}' from generate_series(1,200);`);
      const spoofed = sb.as("authenticated", U.mallory, `insert into public.puzzle_solve_events(no,uid) values (111111, '${U.victim}');`);
      const absurd = sb.as("authenticated", U.mallory, `insert into public.puzzle_line_solve_times(no,tag,uid,ms) values (111111,'x','${U.mallory}',1);`);
      const n = Number(sb.admin(`select count(*) from public.puzzle_solve_events`).out), m = Number(sb.admin(`select count(*) from public.puzzle_line_solve_times`).out);
      return { breached: n > 0 || m > 0, evidence: n || m ? `기록 ${n}+${m}행이 들어감` : "비로그인 삽입·한 번에 200행·남의 uid·0.001초 풀이 시간 모두 거부" };
    } },
  { id: "BUG-112d", kind: "hold", title: "정상 경로 유지: 로그인 사용자의 풀이 기록·라인 풀이 시간 저장, 분당 한도 안의 연속 삽입",
    async run({ sb, U }) {
      const a = sb.as("authenticated", U.bob, `insert into public.puzzle_solve_events(no,uid) values (111111,'${U.bob}');`);
      const b = sb.as("authenticated", U.bob, `insert into public.puzzle_line_solve_times(no,tag,uid,ms) values (111111,'punish','${U.bob}',8000);`);
      const c = sb.as("authenticated", U.bob, `select public.puzzle_solve(111111);`);
      return { breached: !(a.ok && b.ok && c.ok), evidence: `풀이 기록 ${a.ok}, 라인 시간 ${b.ok}, 풀이 수 ${c.ok ? c.out : c.err}` };
    } },
  { id: "BUG-112c", kind: "attack", title: "puzzle_share_put_verified 도배: 비로그인이 새 퍼즐을 연속 100개 올리기",
    async run({ sb }) {
      let ok = 0;
      const sql = Array.from({ length: 100 }, (_, i) => `select public.puzzle_share_put_verified(null, ${900000 + i}, '{"id":"${idForNo(900000 + i)}"}'::jsonb);`).join("\n");
      // 한 호출씩 실행해 실패(속도 제한)를 센다 — 한 트랜잭션에 넣으면 첫 오류에서 전부 되돌려진다.
      for (const q of sql.split("\n")) if (sb.as("service_role", null, q).ok) ok++;
      const n = sb.admin(`select count(*) from public.puzzles where no>=900000`).out;
      // 고정 1분 창이라 테스트 도중 창이 바뀌면 최대 2배(60)까지 가능하다 — 그 이상이면 뚫린 것.
      return { breached: Number(n) > 60, evidence: `비로그인 100회 시도 → ${n}개 저장(상한 분당 30, 창이 바뀌면 최대 60)` };
    } },
  { id: "BUG-115", kind: "attack", title: "리뷰 캐시 선점: anon·일반 계정이 RPC로 아직 리뷰되지 않은 chess.com 대국 번호에 가짜 기보를 직접 저장",
    async run({ sb, U }) {
      const fake = `'{"moves":["e4","e5","Qh5","Nc6","Bc4","Nf6","Qxf7#"],"fake":true}'::jsonb`;
      const a = sb.as("anon", null, `select public.reviewed_game_put(123456789, ${fake});`);
      const b = sb.as("authenticated", U.mallory, `select public.reviewed_game_put(123456789, ${fake});`);
      const c = sb.as("authenticated", U.mallory, `select public.reviewed_analysis_put(123456789, '{"v":1,"d":10,"result":{"moves":[1]}}'::jsonb);`);
      const d = sb.as("authenticated", U.mallory, `insert into public.reviewed_games(cc_id,data) values (123456789, ${fake});`);
      const n = sb.admin(`select count(*) from public.reviewed_games`).out;
      return { breached: n !== "0", evidence: n !== "0" ? "가짜 기보가 공유 리뷰 캐시에 저장됨" : `RPC·직접 삽입 모두 거부(${a.err.split("\n")[0].slice(0, 50)})` };
    } },
  { id: "BUG-115c", kind: "attack", title: "분석 선점: 저장된 기보가 없는 대국에 분석 먼저 저장 · 다른 대국의 분석(SAN 불일치) 붙이기 · 정상 분석은 저장",
    async run({ sb }) {
      const an = (sans) => `'{"v":1,"d":20,"result":{"moves":[${sans.map((x, i) => `{"ply":${i},"san":"${x}"}`).join(",")}]}}'::jsonb`;
      const noGame = sb.as("service_role", null, `select public.reviewed_analysis_put(777, ${an(["e4", "e5"])});`).out;
      sb.as("service_role", null, `select public.reviewed_game_put(777, '{"moves":["e4","e5"]}'::jsonb);`);
      const wrong = sb.as("service_role", null, `select public.reviewed_analysis_put(777, ${an(["d4", "d5"])});`).out;
      const wrongLen = sb.as("service_role", null, `select public.reviewed_analysis_put(777, ${an(["e4"])});`).out;
      const good = sb.as("service_role", null, `select public.reviewed_analysis_put(777, ${an(["e4", "e5+"])});`).out;
      const stored = sb.admin(`select (analysis is not null)::text from public.reviewed_games where cc_id=777`).out;
      const orphan = sb.admin(`select count(*) from public.reviewed_games where cc_id=777 and data is null`).out;
      return { breached: noGame !== "f" || wrong !== "f" || wrongLen !== "f" || good !== "t" || stored !== "true" || orphan !== "0", evidence: `기보 없는 대국 ${noGame} · 다른 대국 분석 ${wrong} · 수 개수 불일치 ${wrongLen} · 정상 분석 ${good}(표기 +/# 무시) · 기보 없는 분석 행 ${orphan}개` };
    } },
  { id: "BUG-122", kind: "attack", title: "공유 보상 파밍: 옛 puzzle_share_reward(금액을 클라이언트가 정하던 RPC)를 반복 호출 — 지금은 RPC 자체가 없고 보상은 서버가 금액을 정한다(정상 흐름은 BUG-113h)",
    async run({ sb, U }) {
      const mid = sb.admin(`insert into public.chat_messages(from_uid,to_uid,puzzle_no) values ('${U.victim}','${U.bob}',111111) returning id`).out.split("\n")[0];
      let ok = 0;
      for (let i = 0; i < 10; i++) if (sb.as("authenticated", U.bob, `select public.puzzle_share_reward(${mid}, 1000);`).ok) ok++;
      const total = Number(sb.admin(`select coalesce(sum((share_reward->>'amount')::bigint),0) from public.chat_messages where to_uid='${U.victim}' and share_reward is not null`).out);
      return { breached: ok > 0 || total > 0, evidence: `옛 RPC 호출 10번 중 성공 ${ok}번, 생성된 보상 ${total} (RPC 삭제됨)` };
    } },
  { id: "BUG-122c", kind: "attack", title: "RPC 우회: 친구가 채팅 테이블에 share_reward(시스템 전용 컬럼)를 직접 넣어 상한 없는 보상 메시지 생성",
    async run({ sb, U }) {
      const r = sb.as("authenticated", U.bob, `insert into public.chat_messages(from_uid,to_uid,share_reward) values ('${U.bob}','${U.victim}','{"amount":1000000,"no":111111}'::jsonb);`);
      const n = sb.admin(`select coalesce(sum((share_reward->>'amount')::bigint),0) from public.chat_messages where to_uid='${U.victim}' and share_reward is not null`).out;
      const plain = sb.as("authenticated", U.bob, `insert into public.chat_messages(from_uid,to_uid,body) values ('${U.bob}','${U.victim}','일반 메시지는 정상');`);
      return { breached: Number(n) > 0 || !plain.ok, evidence: Number(n) > 0 ? `친구가 직접 넣은 보상 ${n} XP가 저장됨` : `share_reward 직접 삽입 거부(${r.err.split("\n")[0].slice(0, 60)}) · 일반 메시지 전송은 ${plain.ok ? "정상" : "실패!"}` };
    } },
  { id: "BUG-117", kind: "attack", title: "account_providers를 브라우저(anon·로그인)가 직접 호출해 이메일 가입 여부·방식 열거",
    async run({ sb, U }) {
      const a = sb.as("anon", null, `select public.account_providers('victim@example.com');`);
      const b = sb.as("authenticated", U.mallory, `select public.account_providers('victim@example.com');`);
      const svc = sb.as("service_role", null, `select public.account_providers('victim@example.com');`);
      return { breached: a.ok || b.ok || svc.out !== "{email}", evidence: a.ok || b.ok ? "브라우저가 직접 조회함: " + a.out : `브라우저 역할 거부 · 서버(service_role)는 정상(${svc.out}) — 조회는 호출 제한이 걸린 /api/auth-providers 경유` };
    } },
  { id: "BUG-118", kind: "attack", title: "anon이 개발자 계정 여부·콘텐츠 편집자 여부 조회",
    async run({ sb, U }) {
      const a = sb.as("anon", null, `select public.is_content_editor('${U.dev}');`).out;
      const b = sb.as("anon", null, `select public._is_dev_account('${U.dev}');`);
      const leaked = a === "t" || b.out === "t";
      return { breached: leaked, evidence: leaked ? `is_content_editor=${a}, _is_dev_account=${b.ok ? b.out : "거부"} — 누가 관리자인지 외부에 노출` : "anon은 두 함수 모두 실행 불가" };
    } },
  { id: "BUG-124b", kind: "attack", title: "봇 대국 기록 직접 저장: 옛 bot_game_record 호출 · 검증용 service 함수를 브라우저가 호출 · 서버(service_role)는 정상 저장",
    async run({ sb, U }) {
      const old = sb.as("authenticated", U.mallory, `select public.bot_game_record('{e4,e5}', 'w', 'win', 3000, '600-0');`);
      const direct = sb.as("authenticated", U.mallory, `select public.bot_game_record_verified('${U.mallory}', '{e4,e5}', 'w', 'win', 3000, '600-0');`);
      const anon = sb.as("anon", null, `select public.bot_game_record_verified('${U.mallory}', '{e4,e5}', 'w', 'win', 3000, '600-0');`);
      const n0 = sb.admin(`select count(*) from public.bot_games`).out;
      const svc = sb.as("service_role", null, `select public.bot_game_record_verified('${U.mallory}', '{e4,e5}', 'w', 'loss', 1500, '600-0');`);
      const n1 = sb.admin(`select count(*) from public.bot_games`).out;
      return { breached: old.ok || direct.ok || anon.ok || n0 !== "0" || !svc.ok || n1 !== "1", evidence: `옛 RPC·직접 호출 거부(${old.err.split("\n")[0].slice(0, 45)}) · 서버(service_role) 저장 ${svc.ok ? "정상" : "실패"}(${n1}건)` };
    } },
  { id: "BUG-123", kind: "attack", title: "혼자 하기 점수 위조: 최고점 제출 후 남이 그 기록을 읽거나 순위에 오르는지 · 본인은 개인 기록을 계속 볼 수 있는지",
    async run({ sb, U }) {
      sb.as("authenticated", U.mallory, `select public.minigame_submit_best('coord', 150);`);   // 위조 가능한 최고점
      sb.admin(`update public.minigame_stats set rated_games = 5, rating = 1300 where uid='${U.mallory}' and game='coord'`);
      const otherCol = sb.as("authenticated", U.bob, `select best_score from public.minigame_stats where uid='${U.mallory}';`);
      const anonCol = sb.as("anon", null, `select best_score from public.minigame_stats;`);
      const star = sb.as("authenticated", U.bob, `select * from public.minigame_stats where uid='${U.mallory}';`);
      const safe = sb.as("anon", null, `select rating from public.minigame_stats where uid='${U.mallory}' and game='coord';`);
      const lb = sb.as("anon", null, `select rank || ':' || coalesce(best_score::text, 'null') from public.minigame_leaderboard('coord', 'best', 'all', 10);`).out;
      const mineRows = sb.as("authenticated", U.mallory, `select best_score from public.minigame_my_best();`).out;
      const othersRows = sb.as("authenticated", U.bob, `select count(*) from public.minigame_my_best();`).out;
      // 제출 속도 제한: 시간당 120회를 채운 상태에서는 더 높은 점수도 거부되고, 창이 지나면 다시 받는다.
      sb.admin(`insert into public.rate_limits(key, window_start, n) values ('mgbest:${U.bob}', to_timestamp(floor(extract(epoch from now()) / 3600) * 3600), 120) on conflict (key, window_start) do update set n = 120`);
      const limited = sb.as("authenticated", U.bob, `select public.minigame_submit_best('attack', 50);`).out;
      sb.admin(`delete from public.rate_limits where key = 'mgbest:${U.bob}'`);
      const allowed = sb.as("authenticated", U.bob, `select public.minigame_submit_best('attack', 50);`).out;
      const bad = otherCol.ok || anonCol.ok || star.ok || !safe.ok || safe.out !== "1300" || /150/.test(lb) || mineRows !== "150" || othersRows !== "0" || limited !== "f" || allowed !== "t";
      return { breached: bad, evidence: `남이 best_score 컬럼 읽기 ${otherCol.ok ? "성공!" : "거부"}·select * ${star.ok ? "성공!" : "거부"}·공개 컬럼(레이팅 ${safe.out}) 정상 · 순위에 위조 점수 ${/150/.test(lb) ? "노출!" : "없음(레이팅 기준)"} · 내 개인 기록 ${mineRows} · 제출 한도(120/시간) 초과 시 ${limited === "f" ? "거부" : "통과!"}, 창이 지나면 ${allowed === "t" ? "다시 허용" : "거부!"}` };
    } },
  { id: "BUG-118b", kind: "attack", title: "프로필 사진 추적: 외부 URL(추적 픽셀)·svg·javascript:·거대한 data URL을 사진으로 저장 · 정상 업로드 사진은 유지 · 소개글 길이 제한",
    async run({ sb, U }) {
      const set = (photo, extra = "") => { sb.as("authenticated", U.mallory, `update public.profiles set pub = jsonb_build_object('photo', $p$${photo}$p$ ${extra}) where id='${U.mallory}';`); return sb.admin(`select coalesce(pub->>'photo','') from public.profiles where id='${U.mallory}'`).out; };
      const ext = set("https://evil.example/pixel.png?viewer=1");
      const svg = set("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");
      const js = set("javascript:alert(1)");
      const huge = set("data:image/jpeg;base64," + "A".repeat(250000));
      const good = set("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD=");
      sb.as("authenticated", U.mallory, `update public.profiles set pub = jsonb_build_object('bio', repeat('가', 5000), 'nickname', repeat('n', 300)) where id='${U.mallory}';`);
      const bioLen = sb.admin(`select length(pub->>'bio') || '/' || length(pub->>'nickname') from public.profiles where id='${U.mallory}'`).out;
      const bad = ext !== "" || svg !== "" || js !== "" || huge !== "" || !good.startsWith("data:image/jpeg") || bioLen !== "600/60";
      return { breached: bad, evidence: `외부 URL ${ext === "" ? "제거" : "저장됨!"} · svg ${svg === "" ? "제거" : "저장됨!"} · javascript: ${js === "" ? "제거" : "저장됨!"} · 25만 자 data ${huge === "" ? "제거" : "저장됨!"} · 정상 JPEG ${good ? "유지" : "삭제됨!"} · 소개글/닉네임 길이 ${bioLen}` };
    } },
];
