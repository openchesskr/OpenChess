#!/usr/bin/env node
/** (v0.7.4 개편) 성장 분석 안전장치. 약점 지도·복습 카드·오프닝 실수는 처음부터 다시 설계하려고 삭제했다 — 이 검사는 남은 것과 새 게이트를 지킨다.
 *  ① 리뷰 5판 게이트: 내가 리뷰한 대국 수 계산(내 chess.com 아이디가 한쪽인 대국·내 OpenChess 대국 id만, 남의 대국·PGN·옛 버전·빈 수 목록은 제외)과 5판 기준, 게이지 바·안내 문구 연결.
 *  ② 하이라이트: 최대 3개, 서로 떨어져 있고 시간순이며 점수 하한을 지킨다. 깨끗한 판은 비어 있다.
 *  ③ 마스터 스타일: 특징 계산이 손으로 센 값과 같고, 표본이 적으면 매칭하지 않으며, 같은 성향의 가짜 마스터가 가장 가깝게 나온다. 마스터 데이터 형식.
 *  ④ 연결: 삭제한 성장 분석 코드(실수 기록·복습 카드·오프닝 실수)가 다시 들어오지 않는다. */
import { readFileSync } from "node:fs";
const fails = [];
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) fails.push(m); };
const R = await import("../src/lib/reviewedCount.js"), A = await import("../src/lib/growthAnalysis.js"), H = await import("../src/lib/highlights.js"), S = await import("../src/lib/masterStyle.js");
const { CRITERIA_GROUPS } = S;

// ── ① 리뷰 5판 게이트·내 대국 수집 ──
const P = "oc-review-result:";
const fakeStore = (entries) => { const m = new Map(entries); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };
{
  const good = (extra) => JSON.stringify({ v: 1, d: 20, result: { moves: [{ san: "e4", white: true, kind: "best" }] }, ...(extra ? { m: extra } : {}) });
  const st = fakeStore([
    [P + "cc:Me|Foe|100", good()], [P + "cc:foe|ME|200", good()],                                      // 내 chess.com 대국 2판(흰·검 어느 쪽이든, 대소문자 무시)
    [P + "cc:Foe|Other|300", good()],                                                                  // 남의 chess.com 대국 — 제외
    [P + "id:pvp-12", good({ color: "w", owner: "tester" })], [P + "id:bot-3", good({ color: "b", owner: "tester" })],   // 내 OpenChess 대국 2판(메타 있음)
    [P + "id:pvp-99", good()],                                                                         // 메타 없는 옛 항목 — 진영을 몰라 제외
    [P + "id:pvp-77", good({ color: "w", owner: "someoneelse" })],                                     // 남의 프로필에서 연 대국 — 제외
    [P + "pgn:e4 e5", good()], [P + "fen:x|y", good()],                                                // PGN·FEN 리뷰 — 제외
    [P + "cc:Me|Foe|400", JSON.stringify({ v: 0, result: { moves: [{}] } })],                          // 옛 버전 — 제외
    [P + "cc:Me|Foe|500", JSON.stringify({ v: 1, result: { moves: [] } })],                            // 수 목록 없음 — 제외
    [P + "cc:Me|Foe|600", "{깨진 JSON"],                                                               // 깨진 값 — 제외(throw 안 함)
    ["oc-review-pos:cc:Me|Foe|700", good()],                                                           // 리뷰 결과가 아니라 위치 기록 — 제외
  ]);
  const recs = R.collectMyReviews({ names: ["Tester"], ccName: "me", version: 1, storage: st });
  eq(recs.length, 4, "내 대국 4판(cc 2 + OpenChess 2)만 모은다");
  eq(recs.map((r) => r.color).sort(), ["b", "b", "w", "w"], "진영: cc는 이름으로, OpenChess는 메타로");
  eq(recs.find((r) => r.key === P + "cc:foe|ME|200").owner, "me", "cc 대국의 owner는 일치한 내 아이디");
  eq(R.countMyReviewedGames({ names: ["tester"], ccName: "", version: 1, storage: st }), 2, "chess.com 아이디가 없으면 OpenChess 대국만 센다");
  eq(R.countMyReviewedGames({ names: [], ccName: "", version: 1, storage: st }), 0, "내 아이디를 모르면 0");
  eq(R.countMyReviewedGames({ names: ["tester"], ccName: "me", version: 1, storage: fakeStore([]) }), 0, "빈 저장소는 0");
  eq(R.countMyReviewedGames({ names: ["tester"], ccName: "me", version: 1, storage: null }), 0, "저장소가 없어도 throw 없이 0(브라우저 밖)");
  eq(R.GROWTH_MIN_REVIEWS, 5, "성장 분석은 리뷰 5판부터");
}
// ── ①-b 분석: 구간·원인·수 유형·곡선·성장 가능성 ──
{
  const SANS = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7 c4 c6".split(" ");
  // evalWin(흰색 기준 승률 %): 평소 55, Ba4(ply 6)에서 55→20으로 추락, h3(ply 16)에서 52→40
  const EW = SANS.map((_, ply) => (ply <= 6 ? 55 : ply <= 7 ? 20 : ply <= 16 ? 52 : 40)).concat([40]);
  const mkRec = (acc, i) => ({ key: "k" + i, endTime: 1000 + i, owner: "me", color: "w", white: "me", black: "foe", id: null, opening: "Ruy Lopez",
    result: { whiteAcc: acc, blackAcc: 70, evalWin: EW, moves: SANS.map((san, ply) => { const white = ply % 2 === 0; let kind = "good", loss = 1; if (white && ply === 6) { kind = "blunder"; loss = 40; } if (white && ply === 16) { kind = "mistake"; loss = 15; }
      const alts = ply === 6 ? [{ san: "Bxc6", win: 55 }, { san: "O-O", win: 52 }, { san: "d3", win: 40 }] : ply === 16 ? [{ san: "d4", win: 52 }] : undefined;
      return { san, white, kind, lossWinPct: loss, sharp: 0, best: ply === 6 ? "Bxc6" : ply === 16 ? "d4" : null, beforeCp: 10, ...(alts ? { alts } : null) }; }) } });
  const { games, growth: gr } = A.growthFromRecords([60, 64, 66, 70, 74, 80].map(mkRec));
  ok(gr && gr.n === 6 && games.length === 6, "여섯 판이 모두 분석됨");
  eq(gr.curve.map((c) => c.acc), [60, 64, 66, 70, 74, 80], "성장 곡선은 시간순 판별 정확도");
  eq([gr.trend.k, gr.trend.recent, gr.trend.prev, gr.trend.delta], [3, 74.7, 63.3, 11.3], "최근 3판 vs 이전 3판 변화");
  ok(games[0].mine.every((x) => x.phase), "내 수마다 구간이 붙음");
  eq(games[0].mine.length, 11, "백 11수만 내 수로 뽑음(흑 수는 제외)");
  eq(gr.phases.map((p) => [p.key, p.games > 0]), [["opening", true], ["middle", true], ["end", false]], "오프닝·중반 구간 정확도 계산, 엔드게임은 표본 없음");
  ok(gr.weakPhase && gr.phases.every((p) => p.acc == null || gr.weakPhase.acc <= p.acc), "가장 약한 구간은 평균 정확도가 가장 낮은 구간");
  eq(gr.causes.map((c) => c.key).sort(), ["missedWin", "positional"], "원인 분류: Ba4(Bxc6을 놓침)=기물 획득 놓침, h3=포지션 판단");
  ok(gr.causes[0].lossSum >= gr.causes[1].lossSum && Math.abs(gr.causes.reduce((s, c) => s + c.share, 0) - 1) < 1e-9, "원인은 손실 큰 순이고 비중의 합이 1");
  ok(gr.focus && gr.focus.cause === "missedWin" && gr.focus.games === 6 && gr.focus.gain > 0, "고칠 한 가지 = 손실 비중이 가장 큰 반복 원인, 상승폭 > 0");
  ok(gr.focus.examples.length === 2 && gr.focus.examples[0].loss >= gr.focus.examples[1].loss, "예시는 손실 큰 순 2개");
  eq(gr.moveTypes.find((r) => r.key === "b").bad, 6, "수 유형별: 비숍으로 둔 나쁜 수 6개(Ba4)");
  eq(gr.moveTypes.find((r) => r.key === "castle").n, 6, "수 유형별: 캐슬링 6번");
  ok(gr.worst.length <= 7 && gr.worst.every((w, i) => i === 0 || gr.worst[i - 1].loss >= w.loss), "가장 아쉬운 수는 손실 큰 순");
  eq(gr.pending, 0, "분류가 끝나면 pending 0");
  // 실수 기록(오프닝 실수 블록)용 데이터: 승률 전/후(둔 사람 관점), MEC 입력, 대안 수, 구간
  ok(gr.badMoves.length === 12 && gr.badMoves.every((x) => x.bad && x.game), "실수 기록: 실수·블런더·놓친 수만 모음(판당 2개 × 6판)");
  const ba = gr.badMoves.find((x) => x.san === "Ba4"), hh = gr.badMoves.find((x) => x.san === "h3");
  eq([ba.phase, ba.winBefore, ba.winAfter, ba.beforeCp], ["opening", 55, 20, 10], "블런더 Ba4: 구간 오프닝, 승률 55%→20%(로지스틱 변환된 evalWin), beforeCp 보존");
  eq(hh.phase, "middle", "h3는 중반 구간");
  eq(ba.alts.map((a) => a.san), ["Bxc6", "O-O", "d3"], "alts가 그대로 실림");
  eq(A.betterMoves(ba).map((b) => [b.san, b.win, b.best]), [["Bxc6", 55, true], ["O-O", 52, false]], "대신 둘 수 있는 수: 최선수 먼저, 최선과 10%p 이내 후보만(d3 40%는 제외)");
  eq(A.betterMoves(hh).map((b) => b.san), ["d4"], "대안 후보가 최선수뿐이면 최선수만");
  eq(A.betterMoves({ san: "Qh5", best: "Nf3", winBefore: 60, alts: [] }).map((b) => [b.san, b.win]), [["Nf3", 60]], "옛 결과(alts 없음)는 최선수만, 승률은 두기 전 승률");
  eq(A.betterMoves({ san: "Qh5", best: null, winBefore: 60, alts: [{ san: "Qh5", win: 60 }] }), [], "둔 수 자신은 대안에서 뺀다");
  eq(A.cleanAlts([{ san: "Nf3", win: 55 }, { san: "<script>", win: 50 }, { san: "e4", win: 120 }]).map((a) => a.san), ["Nf3"], "alts 검증: 형식 틀린 값(스크립트·범위 밖 승률)은 버림");
  eq(A.cleanAlts([{ san: "d4", win: "9" }, null, { san: "c4", win: 50 }]).map((a) => a.san), ["c4"], "alts 검증: 문자열 승률·null은 버림");
  eq(A.cleanAlts(new Array(4).fill({ san: "e4", win: 50 })), [], "alts는 최대 3개");
  eq(A.cleanAlts("x"), [], "배열이 아니면 빈 목록");
  eq(A.joinSentences(["A queen is lost", "Opponent's rook can be captured."]), "A queen is lost. Opponent's rook can be captured.", "문장 이어 붙이기: 끝 구두점이 없으면 마침표를 붙임");
  eq(A.joinSentences(["퀸을 잃습니다.", " ", null, "룩이 잡힙니다"]), "퀸을 잃습니다. 룩이 잡힙니다.", "빈 문장은 버리고 한국어도 마침표 보정");
  eq(A.joinSentences(["クイーンを失う", "ルークが取られる。"]), "クイーンを失う。 ルークが取られる。", "일본어는 。");
  eq(A.joinSentences([]), "", "문장이 없으면 빈 문자열");
  // 분류 전(pending)에는 원인에서 빠지고 개수만 알린다 — 화면이 빠른 계산을 먼저 그리기 위한 계약
  const cache0 = new Map(); const g0 = [60, 64].map(mkRec).map((r) => A.analyzeGame(r, cache0));
  const before = A.buildGrowth(g0);
  ok(before.pending === 4 && before.causes.length === 0 && before.moveTypes.length > 0, "분류 전: 원인 없음·pending 개수·수 유형은 이미 계산됨");
  const step = A.classifyPending(g0, cache0, 0);   // 시간 예산 0 — 캐시 적중이 없으면 하나도 못 한다
  eq(step.left, 4, "시간 예산이 0이면 아무것도 분류하지 않고 남은 개수를 알림");
  A.classifyPending(g0, cache0, Infinity);
  eq(A.buildGrowth(g0).pending, 0, "끝까지 돌리면 모두 분류됨");
  eq(cache0.size, 2, "같은 포지션·수는 캐시 하나로(두 판에 똑같이 나온 2개 수)");
  // 캐시 영속: 저장 후 불러오면 같은 분류가 즉시 붙어 pending이 없다
  const ls = fakeStore([]); A.saveCauseCache(cache0, ls);
  const cache1 = A.loadCauseCache(ls);
  const g1 = [60, 64].map(mkRec).map((r) => A.analyzeGame(r, cache1));
  ok(g1.every((g) => g.mine.every((x) => !x.pending)), "저장된 분류 캐시를 불러오면 다시 계산하지 않는다");
  // 방어: 깨진 입력·내 진영 없음
  eq(A.analyzeGame({ color: null, result: { moves: [] } }), null, "진영이 없으면 분석하지 않음");
  eq(A.buildGrowth([]), null, "판이 없으면 null");
  ok(A.analyzeGame({ color: "w", result: { moves: [{ san: "zz9", white: true, kind: "best" }] } }).mine.length === 0, "해석 불가한 수에서 멈추고 throw하지 않음");
  eq(A.loadCauseCache(fakeStore([["oc_growth_cause_v1", "{깨짐"]])).size, 0, "깨진 캐시는 빈 캐시");
  // 같은 원인을 없앤 정확도는 원래보다 높거나 같다(계산식이 단조)
  ok(gr.focus.gain >= 0, "성장 가능성 추정은 음수가 아님");
}
// ── ② 하이라이트 ──
const mk = (san, white, kind, extra = {}) => ({ san, white, kind, lossWinPct: 20, best: null, ...extra });
const long = { moves: Array.from({ length: 30 }, (_, i) => mk(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O", "h3", "Nb8", "d4", "Nbd7", "c4", "c6", "cxb5", "axb5", "Nc3", "Bb7", "Bg5", "b4", "Nb1", "h6"][i], i % 2 === 0, "good", { lossWinPct: 0 })), evalWin: new Array(31).fill(50) };
long.moves[6].kind = "blunder"; long.moves[6].lossWinPct = 40; long.moves[8].kind = "blunder"; long.moves[8].lossWinPct = 35;   // 가까운 둘(ply 6·8)은 하나만
long.moves[14].kind = "brilliant"; long.moves[22].kind = "mistake"; long.moves[22].lossWinPct = 25;
const hl = H.pickHighlights(long, 3);
ok(hl.length === 3, "하이라이트 3개(가까운 것은 하나만)"); eq(hl.map((h) => h.ply), [...hl.map((h) => h.ply)].sort((a, b) => a - b), "시간순");
ok(hl.every((h, i) => i === 0 || h.ply - hl[i - 1].ply >= H.HIGHLIGHT_MIN_GAP), "서로 4수 이상 떨어짐");
ok(hl.every((h) => h.score >= H.HIGHLIGHT_MIN_SCORE && /\//.test(h.fen) && h.from && h.to), "점수 하한 · 포지션·이동 칸 채움");
ok(hl.some((h) => h.ply === 14 && h.kind === "brilliant"), "탁월한 수 포함");
eq(H.pickHighlights({ moves: long.moves.map((m) => ({ ...m, kind: "good", lossWinPct: 0 })), evalWin: new Array(31).fill(50) }).length, 0, "깨끗한 판은 하이라이트 없음");
eq(H.pickHighlights({ moves: [] }).length, 0, "빈 결과");

// ── ③ 마스터 스타일 ──
const G = (moves, color, result = "win") => ({ moves, color, result });
const f = S.styleFeatures([G(["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6"], "w"), G(["d4", "d5", "c4", "e6", "Nc3", "Nf6"], "b"), G(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "O-O-O", "Nf6"], "w", "draw")]);
eq([f.vec[0], f.vec[1], f.vec[3], f.vec[5], f.vec[12], f.vec[7]], [1, 0, null, 1, 1 / 3, 1], "특징: 백 e4 비율·백 d4·흑 e5(분모 없으면 null)·흑 …d5·무승부·퀸사이드 캐슬링");
const data = JSON.parse(readFileSync(new URL("../src/data/masterStyles.json", import.meta.url), "utf8"));
eq(data.keys, S.STYLE_KEYS, "마스터 데이터의 특징 순서가 앱과 같음");
ok(data.masters.length >= 150 && data.masters.every((m) => m[3].length === 14), "마스터 데이터: 150명 이상, 특징 14개(후퇴 수 비율 포함)");
eq(S.matchMasters(f, data).ok, false, "표본(15판) 미만이면 매칭하지 않는다");
// 가짜 마스터("Twin")의 벡터를 그대로 내 특징으로 만들면 그 마스터가 1등이어야 한다
const twin = data.masters[7], fake = { vec: twin[3].slice(), den: new Array(14).fill(1e6), n: 40 };
const mm = S.matchMasters(fake, data, 3);
ok(mm.ok && mm.list[0].name === twin[0], "같은 성향이면 그 마스터가 가장 가깝다: " + (mm.list[0] && mm.list[0].name) + " vs " + twin[0]);
ok(mm.list[0].sim > mm.list[2].sim, "닮은 정도가 순서대로 줄어든다");
ok(S.sharedTraits(mm.z, twin, data).every((tr) => S.STYLE_KEYS.includes(tr.key)), "닮은 점은 정의된 특징");

// 기준별 비교(판정은 기준마다 사람이 보기에 큰 차이인가로 계산 — 표준편차 기준이 아님): 사용자 제보 사례를 그대로 고정한다
{
  const lv = (key, a, b) => S.criterionDiff(key, a, b).level;
  eq([lv("checkRate", 0.09, 0.07), lv("capRate", 0.26, 0.22), lv("queenTrade", 0.10, 0.09), lv("castleQ", 0.30, 0.26)], ["same", "same", "same", "same"], "9% 대 7%, 26% 대 22% 같은 작은 차이는 거의 같음");
  eq([lv("w_e4", 0.96, 0.52), lv("w_d4", 0.03, 0.48), lv("b_e5", 0.77, 1.0), lv("drawRate", 0.05, 0.26)], ["veryFar", "veryFar", "far", "far"], "큰 비율 차이(44%p·45%p)는 많이 다름, 23·21%p는 다름");
  eq([lv("w_flank", 0.01, 0), lv("b_c5", 0.12, 0), lv("b_nf6", 0.91, 0.92), lv("b_d5", 0.06, 0)], ["same", "close", "same", "same"], "0%에 가까운 값끼리·1%p 차이는 거의 같음, 12%p는 비슷함");
  eq([lv("length", 25 / 60, 40 / 60), lv("length", 40 / 60, 42 / 60), lv("checkRate", 0.05, 0.10), lv("checkRate", 0.005, 0.015)], ["far", "same", "far", "same"], "대국 25수 대 40수는 다름, 40수 대 42수는 거의 같음, 체크 5% 대 10%(2배)는 다름, 둘 다 2% 미만은 거의 같음");
  eq(S.criterionDiff("w_e4", null, 0.5), { diff: null, level: "na" }, "한쪽 값이 없으면 비교 불가");
  eq([S.formatDiff("w_e4", 0.44), S.formatDiff("checkRate", 1.286), S.formatDiff("length", 1.6), S.formatDiff("w_e4", null)], ["±44%p", "1.3배", "1.6배", "-"], "차이 표기");
  ok(S.STYLE_KEYS.every((k) => S.CRITERION_KIND[k]), "모든 기준에 판정 방식(share·intensity·length)이 있다");
  const rowsSame = S.compareCriteria(twin[3], twin[3]);
  ok(rowsSame.length === 14 && rowsSame.every((r) => r.level === "same" || r.level === "na"), "같은 벡터는 모든 기준이 거의 같음");
  ok(S.STYLE_KEYS.every((k) => S.criterionLabel(k) && S.criterionLabel(k) !== k), "모든 기준에 이름이 있다");
  eq([S.formatCriterion("w_e4", 0.456), S.formatCriterion("length", 0.7), S.formatCriterion("drawRate", null)], ["46%", "약 42수", "-"], "값 표기(비율·평균 수·없음)");
}
// 후퇴 수 비율(14번째)은 표시·비교 전용 — 닮은꼴 순위에 영향을 주지 않는다(마스터끼리 표준편차 0.007이라 거리를 지배함)
{
  const twin2 = data.masters[7], base = { vec: twin2[3].slice(), den: new Array(14).fill(1e6), n: 40 };
  const extreme = { vec: twin2[3].map((v, i) => (i === 13 ? 0.9 : v)), den: new Array(14).fill(1e6), n: 40 };
  const r0 = S.matchMasters(base, data, 5), r1 = S.matchMasters(extreme, data, 5);
  eq(r1.list.map((x) => x.name), r0.list.map((x) => x.name), "후퇴 수 비율이 극단이어도 닮은꼴 순위는 그대로");
  ok(Math.abs(r1.list[0].dist - r0.list[0].dist) < 1e-9, "후퇴 수 비율은 거리 계산에 들어가지 않는다");
  const cmp = S.compareCriteria(r1.u, twin2[3]).find((r) => r.key === "retreatRate");
  ok(cmp && cmp.level !== "same", "하지만 기준별 비교에는 나온다(극단값이면 같음이 아님)");
}
// ── ③-b 후퇴 수 비율 ──
{
  const wg = { color: "w", moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7".split(" ") };         // 백 5수 중 Bb5→a4 한 번이 후퇴(폰·캐슬링 제외)
  const bg = { color: "b", moves: "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nb8".split(" ") };                // 흑 4수 중 Nc6→b8 한 번이 후퇴(…e5·…Nf6은 전진)
  eq(S.retreatStats([wg], 10), { rate: 0.2, den: 5 }, "백 후퇴 수 비율: 5수 중 Ba4 1번");
  eq(S.retreatStats([bg], 10), { rate: 0.25, den: 4 }, "흑 후퇴 수 비율: 4수 중 Nb8 1번(흑은 숫자가 커지는 쪽이 후퇴)");
  eq(S.retreatStats([wg, wg, wg], 2).den, 10, "maxGames만큼의 대국만 센다(앞쪽부터)");
  eq(S.retreatStats([], 10), { rate: null, den: 0 }, "대국이 없으면 비율 없음");
  eq(S.retreatStats([{ color: "w", moves: ["e4", "zz9", "Nf3", "Nc6", "Bb5", "a6"] }], 10).den, 1, "해석 불가한 수에서 그 판을 멈춘다(throw 안 함)");
  eq(S.retreatStats([{ color: "w", moves: ["e4", "e5"] }], 10).den, 0, "6플라이 미만 대국은 건너뜀");
  const f0 = S.styleFeatures([wg]), f1 = S.styleFeatures([wg], { retreatGames: 5 });
  eq([f0.vec.length, f0.den.length, f0.vec[13]], [14, 14, null], "특징 14개, 후퇴 수 비율은 기본 계산하지 않음");
  eq([f1.vec[13], f1.den[13]], [0.2, 5], "retreatGames를 주면 후퇴 수 비율이 vec[13]에 들어감");
  eq(S.STYLE_KEYS[13], "retreatRate", "14번째 기준은 retreatRate");
}
// ── ③-c 서버 공유 분석 검증(api/review-put.js): 대안 수(alts)가 형식을 지킨다 ──
{
  const RP = await import("../api/review-put.js");
  const base = (m) => ({ v: 1, d: 20, result: { moves: [{ ply: 0, san: "e4", white: true, kind: "good", ...m }] } });
  ok(RP.sanitizeAnalysis(base({ alts: [{ san: "Nf3", win: 55.5 }] })), "정상 alts는 통과");
  ok(RP.sanitizeAnalysis(base({})), "alts 없는 옛 분석도 통과");
  ok(!RP.sanitizeAnalysis(base({ alts: [{ san: "x".repeat(40), win: 50 }] })), "긴 문자열 alts는 거부");
  ok(!RP.sanitizeAnalysis(base({ alts: [{ san: "Nf3", win: 500 }] })), "범위 밖 승률 alts는 거부");
  ok(!RP.sanitizeAnalysis(base({ alts: [{ san: "Nf3", win: 50 }, { san: "e4", win: 50 }, { san: "d4", win: 50 }, { san: "c4", win: 50 }] })), "4개 이상 alts는 거부");
  ok(!RP.sanitizeAnalysis(base({ alts: "Nf3" })), "배열이 아닌 alts는 거부");
  ok(RP.validAlts([{ san: "O-O-O", win: 0 }, { san: "exd5", win: 100 }, { san: "e8=Q+", win: 50 }]), "캐슬링·잡기·승격 SAN은 통과");
}
// ── ④ 연결 ──
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const review = rd("src/app/review.jsx"), growth = rd("src/app/growth.jsx"), app = rd("src/App.jsx"), quest = rd("src/app/learn.jsx"), common = rd("src/app/common.jsx");
ok(/pickHighlights\(/.test(review) && /drawHighlightCard/.test(review), "리뷰 공유 시트가 하이라이트 카드를 쓰지 않음");
ok(/<GrowthPanel /.test(quest) && /growthUid/.test(quest) && /growthGames/.test(quest), "학습 탭(LearnTab)이 성장 분석(GrowthPanel)을 펼쳐 보이지 않음");
// renderProfile={(mid) => <UserProfilePage .../>}처럼 prop 안에 ">"가 있어 태그 끝을 정규식으로 못 찾으므로, <LearnTab 뒤 일정 구간 안에서 두 prop을 찾는다.
{ const i = app.indexOf("<LearnTab "); const seg = i >= 0 ? app.slice(i, i + 4000) : ""; ok(/growthUid=\{uid\}/.test(seg) && /growthGames=\{chesscom\.games\}/.test(seg), "App이 학습 탭에 uid·chess.com 대국을 넘기지 않음"); }
// 게이트: 5판 미만이면 마스터 스타일을 포함한 성장 분석 요소를 가리고 게이지 바 안내(ReviewGate)만 보인다.
ok(/collectMyReviews\(\{/.test(growth) && /records\.length >= GROWTH_MIN_REVIEWS/.test(growth), "성장 분석이 리뷰 판 수(5판)로 열리지 않음");
{ const common = rd("src/app/common.jsx"), api = rd("api/review-put.js");
  ok(/alts\b/.test(common) && /REVIEW_ALTS_KINDS\.includes\(kind\)/.test(common) && /cands: \[p0, p1, p2\]/.test(common), "리뷰 분석이 나쁜 등급의 수에 대안 수(alts)를 저장하지 않음");
  ok(/validAlts\(m\.alts\)/.test(api), "서버가 공유 분석의 alts를 검증하지 않음(남의 분석이 내 화면에 그려짐)");
  const log = (growth.match(/function MistakeBlock[\s\S]*?\nconst PAGE/) || [""])[0];
  ok(/<MiniBoard /.test(log) && /<WinDrop /.test(log) && /phaseLabel\(m\.phase\)/.test(log) && /g\.opening/.test(log) && /betterMoves\(m\)/.test(log) && /useExplain\(m\)/.test(log), "실수 블록: 미니 보드·구간·오프닝·승률 변동·MEC 설명·대안 수가 모두 있어야 함");
  ok(/late = m\.phase !== "opening"/.test(log) && /\{late && /.test(log), "실수 블록: 유형 칩은 미들게임·엔드게임 실수에만 표시");
  ok(/mecFacts\(/.test(growth) && /explainQueue/.test(growth), "실수 설명은 MEC(mecFacts)를 한 번에 하나씩 대기열로 계산해야 함(전술 탐색이 느림)"); }
ok(/touchReviewMeta\(resultCacheKey, game\)/.test(review) && /owner: game\.username/.test(review), "리뷰 화면이 결과에 성장 분석용 메타(진영·owner 등)를 남기지 않음");
for (const sec of ["Overview", "GrowthCurve", "FocusCard", "PhaseCard", "CauseCard", "TypeCard", "MistakeLog"]) ok(new RegExp("<" + sec + " ").test(growth), "성장 분석 본문에 " + sec + " 구획이 없음");
ok(/classifyPending\(/.test(growth) && /saveCauseCache\(/.test(growth), "원인 분류는 시간 예산으로 나눠 돌리고 캐시를 저장해야 함(전술 탐색이 느려 한꺼번에 돌리면 화면이 멈춤)");
ok(/\{!open \? <ReviewGate [^>]*\/> : \(/.test(growth) && /<MasterStyle /.test(growth), "리뷰 5판 미만이면 ReviewGate(게이지 바)만 보여야 하고, 달성하면 분석 본문과 마스터 스타일을 보여야 함");
{ const gate = (growth.match(/function ReviewGate[\s\S]*?\n}\n/) || [""])[0]; ok(/role="progressbar"/.test(gate) && /Array\.from\(\{ length: need \}/.test(gate) && /더 리뷰하면 열림/.test(gate) && /리뷰 버튼/.test(gate), "ReviewGate: 게이지 바(칸 수 = 필요한 판 수)·남은 판 수·리뷰 안내가 있어야 함"); }
// 마스터 스타일
ok(/matchMasters\(/.test(growth) && /compareCriteria\(/.test(growth), "성장 분석이 마스터 스타일 로직(기준별 비교 포함)을 쓰지 않음");
ok(/aria-label=\{t\("마스터 이름으로 검색"\)\}/.test(growth) && /const suggestions = useMemo/.test(growth), "마스터 비교 헤더의 마스터 자리가 이름 검색창이 아님");
ok(/const peakText = /.test(growth) && !/"Elo " \+/.test(growth), "마스터 레이팅 표기가 모든 언어 공통 \"Peak 2xxx\"가 아님");
ok(CRITERIA_GROUPS.flatMap((g) => g.keys).length === S.STYLE_KEYS.length && S.STYLE_KEYS.every((k) => CRITERIA_GROUPS.some((g) => g.keys.includes(k))), "기준 표(CRITERIA_GROUPS)가 스타일 특징 13개를 하나도 빠짐없이 한 번씩 담지 않음");
// (v0.7.4) 마스터 스타일 압축 레이아웃: 묶음 이름은 성장 분석 구간과 같은 "오프닝·미들게임·엔드게임 성향", 세 묶음을 한 격자에 한 줄씩(접이식 아님), 판정은 색 점.
eq(["open", "mid", "game"].map(S.criterionGroupLabel), ["오프닝 성향", "미들게임 성향", "엔드게임 성향"], "기준 묶음 이름");
ok(/const phaseRows = /.test(growth) && (growth.match(/className="growth-style-bars"/g) || []).length === 1 && !/growth-crit-table/.test(growth), "마스터 스타일: 막대 그래프(growth-style-bars 하나)로 보여야 함(표로 되돌아감)");
{ const ms = (growth.match(/function MasterStyle[\s\S]*?\n}\n/) || [""])[0];
  ok(/stack\(t\("백 첫 수"\)/.test(ms) && /\["1\.e4", "w_e4"\], \["1\.d4", "w_d4"\]/.test(ms), "마스터 스타일: 백 첫 수(1.e4·1.d4·기타) 누적 막대가 없음");
  ok(/흑 응수: 1\.e4에 대해/.test(ms) && /흑 응수: 1\.d4에 대해/.test(ms) && /"b_e5"/.test(ms) && /"b_c5"/.test(ms) && /"b_d5"/.test(ms) && /"b_nf6"/.test(ms), "마스터 스타일: 흑 응수 레퍼토리(1.e4에 …e5·…c5, 1.d4에 …d5·…Nf6) 누적 막대가 없음");
  ok(/\["mine", t\("나"\), true\], \["theirs", lastName, false\]/.test(ms), "마스터 스타일: 누적 막대마다 내 막대 바로 아래에 마스터 막대가 있어야 함");
  ok(/캐슬링 방향\(캐슬링한 대국 중\)/.test(ms) && /t\("킹사이드"\)/.test(ms) && /t\("퀸사이드"\)/.test(ms) && /other: false/.test(ms) && !/pair\("castleQ"\)/.test(ms), "마스터 스타일: 캐슬링 방향은 킹사이드·퀸사이드 합이 1인 누적 막대 하나(기타 없음)여야 함");
  ok(/retreatStats\(/.test(ms) && /setTimeout\(\(\) => setRetreat/.test(ms), "마스터 스타일: 후퇴 수 비율은 첫 화면을 그린 뒤 이어서 계산해야 함(chess.js 재생이 느림)");
  ok(!/openG|toggleG|aria-expanded/.test(ms), "마스터 스타일: 접이식으로 되돌아감"); }
eq(S.CRITERIA_GROUPS.find((g) => g.id === "mid").keys.includes("retreatRate"), true, "미들게임 성향에 기물 후퇴 수 비율이 있음");
ok(/levelLabel\(byKey\[k\]\.level\)/.test(growth) && /LEVEL_COLOR\[lv\]/.test(growth), "마스터 스타일: 판정은 색 점(툴팁 판정 문구)과 범례로 보여야 함");
// 삭제한 성장 분석 코드(약점 지도·복습 카드·오프닝 실수·실수 기록)가 되살아나지 않게 — 새 설계가 확정되기 전에는 넣지 않는다.
{ const all = [review, growth, app, quest, common, rd("src/app/gameHistory.jsx")].join("\n");
  ok(!/lib\/weakness\.js|growthStore|openingMistakes|recordReviewMistakes|WeaknessMap|ReviewCards|OpeningMistakes|occ-growth/.test(all.replace(/occ_growth_v1/g, "")), "삭제한 성장 분석 코드(약점 지도·복습 카드·오프닝 실수·실수 기록) 참조가 다시 생김"); }
if (fails.length) { console.error("✖ check-growth 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-growth: 리뷰 5판 게이트(내 대국 집계·게이지 바), 하이라이트 선정, 마스터 스타일 매칭과 화면 연결이 유지된다");
