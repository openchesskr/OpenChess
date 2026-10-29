// (v0.7.1) YouTube 영상 검색 프록시(api/youtube.js)의 순수 계산 — 수순 검증·검색어 만들기·응답 정리. scripts/check-youtube-search.mjs가 검사한다.
import { Chess } from "chess.js";

export const YT_MAX_PLIES = 40;
export const YT_MAX_RESULTS = 8;

// "e4,e5,Nf3"(쉼표 구분 SAN) → 실제로 둘 수 있는 수순이면 표준 SAN 배열, 아니면 null.
export function parseMovesParam(raw) {
  if (typeof raw !== "string" || !raw || raw.length > YT_MAX_PLIES * 9) return null;
  const toks = raw.split(",");
  if (toks.length < 1 || toks.length > YT_MAX_PLIES) return null;
  const chess = new Chess();
  const out = [];
  for (const tok of toks) {
    if (!/^[A-Za-z0-9=+#-]{2,8}$/.test(tok)) return null;
    let mv = null;
    try { mv = chess.move(tok); } catch { mv = null; }
    if (!mv) return null;
    out.push(mv.san);
  }
  return out;
}
// 그 수까지의 PGN 수순 — "1. e4 e5 2. Nf3"
export function pgnQuery(sans) {
  return sans.map((s, i) => (i % 2 === 0 ? (i / 2 + 1) + ". " : "") + s).join(" ");
}
const ENT = { "&amp;": "&", "&quot;": "\"", "&#39;": "'", "&lt;": "<", "&gt;": ">" };
const decode = (s) => String(s || "").replace(/&(amp|quot|#39|lt|gt);/g, (m) => ENT[m]).slice(0, 200);
// YouTube Data API search.list 응답 → 화면에 필요한 값만, 모양을 확인해서.
export function cleanResults(data) {
  const items = data && Array.isArray(data.items) ? data.items : [];
  const out = [];
  for (const it of items) {
    const id = it && it.id && it.id.videoId;
    const sn = it && it.snippet;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id) || !sn) continue;
    const th = sn.thumbnails && (sn.thumbnails.medium || sn.thumbnails.high || sn.thumbnails.default);
    const thumb = th && typeof th.url === "string" && /^https:\/\/i\d?\.ytimg\.com\//.test(th.url) ? th.url : "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg";
    out.push({ id, title: decode(sn.title), channel: decode(sn.channelTitle), publishedAt: typeof sn.publishedAt === "string" ? sn.publishedAt.slice(0, 10) : "", thumb });
    if (out.length >= YT_MAX_RESULTS) break;
  }
  return out;
}
