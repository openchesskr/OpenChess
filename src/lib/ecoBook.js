// (v0.5.9 BUG-039) 이름 있는 오프닝(ECO) 이론 포지션 — lichess-org/chess-openings(CC0, 약 3,800개 수순)가 지나는 모든 포지션.
// 앱 스냅샷(SNAP)은 포지션마다 많이 두는 수 상위 5개·10수까지만 담아, 1...g6(모던)·1.Nf3 d5(레티)처럼 이름 있는 오프닝도 비이론으로
// 떴다. 데이터는 scripts/build-eco-book.mjs가 src/lib/ecoHash.js의 같은 키·해시로 만든다.
import ECO_BOOK from "../data/ecoBook.json";
import { ecoHash } from "./ecoHash.js";

export { bookPositionKey } from "./ecoHash.js";
let _set = null;
export function isEcoBookPosition(key) {
  if (!key) return false;
  if (!_set) _set = new Set((ECO_BOOK.hashes || "").split(" ").filter(Boolean));
  return _set.has(ecoHash(key));
}
