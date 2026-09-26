#!/usr/bin/env node
/** (v0.5.6) chess.com 대국 요약 알림의 계산 검사(src/lib/ccGameToast.js).
 *   · 본 대국 이후 것만, 오래된 것부터, 최근 CC_TOAST_MAX판만, 변형 체스 제외
 *   · 전적 이전/이후: 같은 오프닝·이 대국보다 앞선 대국만 세고, 이 대국 결과 칸만 1 늘어남
 *   · 레이팅 증감: 같은 시간 규정의 바로 앞 표준 체스 대국 대비(목록용 computeRatingChanges도 — BUG-016)
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-cc-game-toast.mjs
 */
import { computeRatingChanges } from "../src/lib/chesscom.js";
import { pendingCcGames, recordAround, ratingDeltaOf, latestEndTime, CC_TOAST_MAX } from "../src/lib/ccGameToast.js";

const problems = [];
const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(name + ": " + JSON.stringify(got) + " ≠ " + JSON.stringify(want)); };
const G = (id, endTime, result, extra = {}) => ({ id, endTime, result, opening: "Italian Game", timeClass: "blitz", rules: "chess", rating: 1000 + id, ...extra });

const games = [
  G(1, 100, "win"), G(2, 200, "loss"), G(3, 300, "draw"),
  G(4, 400, "win", { opening: "Sicilian Defense" }),
  G(5, 500, "win", { rules: "chess960", rating: 1500 }),
  G(6, 600, "loss", { timeClass: "rapid" }),
  G(7, 700, "win"),
];
const shuffled = [games[6], games[2], games[0], games[5], games[4], games[1], games[3]];
eq("pending 순서·필터", pendingCcGames(shuffled, 250).map((g) => g.id), [3, 4, 6, 7]);
eq("pending 처음 연동(null)", pendingCcGames(shuffled, null), []);
const many = Array.from({ length: 25 }, (_, i) => G(100 + i, 1000 + i, "win"));
const p = pendingCcGames(many, 0);
eq("pending 최대 개수", [p.length, p[0].id, p[p.length - 1].id], [CC_TOAST_MAX, 100 + 25 - CC_TOAST_MAX, 124]);
eq("latestEndTime(변형 제외)", latestEndTime([G(1, 5, "win"), G(2, 9, "win", { rules: "chess960" })]), 5);

const r7 = recordAround(shuffled, games[6]);
eq("전적 이전(시간 규정 무관·변형 제외)", r7.prev, { w: 1, d: 1, l: 2, n: 4, wr: 25 });
eq("전적 이후", r7.next, { w: 2, d: 1, l: 2, n: 5, wr: 40 });
eq("바뀐 칸", [r7.changed, r7.scope], ["w", "opening"]);
const r4 = recordAround(shuffled, games[3]);
eq("첫 오프닝 대국", [r4.prev.n, r4.prev.wr, r4.next.w, r4.next.wr], [0, null, 1, 100]);
const rAll = recordAround(shuffled, G(8, 800, "draw", { opening: null }));
eq("오프닝 없음 → 전체 전적(변형 제외)", [rAll.scope, rAll.prev.n, rAll.next.d], ["all", 6, 2]);

eq("레이팅 증감(변형·다른 규정 건너뜀)", ratingDeltaOf(shuffled, games[6]), 1007 - 1004);
eq("레이팅 증감(앞 대국 없음)", ratingDeltaOf(shuffled, games[0]), null);
const rc = computeRatingChanges(shuffled);
eq("목록 레이팅 증감도 변형 제외(BUG-016)", [rc.get(games[6]), rc.has(games[4])], [3, false]);

if (problems.length) {
  console.error("✗ chess.com 대국 요약 알림 계산 검사 실패(src/lib/ccGameToast.js):");
  problems.forEach((x) => console.error("  · " + x));
  process.exit(1);
}
console.log("✓ cc game toast check: 대기열 순서·개수·변형 제외, 전적 이전/이후, 레이팅 증감 정상");
