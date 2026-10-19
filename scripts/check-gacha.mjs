#!/usr/bin/env node
/** (v0.6.9) 스킨 뽑기 안전장치 — lib/gacha.js의 코인 계산·확률·중복 처리가 어긋나면 실패한다(코인 오류는 P1).
 *  ① 가격: 1회 500, 5회 2400(5×1회보다 저렴), 잘못된 횟수·코인 부족이면 상태를 하나도 바꾸지 않는다.
 *  ② 코인: 뽑은 뒤 코인 = 가진 코인 − 가격 + 중복 환급 합계, 절대 음수가 되지 않는다.
 *  ③ 중복: 이미 가진 세트는 새로 얻지 않고 환급만, 한 번에 여러 번 뽑을 때 앞에서 나온 세트도 중복으로 센다. 나온 세트는 보드·기물 둘 다 보유가 된다.
 *  ④ 확률: 가중치 합 100, 시뮬레이션 비율이 설정 확률과 1%p 안에서 같다. 풀이 theme.js의 세트(SKIN_SETS)와 같은 id다.
 *  ⑤ 연결: App의 뽑기는 gachaPull만 쓰고 직접 구매는 gacha 스킨을 거절하며, 도감 스킨 페이지 맨 위에 뽑기 상자가 있다. 플레이 탭에는 스킨 UI가 없다. */
import { readFileSync } from "node:fs";
import * as G from "../src/lib/gacha.js";
const fails = [];
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) fails.push(m); };
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// ① 가격·거절
eq([G.GACHA_PRICE[1], G.GACHA_PRICE[5]], [500, 2400], "뽑기 가격");
ok(G.GACHA_PRICE[5] < G.GACHA_PRICE[1] * 5, "5회 뽑기가 1회씩 5번보다 싸지 않음");
const owned0 = new Set();
for (const [cnt, coins, why] of [[1, 499, "coins"], [5, 2399, "coins"], [3, 99999, "count"], [0, 99999, "count"]]) {
  const r = G.gachaPull(cnt, owned0, coins, seeded(1));
  ok(!r.ok && r.reason === why && !r.coins && !r.owned, cnt + "회 / " + coins + "코인은 거절돼야 함(" + why + ")");
}
eq([...owned0], [], "거절된 뽑기가 보유 목록을 바꿈");
// ② 코인
let r1 = G.gachaPull(1, owned0, 500, seeded(7));
ok(r1.ok && r1.cost === 500 && r1.coins === 0 && r1.results.length === 1 && r1.results[0].isNew && r1.refund === 0, "1회 500코인: 정확히 차감되고 신규");
ok(r1.owned.size === 1 && [...r1.owned][0].startsWith("pc:"), "1회 뽑기는 기물 하나(pc:<세트>:<기물>)만 얻어야 함");
let r5 = G.gachaPull(5, owned0, 2400, seeded(9));
ok(r5.ok && r5.results.length === 5 && r5.cost === 2400 && r5.coins === r5.refund && r5.coins >= 0, "5회 2400코인 계산");
for (let sd = 1; sd < 300; sd++) { const r = G.gachaPull(5, new Set(), 2400 + sd, seeded(sd)); if (!r.ok || r.coins < 0 || r.coins !== 2400 + sd - 2400 + r.results.reduce((a, x) => a + x.refund, 0)) { fails.push("코인 계산 오류(seed " + sd + ")"); break; } }
// ③ 중복·보드 해금
const first = G.GACHA_POOL[0].id;   // rand=0 → 풀 첫 세트의 첫 기물(P)
const own = new Set(["pc:" + first + ":P"]); const dup = G.gachaPull(1, own, 500, () => 0);
ok(dup.ok && !dup.results[0].isNew && dup.results[0].refund === G.GACHA_DUP_REFUND && dup.coins === G.GACHA_DUP_REFUND && dup.owned.size === 1, "중복 기물은 신규가 아니고 환급만 받음");
const two = G.gachaPull(5, new Set(), 2400, () => 0);   // 항상 같은 기물 → 첫 번째만 신규
eq(two.results.map((x) => x.isNew), [true, false, false, false, false], "한 번에 여러 번 뽑을 때 앞에서 나온 기물을 중복으로 세지 않음");
ok(two.coins === 4 * G.GACHA_DUP_REFUND, "5회 중복 환급 합계 오류");
// 여섯 기물 중 마지막 하나를 뽑는 순간 보드가 해금된다(그 한 번만)
const five = new Set(G.GACHA_PIECES.slice(0, 5).map((ty) => "pc:" + first + ":" + ty));
ok(!G.ownsBoard(five, first), "기물 5종으로 보드가 해금됨");
const lastIdx = (G.GACHA_PIECES.length - 1 + 0.5) / G.GACHA_PIECES.length;
const fin = G.gachaPull(1, five, 500, (() => { const q = [0, lastIdx]; return () => q.shift() ?? 0; })());
ok(fin.ok && fin.results[0].piece === "K" && fin.results[0].isNew && JSON.stringify(fin.boardUnlocked) === JSON.stringify([first]) && G.ownsBoard(fin.owned, first), "여섯 번째 기물에서 보드 해금(boardUnlocked)이 안 됨");
const again = G.gachaPull(1, fin.owned, 500, () => 0);
ok(again.boardUnlocked.length === 0, "이미 해금된 보드가 다시 해금 알림에 들어감");
ok(G.ownedPieceTypes(new Set(), "classic").length === 6 && G.ownsBoard(new Set(), "classic"), "기본 세트는 항상 보유여야 함");
ok(G.ownsBoard(new Set(["board:grandmaster", "piece:grandmaster"]), "grandmaster") && G.ownedPieceTypes(new Set(["piece:grandmaster"]), "grandmaster").length === 6, "그랜드마스터 해금 키가 기물·보드 보유로 인정되지 않음");
// ④ 확률·풀
ok(G.GACHA_TOTAL_WEIGHT === 100 && G.GACHA_POOL.every((p) => p.weight > 0 && G.GACHA_RARITY[p.rarity]), "가중치 합이 100이 아니거나 등급이 잘못됨");
{ const rnd = seeded(2026), N = 200000, cnt = {}, pc = {}; for (let i = 0; i < N; i++) { const r = G.gachaPull(1, new Set(), 500, rnd).results[0]; cnt[r.id] = (cnt[r.id] || 0) + 1; pc[r.piece] = (pc[r.piece] || 0) + 1; }
  for (const p of G.GACHA_POOL) if (Math.abs(cnt[p.id] / N * 100 - p.weight) > 1) fails.push(p.id + " 확률 " + (cnt[p.id] / N * 100).toFixed(2) + "% ≠ " + p.weight + "%");
  for (const ty of G.GACHA_PIECES) if (Math.abs(pc[ty] / N * 100 - 100 / 6) > 1) fails.push("기물 " + ty + " 확률 " + (pc[ty] / N * 100).toFixed(2) + "%가 균등(16.7%)이 아님"); }
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const theme = read("src/lib/theme.js"), app = read("src/App.jsx"), dex = read("src/app/dex.jsx"), play = read("src/app/play.jsx");
const setIds = [...theme.matchAll(/\{ id: "(\w+)", label: t\("[^"]+"\), desc: t\("[^"]+"\) \}/g)].map((m) => m[1]);
eq([...setIds].sort(), G.GACHA_POOL.map((p) => p.id).sort(), "뽑기 풀과 스킨 세트(SKIN_SETS) id가 다름");
for (const id of setIds) if (!new RegExp("^  " + id + ": \\{ label: t\\(\"[^\"]+\"\\), gacha: true, set: \"" + id + "\"", "mg").test(theme)) fails.push("세트 " + id + "의 보드·기물 스킨이 gacha: true가 아님");
// ⑤ 연결
// (v0.7.0 BUG-113) 뽑기는 서버(gacha_pull)가 한다 — 클라이언트는 서버 결과를 반영만 한다. lib/gacha.js의 gachaPull은 규칙의 기준 구현(테스트용)으로 남고, 서버 상수와의 일치는 check-economy-constants가 본다.
ok(/economyGacha\(count\)/.test(app) && /applyEconomyRef\.current\(r\)/.test(app) && !/gachaPull\(count, ownedSkins, ocCoins\)/.test(app), "App의 뽑기가 서버(economyGacha) 결과를 반영하지 않거나 클라이언트에서 직접 뽑음");
ok(!/buySkin|SkinShopCard/.test(app + dex), "개별 스킨 구매·장착 UI가 남아 있음(스킨은 세트 단위로만 장착)");
ok(!/^  ocean: \{/m.test(theme), "삭제한 푸른 바다 스킨이 theme에 남아 있음");
ok(/pieceTypes/.test(app) && /ownedPieceTypes/.test(app), "App이 장착 세트의 보유 기물(pieceTypes)을 SkinContext로 넘기지 않음");
ok(/ctx\.pieceTypes/.test(read("src/components/pieces.jsx")), "PieceGlyph가 못 얻은 기물을 기본 모양으로 돌리지 않음");
ok(!/절약|savings/.test(read("src/app/gacha.jsx")), "뽑기 화면에 지시하지 않은 설명 문구가 있음");
ok(/<GachaSection /.test(dex) && dex.indexOf("<GachaSection ") < dex.indexOf("<SkinBook "), "도감 스킨 페이지 맨 위에 뽑기 상자가 없음");
ok(!/SkinShopCard|StoreTab|storeProps/.test(play), "플레이 탭에 스킨 상점 UI가 남아 있음");
if (fails.length) { console.error("✖ check-gacha 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-gacha: 가격(500/2400)·코인 계산·중복 환급·확률 시뮬레이션·뽑기 전용 스킨·도감 연결이 유지된다");
