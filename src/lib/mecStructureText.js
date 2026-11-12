import { t } from "./i18n.js";

// (v0.7.5) 폰 구조(mecPawnStructure.js)의 코치 문장. side는 구조의 주인, 상대는 그 반대편.
const sideName = (c) => (c === "w" ? t("백") : t("흑"));

/** 구조 이름(게임 요약·라벨용). */
export function structureName(kind) {
  return ({
    iqp: t("고립 d폰(IQP)"), hanging: t("행잉 폰"), carlsbad: t("칼스바드 구조"), frenchChain: t("d4–e5 폰 사슬"), kidChain: t("닫힌 중앙(킹스 인디언형)"),
    benoni: t("베노니 구조"), hedgehog: t("헤지호그"), maroczy: t("마로치 바인드"), dragon: t("드래곤 구조"), scheveningen: t("작은 중앙(셰베닝겐형)"),
    boleslavsky: t("d5 구멍(볼레슬랍스키형)"), stonewall: t("스톤월"), slavTriangle: t("슬라브 삼각형"), openCenter: t("열린 중앙"),
  })[kind] || null;
}

/** 새로 생긴 구조를 설명하는 문장. */
export function structurePhrase(s) {
  if (!s) return null;
  const S = s.side ? sideName(s.side) : null, O = s.side ? sideName(s.side === "w" ? "b" : "w") : null;
  switch (s.kind) {
    case "iqp": return t("{0}의 d폰이 홀로 남은 고립 d폰 구조입니다. {0:은/는} 활발한 기물과 킹사이드 공격을 노리고, {1:은/는} {2} 칸을 막은 뒤 기물을 교환해 약한 폰을 공략합니다.", S, O, s.blockade);
    case "hanging": return t("{0}의 c·d폰이 나란히 선 행잉 폰 구조입니다. {0:은/는} 두 폰을 전진시킬 때를 노리고, {1:은/는} 두 폰을 압박해 한쪽이 나오게 한 뒤 그 앞 칸을 막습니다.", S, O);
    case "carlsbad": return t("칼스바드 구조입니다. {0:은/는} {2} 소수 공격으로 상대 c폰을 약점으로 만들고, {1:은/는} {3} 칸의 나이트와 킹사이드 공격으로 반격합니다.", S, O, s.minority, s.knightSq);
    case "frenchChain": return t("d4–e5 폰 사슬이 생겼습니다. 흑은 ...c5로 사슬의 밑동 d4를, ...f6로 머리 e5를 공격하고, 백은 공간을 살려 킹사이드를 노립니다.");
    case "kidChain": return t("d5–e4와 d6–e5 폰으로 중앙이 닫혔습니다. 백은 c4–c5로 퀸사이드를, 흑은 ...f5로 킹사이드를 공략합니다.");
    case "benoni": return t("베노니 구조입니다. 백은 중앙 다수 폰으로 e4–e5 돌파를, 흑은 퀸사이드 다수 폰으로 ...b5 전진을 노립니다.");
    case "hedgehog": return t("헤지호그 구조입니다. 흑은 a6·b6·d6·e6 폰 뒤에서 기다리다 ...b5나 ...d5 돌파로 반격하고, 백은 공간 우위로 그 돌파를 막습니다.");
    case "maroczy": return t("마로치 바인드입니다. 백의 c4·e4 폰이 d5 칸을 장악해 흑의 돌파를 막고, 흑은 기물 교환과 ...b5·...f5 돌파로 숨통을 틉니다.");
    case "dragon": return t("드래곤 구조입니다. 흑의 g7 비숍이 긴 대각선을 노리고, 백은 h4–h5로 g6 폰을 공격해 킹사이드를 엽니다.");
    case "scheveningen": return t("d6·e6의 작은 중앙 구조입니다. 흑은 단단히 받다가 ...d5나 ...e5로 풀고, 백은 킹사이드 폰을 전진시켜 공격합니다.");
    case "boleslavsky": return t("흑의 d6·e5 폰으로 d5 칸에 구멍이 생겼습니다. 백은 d5에 기물을 두려 하고, 흑은 ...d5 전진으로 이 약점을 없애려 합니다.");
    case "stonewall": return t("{0}의 스톤월 구조입니다. {0:은/는} {1}에 나이트를 두고 킹사이드 공격을 노리지만, {2} 칸은 약점이 됩니다.", S, s.outpost, s.hole);
    case "slavTriangle": return t("c6·d5·e6 폰의 삼각형 구조입니다. 흑은 ...dxc4 뒤 ...b5나 ...c5·...e5 돌파로 풀어 가고, 백은 e4 전진으로 중앙을 넓힙니다.");
    case "openCenter": return t("d·e파일의 폰이 모두 사라진 열린 중앙입니다. 기물 활동성과 열린 파일을 먼저 장악하는 쪽이 유리합니다.");
    default: return null;
  }
}
