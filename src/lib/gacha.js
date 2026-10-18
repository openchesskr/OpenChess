// (v0.6.9) 스킨 뽑기 — 도감 스킨 페이지의 상자에서 기물 스킨 한 개를 뽑는다. 화면(React)과 분리한 순수 모듈.
//  · 가격: 1회 500코인, 5회 2400코인(1회씩 5번 = 2500보다 100 저렴).
//  · 한 번 뽑을 때마다 아래 풀에서 가중치대로 세트가 정해지고, 그 세트의 기물 6종(폰·나이트·비숍·룩·퀸·킹) 중 하나가 같은 확률로 나온다. 이미 가진 기물이면 코인 GACHA_DUP_REFUND를 돌려받는다.
//  · 보드는 뽑지 않는다 — 한 세트의 기물 6종을 모두 모으면 그 세트의 보드가 해금된다(boardUnlocked).
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
export const GACHA_PIECES = ["P", "N", "B", "R", "Q", "K"];
const pcKey = (setId, type) => "pc:" + setId + ":" + type;
/** 기물 보유: 기본(classic)은 항상, 그랜드마스터는 티어 해금 키, 뽑기 세트는 기물별 키(옛 "piece:<id>" 키는 여섯 기물 모두로 인정). */
export const ownsPiece = (owned, setId, type) => setId === "classic" || owned.has(pcKey(setId, type)) || owned.has("piece:" + setId);
export const ownedPieceTypes = (owned, setId) => GACHA_PIECES.filter((ty) => ownsPiece(owned, setId, ty));
/** 보드 보유: 기본은 항상, 그랜드마스터는 티어 해금 키, 뽑기 세트는 기물 6종을 모두 모았을 때(옛 "board:<id>" 키도 인정). */
export const ownsBoard = (owned, setId) => setId === "classic" || owned.has("board:" + setId) || GACHA_PIECES.every((ty) => ownsPiece(owned, setId, ty));
/** count(1 또는 5)번 뽑기. 코인이 모자라거나 count가 잘못이면 아무것도 바꾸지 않고 { ok:false }.
 *  성공하면 { ok:true, cost, refund, results:[{id,piece,rarity,isNew,refund}], boardUnlocked:[세트 id], coins(뽑은 뒤 코인), owned(새 Set) }. */
export function gachaPull(count, owned, coins, rand = Math.random) {
  const cost = GACHA_PRICE[count];
  if (!cost) return { ok: false, reason: "count" };
  if (!(coins >= cost)) return { ok: false, reason: "coins" };
  const next = new Set(owned); const results = []; const boardUnlocked = []; let refund = 0;
  for (let i = 0; i < count; i++) {
    const p = gachaRoll(rand);
    const piece = GACHA_PIECES[Math.min(GACHA_PIECES.length - 1, Math.floor(rand() * GACHA_PIECES.length))];
    const isNew = !ownsPiece(next, p.id, piece); const rf = isNew ? 0 : GACHA_DUP_REFUND;
    const hadBoard = ownsBoard(next, p.id);
    next.add(pcKey(p.id, piece)); refund += rf;
    if (!hadBoard && ownsBoard(next, p.id)) boardUnlocked.push(p.id);
    results.push({ id: p.id, piece, rarity: p.rarity, isNew, refund: rf });
  }
  return { ok: true, cost, refund, results, boardUnlocked, coins: coins - cost + refund, owned: next };
}
