// (v0.7.8, 사용자 요청) 집중 분석 해설 화면 "커뮤니티" 블록의 웹 검색 프록시(api/web-search.js) 순수 계산 — 오프닝 이름 검증, 검색어 만들기, 응답 정리.
// scripts/check-web-search.mjs가 검사한다. 수순 검증은 영상 검색과 같은 규칙(api/_lib/youtube.js parseMovesParam)을 쓴다.
import { pgnQuery } from "./youtube.js";

export const WEB_MAX_RESULTS = 6;
// 오프닝 이름 — Lichess 오프닝 이름에 쓰이는 글자(영문·숫자·공백·' ’ : , . ( ) - /)만, 2~80자. 그 밖의 글자가 있으면 이름 없이(수순으로) 검색한다.
export function parseNameParam(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/\s+/g, " ");
  // 검색 연산자(site:·inurl: 같은 "단어:값")는 막는다 — 오프닝 이름의 콜론은 늘 뒤에 공백이 온다("Ruy Lopez: Open").
  return /^[A-Za-z0-9À-ÿ '’:,.()\/-]{2,80}$/.test(s) && /[A-Za-z]{3}/.test(s) && !/:\S/.test(s) && !/(^|\s)-\S/.test(s) ? s : null;
}
// 이름이 있으면 이름으로, 없으면 PGN 수순으로 — 늘 체스 맥락을 붙인다.
export function webQuery(sans, name) {
  return name ? "\"" + name + "\" chess opening" : pgnQuery(sans) + " chess opening";
}
const ENT = { "&amp;": "&", "&quot;": "\"", "&#39;": "'", "&#x27;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };
const plain = (s, n) => String(s || "").replace(/<[^>]*>/g, "").replace(/&(amp|quot|#39|#x27|lt|gt|nbsp);/g, (m) => ENT[m]).replace(/\s+/g, " ").trim().slice(0, n);
// Brave Search API(web) 응답 → 화면 값(제목·주소·사이트·요약). http(s) 주소만.
export function cleanWebResults(data) {
  const list = data && data.web && Array.isArray(data.web.results) ? data.web.results : [];
  const out = [];
  for (const r of list) {
    if (!r || typeof r.url !== "string") continue;
    let u; try { u = new URL(r.url); } catch { continue; }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    const title = plain(r.title, 140);
    if (!title) continue;
    out.push({ title, url: u.href, site: plain((r.profile && r.profile.name) || u.hostname.replace(/^www\./, ""), 60), snippet: plain(r.description, 220) });
    if (out.length >= WEB_MAX_RESULTS) break;
  }
  return out;
}
