// (v0.7.9 성능, 번들 분할) 유산 피드 동작 Context만 따로 둔 파일 — App이 첫 화면에서 Provider를 그려야 해서,
// legacyFeed.jsx(유산 게시물 화면 전체)를 첫 화면 번들에 끌고 오지 않도록 Context만 떼어 냈다.
// App이 내려 주는 동작: { saved: 리포스트한 남의 게시물 목록, toggleSave({owner, ownerName, id, entry}), removeMine(id) } — 없으면 해당 버튼을 숨긴다.
import { createContext } from "react";
export const LegacyActionsCtx = createContext(null);
