import { createClient } from "@supabase/supabase-js";

/* ===== Supabase 백엔드 (선택) — Vite 환경변수로 주입, 미설정 시 자동으로 localStorage 폴백 =====
   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 를 .env / 호스트 환경변수에 넣으면 활성화됨 */
export const SB_URL = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || "";
export const SB_KEY = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || "";
export const SB_ON = !!(SB_URL && SB_KEY);
export let SB_TOKEN = null; // Supabase Auth access_token (로그인 시 채워짐; 없으면 anon 으로 동작)
export const sbHeaders = () => ({ apikey: SB_KEY, Authorization: "Bearer " + (SB_TOKEN || SB_KEY), "Content-Type": "application/json" });
// (v0.0.5 성능) 나머지 REST 호출은 그대로 fetch 기반(sbSelect/sbInsert 등)을 쓰되, Realtime(WebSocket)
// 구독에만 공식 SDK 클라이언트를 둔다 — 자체 세션 관리(persistSession/autoRefreshToken)는 이미
// SB_TOKEN/refresh_token 로 직접 하고 있으므로 꺼서 두 세션 소스가 어긋나지 않게 한다.
export const sbClient = SB_ON ? createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
// RLS가 auth.uid() 기준이라 Realtime 소켓도 같은 access_token으로 인증해야 내 알림/채팅만 필터링되어 온다 —
// 로그인·로그아웃·토큰 갱신이 일어나는 모든 지점에서 SB_TOKEN을 직접 대입하지 않고 이 함수를 거치게 한다.
export function setSbToken(token) { SB_TOKEN = token || null; if (sbClient) sbClient.realtime.setAuth(SB_TOKEN || SB_KEY); }
export async function sbRpc(fn, args) { const r = await fetch(SB_URL + "/rest/v1/rpc/" + fn, { method: "POST", headers: sbHeaders(), body: JSON.stringify(args || {}) }); if (!r.ok) throw new Error("rpc " + r.status); return await r.json(); }
export async function sbSelect(path) { const r = await fetch(SB_URL + "/rest/v1/" + path, { headers: sbHeaders() }); if (!r.ok) throw new Error("sel " + r.status); return await r.json(); }
export async function sbUpsert(table, row) { const r = await fetch(SB_URL + "/rest/v1/" + table, { method: "POST", headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(row) }); if (!r.ok) throw new Error("up " + r.status); }
export async function sbInsert(table, row) { const r = await fetch(SB_URL + "/rest/v1/" + table, { method: "POST", headers: sbHeaders(), body: JSON.stringify(row) }); if (!r.ok) throw new Error("ins " + r.status); }
// (18차 보충 UX4) id가 GENERATED ALWAYS AS IDENTITY 인 테이블(notifications/chat_messages)은 sbUpsert(POST +
// merge-duplicates)로 갱신하면 id 명시 삽입이 거부되어 read 플래그가 서버에 반영되지 않았다(새로고침 시 배지 부활).
// PATCH(부분 업데이트)로 특정 행만 갱신한다.
export async function sbPatch(table, filter, patch) { const r = await fetch(SB_URL + "/rest/v1/" + table + "?" + filter, { method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" }, body: JSON.stringify(patch) }); if (!r.ok) throw new Error("patch " + r.status); }
export async function sbDelete(table, filter) { const r = await fetch(SB_URL + "/rest/v1/" + table + "?" + filter, { method: "DELETE", headers: { ...sbHeaders(), Prefer: "return=minimal" } }); if (!r.ok) throw new Error("del " + r.status); }
// (v0.4.5 기능, 사용자 요청) 체크메이트·스테일메이트·3회 동형 반복은 pvp_finish로 직접 보고하지 않고
// 이 서버리스 함수(api/pvp-finish.js)를 거친다 — sans를 chess.js로 재생해 실제로 그 결과가 맞는지
// 서버가 독립적으로 검증한 뒤에만 확정하므로, 승자·패자 어느 쪽 클라이언트가 먼저(또는 유일하게)
// 살아 있어도 결과가 확정된다(pvp_finish의 자기 승리 선언 금지 가드를 안전하게 우회할 방법이 없어
// 이 검증 경로를 대신 만들었다 — supabase-setup.sql의 pvp_finish/pvp_finish_verified 주석 참고).
export async function pvpFinishVerified(gameId, status) {
  if (!SB_ON || !SB_TOKEN) return false;
  try {
    const r = await fetch("/api/pvp-finish", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + SB_TOKEN }, body: JSON.stringify({ game_id: gameId, status }) });
    return r.ok;
  } catch { return false; }
}
