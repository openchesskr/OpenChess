// (v0.6.4) 성장 센터 저장소 — 실수 기록(복습 카드의 진도 포함)을 기기에 계정별로 저장한다. 서버에는 올리지 않는다(리뷰 결과가 이미 기기 캐시라 같은 범위).
//  키: occ_growth_v1:<uid|guest>. 저장이 실패해도(비공개 창 등) 화면은 메모리 값으로 동작한다.
import { extractMistakes, mergeMistakes } from "./weakness.js";

const key = (uid) => "occ_growth_v1:" + (uid || "guest");
const mem = {};
export function loadGrowth(uid) {
  try { const raw = window.localStorage.getItem(key(uid)); if (raw) { const p = JSON.parse(raw); if (p && Array.isArray(p.mistakes)) return (mem[key(uid)] = p); } } catch { /* 메모리 값 사용 */ }
  return mem[key(uid)] || { v: 1, mistakes: [] };
}
export function saveGrowth(uid, data) {
  mem[key(uid)] = data;
  try { window.localStorage.setItem(key(uid), JSON.stringify(data)); } catch { /* 메모리에만 */ }
  try { window.dispatchEvent(new Event("occ-growth")); } catch { /* ignore */ }
}
/* 리뷰가 끝난 대국에서 내 실수를 기록한다. 이미 기록한 실수(같은 id)는 진도를 지키며 건너뛴다. 새로 기록한 개수를 돌려준다. */
export function recordReviewMistakes(uid, result, { color, gameKey, fenRoot }) {
  const add = extractMistakes(result, { color, gameKey, fenRoot });
  if (!add.length) return 0;
  const cur = loadGrowth(uid), before = cur.mistakes.length, merged = mergeMistakes(cur.mistakes, add);
  if (merged.length === before) return 0;
  saveGrowth(uid, { ...cur, mistakes: merged });
  return merged.length - before;
}
