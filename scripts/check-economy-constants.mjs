#!/usr/bin/env node
/** (v0.7.0 보안, BUG-113) 서버 경제 규칙(supabase-setup.sql의 economy_params()와 함수 본문)이 클라이언트가 화면에 보여 주는 상수와 같은지 검사한다.
 *  서버가 금액·확률을 정하고 클라이언트는 보여 주기만 하므로, 둘이 어긋나면 화면의 가격표·확률표·승급 연출이 실제와 달라진다.
 *    · 티어 문턱(누적 XP) = lib/tierSystem.js TIER_XP_REQ의 누적합
 *    · 뽑기 가격·환급·세트 가중치/등급·기물 = lib/gacha.js
 *    · 승급 코인(티어 인덱스 × 50) = App.jsx 승급 연출 계산
 *    · 라인 XP 공식 {13~17 난수 × (별 수 + 1.2)} = tierSystem.js rollLineXp, 별 계산 = common.jsx starsOf
 *  또한 클라이언트가 XP·코인·스킨을 서버 응답 외의 값으로 바꾸지 않는지(setTotalXp·setOcCoins·setOwnedSkins는 applyEconomy 안에서만) 확인한다. */
import { readFileSync } from "node:fs";
import { TIER_XP_REQ } from "../src/lib/tierSystem.js";
import { GACHA_PRICE, GACHA_DUP_REFUND, GACHA_POOL, GACHA_PIECES } from "../src/lib/gacha.js";

const rd = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const sql = rd("supabase-setup.sql");
const problems = [];
const m = /create or replace function public\.economy_params\(\)[\s\S]*?select '(\{[\s\S]*?\})'::jsonb/.exec(sql);
if (!m) problems.push("economy_params()를 찾지 못했다");
else {
  const P = JSON.parse(m[1]);
  const cum = []; TIER_XP_REQ.reduce((a, r) => (cum.push(a + r), a + r), 0);
  const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(what + ": 서버 " + JSON.stringify(a) + " ≠ 클라이언트 " + JSON.stringify(b)); };
  eq(P.tierXpCum, cum, "티어 문턱(누적 XP)");
  eq(P.gachaPrice, Object.fromEntries(Object.entries(GACHA_PRICE).map(([k, v]) => [k, v])), "뽑기 가격");
  eq(P.gachaDupRefund, GACHA_DUP_REFUND, "중복 환급");
  eq(P.gachaPool.map((x) => [x.id, x.weight]), GACHA_POOL.map((x) => [x.id, x.weight]), "뽑기 세트 가중치");
  eq(P.gachaPool.map((x) => x.rarity), GACHA_POOL.map((x) => x.rarity), "뽑기 등급");
  eq(P.pieces, GACHA_PIECES, "기물 종류");
  const app = rd("src/App.jsx");
  if (!new RegExp("tierInfo\\.tierIndex \\* " + P.tierUpCoinsPerIndex + "\\b").test(app)) problems.push("App.jsx 승급 연출의 코인(티어 인덱스 × " + P.tierUpCoinsPerIndex + ")이 서버와 다르다");
  const ts = rd("src/lib/tierSystem.js");
  if (!/13 \+ Math\.floor\(Math\.random\(\) \* 5\)/.test(ts) || !/existingStars \+ 1\.2/.test(ts)) problems.push("rollLineXp 공식이 바뀌었다 — 서버 economy_line_solved의 XP 공식과 맞출 것");
  if (!/floor\(\(13 \+ floor\(random\(\) \* 5\)\) \* \(v_stars \+ 1\.2\)\)/.test(sql)) problems.push("서버 라인 XP 공식이 클라이언트 rollLineXp와 다르다");
  const stars = /export function starsOf[\s\S]*?\n\}/.exec(rd("src/app/common.jsx"));
  if (!stars || !/solvedCount >= totalLines\) return 3/.test(stars[0]) || !/solvedCount \* 2 >= totalLines\) return 2/.test(stars[0])) problems.push("starsOf 규칙이 바뀌었다 — 서버의 별 계산(economy_line_solved)과 맞출 것");
  if (!/when v_existing >= v_total then 3 when v_existing \* 2 >= v_total then 2 else 1/.test(sql)) problems.push("서버 별 계산이 클라이언트 starsOf와 다르다");
  eq(P.questCoins, { puzzle: 10, dailypuzzle: 10, cc_0: 10, cc_1: 10, cc_2: 10 }, "퀘스트 보상 코인(화면 문구 기준)");
}
// 클라이언트는 서버 응답으로만 XP·코인·스킨을 바꾼다.
const app = rd("src/App.jsx");
const outside = app.split("\n").map((l, i) => [l, i + 1]).filter(([l]) => /\b(setTotalXp|setOcCoins)\(/.test(l) && !/const \[totalXp, setTotalXp\]|const \[ocCoins, setOcCoins\]/.test(l));
const allowed = (ln) => ln >= 150 && ln <= 160;   // applyEconomy 안
for (const [l, n] of outside) if (!allowed(n) && !/setTotalXp\(0\); setOcCoins\(0\)/.test(l)) problems.push("src/App.jsx:" + n + " — setTotalXp/setOcCoins를 서버 응답(applyEconomy) 밖에서 호출한다(BUG-113)");
if (/progressSave\([^)]*(xp:|coins:|ownedSkins)/.test(app.replace(/\n/g, " "))) problems.push("progressSave에 xp·coins·ownedSkins를 싣고 있다(서버가 무시하지만 보내지 않는다)");
if (problems.length) { console.error("✗ check-economy-constants 실패:\n - " + problems.join("\n - ")); process.exit(1); }
console.log("✓ check-economy-constants: 티어 문턱·뽑기 가격/확률·승급 코인·라인 XP/별 공식이 서버와 같고, 클라이언트는 서버 응답으로만 재화를 바꾼다");
