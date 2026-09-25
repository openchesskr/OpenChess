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
// (버그 수정, 사용자 제보) "퍼즐 삭제·FEN 퍼즐 이름 변경이 안 된다" — puzzle_delete/puzzle_set_name은
// SQL에서 `returns void`로 선언돼 있어, PostgREST가 이 RPC 호출에 본문 없는 204 No Content로
// 응답한다(공식 동작 — void 반환 함수는 204). 그런데 이 함수는 응답이 ok(204도 포함)이기만 하면
// 항상 r.json()을 호출했는데, 빈 본문에 대한 json() 파싱은 항상 SyntaxError를 던진다 — 그 예외가
// 호출부의 try/catch에 걸려 서버 작업(삭제·이름 변경 등)은 실제로 성공했더라도 클라이언트는 매번
// 실패로 판정했다. void를 반환하는 다른 RPC(puzzle_reassign_creator·puzzle_creator_save 등) 전부
// 같은 구조적 결함을 안고 있었다 — 204거나 본문이 비어 있으면 파싱을 건너뛰고 null을 돌려준다.
export async function sbRpc(fn, args) {
  const r = await fetch(SB_URL + "/rest/v1/rpc/" + fn, { method: "POST", headers: sbHeaders(), body: JSON.stringify(args || {}) });
  if (!r.ok) throw new Error("rpc " + r.status);
  if (r.status === 204) return null;
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
// (v0.5.5 재발 방지, BUG-001) 테이블 한 행(returns public.xxx)을 돌려주는 RPC가 SQL NULL을 돌려주면 PostgREST는 null이 아니라
// "모든 필드가 null인 객체"로 직렬화한다 — `if (row)`가 이를 실제 행으로 오인해 체스 PvP(v0.4.x)와 미니게임(v0.5.3~v0.5.4)에서
// 매칭 버튼을 누르자마자 "패배"가 뜨는 같은 버그가 두 번 났다. 그런 RPC는 반드시 이 함수로 부른다 — 모든 값이 null인 객체는 null로 바꾼다.
// scripts/check-rpc-null-rows.mjs(npm run build 전에 자동 실행)가 NULL을 돌려줄 수 있는 행 반환 RPC를 sbRpc로 직접 부르는 곳이 있으면 빌드를 막는다.
export async function sbRpcRow(fn, args) {
  const row = await sbRpc(fn, args);
  if (!row || typeof row !== "object" || Array.isArray(row)) return row || null;
  return Object.values(row).every((v) => v == null) ? null : row;
}
// (버그 수정, 사용자 제보) "생성자 회수·양도가 성공했다고 뜨는데 표시가 안 바뀐다" — RPC로 막 바꾼
// 값을 곧바로 이 GET으로 다시 읽어 화면에 반영하는 호출부(puzzleCreatorInfo 등)가 여럿인데, fetch
// 기본 캐시 모드("default")는 서버가 명시적으로 no-store를 내려주지 않는 한 브라우저가 같은 URL의
// 직전 응답을 그대로 재사용할 수 있다 — "쓰고 바로 읽기"에서 방금 쓴 값 대신 그 직전 값을 보여줄
// 여지가 있었다. 이 클라이언트가 하는 모든 읽기는 항상 최신 상태를 봐야 하므로 캐시를 끈다.
export async function sbSelect(path) { const r = await fetch(SB_URL + "/rest/v1/" + path, { headers: sbHeaders(), cache: "no-store" }); if (!r.ok) throw new Error("sel " + r.status); return await r.json(); }
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
