// (v0.5.9 BUG-039) 이론 포지션 키·해시 — 앱(src/lib/ecoBook.js)과 데이터 생성 스크립트(scripts/build-eco-book.mjs)가 함께 쓴다.
// 규칙을 바꾸면 src/data/ecoBook.json을 다시 만들어야 한다.
// 수순 끝 포지션 FEN → 이론 비교용 키(기물 배치·차례·캐슬링 권리). 앙파상 칸은 뺀다 — 잡을 폰이 없어도 두 칸 전진마다 적혀 같은
// 포지션이 달라 보였다(1.e4 g6 2.d4와 1.d4 g6 2.e4).
export function bookPositionKey(fen) { return (fen || "").split(" ").slice(0, 3).join(" "); }
// 32비트 FNV-1a → 36진수. 약 7,900개 포지션 기준 우연히 겹칠 확률은 조회 한 번에 약 0.0002%.
export function ecoHash(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
