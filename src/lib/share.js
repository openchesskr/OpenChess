// (v0.6.3) 외부 공유 공통 도우미 — 퍼즐·리뷰·친구 초대가 같은 복사·공유·바로가기 로직을 쓴다.
//  · copyText: 클립보드 API가 막힌 환경(비보안 출처·일부 인앱 브라우저)에서도 임시 textarea로 복사를 시도하고, 성공 여부를 돌려준다.
//  · webShare: Web Share API 결과를 "shared | cancelled | unsupported | error"로 구분한다(취소는 오류로 보이지 않게).
//  · shareTargets: URL만으로 공유할 수 있는 서비스 바로가기 목록(Web Share API가 없는 데스크톱용).
//  · 순수 함수는 scripts/check-share-ui.mjs가 검사한다.
export function canWebShare() { return typeof navigator !== "undefined" && typeof navigator.share === "function"; }
export function canWebShareFiles(file) {
  try { return typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function" && (!file || navigator.canShare({ files: [file] })); } catch { return false; }
}

export async function copyText(text) {
  const value = String(text == null ? "" : text);
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(value); return true; } } catch { /* 아래 폴백 */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = value; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, value.length);
    const ok = document.execCommand && document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch { return false; }
}

/* data: { title, text, url } 또는 { files, title, text }. 반환: "shared" | "cancelled" | "unsupported" | "error" */
export async function webShare(data) {
  if (!canWebShare()) return "unsupported";
  try { await navigator.share(data); return "shared"; }
  catch (e) { return e && e.name === "AbortError" ? "cancelled" : "error"; }
}

/* 서비스 바로가기. href는 URL·문구를 인코딩해 만든다. id는 안정 식별자(화면 이름은 호출부가 t()로 붙인다). */
export function shareTargets(url, text) {
  const u = encodeURIComponent(url || ""), tx = encodeURIComponent(text || "");
  return [
    { id: "kakaostory", href: "https://story.kakao.com/share?url=" + u, color: "#FEE500", fg: "#191919", glyph: "K" },
    { id: "x", href: "https://x.com/intent/post?url=" + u + (text ? "&text=" + tx : ""), color: "#000000", fg: "#FFFFFF", glyph: "X" },
    { id: "facebook", href: "https://www.facebook.com/sharer/sharer.php?u=" + u, color: "#1877F2", fg: "#FFFFFF", glyph: "f" },
    { id: "email", href: "mailto:?subject=" + tx + "&body=" + encodeURIComponent((text ? text + "\n" : "") + (url || "")), color: "#6B5A3E", fg: "#FFFFFF", glyph: "@", mail: true },
  ];
}

/* Blob을 파일로 저장(다운로드). */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
