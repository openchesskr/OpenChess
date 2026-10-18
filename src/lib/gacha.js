// (v0.6.9) 스킨 뽑기 — 도감 스킨 페이지의 상자에서 스킨 세트(보드 + 기물 한 벌)를 뽑는다. 화면(React)과 분리한 순수 모듈.
//  · 가격: 1회 500코인, 5회 2400코인(1회씩 5번 = 2500보다 100 저렴).
//  · 한 번 뽑을 때마다 아래 풀에서 가중치대로 세트 하나가 나온다(확률 = 가중치 / 가중치 합). 이미 가진 세트면 코인 GACHA_DUP_REFUND를 돌려받는다.
//  · 세트 스킨은 뽑기로만 얻는다(상점 직접 구매 없음) — theme.js의 gacha: true. 새 세트를 더하면 GACHA_POOL에도 같은 id를 추가한다(check-gacha가 확인).
export const GACHA_PRICE = { 1: 500, 5: 2400 };
export const GACHA_DUP_REFUND = 150;
export const GACHA_RARITY = {
  common: { label: "일반", color: "#8FA3B5" },
  rare: { label: "희귀", color: "#4A90D9" },
  epic: { label: "영웅", color: "#A857E0" },
  legend: { label: "전설", color: "#F2B33D" },
};
export const GACHA_POOL = [
  { id: "coral", weight: 28, rarity: "common" },
  { id: "forest", weight: 26, rarity: "common" },
  { id: "deco", weight: 22, rarity: "rare" },
  { id: "stars", weight: 15, rarity: "epic" },
  { id: "crystal", weight: 9, rarity: "legend" },
];
export const GACHA_TOTAL_WEIGHT = GACHA_POOL.reduce((a, p) => a + p.weight, 0);
/** 풀에서 하나 뽑는다. rand는 [0,1)을 돌려주는 함수(테스트에서 고정 난수를 넣는다). */
export function gachaRoll(rand = Math.random) {
  let r = rand() * GACHA_TOTAL_WEIGHT;
  for (const p of GACHA_POOL) { if (r < p.weight) return p; r -= p.weight; }
  return GACHA_POOL[GACHA_POOL.length - 1];
}
export const ownsSet = (owned, id) => owned.has("board:" + id) && owned.has("piece:" + id);
/** count(1 또는 5)번 뽑기. 코인이 모자라거나 count가 잘못이면 아무것도 바꾸지 않고 { ok:false }.
 *  성공하면 { ok:true, cost, refund, results:[{id,rarity,isNew,refund}], coins(뽑은 뒤 코인), owned(새 Set) }. */
export function gachaPull(count, owned, coins, rand = Math.random) {
  const cost = GACHA_PRICE[count];
  if (!cost) return { ok: false, reason: "count" };
  if (!(coins >= cost)) return { ok: false, reason: "coins" };
  const next = new Set(owned); const results = []; let refund = 0;
  for (let i = 0; i < count; i++) {
    const p = gachaRoll(rand); const isNew = !ownsSet(next, p.id); const rf = isNew ? 0 : GACHA_DUP_REFUND;
    next.add("board:" + p.id); next.add("piece:" + p.id); refund += rf;
    results.push({ id: p.id, rarity: p.rarity, isNew, refund: rf });
  }
  return { ok: true, cost, refund, results, coins: coins - cost + refund, owned: next };
}
