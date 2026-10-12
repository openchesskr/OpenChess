// (v0.6.5) 대회 대국 수순 압축 — 한 수를 "그 포지션의 합법 수 목록(알파벳 순)에서 몇 번째인가" 1바이트로 적고 base64로 묶는다.
// 평문 SAN 대비 약 3배 작다(8만 판이 넘는 대회 대국 데이터를 앱에 싣기 위해 — Vercel 배포 저장 용량 규칙).
//  · 알파벳 순으로 정렬해 쓰므로 chess.js의 수 생성 순서가 바뀌어도 부호가 깨지지 않는다(복원은 정렬된 목록에서 같은 번호를 고름).
//  · 복원한 SAN은 chess.js가 만드는 표준 표기(체크 + · 메이트 #)다. 원본 PGN의 표기가 달라도(Nbd7 ↔ Nd7 …) 같은 수다.
//  · 불법 수가 나오면 거기서 멈춘다(앞부분만 보존). scripts/check-tournament-data.mjs가 무작위 표본의 왕복 복원을 검사한다.
import { Chess } from "chess.js";

function toB64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x2000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x2000)); return btoa(s); }

/** SAN 배열 → { code, n }. n = 부호화된 수(불법 수에서 멈추면 입력보다 작다). */
export function encodeMoves(sans) {
  const c = new Chess(), bytes = [];
  for (const san of sans) {
    const list = c.moves().sort();
    let r; try { r = c.move(san); } catch { break; }
    const idx = list.indexOf(r.san);
    if (idx < 0 || idx > 255) break;
    bytes.push(idx);
  }
  return { code: toB64(Uint8Array.from(bytes)), n: bytes.length };
}

/** 부호 → SAN 배열(표준 표기). 빈 부호는 []. */
export function decodeMoves(code) {
  if (!code) return [];
  const bin = atob(code), c = new Chess(), out = [];
  for (let i = 0; i < bin.length; i++) {
    const san = c.moves().sort()[bin.charCodeAt(i)];
    if (!san) break;
    c.move(san); out.push(san);
  }
  return out;
}
