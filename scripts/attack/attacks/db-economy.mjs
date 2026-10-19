// BUG-113 경제 시스템 서버화 검증 — 위조 시도는 막히고(attack), 정상 흐름은 이전과 같이 동작해야 한다(hold).
// breached=true는 attack이면 '위조 성공', hold이면 '정상 기능이 깨짐'.
const J = (r) => { try { return JSON.parse(r.out); } catch { return null; } };
const call = (sb, role, uid, sql) => sb.as(role, uid, sql);
const eco = (sb, uid) => J(call(sb, "authenticated", uid, `select public.economy_get();`)) || {};
const give = (sb, uid, xp, coins) => { call(sb, "authenticated", uid, `select public.economy_get();`); sb.admin(`update public.economy set xp=${xp}, coins=${coins} where uid='${uid}'`); };
const line = (sb, uid, tag, extra = "") => call(sb, "authenticated", uid, `select public.economy_line_solved(111111, '${tag}'${extra});`);
const money = (e) => `${e.xp}XP/${e.coins}코인`;

export default [
  { id: "BUG-113", kind: "attack", title: "프로필 pub.xp를 직접 조작해 리더보드 1위 차지",
    async run({ sb, U }) {
      eco(sb, U.mallory);
      sb.as("authenticated", U.mallory, `update public.profiles set pub = jsonb_build_object('xp', 999999999999, 'puzzleRating', 99999) where id='${U.mallory}';`);
      const top = sb.as("anon", null, `select username || ':' || (pub->>'xp') from public.leaderboard_top(1);`).out;
      const pub = sb.admin(`select pub->>'xp' || '/' || (pub->>'puzzleRating') from public.profiles where id='${U.mallory}'`).out;
      return { breached: /999999999999/.test(top + pub), evidence: `조작 후 공개 xp/레이팅=${pub} (서버가 원장 값 0과 범위 4000으로 덮어씀)` };
    } },
  { id: "BUG-113b", kind: "attack", title: "user_progress에 코인·XP·스킨을 직접 써넣기(옛 클라이언트 방식)",
    async run({ sb, U }) {
      sb.as("authenticated", U.mallory, `insert into public.user_progress(id,progress) values ('${U.mallory}','{"coins":999999999,"xp":999999999,"ownedSkins":["pc:crystal:K"],"title":"ok"}') on conflict (id) do update set progress=excluded.progress;`);
      const stored = sb.admin(`select progress::text from public.user_progress where id='${U.mallory}'`).out;
      const e = eco(sb, U.mallory);
      return { breached: /999999999/.test(stored) || e.coins > 0 || e.xp > 0 || (e.owned || []).length > 0, evidence: `저장된 progress=${stored} · 서버 원장=${money(e)}, 스킨 ${(e.owned || []).length}개` };
    } },
  { id: "BUG-113c", kind: "attack", title: "경제 표(economy·원장·청구 기록)를 직접 쓰기 · 남의 경제 정보 읽기",
    async run({ sb, U }) {
      eco(sb, U.victim); eco(sb, U.mallory);
      const w1 = sb.as("authenticated", U.mallory, `update public.economy set coins=999999 where uid='${U.mallory}';`);
      const w2 = sb.as("authenticated", U.mallory, `insert into public.economy(uid,coins) values ('${U.bob}', 5) on conflict do nothing;`);
      const w3 = sb.as("authenticated", U.mallory, `delete from public.economy_claims;`);
      const w4 = sb.as("authenticated", U.mallory, `insert into public.economy_ledger(uid,kind,coins_delta) values ('${U.mallory}','x',1);`);
      const read = sb.as("authenticated", U.mallory, `select count(*) from public.economy where uid='${U.victim}';`).out;
      const readLedger = sb.as("authenticated", U.mallory, `select count(*) from public.economy_ledger where uid='${U.victim}';`).out;
      const anon = sb.as("anon", null, `select count(*) from public.economy;`);
      const c = sb.admin(`select coins from public.economy where uid='${U.mallory}'`).out;
      return { breached: c !== "0" || w1.ok && false || read !== "0" || readLedger !== "0" || anon.ok, evidence: `직접 쓰기 모두 거부(${w1.err.split("\\n")[0].slice(0, 40)}) · 남의 행 조회 ${read}건 · 남의 원장 ${readLedger}건 · 비로그인 ${anon.ok ? "읽힘!" : "거부"}` };
    } },
  { id: "BUG-113d", kind: "attack", title: "뽑기 위조: 코인 없이 뽑기 · 잘못된 횟수 · 코인 초과 · 서버 결과의 가격/환급 정확성",
    async run({ sb, U }) {
      const none = call(sb, "authenticated", U.mallory, `select public.gacha_pull(1);`);
      give(sb, U.mallory, 0, 499);
      const poor = call(sb, "authenticated", U.mallory, `select public.gacha_pull(1);`);
      const badCount = call(sb, "authenticated", U.mallory, `select public.gacha_pull(2);`);
      const neg = call(sb, "authenticated", U.mallory, `select public.gacha_pull(-5);`);
      const e = eco(sb, U.mallory);
      give(sb, U.mallory, 0, 5000);
      const r = J(call(sb, "authenticated", U.mallory, `select public.gacha_pull(5);`));
      const refund = r ? r.results.reduce((a, x) => a + x.refund, 0) : -1;
      const priceOk = r && r.coins === 5000 - 2400 + refund && r.cost === 2400 && r.results.length === 5 && r.results.every((x) => ["coral", "forest", "deco", "stars", "crystal"].includes(x.id));
      const bad = none.ok || poor.ok || badCount.ok || neg.ok || e.coins !== 499 || (e.owned || []).length > 0 || !priceOk;
      return { breached: bad, evidence: `코인 0/499로 뽑기 거부(${none.err.split("\\n")[0].slice(0, 30)}) · 횟수 2/-5 거부 · 5연차: 비용 ${r && r.cost}, 환급 ${refund}, 남은 코인 ${r && r.coins}(기대 ${5000 - 2400 + refund})` };
    } },
  { id: "BUG-113e", kind: "attack", title: "뽑기 확률·중복·보드 해금이 서버에서 정상 동작(5000번 뽑아 분포 확인, 기물 6종 수집 시 보드 해금)",
    async run({ sb, U }) {
      give(sb, U.bob, 0, 2000000);
      const counts = {}; let boardUnlocks = 0, dupRefundOk = true, n = 0;
      const sql = Array.from({ length: 40 }, () => `select public.gacha_pull(5);`).join("\n");
      for (const q of sql.split("\n")) {
        const r = J(call(sb, "authenticated", U.bob, q)); if (!r) continue;
        for (const x of r.results) { counts[x.id] = (counts[x.id] || 0) + 1; n++; if (!x.isNew && x.refund !== 150) dupRefundOk = false; if (x.isNew && x.refund !== 0) dupRefundOk = false; }
        boardUnlocks += r.boardUnlocked.length;
      }
      const e = eco(sb, U.bob);
      const share = (id) => (counts[id] || 0) / n;
      const expected = { coral: .28, forest: .26, deco: .22, stars: .15, crystal: .09 };
      const off = Object.keys(expected).filter((k) => Math.abs(share(k) - expected[k]) > 0.08);
      const owned = e.owned || [];
      const allSix = (set) => ["P", "N", "B", "R", "Q", "K"].every((p) => owned.includes(`pc:${set}:${p}`));
      const setsComplete = ["coral", "forest", "deco", "stars", "crystal"].filter(allSix).length;
      return { breached: off.length > 0 || !dupRefundOk || boardUnlocks !== setsComplete || n !== 200, evidence: `200회 뽑기 분포 ${Object.entries(counts).map(([k, v]) => k + ":" + (100 * v / n).toFixed(0) + "%").join(" ")} · 중복 환급 ${dupRefundOk ? "정상(150)" : "오류"} · 보드 해금 ${boardUnlocks}회(완성 세트 ${setsComplete}개)` };
    } },
  { id: "BUG-113f", kind: "attack", title: "퍼즐 라인 XP 파밍: 같은 라인 반복 · 존재하지 않는 라인 이름 대량 신고 · 존재하지 않는 퍼즐 · 비로그인",
    async run({ sb, U }) {
      const first = J(line(sb, U.mallory, "a"));
      const repeat = Array.from({ length: 10 }, () => J(line(sb, U.mallory, "a")));
      const second = J(line(sb, U.mallory, "b"));
      const third = J(line(sb, U.mallory, "c"));
      const invented = [J(line(sb, U.mallory, "x1")), J(line(sb, U.mallory, "x2"))];   // 실제 라인은 3개뿐이므로 더는 지급되지 않아야 함
      const ghost = call(sb, "authenticated", U.mallory, `select public.economy_line_solved(424242, 'a');`);
      const anon = call(sb, "anon", null, `select public.economy_line_solved(111111, 'zz');`);
      const e = eco(sb, U.mallory);
      const gains = [first, second, third].map((x) => x && x.gain);
      const bad = !first || first.gain < 15 || first.gain > 20 || repeat.some((r) => r && r.gain) || (invented[0] && invented[0].gain) || (invented[1] && invented[1].gain) || ghost.ok || anon.ok || e.xp !== gains.reduce((a, b) => a + (b || 0), 0) || gains.some((g, i) => g < (i === 0 ? 15 : 0));
      return { breached: bad, evidence: `정상 3라인 XP ${gains.join("+")}=${e.xp} (첫 라인 15~20, 별이 쌓일수록 증가) · 같은 라인 10번 반복 지급 0 · 가짜 라인 지급 0 · 없는 퍼즐/비로그인 거부` };
    } },
  { id: "BUG-113g", kind: "attack", title: "라인 XP 속도 제한: 4초 안에 여러 퍼즐 라인 연속 신고(자동화 파밍)",
    async run({ sb, U }) {
      sb.admin(`insert into public.puzzles(no,data) values (222222, '{"id":"p2","tree":{"children":[{"san":"d4","children":[{"san":"d5","children":[{"san":"c4"}]},{"san":"Nf6","children":[{"san":"c4"}]},{"san":"e6","children":[{"san":"c4"}]},{"san":"g6","children":[{"san":"c4"}]}]}]}}')`);
      const results = ["a", "b", "c", "d"].map((t) => call(sb, "authenticated", U.mallory, `select public.economy_line_solved(222222, '${t}');`));
      const okCount = results.filter((r) => r.ok).length;
      return { breached: okCount > 3, evidence: `연속 4건 중 지급 ${okCount}건 (12초에 3건까지)` };
    } },
  { id: "BUG-113h", kind: "attack", title: "공유 보상: 서버가 금액(얻은 XP의 10%)을 정해 공유자에게 직접 지급 · 남이 받은 공유 메시지로 청구 · 중복 청구",
    async run({ sb, U }) {
      const mid = sb.admin(`insert into public.chat_messages(from_uid,to_uid,puzzle_no) values ('${U.victim}','${U.bob}',111111) returning id`).out.split("\n")[0];
      const before = eco(sb, U.victim);
      const r = J(call(sb, "authenticated", U.bob, `select public.economy_line_solved(111111, 'a', ${mid});`));
      const after = eco(sb, U.victim);
      const stolen = call(sb, "authenticated", U.mallory, `select public.economy_line_solved(111111, 'a', ${mid});`);   // mallory는 받는 사람이 아님
      const again = call(sb, "authenticated", U.bob, `select public.economy_line_solved(111111, 'a', ${mid});`);
      const final = eco(sb, U.victim);
      const expected = Math.max(1, Math.round(r.gain * 0.1));
      const mallorySharer = sb.admin(`select count(*) from public.economy_ledger where uid='${U.victim}' and kind='share_reward'`).out;
      return { breached: (after.xp - before.xp) !== expected || final.xp !== after.xp || mallorySharer !== "1", evidence: `bob의 XP ${r.gain} → victim에게 서버가 ${after.xp - before.xp}(기대 ${expected}) 지급 · 도용 청구·중복 청구로 추가 지급 ${final.xp - after.xp}` };
    } },
  { id: "BUG-113i", kind: "attack", title: "티어 승급 코인: 서버가 XP로 티어를 계산해 승급 시 (새 티어×50) 코인 1회 지급 · 같은 티어에서 반복 지급 없음",
    async run({ sb, U }) {
      give(sb, U.bob, 495, 0);
      const r1 = J(call(sb, "authenticated", U.bob, `select public.economy_line_solved(111111, 'a');`));
      const e1 = eco(sb, U.bob);
      const r2 = J(call(sb, "authenticated", U.bob, `select public.economy_line_solved(111111, 'b');`));
      const e2 = eco(sb, U.bob);
      return { breached: !(r1 && r1.tierUp === 50 && e1.coins === 50 && e1.tierIndex === 1 && r2 && !r2.tierUp && e2.coins === 50), evidence: `495XP → 라인 1개(+${r1 && r1.gain}) → 브론즈 승급 보상 ${r1 && r1.tierUp}코인(누적 ${e1.coins}) · 다음 라인에서는 추가 승급 보상 ${r2 && r2.tierUp ? "있음!" : "없음"}` };
    } },
  { id: "BUG-113j", kind: "attack", title: "일일 퀘스트 위조: 푼 적 없이 puzzle 슬롯 · 같은 날 중복 · 보너스 먼저 · 잘못된 슬롯 · 정상 흐름의 합계",
    async run({ sb, U }) {
      const noSolve = call(sb, "authenticated", U.mallory, `select public.economy_claim_quest('puzzle');`);
      const bonusEarly = call(sb, "authenticated", U.mallory, `select public.economy_claim_quest('bonus');`);
      const badSlot = call(sb, "authenticated", U.mallory, `select public.economy_claim_quest('cc_9');`);
      line(sb, U.mallory, "a");
      const p1 = J(call(sb, "authenticated", U.mallory, `select public.economy_claim_quest('puzzle');`));
      const p2 = J(call(sb, "authenticated", U.mallory, `select public.economy_claim_quest('puzzle');`));
      const slots = ["dailypuzzle", "cc_0", "cc_1", "cc_2"].map((s) => J(call(sb, "authenticated", U.mallory, `select public.economy_claim_quest('${s}');`)));
      const before = eco(sb, U.mallory);
      const bonus = J(call(sb, "authenticated", U.mallory, `select public.economy_claim_quest('bonus');`));
      const bonus2 = J(call(sb, "authenticated", U.mallory, `select public.economy_claim_quest('bonus');`));
      const e = eco(sb, U.mallory);
      const bad = noSolve.ok || bonusEarly.ok || badSlot.ok || !p1 || p1.duplicate !== false || !p2 || p2.duplicate !== true || slots.some((x) => !x) || !bonus || bonus.gainXp !== 20 || !bonus2 || bonus2.duplicate !== true || e.coins !== 50 + 50 || e.xp !== before.xp + 20;
      return { breached: bad, evidence: `푼 적 없는 퀘스트·조기 보너스·가짜 슬롯 거부 · 5슬롯 ${p1 && p1.gainCoins}코인×5 + 보너스(XP ${bonus && bonus.gainXp}, 코인 ${bonus && bonus.gainCoins}) = 합계 ${e.coins}코인 · 중복 청구는 지급 0` };
    } },
  { id: "BUG-113k", kind: "attack", title: "챕터 보상: 같은 챕터 반복 · 이름을 지어낸 챕터로 코인 생성 · 거액 설정은 상한 · 서버 콘텐츠가 없을 때는 기본 레슨 목록만 · 시간당 제한",
    async run({ sb, U }) {
      // (1) 서버 콘텐츠에 레슨이 있을 때: 그 목록만
      sb.admin(`insert into public.app_content(key,value) values ('global','{"lessons":{"ch1":{"reward":250},"chHuge":{"reward":99999999},"chNone":{}}}')`);
      const a = J(call(sb, "authenticated", U.mallory, `select public.economy_claim_chapter('ch1');`));
      const again = J(call(sb, "authenticated", U.mallory, `select public.economy_claim_chapter('ch1');`));
      const huge = J(call(sb, "authenticated", U.mallory, `select public.economy_claim_chapter('chHuge');`));
      const dflt = J(call(sb, "authenticated", U.mallory, `select public.economy_claim_chapter('chNone');`));
      const invented = Array.from({ length: 5 }, (_, i) => call(sb, "authenticated", U.mallory, `select public.economy_claim_chapter('made_up_${i}');`));
      const bad = call(sb, "authenticated", U.mallory, `select public.economy_claim_chapter('x; drop table y');`);
      const e1 = eco(sb, U.mallory);
      // (2) 서버 콘텐츠에 레슨이 없을 때: 코드의 기본 레슨 목록(l_intro=40 …)만
      sb.admin(`delete from public.app_content`);
      const seed = J(call(sb, "authenticated", U.mallory, `select public.economy_claim_chapter('l_intro');`));
      const inventedSeed = call(sb, "authenticated", U.mallory, `select public.economy_claim_chapter('ch1');`);
      const e2 = eco(sb, U.mallory);
      // (3) 시간당 제한: 지어낸 이름을 계속 보내도 제한에 걸린다
      const flood = Array.from({ length: 40 }, (_, i) => call(sb, "authenticated", U.bob, `select public.economy_claim_chapter('zz_${i}');`));
      const limited = flood.filter((r) => J(r) && J(r).error === "rate limited").length;
      const bad2 = !(a && a.gainCoins === 250 && again && again.duplicate && huge && huge.gainCoins === 1000 && dflt && dflt.gainCoins === 100) || invented.some((r) => !(J(r) && J(r).error)) || bad.ok
        || e1.coins !== 250 + 1000 + 100 || !(seed && seed.gainCoins === 40) || !(J(inventedSeed) && J(inventedSeed).error) || e2.coins !== e1.coins + 40 || limited < 5 || flood.some((r) => J(r) && !J(r).error);
      return { breached: bad2, evidence: `서버 콘텐츠 챕터 ch1 ${a && a.gainCoins}·반복 지급 0·거액 설정 상한 ${huge && huge.gainCoins}·reward 없는 챕터 기본 ${dflt && dflt.gainCoins} · 지어낸 이름 5개·잘못된 이름 거부 · 콘텐츠 없을 때 기본 레슨 l_intro ${seed && seed.gainCoins}(지어낸 이름 거부) · 지어낸 이름 40개 중 제한 ${limited}건, 지급 0` };
    } },
  { id: "BUG-113l", kind: "attack", title: "알림 보상 위조: payload의 reward를 고쳐 청구 · reward_amount 컬럼 수정 · 같은 알림 반복 · 남의 알림 청구",
    async run({ sb, U }) {
      const nid = sb.admin(`insert into public.notifications(to_uid,kind,payload,reward_amount) values ('${U.mallory}','daily_puzzle_selected','{"no":1,"reward":30,"claimed":false}',30) returning id`).out.split("\n")[0];
      const edit = call(sb, "authenticated", U.mallory, `update public.notifications set payload = jsonb_set(payload,'{reward}','99999999') where id=${nid};`);
      const col = call(sb, "authenticated", U.mallory, `update public.notifications set reward_amount = 99999999 where id=${nid};`);
      const reset = call(sb, "authenticated", U.mallory, `update public.notifications set payload = payload || '{"claimed":false}' where id=${nid};`);
      const a = J(call(sb, "authenticated", U.mallory, `select public.economy_claim_notification(${nid});`));
      const b = J(call(sb, "authenticated", U.mallory, `select public.economy_claim_notification(${nid});`));
      const other = call(sb, "authenticated", U.bob, `select public.economy_claim_notification(${nid});`);
      const e = eco(sb, U.mallory);
      return { breached: !(a && a.gainCoins === 30 && b && b.duplicate) || col.ok || other.ok || e.coins !== 30, evidence: `payload를 99999999로 고쳐도 지급은 서버 값 ${a && a.gainCoins} · reward_amount 컬럼 수정 ${col.ok ? "성공!" : "거부"} · 반복 청구 지급 0 · 남의 알림 거부 · 합계 ${e.coins}` };
    } },
  { id: "BUG-113m", kind: "attack", title: "개발자 RPC: 일반 계정의 경제 직접 지정 · 개발자 보너스 · 개발자 계정의 정상 사용",
    async run({ sb, U }) {
      const a = call(sb, "authenticated", U.mallory, `select public.economy_dev_set(100000, 100000);`);
      const b = call(sb, "authenticated", U.mallory, `select public.economy_dev_bonus();`);
      const dev = J(call(sb, "authenticated", U.dev, `select public.economy_dev_bonus();`));
      const dev2 = J(call(sb, "authenticated", U.dev, `select public.economy_dev_bonus();`));
      const set = J(call(sb, "authenticated", U.dev, `select public.economy_dev_set(1234, 4321);`));
      const e = eco(sb, U.mallory);
      return { breached: a.ok || b.ok || e.xp !== 0 || e.coins !== 0 || !dev || dev.coins !== 10000 || !dev2 || !dev2.duplicate || !set || set.xp !== 1234 || set.coins < 4321, evidence: `일반 계정 거부 · 개발자 보너스 ${dev && dev.coins}코인(1회, 반복 지급 0) · 개발자 지정 ${set && set.xp}XP/${set && set.coins}코인(승급 보상 포함)` };
    } },
  { id: "BUG-113n", kind: "attack", title: "기준선 이월: 옛 방식으로 저장된 과도한 값(XP·코인 90억, 가짜 스킨)은 범위로 잘리고 이상치로 기록",
    async run({ sb, U }) {
      sb.admin(`alter table public.user_progress disable trigger user_progress_strip_economy;
        insert into public.user_progress(id,progress) values ('${U.mallory}','{"xp":9000000000,"coins":9000000000,"ownedSkins":["pc:crystal:K","evil;drop","piece:grandmaster","<script>"]}') on conflict (id) do update set progress=excluded.progress;
        alter table public.user_progress enable trigger user_progress_strip_economy;`);
      const e = eco(sb, U.mallory);
      const anomalies = sb.admin(`select count(*) from public.economy_anomalies where uid='${U.mallory}'`).out;
      return { breached: e.xp > 5000000 || e.coins > 1000000 || (e.owned || []).some((s) => /evil|script/.test(s)) || anomalies === "0", evidence: `이월 결과 ${money(e)}(상한 5,000,000/1,000,000) · 스킨 ${JSON.stringify(e.owned)} (형식 위반 항목 제거) · 이상치 기록 ${anomalies}건` };
    } },
  { id: "BUG-113o", kind: "hold", title: "정상 경로 유지: 첫 접속 계정은 0/0으로 시작하고 같은 값이 반복 조회 · 프로필 공개 xp가 원장 값을 따라감 · move_notes_cap이 서버 XP를 사용",
    async run({ sb, U }) {
      const first = eco(sb, U.bob);
      line(sb, U.bob, "a");
      const e = eco(sb, U.bob);
      const pub = sb.admin(`select pub->>'xp' from public.profiles where id='${U.bob}'`).out;
      const cap = call(sb, "authenticated", U.bob, `select public.move_notes_cap();`).out;
      sb.admin(`update public.economy set xp=200000 where uid='${U.bob}'`);
      const cap2 = call(sb, "authenticated", U.bob, `select public.move_notes_cap();`).out;
      return { breached: first.xp !== 0 || first.coins !== 0 || String(e.xp) !== pub || cap !== "1" || cap2 !== "2", evidence: `시작 ${money(first)} · 라인 1개 후 ${money(e)}, 공개 프로필 xp=${pub} · 노트 한도 ${cap}→(XP 20만)→${cap2}` };
    } },
  { id: "BUG-125", kind: "attack", title: "아이디 변경으로 사칭: 본인 프로필의 username을 공동개발자 아이디로 바꾸기 · 정상적인 프로필 저장(같은 아이디)은 유지",
    async run({ sb, U }) {
      sb.admin(`insert into public.app_content(key,value) values ('global','{"codev":["futurecodev"]}')`);
      sb.as("authenticated", U.mallory, `update public.profiles set username = 'futurecodev' where id='${U.mallory}';`);
      const name = sb.admin(`select username from public.profiles where id='${U.mallory}'`).out;
      const editor = sb.as("authenticated", U.mallory, `select public.am_content_editor();`).out;
      const save = sb.as("authenticated", U.mallory, `insert into public.profiles(id,username,pub) values ('${U.mallory}','mallory','{"nickname":"새 이름"}') on conflict (id) do update set username=excluded.username, pub=excluded.pub;`);
      const nick = sb.admin(`select pub->>'nickname' from public.profiles where id='${U.mallory}'`).out;
      return { breached: name !== "mallory" || editor === "t" || !save.ok || nick !== "새 이름", evidence: `아이디 변경 시도 후 username=${name}, 편집자 판정=${editor} · 정상 프로필 저장 ${save.ok ? "성공" : "실패"}(닉네임 ${nick})` };
    } },
];
