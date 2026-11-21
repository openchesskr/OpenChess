// (v0.7.8, 사용자 요청) 집중 분석 해설 화면 "커뮤니티" 블록의 웹 검색 프록시(api/youtube.js?web=1 → api/_lib/webSearchHandler.js) 순수 계산 — 오프닝 이름 검증, 검색어 만들기, 응답 정리.
// scripts/check-web-search.mjs가 검사한다. 수순 검증은 영상 검색과 같은 규칙(api/_lib/youtube.js parseMovesParam)을 쓴다.
import { pgnQuery } from "./youtube.js";

export const WEB_MAX_RESULTS = 10;   // (v0.7.9, 사용자 요청) 6 → 10. Tavily 기본 검색은 결과 개수와 상관없이 1크레딧
export const WEB_DAILY_CAP = 30;   // 사이트 전체 하루 검색 상한 — Tavily 무료 1,000회/월(약 33회/일) 안쪽. 같은 검색은 엣지 7일 캐시라 실제 호출은 더 적다
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
// 검색 응답 → 화면 값(제목·주소·사이트·요약). http(s) 주소만.
//  Tavily: { results: [{ title, url, content }] } — 사이트 이름이 없어 주소의 호스트로. (예전 Brave 모양 { web: { results: [{ title, url, description, profile }] } }도 읽는다)
export function cleanWebResults(data) {
  const list = data && Array.isArray(data.results) ? data.results : data && data.web && Array.isArray(data.web.results) ? data.web.results : [];
  const out = [];
  for (const r of list) {
    if (!r || typeof r.url !== "string") continue;
    let u; try { u = new URL(r.url); } catch { continue; }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (!isPublicHttpUrl(u)) continue;   // (v0.7.9) 내부·IP 주소 결과는 링크로도 내보내지 않는다
    const title = plain(r.title, 140);
    if (!title) continue;
    out.push({ title, url: u.href, site: plain((r.profile && r.profile.name) || u.hostname.replace(/^www\./, ""), 60), snippet: plain(r.content || r.description, 220) });
    if (out.length >= WEB_MAX_RESULTS) break;
  }
  return out;
}

// ── (v0.7.9, 사용자 요청) 구글 검색 결과처럼 미리보기 — 결과 페이지의 og:image(미리보기 이미지)·아이콘·사이트 이름·게시일을 서버가 읽어 붙인다.
// 외부 주소를 서버가 직접 여는 일이라(SSRF) 공개 웹 주소만 연다: http(s)·기본 포트·도메인 이름(IP 주소·localhost·내부용 이름 금지)·계정 정보 없는 주소.
const PRIVATE_HOST = /(^localhost$|\.localhost$|\.local$|\.internal$|\.lan$|\.home\.arpa$|\.intranet$|\.corp$)/i;
export function isPublicHttpUrl(u) {
  if (!(u instanceof URL)) { try { u = new URL(String(u)); } catch { return false; } }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const h = u.hostname.toLowerCase().replace(/\.+$/, "");   // (BUG-197) "localhost." 같은 끝 점 정규화
  if (!h || h.includes(":") || h.startsWith("[") || /^\d+(\.\d+){0,3}$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return false;   // IP 주소(10진·16진) 금지
  if (!h.includes(".") || PRIVATE_HOST.test(h)) return false;
  return true;
}

// (v0.7.9, BUG-197) 이름 검사만으로는 부족하다 — 공개 도메인이 DNS에서 내부 IP(127.0.0.1·10.x·169.254.169.254 등)를 가리킬 수 있다.
// 실제로 접속할 IP를 이 함수로 검사하고, 검사한 그 IP로만 접속한다(webSearchHandler.js safeLookup — 검사 뒤 DNS 응답이 바뀌는 공격도 막음).
const V4_BLOCK = [[0, 8], [10, 8], [100, 64, 10], [127, 8], [169, 254, 16], [172, 16, 12], [192, 0, 0, 24], [192, 0, 2, 24], [192, 88, 99, 24], [192, 168, 16], [198, 18, 15], [198, 51, 100, 24], [203, 0, 113, 24], [224, 4], [240, 4]];
function v4Blocked(a) {
  const p = a.split(".").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return true;
  const n = ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  for (const r of V4_BLOCK) {
    const bits = r[r.length - 1], oct = r.slice(0, -1);
    while (oct.length < 4) oct.push(0);
    const base = ((oct[0] << 24) >>> 0) + (oct[1] << 16) + (oct[2] << 8) + oct[3];
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if (((n & mask) >>> 0) === ((base & mask) >>> 0)) return true;
  }
  return false;
}
/** 접속하면 안 되는 IP(루프백·사설망·링크 로컬·CGNAT·예약·멀티캐스트, IPv6 ULA·링크 로컬·IPv4 매핑 포함)면 true. 형식이 이상해도 true. */
export function isPrivateIp(addr) {
  const a = String(addr || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(a)) return v4Blocked(a);
  if (!a.includes(":")) return true;
  const m4 = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(a);   // ::ffff:1.2.3.4, 64:ff9b::1.2.3.4 등 IPv4를 품은 주소
  if (m4) return v4Blocked(m4[1]) || !/^(::ffff:|64:ff9b::)/.test(a) || false;
  if (a === "::" || a === "::1") return true;
  const first = parseInt(a.split(":")[0] || "0", 16);
  if (/^::ffff:/.test(a) || /^64:ff9b:/.test(a)) return true;   // 16진 표기 IPv4 매핑 — 안전하게 막는다
  if ((first & 0xfe00) === 0xfc00) return true;   // fc00::/7 ULA
  if ((first & 0xffc0) === 0xfe80) return true;   // fe80::/10 링크 로컬
  if ((first & 0xff00) === 0xff00) return true;   // ff00::/8 멀티캐스트
  if (a.startsWith("2001:db8:") || a.startsWith("100::")) return true;   // 문서용·폐기용
  return false;
}
const ATTR_RE = /([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const attrsOf = (tag) => { const o = {}; for (const m of tag.matchAll(ATTR_RE)) o[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ""; return o; };
const absHttps = (href, base) => { const raw = String(href || "").trim(); if (!raw || raw.startsWith("data:")) return null; try { const u = new URL(raw, base); return u.protocol === "https:" && isPublicHttpUrl(u) && u.href.length <= 600 ? u.href : null; } catch { return null; } };
/** HTML(머리 부분) → { image, icon, siteName, date } — 없는 값은 null. 이미지·아이콘은 https 공개 주소만(브라우저가 바로 불러오므로). */
export function extractPreview(html, baseUrl) {
  const out = { image: null, icon: null, siteName: null, date: null };
  if (typeof html !== "string" || !html) return out;
  const head = html.slice(0, 300000);
  const meta = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrsOf(m[0]); const k = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (k && a.content != null && !(k in meta)) meta[k] = a.content;
  }
  for (const k of ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src", "image", "thumbnailurl"]) { const v = absHttps(plain(meta[k], 600), baseUrl); if (v) { out.image = v; break; } }
  const icons = [];
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrsOf(m[0]); const rel = (a.rel || "").toLowerCase();
    if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel) || !a.href) continue;
    const v = absHttps(plain(a.href, 600), baseUrl); if (!v) continue;
    const size = parseInt(String(a.sizes || "").split("x")[0], 10) || (/apple-touch/.test(rel) ? 180 : 16);
    icons.push({ v, score: (size >= 32 && size <= 192 ? 1000 : 0) + Math.min(size, 512) });
  }
  icons.sort((a, b) => b.score - a.score);
  out.icon = icons.length ? icons[0].v : absHttps("/favicon.ico", baseUrl);
  const sn = plain(meta["og:site_name"] || meta["application-name"], 60);
  out.siteName = sn || null;
  const dt = meta["article:published_time"] || meta["og:article:published_time"] || meta["datepublished"] || meta["date"] || meta["pubdate"];
  if (dt) { const ms = Date.parse(String(dt).trim()); if (Number.isFinite(ms) && ms > Date.UTC(1995, 0, 1) && ms < Date.now() + 86400000) out.date = new Date(ms).toISOString().slice(0, 10); }
  return out;
}
export const PREVIEW_TIMEOUT_MS = 2500;   // 페이지 하나를 기다리는 최대 시간 — 미리보기가 늦으면 이미지 없이 결과만 보낸다
export const PREVIEW_MAX_BYTES = 262144;  // 페이지 앞부분 256KB만 읽는다(<head>에 있는 값만 필요)
