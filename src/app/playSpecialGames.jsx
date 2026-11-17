// (v0.7.9 성능, 번들 분할) 미니게임 목록의 "이름표"(종류·이름·설명·아이콘·강조색)만 담은 가벼운 파일.
// 예전엔 이 배열이 play.jsx 안에 게임 컴포넌트(Component)까지 함께 들고 있어, 도전장 알림(shell)·채팅(social)·프로필 전적(profile)이
// 이름 하나를 보려고 플레이 탭 전체(미니게임 4종 포함)를 첫 화면 번들에 끌고 왔다. 게임 컴포넌트는 play.jsx의 SPECIAL_GAME_COMPONENTS가
// gameType으로 찾아 붙인다 — 새 미니게임은 여기에 이름표 한 줄, play.jsx에 컴포넌트 한 줄을 더한다(check-bundle-split이 둘을 맞춰 본다).
// gameType 값은 play.jsx의 COORD_GAME_TYPE/KNIGHT_GAME_TYPE 상수와 반드시 같아야 한다(리터럴로 적어 둔다).
import { FacetCrosshair } from "../components/facetIcons.jsx";
import { Route, Puzzle, Swords } from "../components/ocIcons.jsx";
import { T } from "../lib/theme.js";
import { t } from "../lib/i18n.js";

// (v0.7.1) 좌표 인지 게임의 얼굴 아이콘 — 허브 카드·게임 보드의 조준경(FacetCrosshair) 그대로. lucide 아이콘과 같은 규격(size·color)이라
// Icon 자리(로비 배너·모드 행·프로필 전적)에 그대로 들어간다. 글자색(currentColor)을 따르고 그림자는 뺀다.
function CoordCrosshairIcon({ size = 24, color = "currentColor" }) { return <FacetCrosshair size={size} color={color} />; }

export const PLAY_SPECIAL_GAMES = [
  { key: "coord-race", gameType: "coord", name: t("좌표 인지 게임"), desc: t("무작위 좌표가 뜨면 상대보다 먼저 그 칸 클릭. 실시간 대전"), Icon: CoordCrosshairIcon, accent: T.brilliant },
  { key: "knight-race", gameType: "knight", name: t("나이트 레이스"), desc: t("나이트로 목표 칸에 먼저 도달. 7전 4선승, 라운드마다 방해 칸 증가"), Icon: Route, accent: T.only },
  // (v0.5.3 신규, 사용자 설계) 3호·4호 — 혼자 풀기(러시아워)·봇·실시간 PvP·친구 도전 모두 지원.
  { key: "rush-hour", gameType: "rush", name: t("백랭크 러시아워"), desc: t("엉킨 기물 사이에서 룩을 탈출시켜 백랭크 메이트. 비켜 주거나 희생으로 수비 기물 유인"), Icon: Puzzle, accent: "#B7793A", isNew: true },
  { key: "attack-mode", gameType: "attack", name: t("무한 체크메이트 게임"), desc: t("3분 동안 강제 메이트 기회를 더 많이 성공시키는 쪽 승리. 짧은 메이트일수록 높은 등급"), Icon: Swords, accent: "#C2453A", isNew: true },
];
