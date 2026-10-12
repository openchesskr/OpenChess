// (v0.6.5) 사용자 글 번역의 순수 로직(브라우저·네트워크 없이 도는 부분) — scripts/check-ugc-translate.mjs가 Node에서 그대로 검사한다.
//  · UGC_KINDS: 번역하는 글의 종류. 수 설명("note")·프로필 소개글("bio")뿐이고 채팅은 없다(서버 api/translate.js의 KINDS와 같아야 함).
export const UGC_KINDS = ["note", "bio"];
export const UGC_MAX_CHARS = 400;
const BRACKET = /\[\[[^\]]*\]\]/g;

/** [[…]] 수순 표지를 ⟦n⟧로 바꾼다. 돌려주는 saved[n]이 원래 조각. */
export function protectTokens(text) {
  const saved = [];
  const out = String(text).replace(BRACKET, (m) => { saved.push(m); return "⟦" + (saved.length - 1) + "⟧"; });
  return { text: out, saved };
}
export function restoreTokens(text, saved) { return String(text).replace(/⟦(\d+)⟧/g, (m, i) => (saved[+i] != null ? saved[+i] : m)); }

// 기보 표기(Nf3·12.e5·O-O·1-0 …)만 있는 글은 번역할 말이 없다.
const NOTATION = /(?:\b\d+\.{1,3})?(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|O-O(?:-O)?)[+#!?]*|\b(?:1-0|0-1|1\/2-1\/2)\b/g;
const share = (s, re) => { const l = s.match(/\p{L}/gu) || []; return l.length ? (s.match(re) || []).length / l.length : 0; };
/** 이 글을 번역 요청할 가치가 있는지(서버 호출 전의 싼 걸러내기). 이미 대상 언어의 글자로만 쓰였거나 말이 없으면 false. */
export function needsTranslation(text, target) {
  if (typeof text !== "string") return false;
  const s = text.replace(BRACKET, " ").replace(NOTATION, " ").trim();
  if (((s.match(/\p{L}/gu) || []).length) < 2 || text.length > UGC_MAX_CHARS) return false;
  if (target === "ko" && share(s, /[가-힣]/g) >= 0.5) return false;
  if (target === "hi" && share(s, /[ऀ-ॿ]/g) >= 0.5) return false;
  if (target === "ja" && /[぀-ヿ]/.test(s) && share(s, /[가-힣]/g) < 0.2) return false;
  if (target === "zh" && share(s, /[㐀-鿿]/g) >= 0.5 && !/[぀-ヿ가-힣]/.test(s)) return false;
  return true;
}

