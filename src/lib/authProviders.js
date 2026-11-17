// (v0.7.9, BUG-193) Supabase Auth에 실제로 켜진 소셜 로그인만 버튼으로 보여 준다.
// 예전엔 로그인 창이 Google·Apple·Facebook 버튼을 항상 그려, 대시보드에서 Apple/Facebook을 아직 켜지 않은 동안 그 버튼을 누르면
// GoTrue가 400 JSON("Unsupported provider: provider is not enabled") 화면으로 보내 사이트를 벗어났다.
// GoTrue의 공개 설정 주소(/auth/v1/settings, anon 키로 읽음)의 external.<provider> 값으로 판단하므로, 대시보드에서 켜면 배포 없이 바로 나타난다.
import { useEffect, useState } from "react";
import { SB_URL, SB_KEY, SB_ON } from "./supabaseClient.js";

export const OAUTH_PROVIDERS = ["google", "apple", "facebook"];

/** GoTrue /settings 응답 → { google, apple, facebook } (모두 boolean). 모양이 다르면 null(판단 불가). 순수 함수 — check-oauth-providers가 시험한다. */
export function enabledFromSettings(json) {
  const ext = json && typeof json === "object" ? json.external : null;
  if (!ext || typeof ext !== "object") return null;
  return Object.fromEntries(OAUTH_PROVIDERS.map((p) => [p, ext[p] === true]));
}

/** 화면에 그릴 제공자 목록. state: undefined(불러오는 중) | null(판단 불가) | { provider: boolean }.
 *  불러오는 중: Google만(이미 운영 중인 수단 — 버튼이 늦게 생겼다 사라지는 깜빡임 방지). 판단 불가(오프라인·오류): 예전처럼 모두. */
export function visibleProviders(state) {
  if (state === undefined) return ["google"];
  if (state === null) return OAUTH_PROVIDERS.slice();
  return OAUTH_PROVIDERS.filter((p) => state[p]);
}

let pending = null;
function fetchEnabled() {
  if (!SB_ON) return Promise.resolve(null);
  return (pending ||= fetch(SB_URL + "/auth/v1/settings", { headers: { apikey: SB_KEY } })
    .then((r) => (r.ok ? r.json() : null))
    .then(enabledFromSettings)
    .catch(() => null)
    .then((v) => { if (v === null) pending = null; return v; }));   // 실패는 기억하지 않는다(다음에 창을 열 때 다시 묻는다)
}

/** 로그인 창·계정 센터에서 쓰는 훅 — 보여 줄 제공자 key 배열. */
export function useOAuthProviders() {
  const [state, setState] = useState(undefined);
  useEffect(() => {
    let alive = true;
    fetchEnabled().then((v) => { if (alive) setState(v); });
    return () => { alive = false; };
  }, []);
  return visibleProviders(state);
}
