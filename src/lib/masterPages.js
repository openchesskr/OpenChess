// (v0.7.6, 사용자 요청) 마스터 페이지 /master/<slug> — 마스터마다 고정 고유 주소(예: openchess.kr/master/magnus-carlsen).
// 주소표는 scripts/build-master-slugs.mjs가 만든 src/data/masterSlugs.json(slug → { key: 프로필 키, name: 전체 이름 }). 순수 함수 + 작은 열기 통로.
//  · 이름(어떤 표기든 — "Carlsen,M" · "Carlsen, Magnus" · "Magnus Carlsen") → 프로필 키(findProfile과 같은 규칙, 주소표의 키만 사용) → slug
//  · 화면 어디서든 openMasterPage(slug)를 부르면 App이 등록한 처리기가 페이지를 연다(마스터 통계·대국·스타일·도감 카드가 서로 import하지 않게).
import SLUGS from "../data/masterSlugs.json";
import { candidateKeys } from "./masterProfile.js";

export const MASTER_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BY_KEY = new Map(Object.entries(SLUGS.bySlug).map(([slug, v]) => [v.key, slug]));
/** slug → { slug, key, name } | null */
export function masterBySlug(slug) {
  const s = String(slug || "").toLowerCase();
  if (!MASTER_SLUG_RE.test(s)) return null;
  const v = SLUGS.bySlug[s];
  return v ? { slug: s, key: v.key, name: v.name } : null;
}
export const masterSlugOfKey = (key) => BY_KEY.get(key) || null;
export const masterPath = (slug) => "/master/" + slug;
/** 주소 → slug(주소표에 있을 때만) | null */
export function parseMasterPath(pathname) {
  const m = /^\/master\/([a-z0-9-]+)\/?$/i.exec(pathname || "");
  return m && masterBySlug(m[1]) ? m[1].toLowerCase() : null;
}
// 이름 → 프로필 키: masterProfile.js findProfile과 같은 규칙(후보 키 → 성이 유일하면 성만으로)을 주소표의 키만으로 돌린다 — 1MB 프로필 파일을 받지 않고도 링크 여부를 정한다.
const STRIPPED = new Map([...BY_KEY.keys()].map((k) => [k.replace(/ /g, ""), k]));
const BY_SUR = (() => { const m = new Map(); for (const k of STRIPPED.keys()) { const s = k.split("|")[0]; if (!m.has(s)) m.set(s, []); m.get(s).push(k); } return m; })();
export function profileKeyForName(name) {
  const cands = candidateKeys(name);
  for (const k of cands) if (STRIPPED.has(k)) return STRIPPED.get(k);
  for (const k of cands) { const list = BY_SUR.get(k.split("|")[0]); if (list && list.length === 1) return STRIPPED.get(list[0]); }
  return null;
}
/** 이름(어떤 표기든) → slug | null */
export function slugForName(name) { const k = name ? profileKeyForName(String(name).split(":")[0]) : null; return k ? masterSlugOfKey(k) : null; }
export const rememberProfiles = () => {};

/** 표시용 이름 — 마스터 페이지가 있으면 주소표의 전체 이름("Magnus Carlsen"), 없으면 null. 옛 데이터의 "성, 이름:다른 사람" 붙은 표기도 앞사람만 본다(BUG-167). */
export function masterDisplayName(name) { const k = name ? profileKeyForName(String(name).split(":")[0]) : null; const slug = k ? masterSlugOfKey(k) : null; return slug ? SLUGS.bySlug[slug].name : null; }

// 열기 통로 — App이 처리기를 등록한다.
let handler = null;
export const setMasterPageHandler = (f) => { handler = f; };
export function openMasterPage(slug) { if (handler && masterBySlug(slug)) handler(String(slug).toLowerCase()); }
