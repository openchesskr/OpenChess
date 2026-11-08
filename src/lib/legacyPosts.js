// (v0.7.4, 사용자 요청) 유산을 "게시물"로 — 최선·유일·탁월 3칸 슬롯 대신 최대 LEGACY_MAX_POSTS(200)개를 쌓는다. 순수 함수라 scripts/check-legacy-posts.mjs가 시험한다.
// 저장 형태는 예전과 같은 { 아이디: 항목 } 묶음(profile.legacies → pub.legacies)이다. 옛 슬롯 키(best, only, brilliant, best2 …)는 그대로 유효한 게시물 아이디라
// 변환 없이 이어지고(좋아요·채팅 공유가 키로 묶여 있다), 새 게시물은 "p…" 아이디를 쓴다. 종류는 항목의 kind 태그, 없으면 옛 키로 알아낸다.
// 프로필 JSON은 서버에서 30만 자로 제한되므로, 항목은 필요한 수순까지만 잘라 담고(compactEntry) 전체 크기에도 상한을 둔다.
import { normalizeLegacyEntry, POST_ID_RE } from "./legacyEntry.js";

export const LEGACY_MAX_POSTS = 200;
export const LEGACY_MAX_CHARS = 170000;   // 직렬화한 유산 묶음의 상한(프로필 전체 300000자 중 나머지는 다른 정보 몫)
export const LEGACY_KINDS = ["best", "only", "brilliant"];

export const legacyBaseOf = (id) => (typeof id === "string" && id.endsWith("2") ? id.slice(0, -1) : id);
export function kindOfPost(id, entry) {
  if (entry && LEGACY_KINDS.includes(entry.kind)) return entry.kind;
  const b = legacyBaseOf(id);
  return LEGACY_KINDS.includes(b) ? b : null;
}
export function newPostId(now = Date.now(), rnd = Math.random) {
  return "p" + now.toString(36) + Math.floor(rnd() * 36 * 36 * 36).toString(36).padStart(3, "0");
}
// 보여 줄 수순 끝(= 유산 수 + 재생 수)까지만 남긴다 — 그 뒤 수는 어디에도 쓰이지 않는다.
export function compactEntry(entry) {
  const end = Math.min(entry.sans.length, entry.moveIndex + Math.max(1, entry.playCount || 1));
  return { ...entry, sans: entry.sans.slice(0, end), kinds: entry.kinds ? entry.kinds.slice(0, end) : null };
}
const sameMoves = (a, b) => a.moveIndex === b.moveIndex && a.sans.length >= a.moveIndex + 1 && b.sans.length >= b.moveIndex + 1 && a.sans.slice(0, a.moveIndex + 1).join(" ") === b.sans.slice(0, b.moveIndex + 1).join(" ");
// 이 대국의 이 수가 이미 게시물인가 — 리뷰 화면의 "저장됨" 표시. 게시물 아이디(없으면 null).
export function findPost(map, sans, moveIndex) {
  if (!map) return null;
  const probe = { sans, moveIndex };
  for (const id of Object.keys(map)) { const e = map[id]; if (e && Array.isArray(e.sans) && sameMoves(e, probe)) return id; }
  return null;
}
// 최신순 목록 [{ id, entry, kind }] — 검증을 통과한 항목만(남의 공개 프로필 값은 누구나 쓸 수 있다).
export function listPosts(map) {
  if (!map || typeof map !== "object") return [];
  const out = [];
  for (const id of Object.keys(map)) {
    if (!POST_ID_RE.test(id)) continue;
    const entry = normalizeLegacyEntry(map[id]); if (!entry) continue;
    out.push({ id, entry, kind: kindOfPost(id, entry) });
  }
  return out.sort((a, b) => (b.entry.savedAt || 0) - (a.entry.savedAt || 0));
}
// 새 게시물 추가 → { ok: true, id, map } | { ok: false, reason: "dup"|"full"|"size"|"invalid", id? }
export function addPost(map, entry, now = Date.now(), rnd = Math.random) {
  const base = map && typeof map === "object" ? map : {};
  const valid = normalizeLegacyEntry({ ...entry, kind: entry && entry.kind });
  if (!valid || !kindOfPost("", valid)) return { ok: false, reason: "invalid" };
  const dup = findPost(base, valid.sans, valid.moveIndex);
  if (dup) return { ok: false, reason: "dup", id: dup };
  const live = Object.keys(base).filter((k) => base[k]);
  if (live.length >= LEGACY_MAX_POSTS) return { ok: false, reason: "full" };
  let id = newPostId(now, rnd); while (id in base) id = newPostId(now, rnd);
  const next = { ...base, [id]: compactEntry({ ...valid, savedAt: now }) };
  if (JSON.stringify(next).length > LEGACY_MAX_CHARS) return { ok: false, reason: "size" };
  return { ok: true, id, map: next };
}
export function removePost(map, id) {
  if (!map || !(id in map)) return map || {};
  const next = { ...map }; delete next[id]; return next;
}

/* ── 저장함(남의 게시물 북마크) — 내 계정의 비공개 진행 정보(progress.savedLegacies)에 둔다. 항목 { owner, ownerName, id, entry, savedAt }. ── */
export const SAVED_MAX = 200;
export const savedKey = (owner, id) => owner + "|" + id;
export function isSaved(list, owner, id) { return Array.isArray(list) && list.some((x) => x && x.owner === owner && x.id === id); }
// 저장 ↔ 해제. 가득 차면 가장 오래된 것부터 밀려난다(북마크라 막지 않는다).
export function toggleSaved(list, { owner, ownerName, id, entry }, now = Date.now()) {
  const cur = Array.isArray(list) ? list : [];
  if (isSaved(cur, owner, id)) return cur.filter((x) => !(x.owner === owner && x.id === id));
  const valid = normalizeLegacyEntry(entry); if (!valid || !owner || !POST_ID_RE.test(id)) return cur;
  const next = [...cur, { owner, ownerName: String(ownerName || "").slice(0, 40), id, entry: compactEntry(valid), savedAt: now }];
  return next.length > SAVED_MAX ? next.slice(next.length - SAVED_MAX) : next;
}
// 불러온 저장함을 화면에 쓰기 전 검증 — 최신순.
export function normalizeSaved(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const x of list.slice(-SAVED_MAX)) {
    if (!x || typeof x !== "object" || typeof x.owner !== "string" || typeof x.id !== "string" || !POST_ID_RE.test(x.id)) continue;
    const entry = normalizeLegacyEntry(x.entry); if (!entry) continue;
    out.push({ owner: x.owner, ownerName: typeof x.ownerName === "string" ? x.ownerName.slice(0, 40) : "", id: x.id, entry, savedAt: Number.isFinite(x.savedAt) ? x.savedAt : 0 });
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/* ── 공유 링크: openchess.kr/legacy/<주인 MID>-<게시물 아이디> ── MID는 프로필의 고유 번호(영문 5 + 숫자 4), 게시물 아이디는 위 아이디(p… 또는 옛 슬롯 키). */
export const LEGACY_LINK_RE = /^\/legacy\/([A-Za-z]{5}[0-9]{4})-([a-z][a-z0-9]{0,23})$/;
export const legacyPath = (mid, id) => "/legacy/" + String(mid).toUpperCase() + "-" + id;
export function parseLegacyPath(path) { const m = LEGACY_LINK_RE.exec(path || ""); return m ? { mid: m[1].toUpperCase(), id: m[2] } : null; }
