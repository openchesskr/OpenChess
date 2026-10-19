// puzzleNo(id)(src/app/common.jsx)와 같은 식으로, 원하는 퍼즐 번호가 나오는 id를 찾아 준다(시드·테스트용).
export function puzzleNo(id) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 900000 + 100000; }
const cache = new Map();
export function idForNo(no, prefix = "t") {
  const ck = prefix + ":" + no;
  if (cache.has(ck)) return cache.get(ck);
  for (let k = 0; k < 20000000; k++) { const id = prefix + k; if (puzzleNo(id) === no) { cache.set(ck, id); return id; } }
  throw new Error("id를 찾지 못함: " + no);
}
