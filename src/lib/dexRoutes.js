// (v0.6.8) 도감 탭의 하위 주소 — 구역마다 자기 주소를 가진다: /opening(오프닝), /master(마스터), /achievement(업적), /skin(스킨).
//  내부 구역 키(openings·masters·titles·skins)는 그대로 두고 주소와 화면 이름만 바꿨다. 옛 주소 /book은 오프닝으로 연결.
export const DEX_VIEW_PATH = { openings: "/opening", masters: "/master", titles: "/achievement", skins: "/skin" };
const VIEW_OF_PATH = { "/opening": "openings", "/master": "masters", "/achievement": "titles", "/skin": "skins", "/book": "openings" };
export const DEX_PATHS = Object.keys(VIEW_OF_PATH);
const norm = (p) => (p || "").replace(/\/$/, "") || "/";
/** 주소 → 도감 구역 키(도감 주소가 아니면 null). */
export const dexViewFromPath = (pathname) => VIEW_OF_PATH[norm(pathname)] || null;
