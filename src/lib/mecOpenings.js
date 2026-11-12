import { Chess } from "chess.js";
import { t } from "./i18n.js";

// (v0.7.5) MEC 오프닝 레파토리 — 정석 수(book)에 "이 수가 왜 이론인지"를 설명한다.
// 수순 문자열이 아니라 포지션으로 찾아서(트랜스포지션 대응) 1.Nf3 d5 2.d4처럼 다른 순서로 와도 같은 설명이 나온다.
// 내용은 웹에서 확인한 일반적인 오프닝 설명을 바탕으로 직접 다시 썼다(문장 복사 아님):
//   · chess.com "Introduction to the Ruy Lopez", Wikibooks "Chess Opening Theory"(1.e4 e5 2.Nf3 Nc6 3.Bb5 갈래)
//   · chess.com "The advance variation of the French defence", "How To Play The Mar del Plata", chessbio.com 오프닝 항목
//   · thomasollo.net 킹스 인디언 마르델플라타 항목, chessdom·New in Chess 오프닝 소개
// 항목 = [수순, 계열, 설명]. 계열(FAMILY)은 이름과, 이론을 벗어날 때 한 번 보여 줄 중반 계획을 가진다.
const FAMILY = {
  kp: { name: () => t("킹스 폰 오프닝") },
  qp: { name: () => t("퀸스 폰 오프닝") },
  open: { name: () => t("오픈 게임") },
  ruy: { name: () => t("루이 로페즈"), plan: () => t("루이 로페즈에서 백은 c3·d4로 중앙을 넓히고 나이트를 d2–f1–g3로 돌려 킹사이드를 노리며, 흑은 ...b5·...c5로 퀸사이드 공간을 얻고 ...d5 돌파를 노립니다.") },
  berlin: { name: () => t("베를린 디펜스"), plan: () => t("베를린 디펜스는 퀸이 일찍 교환되는 엔드게임으로 가는 일이 많고, 흑은 비숍 쌍과 단단한 구조로 버팁니다.") },
  italian: { name: () => t("이탈리안 게임"), plan: () => t("이탈리안 게임에서 백은 c3·d4로 중앙을 차지하거나 d3로 천천히 정비한 뒤 킹사이드를 노리고, 흑은 ...d5나 ...d6로 중앙의 균형을 지킵니다.") },
  twoKnights: { name: () => t("투 나이츠 디펜스"), plan: () => t("투 나이츠 디펜스는 일찍 날카로운 싸움이 벌어지기 쉬워, 흑은 ...d5로 중앙에 맞서며 빠른 전개를 우선합니다.") },
  scotch: { name: () => t("스카치 게임"), plan: () => t("스카치 게임에서 백은 중앙 나이트와 빠른 전개로 공격하고, 흑은 ...d5로 중앙에 맞서며 기물을 활발하게 둡니다.") },
  petrov: { name: () => t("페트로프 디펜스"), plan: () => t("페트로프 디펜스는 대칭에 가까운 단단한 구조라, 작은 전개 우위와 e파일 싸움이 승부를 가릅니다.") },
  philidor: { name: () => t("필리도르 디펜스"), plan: () => t("필리도르 디펜스에서 흑은 e5를 끝까지 지키며 ...Nbd7·...Be7·...c6로 단단한 진형을 만들고, 백은 넓은 공간으로 압박합니다.") },
  kingsGambit: { name: () => t("킹스 갬빗"), plan: () => t("킹스 갬빗에서 백은 f파일과 빠른 전개로 f7을 공격하고, 흑은 폰을 지키거나 ...d5로 돌려주며 반격합니다.") },
  vienna: { name: () => t("비엔나 게임"), plan: () => t("비엔나 게임에서 백은 f4 전진으로 킹사이드를 열려 하고, 흑은 ...d5나 빠른 전개로 중앙을 먼저 차지하려 합니다.") },
  sicilian: { name: () => t("시칠리안 디펜스"), plan: () => t("시칠리안 디펜스에서 백은 빠른 전개와 킹사이드 공격을, 흑은 반쯤 열린 c파일과 퀸사이드 반격을 노리는 비대칭 싸움이 됩니다.") },
  najdorf: { name: () => t("나이도르프 변화"), plan: () => t("나이도르프에서 흑은 ...e5나 ...e6로 중앙을 정하고 ...b5로 퀸사이드에서 반격하며, 백은 f4·g4 같은 킹사이드 폰 전진으로 공격합니다.") },
  dragon: { name: () => t("드래곤 변화"), plan: () => t("드래곤에서 백은 퀸사이드 캐슬링 뒤 h4–h5로 흑 킹을 공격하고, 흑은 c파일과 g7 비숍으로 백 킹을 노리는 공격 경쟁이 됩니다.") },
  scheveningen: { name: () => t("셰베닝겐 변화"), plan: () => t("셰베닝겐에서 흑은 d6·e6의 작은 중앙으로 버티다 ...d5나 ...e5로 풀고, 백은 g4–g5 같은 킹사이드 폰 공격을 노립니다.") },
  sveshnikov: { name: () => t("스베시니코프 변화"), plan: () => t("스베시니코프에서 흑은 d5 칸의 약점을 감수하고 ...b5·...f5로 활발한 기물 싸움을 하며, 백은 d5에 나이트를 두려 합니다.") },
  alapin: { name: () => t("알라핀 변화"), plan: () => t("알라핀 변화에서 백은 c3·d4로 폰 중앙을 세우려 하고, 흑은 ...d5나 ...Nf6로 그 중앙을 곧바로 공격합니다.") },
  closedSicilian: { name: () => t("클로즈드 시칠리안"), plan: () => t("클로즈드 시칠리안에서 백은 g3·Bg2 뒤 f4로 킹사이드 공격을, 흑은 ...b5로 퀸사이드 확장을 노립니다.") },
  french: { name: () => t("프렌치 디펜스"), plan: () => t("프렌치 디펜스에서 백은 공간을 살려 킹사이드를, 흑은 ...c5·...f6로 백의 폰 사슬을 공격합니다. c8 비숍을 살리는 것이 흑의 과제입니다.") },
  caro: { name: () => t("카로칸 디펜스"), plan: () => t("카로칸 디펜스에서 흑은 단단한 구조와 활동적인 c8 비숍으로 버티고, 백은 공간과 전개 우위로 압박합니다.") },
  scandi: { name: () => t("스칸디나비안 디펜스"), plan: () => t("스칸디나비안 디펜스에서 흑은 퀸을 안전한 자리에 두고 ...c6·...Bf5로 단단한 진형을 만들며, 백은 전개 우위를 살립니다.") },
  pirc: { name: () => t("피르츠 디펜스"), plan: () => t("피르츠·모던 디펜스에서 흑은 ...e5나 ...c5로 백의 중앙을 공격하고, 백은 넓은 중앙과 공간으로 공격을 노립니다.") },
  alekhine: { name: () => t("알레힌 디펜스"), plan: () => t("알레힌 디펜스에서 백은 앞으로 나온 폰으로 공간을 얻고, 흑은 그 폰들을 공격해 약점으로 만듭니다.") },
  qgd: { name: () => t("퀸스 갬빗 거절"), plan: () => t("퀸스 갬빗 거절에서 백은 c파일 압박과 소수 공격을, 흑은 c8 비숍을 살리고 ...c5나 ...e5로 중앙을 풀어 갑니다.") },
  qga: { name: () => t("퀸스 갬빗 수락"), plan: () => t("퀸스 갬빗 수락에서 백은 넓은 중앙과 빠른 전개를, 흑은 ...c5로 d4를 공격하며 균형을 찾습니다.") },
  slav: { name: () => t("슬라브 디펜스"), plan: () => t("슬라브 디펜스에서 흑은 단단한 d5와 활동적인 c8 비숍으로 버티고, 백은 e4 전진으로 중앙을 넓히려 합니다.") },
  semiSlav: { name: () => t("세미 슬라브"), plan: () => t("세미 슬라브에서 흑은 ...dxc4와 ...b5로 퀸사이드를 넓히거나 ...e5로 중앙을 풀고, 백은 e4 전진과 킹사이드 공격을 노립니다.") },
  london: { name: () => t("런던 시스템"), plan: () => t("런던 시스템에서 백은 e3·c3·Nbd2로 진형을 세운 뒤 Ne5와 킹사이드 공격을, 흑은 ...c5로 중앙에 반격합니다.") },
  indian: { name: () => t("인디언 디펜스") },
  nimzo: { name: () => t("님조인디언 디펜스"), plan: () => t("님조인디언에서 백은 비숍 쌍과 중앙을 살리려 하고, 흑은 백의 더블폰과 e4 칸 장악을 노립니다.") },
  qid: { name: () => t("퀸스 인디언 디펜스"), plan: () => t("퀸스 인디언에서 흑은 b7 비숍으로 e4 칸을 장악하고, 백은 d5·e4 전진으로 중앙을 넓히려 합니다.") },
  catalan: { name: () => t("카탈란 오프닝"), plan: () => t("카탈란에서 백은 g2 비숍과 퀸사이드 압박을, 흑은 c4 폰을 지키거나 ...c5로 중앙을 풉니다.") },
  kid: { name: () => t("킹스 인디언 디펜스"), plan: () => t("킹스 인디언에서 중앙이 닫히면 흑은 ...f5로 킹사이드 공격을, 백은 c4–c5로 퀸사이드 돌파를 노리는 경쟁이 됩니다.") },
  grunfeld: { name: () => t("그룬펠드 디펜스"), plan: () => t("그룬펠드에서 흑은 g7 비숍과 ...c5로 백의 중앙을 공격하고, 백은 큰 중앙을 지키며 d5 전진을 노립니다.") },
  benoni: { name: () => t("베노니 디펜스"), plan: () => t("베노니에서 백은 중앙 다수 폰으로 e4–e5 돌파를, 흑은 퀸사이드 다수 폰으로 ...b5 전진을 노립니다.") },
  benko: { name: () => t("벤코 갬빗"), plan: () => t("벤코 갬빗에서 흑은 내준 폰 대신 열린 a·b파일과 g7 비숍으로 오래 압박하고, 백은 폰을 지키며 중앙을 노립니다.") },
  dutch: { name: () => t("더치 디펜스"), plan: () => t("더치 디펜스에서 흑은 e4 칸 장악과 킹사이드 공격을, 백은 e4 돌파나 퀸사이드 확장을 노립니다.") },
  english: { name: () => t("잉글리시 오프닝"), plan: () => t("잉글리시 오프닝에서 백은 g3·Bg2로 긴 대각선과 퀸사이드를 압박하고, 흑은 중앙 공간을 먼저 차지해 맞섭니다.") },
  reti: { name: () => t("레티 오프닝") },
};

const RUY = "e4 e5 Nf3 Nc6 Bb5", ITA = "e4 e5 Nf3 Nc6 Bc4", OSIC = "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3";
const ENTRIES = [
  ["e4", "kp", () => t("가장 인기 있는 첫 수입니다. 중앙 e4를 차지하고 퀸과 f1 비숍의 길을 엽니다.")],
  ["d4", "qp", () => t("중앙 d4를 차지하는 첫 수입니다. 퀸이 지켜 주는 폰이라 단단한 중앙 싸움으로 이어지기 쉽습니다.")],
  ["c4", "english", () => t("잉글리시 오프닝입니다. 측면의 c폰으로 d5 칸을 견제하며 유연하게 중앙을 노립니다.")],
  ["Nf3", "reti", () => t("나이트로 d4·e5를 견제하는 유연한 첫 수로, 여러 오프닝으로 이어질 수 있습니다.")],
  // ── 1.e4 e5 ──
  ["e4 e5", "open", () => t("흑도 중앙 e5를 차지하는 대칭 응수로, 오픈 게임이 시작됩니다.")],
  ["e4 e5 Nf3", "open", () => t("나이트를 전개하며 흑의 e5 폰을 공격합니다.")],
  ["e4 e5 Nf3 Nc6", "open", () => t("나이트를 전개해 e5 폰을 지킵니다.")],
  [RUY, "ruy", () => t("루이 로페즈입니다. 비숍이 e5를 지키는 c6 나이트를 압박해 흑의 중앙을 흔듭니다.")],
  [RUY + " a6", "ruy", () => t("모피 디펜스입니다. 비숍에게 물러날지 교환할지 묻고, 나중에 ...b5로 퀸사이드 공간을 얻습니다.")],
  [RUY + " a6 Ba4", "ruy", () => t("비숍을 유지하며 c6 나이트에 대한 압박을 이어 갑니다.")],
  [RUY + " a6 Bxc6", "ruy", () => t("익스체인지 변화입니다. 흑에게 더블폰을 남기고, 더 좋은 폰 구조로 엔드게임을 노립니다.")],
  [RUY + " a6 Ba4 Nf6", "ruy", () => t("나이트를 전개하며 e4 폰을 공격합니다.")],
  [RUY + " a6 Ba4 Nf6 O-O", "ruy", () => t("e4 폰을 직접 지키지 않고 킹을 먼저 안전하게 합니다. 흑이 e4를 잡으면 e파일에서 되찾을 수 있습니다.")],
  [RUY + " a6 Ba4 Nf6 O-O Be7", "ruy", () => t("닫힌 루이 로페즈입니다. 비숍을 조용히 전개해 캐슬링을 준비합니다.")],
  [RUY + " a6 Ba4 Nf6 O-O Nxe4", "ruy", () => t("오픈 루이 로페즈입니다. e4 폰을 잡아 활발한 기물을 얻고, 백은 Re1이나 d4로 되찾습니다.")],
  [RUY + " a6 Ba4 Nf6 O-O Be7 Re1", "ruy", () => t("e4 폰을 지키고 c3·d4로 중앙을 넓힐 준비를 합니다.")],
  [RUY + " a6 Ba4 Nf6 O-O Be7 Re1 b5", "ruy", () => t("비숍을 b3로 밀어내며 퀸사이드 공간을 얻습니다.")],
  [RUY + " a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3", "ruy", () => t("비숍이 b3에서 f7을 겨누는 대각선을 지킵니다.")],
  [RUY + " Nf6", "berlin", () => t("베를린 디펜스입니다. 곧바로 e4를 공격하는 단단한 수비로, 최상위 대국에서 자주 나옵니다.")],
  [ITA, "italian", () => t("이탈리안 게임입니다. 비숍이 흑 킹 앞의 약한 f7 칸을 겨눕니다.")],
  [ITA + " Bc5", "italian", () => t("주오코 피아노입니다. 흑도 비숍으로 f2를 겨누며 대칭으로 전개합니다.")],
  [ITA + " Bc5 c3", "italian", () => t("c3로 d4 전진을 준비해 폰으로 중앙을 차지하려 합니다.")],
  [ITA + " Bc5 c3 Nf6", "italian", () => t("e4 폰을 공격해 백의 d4 계획에 반격합니다.")],
  [ITA + " Bc5 c3 Nf6 d3", "italian", () => t("주오코 피아니시모입니다. 중앙을 서두르지 않고 천천히 기물을 정비하는 현대적인 방식입니다.")],
  [ITA + " Bc5 b4", "italian", () => t("에반스 갬빗입니다. b폰을 내주고 c3·d4로 빠른 중앙과 전개를 얻으려 합니다.")],
  [ITA + " Nf6", "twoKnights", () => t("투 나이츠 디펜스입니다. 비숍 대신 나이트로 e4를 공격하는 적극적인 응수입니다.")],
  [ITA + " Nf6 Ng5", "twoKnights", () => t("나이트로 f7을 한 번 더 노리는 공격적인 수입니다. 흑은 보통 ...d5로 맞섭니다.")],
  ["e4 e5 Nf3 Nc6 d4", "scotch", () => t("스카치 게임입니다. 곧바로 중앙을 열어 e5 폰을 교환하고 기물을 빠르게 움직입니다.")],
  ["e4 e5 Nf3 Nc6 d4 exd4 Nxd4", "scotch", () => t("나이트로 폰을 되찾아 중앙에 자리 잡습니다. 백은 중앙 공간, 흑은 빠른 전개로 균형을 맞춥니다.")],
  ["e4 e5 Nf3 Nf6", "petrov", () => t("페트로프 디펜스입니다. e5를 지키는 대신 백의 e4를 맞공격하는 대칭적이고 단단한 수비입니다.")],
  ["e4 e5 Nf3 d6", "philidor", () => t("필리도르 디펜스입니다. d6로 e5를 단단히 지키지만, 흑 기물이 다소 소극적이 됩니다.")],
  ["e4 e5 f4", "kingsGambit", () => t("킹스 갬빗입니다. f폰을 내주고 e5 폰을 없애 중앙과 f파일을 열려 합니다.")],
  ["e4 e5 Nc3", "vienna", () => t("비엔나 게임입니다. 나이트로 d5를 견제하고 나중에 f4로 공격할 준비를 합니다.")],
  // ── 시칠리안 ──
  ["e4 c5", "sicilian", () => t("시칠리안 디펜스입니다. 측면의 c폰으로 d4를 견제하는 비대칭 응수로, 흑은 반격 기회를 얻습니다.")],
  ["e4 c5 Nf3", "sicilian", () => t("나이트를 전개하며 d4 전진을 준비합니다.")],
  ["e4 c5 Nf3 d6", "sicilian", () => t("d6로 e5를 견제하고 c8 비숍의 길을 엽니다.")],
  ["e4 c5 Nf3 Nc6", "sicilian", () => t("나이트를 전개해 d4를 한 번 더 견제합니다.")],
  ["e4 c5 Nf3 e6", "sicilian", () => t("e6로 d5를 견제하고 f8 비숍의 길을 엽니다.")],
  ["e4 c5 Nf3 d6 d4", "sicilian", () => t("오픈 시칠리안입니다. 폰을 교환해 중앙을 열고 빠른 전개로 공격을 노립니다.")],
  ["e4 c5 Nf3 d6 d4 cxd4", "sicilian", () => t("측면 폰을 중앙 폰과 교환해, 흑은 중앙 폰을 하나 더 남깁니다.")],
  ["e4 c5 Nf3 d6 d4 cxd4 Nxd4", "sicilian", () => t("나이트로 중앙에서 폰을 되찾습니다.")],
  ["e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6", "sicilian", () => t("e4 폰을 공격해 백의 나이트를 c3로 끌어냅니다.")],
  [OSIC, "sicilian", () => t("e4 폰을 지키며 나이트를 전개합니다.")],
  [OSIC + " a6", "najdorf", () => t("나이도르프 변화입니다. b5 칸을 막아 백 기물의 침투를 막고, ...e5나 ...b5를 준비하는 유연한 수입니다.")],
  [OSIC + " g6", "dragon", () => t("드래곤 변화입니다. 비숍을 g7에 두어 긴 대각선으로 d4와 퀸사이드를 겨눕니다.")],
  [OSIC + " e6", "scheveningen", () => t("셰베닝겐 변화입니다. d6·e6의 작은 중앙으로 단단하게 받습니다.")],
  ["e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5", "sveshnikov", () => t("스베시니코프 변화입니다. d5 칸이 약해지는 대신 나이트를 쫓아내고 활발한 기물을 얻습니다.")],
  ["e4 c5 c3", "alapin", () => t("알라핀 변화입니다. c3로 d4를 준비해 폰으로 중앙을 차지하려 합니다.")],
  ["e4 c5 Nc3", "closedSicilian", () => t("중앙을 열지 않는 클로즈드 시칠리안 계열입니다. g3·Bg2로 킹사이드를 정비합니다.")],
  // ── 프렌치·카로칸·기타 1.e4 ──
  ["e4 e6", "french", () => t("프렌치 디펜스입니다. ...d5를 준비해 e4를 공격하는 단단한 수비지만, c8 비숍이 막히기 쉽습니다.")],
  ["e4 e6 d4", "french", () => t("두 중앙 폰을 나란히 세웁니다.")],
  ["e4 e6 d4 d5", "french", () => t("e4 폰에 정면으로 맞섭니다.")],
  ["e4 e6 d4 d5 e5", "french", () => t("어드밴스 변화입니다. 공간을 얻고 f6 칸을 빼앗지만, d4가 흑의 ...c5 공격 대상이 됩니다.")],
  ["e4 e6 d4 d5 e5 c5", "french", () => t("폰 사슬의 밑동인 d4를 공격하는 프렌치의 핵심 반격입니다.")],
  ["e4 e6 d4 d5 Nc3", "french", () => t("나이트로 e4를 지키는 주요 변화입니다.")],
  ["e4 e6 d4 d5 Nc3 Bb4", "french", () => t("위나워 변화입니다. c3 나이트를 핀으로 묶어 e4에 대한 압박을 높입니다.")],
  ["e4 e6 d4 d5 Nc3 Nf6", "french", () => t("나이트로 e4 폰을 공격합니다.")],
  ["e4 e6 d4 d5 Nd2", "french", () => t("타라시 변화입니다. c폰이 나올 길을 남기고 ...Bb4 핀을 피합니다.")],
  ["e4 e6 d4 d5 exd5", "french", () => t("익스체인지 변화입니다. 대칭 구조가 돼 비교적 조용한 싸움이 됩니다.")],
  ["e4 c6", "caro", () => t("카로칸 디펜스입니다. ...d5를 준비하면서도 c8 비숍의 길을 막지 않는 단단한 수비입니다.")],
  ["e4 c6 d4", "caro", () => t("두 중앙 폰을 나란히 세웁니다.")],
  ["e4 c6 d4 d5", "caro", () => t("c6 폰의 지원을 받아 e4 폰을 공격합니다.")],
  ["e4 c6 d4 d5 e5", "caro", () => t("어드밴스 변화입니다. 공간을 얻고, 흑은 보통 ...Bf5로 비숍을 사슬 밖으로 꺼냅니다.")],
  ["e4 c6 d4 d5 e5 Bf5", "caro", () => t("비숍을 폰 사슬 밖으로 먼저 꺼내 활동적으로 둡니다. 그 뒤 ...e6로 사슬을 완성합니다.")],
  ["e4 c6 d4 d5 Nc3", "caro", () => t("나이트로 e4를 지키는 주요 변화입니다.")],
  ["e4 c6 d4 d5 Nc3 dxe4 Nxe4", "caro", () => t("폰을 교환해 중앙의 긴장을 풀었습니다.")],
  ["e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5", "caro", () => t("클래식 변화입니다. 비숍이 나이트를 공격하며 전개합니다.")],
  ["e4 c6 d4 d5 exd5 cxd5", "caro", () => t("익스체인지 변화입니다. 중앙 폰을 교환해 대칭에 가까운 구조가 됩니다.")],
  ["e4 c6 d4 d5 exd5 cxd5 c4", "caro", () => t("파노프 공격입니다. c4로 d5를 공격해 고립 d폰 구조로 이어지기 쉽습니다.")],
  ["e4 d5", "scandi", () => t("스칸디나비안 디펜스입니다. 곧바로 e4 폰에 맞서 중앙을 엽니다.")],
  ["e4 d5 exd5 Qxd5", "scandi", () => t("퀸으로 폰을 되찾습니다. 퀸이 일찍 나와 백의 Nc3에 시간을 잃을 수 있습니다.")],
  ["e4 d5 exd5 Qxd5 Nc3", "scandi", () => t("나이트를 전개하며 퀸을 공격해 시간을 법니다.")],
  ["e4 d5 exd5 Qxd5 Nc3 Qa5", "scandi", () => t("퀸을 a5로 피해 대각선에서 백의 전개를 견제하는 주요 수입니다.")],
  ["e4 d6", "pirc", () => t("백에게 중앙을 먼저 내주고 나중에 반격하는 피르츠 계열의 첫 수입니다.")],
  ["e4 d6 d4 Nf6 Nc3 g6", "pirc", () => t("피르츠 디펜스입니다. 비숍을 g7에 두고 백의 중앙을 측면에서 압박합니다.")],
  ["e4 g6", "pirc", () => t("모던 디펜스입니다. 중앙을 내주고 g7 비숍으로 멀리서 압박합니다.")],
  ["e4 Nf6", "alekhine", () => t("알레힌 디펜스입니다. 나이트로 e4를 공격해 백 폰을 끌어낸 뒤, 앞으로 나온 폰을 표적으로 삼습니다.")],
  // ── 1.d4 d5 ──
  ["d4 d5", "qp", () => t("흑도 중앙 d5를 차지하는 대칭 응수입니다.")],
  ["d4 d5 c4", "qgd", () => t("퀸스 갬빗입니다. c폰을 내주는 것처럼 보이지만, d5 폰을 측면에서 흔들어 중앙을 차지하려는 수입니다.")],
  ["d4 d5 c4 e6", "qgd", () => t("퀸스 갬빗 거절입니다. d5를 단단히 지키지만 c8 비숍이 막히는 것이 과제입니다.")],
  ["d4 d5 c4 e6 Nc3", "qgd", () => t("나이트로 d5에 대한 압박을 높입니다.")],
  ["d4 d5 c4 e6 Nc3 Nf6", "qgd", () => t("나이트로 d5를 한 번 더 지키며 전개합니다.")],
  ["d4 d5 c4 e6 Nc3 Nf6 Bg5", "qgd", () => t("d5를 지키는 f6 나이트를 핀으로 묶어 압박합니다.")],
  ["d4 d5 c4 e6 Nc3 Nf6 cxd5", "qgd", () => t("익스체인지 변화입니다. ...exd5 뒤 칼스바드 구조가 돼, 백은 소수 공격을 노립니다.")],
  ["d4 d5 c4 dxc4", "qga", () => t("퀸스 갬빗 수락입니다. 폰을 잡아 두고 ...c5·...e6로 백의 중앙에 반격합니다. 폰을 끝까지 지키려 애쓰지 않는 것이 핵심입니다.")],
  ["d4 d5 c4 c6", "slav", () => t("슬라브 디펜스입니다. c6로 d5를 지키면서도 c8 비숍의 길을 막지 않습니다.")],
  ["d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4", "slav", () => t("c4 폰을 잡아 두고, 백이 되찾는 동안 ...Bf5로 비숍을 전개합니다.")],
  ["d4 d5 c4 c6 Nf3 Nf6 Nc3 e6", "semiSlav", () => t("세미 슬라브입니다. c6·d5·e6 삼각형으로 단단하게 받고, ...dxc4와 ...b5로 반격할 수 있습니다.")],
  ["d4 d5 Bf4", "london", () => t("런던 시스템입니다. 비숍을 폰 사슬 밖 f4로 먼저 꺼내고 e3·c3·Nf3로 단단한 진형을 만듭니다.")],
  ["d4 Nf6 Bf4", "london", () => t("런던 시스템입니다. 비숍을 폰 사슬 밖 f4로 먼저 꺼내고 e3·c3·Nf3로 단단한 진형을 만듭니다.")],
  ["d4 d5 Nf3 Nf6 Bf4", "london", () => t("런던 시스템입니다. 비숍을 폰 사슬 밖 f4로 먼저 꺼내고 e3·c3·Nf3로 단단한 진형을 만듭니다.")],
  // ── 1.d4 Nf6 ──
  ["d4 Nf6", "indian", () => t("나이트로 e4를 견제하며 인디언 계열 수비의 문을 엽니다.")],
  ["d4 Nf6 c4", "indian", () => t("c4로 d5를 견제하며 중앙 공간을 넓힙니다.")],
  ["d4 Nf6 c4 e6", "indian", () => t("e6로 d5를 견제하고 f8 비숍의 길을 엽니다.")],
  ["d4 Nf6 c4 e6 Nc3 Bb4", "nimzo", () => t("님조인디언 디펜스입니다. c3 나이트를 핀으로 묶어 e4 전진을 막고, Bxc3로 백에게 더블폰을 남길 수 있습니다.")],
  ["d4 Nf6 c4 e6 Nf3 b6", "qid", () => t("퀸스 인디언 디펜스입니다. 비숍을 b7에 두어 e4 칸을 견제합니다.")],
  ["d4 Nf6 c4 e6 g3", "catalan", () => t("카탈란 오프닝입니다. g2 비숍이 긴 대각선으로 d5와 퀸사이드를 압박합니다.")],
  ["d4 Nf6 c4 g6", "kid", () => t("비숍을 g7에 두어 긴 대각선을 노리는 킹스 인디언·그룬펠드 계열입니다.")],
  ["d4 Nf6 c4 g6 Nc3 Bg7", "kid", () => t("비숍을 긴 대각선에 둡니다.")],
  ["d4 Nf6 c4 g6 Nc3 Bg7 e4", "kid", () => t("백이 c4·d4·e4의 큰 폰 중앙을 세웁니다.")],
  ["d4 Nf6 c4 g6 Nc3 Bg7 e4 d6", "kid", () => t("킹스 인디언 디펜스입니다. 백에게 중앙을 내주고, 나중에 ...e5나 ...c5로 중앙을 공격합니다.")],
  ["d4 Nf6 c4 g6 Nc3 d5", "grunfeld", () => t("그룬펠드 디펜스입니다. 곧바로 ...d5로 맞서, 백이 큰 중앙을 세우게 한 뒤 기물로 공격합니다.")],
  ["d4 Nf6 c4 c5", "benoni", () => t("베노니 계열입니다. d4에 측면에서 맞서, 백이 d5로 전진하면 비대칭 구조가 됩니다.")],
  ["d4 Nf6 c4 c5 d5 e6", "benoni", () => t("모던 베노니입니다. ...exd5로 e파일을 열고 퀸사이드 다수 폰으로 반격합니다.")],
  ["d4 Nf6 c4 c5 d5 b5", "benko", () => t("벤코 갬빗입니다. 폰을 내주고 열린 a·b파일에서 오래 압박합니다.")],
  ["d4 f5", "dutch", () => t("더치 디펜스입니다. f5로 e4 칸을 장악해 비대칭으로 싸웁니다.")],
  // ── 1.c4 ──
  ["c4 e5", "english", () => t("흑이 e5로 중앙을 차지해, 백은 색이 뒤바뀐 시칠리안처럼 둡니다.")],
];

// 포지션 키: 기물 배치·차례·캐슬링 권리(앙파상 칸은 chess.js 버전마다 표기가 달라 뺀다)
const posKey = (fen) => fen.split(" ").slice(0, 3).join(" ");
let INDEX = null; // posKey → { fam, idea, children:Set }
function index() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  for (const [line, fam, idea] of ENTRIES) {
    const c = new Chess(); let parent = posKey(c.fen());
    for (const san of line.split(" ")) {
      if (!c.move(san)) throw new Error("mecOpenings: illegal line " + line); // 내부 오류(검사 스크립트가 미리 막음)
      const k = posKey(c.fen());
      if (INDEX.has(parent)) INDEX.get(parent).children.add(k);
      parent = k;
    }
    const prev = INDEX.get(parent);
    INDEX.set(parent, { fam, idea, line, children: prev ? prev.children : new Set() });
  }
  // 수순 중간 포지션이 나중에 등록되면 자식 관계가 빠질 수 있어 한 번 더 채운다
  for (const [line] of ENTRIES) {
    const c = new Chess(); let parent = posKey(c.fen());
    for (const san of line.split(" ")) { c.move(san); const k = posKey(c.fen()); if (INDEX.has(parent)) INDEX.get(parent).children.add(k); parent = k; }
  }
  return INDEX;
}
export const OPENING_ENTRY_COUNT = ENTRIES.length;
/** 검사용 — 모든 항목의 수순·계열 */
export const openingEntries = () => ENTRIES.map(([line, fam]) => ({ line, fam, hasName: !!FAMILY[fam] }));

function playAll(sans, fenRoot) {
  const c = fenRoot ? new Chess(fenRoot) : new Chess();
  for (const s of sans) if (!c.move(s)) return null;
  return c;
}
/**
 * 정석 수 설명. sansBefore 뒤에 san을 둔 포지션이 레파토리에 있으면 { family, name, idea, plan? }.
 * nextSan(그 대국의 다음 수)을 두면 레파토리를 벗어나는 수라면 계열의 중반 계획(plan)을 함께 돌려준다.
 * nextSan이 없으면(대국의 마지막 수·자유 탐색) 레파토리에 이어지는 수가 없을 때만 계획을 붙인다. 시작 포지션이 다른 대국(fenRoot)은 대상이 아니다.
 */
export function openingMoveFact(sansBefore, san, nextSan, fenRoot) {
  if (fenRoot) return null;
  let c;
  try { c = playAll([...sansBefore, san]); } catch { return null; }
  if (!c) return null;
  const k = posKey(c.fen()), e = index().get(k);
  if (!e) return null;
  const F = FAMILY[e.fam] || {};
  let leaves = e.children.size === 0;
  if (nextSan) { try { const n = new Chess(c.fen()); leaves = !(n.move(nextSan) && index().has(posKey(n.fen()))); } catch { leaves = true; } }
  return { family: e.fam, name: F.name ? F.name() : null, idea: e.idea(), plan: leaves && F.plan ? F.plan() : null };
}
/** 대국이 지나간 가장 깊은 레파토리 포지션(게임 요약용) — { family, name, plan, ply } 또는 null. */
export function openingOfGame(sans, fenRoot) {
  if (fenRoot) return null;
  const c = new Chess(); let best = null;
  for (let i = 0; i < sans.length && i < 40; i++) {
    try { if (!c.move(sans[i])) break; } catch { break; }
    const e = index().get(posKey(c.fen()));
    if (e) { const F = FAMILY[e.fam] || {}; best = { family: e.fam, name: F.name ? F.name() : null, plan: F.plan ? F.plan() : null, ply: i }; }
  }
  return best;
}
/** (v0.7.5) 계열 이름·중반 계획(레슨의 오프닝 레파토리 단계가 쓴다). 없는 계열이면 null. */
export function openingFamily(fam) {
  const F = FAMILY[fam]; if (!F) return null;
  return { name: F.name ? F.name() : null, plan: F.plan ? F.plan() : null };
}
/** (v0.7.5) 그 포지션(시작 포지션에서 sans를 둔 뒤)의 레파토리 설명(그 마지막 수의 의도). 없으면 null. */
export function openingIdeaAt(sans) {
  if (!sans.length) return null;
  try { const f = openingMoveFact(sans.slice(0, -1), sans[sans.length - 1], null, null); return f ? f.idea : null; } catch { return null; }
}
