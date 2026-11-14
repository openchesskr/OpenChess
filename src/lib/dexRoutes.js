// (v0.6.8) 도감 탭의 하위 주소 — 구역마다 자기 주소를 가진다: /opening(오프닝), /master(마스터), /achievement(업적), /skin(스킨).
//  내부 구역 키(openings·masters·titles·skins)는 그대로 두고 주소와 화면 이름만 바꿨다. /book은 테마 카드를 고르는 첫 화면.
export const DEX_VIEW_PATH = { hub: "/book", openings: "/opening", masters: "/master", titles: "/achievement", skins: "/skin" };
export const DEX_HUB_PATH = "/book";   // 옛 첫 화면 주소 — v0.7.7부터 첫 화면이 없어 마지막에 보던 구역으로 연다(링크 호환용으로 남김)
const VIEW_OF_PATH = { "/opening": "openings", "/master": "masters", "/achievement": "titles", "/skin": "skins", "/book": "hub" };
export const DEX_PATHS = Object.keys(VIEW_OF_PATH);
const norm = (p) => (p || "").replace(/\/$/, "") || "/";
/** 주소 → 도감 구역 키(도감 주소가 아니면 null). */
export const dexViewFromPath = (pathname) => VIEW_OF_PATH[norm(pathname)] || null;
// (v0.7.7, 사용자 요청) 도감 첫 화면(테마 카드)을 없앴다 — 마지막에 보던 구역을 기억해(기기에 저장) 도감 탭에 들어올 때 그 구역으로 연다. 처음엔 오프닝.
const LAST_VIEW_KEY = "oc_dex_last_view";
const VIEWS = ["openings", "masters", "titles", "skins"];
export function loadDexView() { try { const v = window.localStorage.getItem(LAST_VIEW_KEY); return VIEWS.includes(v) ? v : "openings"; } catch { return "openings"; } }
export function saveDexView(v) { if (!VIEWS.includes(v)) return; try { window.localStorage.setItem(LAST_VIEW_KEY, v); } catch { } }
/** 도감 탭에 들어갈 때의 주소 — 마지막에 보던 구역 */
export const dexEntryPath = () => DEX_VIEW_PATH[loadDexView()];
