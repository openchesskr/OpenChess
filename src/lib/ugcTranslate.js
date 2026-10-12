// (v0.6.5 기능, 사용자 요청) 사용자가 쓴 글(수 설명 "note"·프로필 소개글 "bio")을 보는 사람의 언어로 번역한다.
//  · 번역은 서버(api/translate.js → Gemini)가 하고, 같은 글은 서버 표(text_translations)와 이 기기(localStorage)에 저장해 다시 요청하지 않는다.
//  · 채팅 메시지는 번역 대상이 아니다 — UGC_KINDS에 "chat"이 없고 서버도 거부한다. 채팅 화면이 이 모듈을 쓰지 못하게 scripts/check-ugc-translate.mjs가 막는다.
//  · 수 설명의 [[12.e5 Nf3 …]] 수순 표지는 번역하면 링크 인식이 깨지므로 ⟦n⟧ 자리표시자로 바꿔 보내고 돌아오면 되돌린다.
//  · 실패(비로그인·네트워크·쿼터)하면 원문을 그대로 보여 준다 — 번역은 덤이라 화면을 막지 않는다.
import { SB_ON, SB_TOKEN } from "./supabaseClient.js";
import { apiUrl } from "./siteConfig.js";
import { lang } from "./i18n.js";
import { loadUgcTranslatePref } from "./prefs.js";

import { UGC_KINDS, UGC_MAX_CHARS, protectTokens, restoreTokens, needsTranslation } from "./ugcText.js";
export { UGC_KINDS, UGC_MAX_CHARS, protectTokens, restoreTokens, needsTranslation };
const BATCH = 12, CACHE_KEY = "occ_ugc_tr_v1", CACHE_MAX = 200, FAIL_MS = 60000, BACKOFF_MS = 30000;

// ── 저장(메모리 + localStorage, 최근 CACHE_MAX개) ──
const mem = new Map(); // "target\u0000보호된글" → { t, same }
let loaded = false, saveTimer = null;
const ck = (target, text) => target + "\u0000" + text;
function loadCache() {
  if (loaded) return; loaded = true;
  try { for (const [k, t, same] of JSON.parse(window.localStorage.getItem(CACHE_KEY) || "[]")) mem.set(k, { t, same: !!same }); } catch { /* 없음·손상 */ }
}
function saveCache() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { const rows = [...mem.entries()].slice(-CACHE_MAX).map(([k, v]) => [k, v.t, v.same ? 1 : 0]); window.localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch { /* 저장 공간 부족 등 */ }
  }, 800);
}
const remember = (k, v) => { mem.delete(k); mem.set(k, v); if (mem.size > CACHE_MAX * 2) mem.delete(mem.keys().next().value); saveCache(); };

// ── 요청 묶음(같은 순간에 필요한 글을 한 번에) ──
const waiting = new Map(); // key → { text, kind, target, resolvers: [] }
const failedUntil = new Map();
let flushTimer = null, pausedUntil = 0;
function scheduleFlush() { if (!flushTimer) flushTimer = setTimeout(flush, 40); }
async function flush() {
  flushTimer = null;
  const jobs = [...waiting.entries()]; waiting.clear();
  const groups = new Map();
  for (const [key, j] of jobs) { const g = j.kind + "\u0000" + j.target; (groups.get(g) || groups.set(g, []).get(g)).push([key, j]); }
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH), { kind, target } = chunk[0][1];
      const done = (key, v) => { chunk.find((c) => c[0] === key)[1].resolvers.forEach((r) => r(v)); };
      try {
        const r = await fetch(apiUrl("/api/translate"), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + SB_TOKEN }, body: JSON.stringify({ kind, target, texts: chunk.map((c) => c[1].text) }) });
        if (r.status === 401 || r.status === 429 || r.status >= 500) pausedUntil = Date.now() + BACKOFF_MS;
        const data = r.ok ? await r.json() : null;
        chunk.forEach(([key, j], n) => {
          const it = data && data.items && data.items[n];
          if (!it) { failedUntil.set(key, Date.now() + FAIL_MS); done(key, null); return; }
          const v = { t: it.translated, same: !!it.same };
          if (it.failed) failedUntil.set(key, Date.now() + FAIL_MS); else remember(key, v);
          done(key, v);
        });
      } catch { pausedUntil = Date.now() + BACKOFF_MS; chunk.forEach(([key]) => { failedUntil.set(key, Date.now() + FAIL_MS); done(key, null); }); }
    }
  }
}

/** 지금 번역을 쓸 수 있는 상태인지(설정 켬 + 로그인). */
export function ugcTranslateAvailable() { return !!(SB_ON && SB_TOKEN) && loadUgcTranslatePref(); }

/** 저장돼 있으면 바로(동기) 돌려준다. { text, same } 또는 null. */
export function peekTranslation(text, kind) {
  if (!UGC_KINDS.includes(kind) || !needsTranslation(text, lang)) return null;
  loadCache();
  const { text: p, saved } = protectTokens(text.trim());
  const v = mem.get(ck(lang, p));
  return v ? { text: restoreTokens(v.t, saved), same: v.same } : null;
}

/** 번역을 요청한다. 해결값은 { text, same } 또는 null(번역 못 함·할 필요 없음·꺼짐). */
export function requestTranslation(text, kind) {
  if (!UGC_KINDS.includes(kind)) return Promise.resolve(null); // 채팅 등은 여기서도 거부
  if (!ugcTranslateAvailable() || !needsTranslation(text, lang)) return Promise.resolve(null);
  loadCache();
  const { text: p, saved } = protectTokens(text.trim()), key = ck(lang, p);
  const hit = mem.get(key);
  if (hit) return Promise.resolve({ text: restoreTokens(hit.t, saved), same: hit.same });
  if ((failedUntil.get(key) || 0) > Date.now() || pausedUntil > Date.now()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const wrap = (v) => resolve(v ? { text: restoreTokens(v.t, saved), same: v.same } : null);
    const cur = waiting.get(key);
    if (cur) cur.resolvers.push(wrap); else waiting.set(key, { text: p, kind, target: lang, resolvers: [wrap] });
    scheduleFlush();
  });
}
