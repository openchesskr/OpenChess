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
const owned0 = new Set(["board:classic", "piece:classic"]);
for (const [cnt, coins, why] of [[1, 499, "coins"], [5, 2399, "coins"], [3, 99999, "count"], [0, 99999, "count"]]) {
  const r = G.gachaPull(cnt, owned0, coins, seeded(1));
  ok(!r.ok && r.reason === why && !r.coins && !r.owned, cnt + "회 / " + coins + "코인은 거절돼야 함(" + why + ")");
}
eq([...owned0], ["board:classic", "piece:classic"], "거절된 뽑기가 보유 목록을 바꿈");
// ② 코인
let r1 = G.gachaPull(1, owned0, 500, seeded(7));
ok(r1.ok && r1.cost === 500 && r1.coins === 0 && r1.results.length === 1 && r1.results[0].isNew && r1.refund === 0, "1회 500코인: 정확히 차감되고 신규");
let r5 = G.gachaPull(5, owned0, 2400, seeded(9));
ok(r5.ok && r5.results.length === 5 && r5.cost === 2400 && r5.coins === 0 + r5.refund && r5.coins >= 0, "5회 2400코인 계산");
for (let sd = 1; sd < 300; sd++) { const r = G.gachaPull(5, new Set(), 2400 + sd, seeded(sd)); if (!r.ok || r.coins < 0 || r.coins !== 2400 + sd - 2400 + r.results.reduce((a, x) => a + x.refund, 0)) { fails.push("코인 계산 오류(seed " + sd + ")"); break; } }
// ③ 중복
const own = new Set(["board:coral", "piece:coral"]); const dup = G.gachaPull(1, own, 500, () => 0);   // rand=0 → 풀 첫 번째(coral)
ok(dup.ok && !dup.results[0].isNew && dup.results[0].refund === G.GACHA_DUP_REFUND && dup.coins === G.GACHA_DUP_REFUND && dup.owned.size === 2, "중복 세트는 신규가 아니고 환급만 받음");
const two = G.gachaPull(5, new Set(), 2400, () => 0);   // 항상 첫 세트 → 첫 번째만 신규, 나머지 네 번은 중복
eq(two.results.map((x) => x.isNew), [true, false, false, false, false], "한 번에 여러 번 뽑을 때 앞에서 나온 세트를 중복으로 세지 않음");
ok(two.coins === 4 * G.GACHA_DUP_REFUND && two.owned.has("board:coral") && two.owned.has("piece:coral"), "나온 세트는 보드·기물 둘 다 보유가 돼야 함");
// ④ 확률·풀
ok(G.GACHA_TOTAL_WEIGHT === 100 && G.GACHA_POOL.every((p) => p.weight > 0 && G.GACHA_RARITY[p.rarity]), "가중치 합이 100이 아니거나 등급이 잘못됨");
{ const rnd = seeded(2026), N = 200000, cnt = {}; for (let i = 0; i < N; i++) { const p = G.gachaRoll(rnd); cnt[p.id] = (cnt[p.id] || 0) + 1; }
  for (const p of G.GACHA_POOL) if (Math.abs(cnt[p.id] / N * 100 - p.weight) > 1) fails.push(p.id + " 확률 " + (cnt[p.id] / N * 100).toFixed(2) + "% ≠ " + p.weight + "%"); }
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const theme = read("src/lib/theme.js"), app = read("src/App.jsx"), dex = read("src/app/dex.jsx"), play = read("src/app/play.jsx");
const setIds = [...theme.matchAll(/\{ id: "(\w+)", label: t\("[^"]+"\), desc: t\("[^"]+"\) \}/g)].map((m) => m[1]);
eq([...setIds].sort(), G.GACHA_POOL.map((p) => p.id).sort(), "뽑기 풀과 스킨 세트(SKIN_SETS) id가 다름");
for (const id of setIds) if (!new RegExp("^  " + id + ": \\{ label: t\\(\"[^\"]+\"\\), gacha: true, set: \"" + id + "\"", "mg").test(theme)) fails.push("세트 " + id + "의 보드·기물 스킨이 gacha: true가 아님");
// ⑤ 연결
ok(/gachaPull\(count, ownedSkins, ocCoins\)/.test(app) && /setOcCoins\(r\.coins\)/.test(app) && /setOwnedSkins\(r\.owned\)/.test(app), "App의 뽑기가 gachaPull 결과를 코인·보유 목록에 반영하지 않음");
ok(/if \(sk\.gacha\) return false;/.test(app), "직접 구매(buySkin)가 뽑기 전용 스킨을 거절하지 않음");
ok(/<GachaSection /.test(dex) && dex.indexOf("<GachaSection ") < dex.indexOf("SKIN_SETS.map"), "도감 스킨 페이지 맨 위에 뽑기 상자가 없음");
ok(!/SkinShopCard|StoreTab|storeProps/.test(play), "플레이 탭에 스킨 상점 UI가 남아 있음");
if (fails.length) { console.error("✖ check-gacha 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-gacha: 가격(500/2400)·코인 계산·중복 환급·확률 시뮬레이션·뽑기 전용 스킨·도감 연결이 유지된다");
