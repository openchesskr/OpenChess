// (v0.0.6 개편) 예전 레벨/XP 시스템은 피보나치 곡선이 너무 가팔라(레벨 10에 누적 23,100 XP, 레벨
// 20엔 286만 XP) 사실상 아무도 레벨 10~13을 넘기지 못했다 — chess.com 퍼즐 티어처럼, 랭크 게임의
// 7단계 티어(아이언→브론즈→실버→골드→다이아몬드→마스터→그랜드마스터)로 재편해 퍼즐을 꾸준히
// 풀면 몇 주 안에 다음 티어로 오르는 게 실제로 체감되게 한다. 기물 테마(폰→나이트→…→킹)는 그대로
// 두고, 티어마다 그 기물에 입히는 색만 등급에 맞게 달리한다(TIER_COLORS).
export const TIERS = [
  { key: "iron", label: "아이언", piece: "P" },
  { key: "bronze", label: "브론즈", piece: "N" },
  { key: "silver", label: "실버", piece: "B" },
  { key: "gold", label: "골드", piece: "R" },
  { key: "diamond", label: "다이아몬드", piece: "Q" },
  { key: "master", label: "마스터", piece: "K" },
  { key: "grandmaster", label: "그랜드마스터", piece: "GM" }, // gm.png(기물 + 하단 "GM" 워드마크 합성본) 사용
  // (v0.1.4 버그 수정) 한때 이 자리가 "grandmaster.png"를 가리켰는데, 그 파일이 GitHub 웹 업로드로
  // 아우로라 사진에 덮어써진 채 방치돼 배지에 배경 사진이 뜨는 버그가 있었다 — 파일명 충돌을 아예
  // 없애기 위해 원본 기물 아이콘으로 새로 받아 교체하면서 실수로 워드마크 없는 gm-piece.png(기물만
  // 있고 하단 "GM" 글자가 없음)를 넣었다 — AboutPage.jsx가 이미 gm.png를 "기물+GM 워드마크 합성본"
  // 원본으로 쓰고 있던 것과 어긋났던 것. gm.png로 교체해 하단 워드마크를 되살린다.
];
// (기능) 실제 티어 기물 이미지(public/iron-pawn.png 등)에서 뽑아낸 대표 색 — 배지 테두리·글로우·
// 진행바가 그 이미지의 실제 톤과 어긋나지 않도록, 이미지를 새로 받을 때마다 이 값도 함께 맞춘다.
// 그랜드마스터만 단일 그라디언트가 아니라 실제 이미지의 홀로그램(보라·청록·핑크) 느낌을 그대로
// 다색 그라디언트로 옮겨 특별하게 처리한다.
export const TIER_COLORS = {
  iron: { lo: "#5B6169", hi: "#9AA1AA" },
  bronze: { lo: "#6B3A1E", hi: "#F1A979" },
  silver: { lo: "#A6ADB4", hi: "#F2F4F6" },
  gold: { lo: "#8A6428", hi: "#FDDB82" },
  diamond: { lo: "#0090C8", hi: "#4FE8FF" },
  master: { lo: "#3B1568", hi: "#B98CFF" },
  grandmaster: { stops: ["#B983FF", "#6EE7C8", "#FF8FD1"] },
};
// (v0.2.9 기능) 티어 승급 팝업(TierUpOverlay)의 햇살·발광 펄스·제목 그러데이션을 "도달한 티어" 고유
// 색으로 물들이기 위한 헬퍼 — TIER_COLORS를 그대로 재사용해 배지·진행바와 같은 색 언어를 따른다.
// (v0.2.9 디자인) 승급 팝업이 밝은 카드로 바뀌면서, 어두운 배경 전제로 골랐던 옅은 .hi색(특히 실버는
// 거의 흰색이라 밝은 카드 위에서 안 보임) 대신 더 짙고 채도 높은 .lo색을 기본으로 쓴다.
export function tierGlowHex(tierKey) { const c = TIER_COLORS[tierKey]; return (c && (c.lo || (c.stops && c.stops[0]))) || "#8A6428"; }
export function tierGradientCss(tierKey) {
  const c = TIER_COLORS[tierKey];
  if (!c) return "linear-gradient(180deg,#FFF6DE,#F3DFAE 45%,#C49A50 100%)";
  return c.stops ? "linear-gradient(135deg," + c.stops.join(",") + ")" : "linear-gradient(180deg," + c.hi + "," + c.lo + ")";
}
// (사용자 요청) 그랜드마스터 프로필 사진에 두르는 무지개 그라데이션 테두리 — TIER_COLORS.grandmaster의
// 기존 홀로그램 색(보라·민트·핑크)을 그대로 재사용한다. border-box에는 그라데이션을, content-box에는
// 투명을 깔아(배경 두 겹 클리핑) <img>의 실제 사진이 안쪽을 그대로 덮게 하면서 테두리 링만 보이게 한다.
export function gmPhotoRingStyle(isGM, borderWidth = 2.5) {
  if (!isGM) return null;
  return {
    border: borderWidth + "px solid transparent",
    backgroundImage: "linear-gradient(#0000,#0000)," + tierGradientCss("grandmaster"),
    backgroundOrigin: "border-box",
    backgroundClip: "content-box, border-box",
    boxShadow: "0 0 9px rgba(185,131,255,.55)",
  };
}
// 티어[0..5](아이언..마스터)를 깨는 데 필요한 XP — 한 곳에서만 관리하는 튜닝 가능한 상수. 누적
// 500/2,000/10,000/50,000/100,000 XP에 브론즈/실버/골드/다이아몬드/마스터에 도달하고, 그
// 두 배(누적 200,000)에 그랜드마스터에 도달한다.
export const TIER_XP_REQ = [500, 1500, 8000, 40000, 50000, 100000];
// 그랜드마스터(최종 티어) 도달 후에는 XP가 계속 쌓이며 이 단위로 "★" 프레스티지 카운터가 무한히 오른다.
export const GM_STAR_XP = 100000;
// (v0.0.6 추가) 랭크 게임처럼 티어마다 5단계 구간(1~5)을 두고, 1이 5보다 높은 구간(승급 직전)이다.
// 각 구간에 필요한 XP는 그 티어 전체 요구치를 5등분(TIER_XP_REQ가 전부 5의 배수라 나머지 없이 나뉜다).
// 그랜드마스터(끝없는 최종 티어)는 구간 대신 기존 "★" 프레스티지 카운터를 그대로 쓴다.
export const DIVISIONS_PER_TIER = 5;
// (v0.0.6 추가) 여정 지도가 "티어당 5단계 구간을 전부 같은 크기의 원으로" 보여줄 수 있도록,
// (티어, 구간) 조합을 진행 순서대로 하나씩 펼친 목록 — 아이언5→아이언4→…→아이언1→브론즈5→…
// →마스터1→그랜드마스터(구간 없음, 항목 하나로 끝) 순. TIERS/DIVISIONS_PER_TIER가 둘 다 고정
// 상수라 모듈이 로드될 때 한 번만 계산해 두고 재사용한다.
export const TIER_STATIONS = TIERS.flatMap((tier, tierIdx) => (
  tierIdx === TIERS.length - 1
    ? [{ tier, tierIdx, division: null }]
    : Array.from({ length: DIVISIONS_PER_TIER }, (_, k) => ({ tier, tierIdx, division: DIVISIONS_PER_TIER - k }))
));
// 누적 총 경험치(totalXp)로부터 현재 티어·구간·해당 구간 내 경험치·다음 구간까지 필요 경험치를 도출한다.
export function tierFromXp(totalXp) {
  let idx = 0, remaining = Math.max(0, totalXp || 0);
  while (idx < TIER_XP_REQ.length && remaining >= TIER_XP_REQ[idx]) { remaining -= TIER_XP_REQ[idx]; idx++; }
  const tier = TIERS[idx];
  if (idx < TIER_XP_REQ.length) {
    const perDiv = TIER_XP_REQ[idx] / DIVISIONS_PER_TIER;
    const divIdx = Math.min(DIVISIONS_PER_TIER - 1, Math.floor(remaining / perDiv)); // 0(최하위)~4(최상위)
    const division = DIVISIONS_PER_TIER - divIdx; // 표시용 — 1이 최상위, 5가 최하위
    return { tierIndex: idx, tier, xpInTier: remaining, xpForNext: TIER_XP_REQ[idx], maxed: false, gmStars: 0, division, xpInDivision: remaining - divIdx * perDiv, xpForNextDivision: perDiv };
  }
  const gmStars = Math.floor(remaining / GM_STAR_XP);
  return { tierIndex: idx, tier, xpInTier: remaining % GM_STAR_XP, xpForNext: GM_STAR_XP, maxed: true, gmStars, division: null, xpInDivision: remaining % GM_STAR_XP, xpForNextDivision: GM_STAR_XP };
}
// (v0.2.9 기능) 개발자 재화·티어 패널 — tierFromXp(XP → 티어/구간)의 반대 방향. 티어·구간(또는
// 그랜드마스터의 ★ 프레스티지)을 직접 고르면 그 지점의 누적 XP를 계산해 setTotalXp에 그대로 넣을 수
// 있다 — tierFromXp와 같은 경계값 규칙(구간 5=그 티어 진입 직후, 1=다음 티어 승급 직전)을 공유하므로
// 두 함수를 오가도(XP→티어→XP) 항상 같은 값으로 왕복된다.
export function xpForTierDivision(tierKey, division, gmStars) {
  const idx = TIERS.findIndex((t) => t.key === tierKey);
  if (idx < 0) return 0;
  let base = 0;
  for (let i = 0; i < idx && i < TIER_XP_REQ.length; i++) base += TIER_XP_REQ[i];
  if (idx >= TIER_XP_REQ.length) return base + Math.max(0, gmStars || 0) * GM_STAR_XP; // 그랜드마스터: 구간 없음, ★만
  const perDiv = TIER_XP_REQ[idx] / DIVISIONS_PER_TIER;
  const div = Math.min(DIVISIONS_PER_TIER, Math.max(1, division || DIVISIONS_PER_TIER));
  const divIdx = DIVISIONS_PER_TIER - div; // 구간 5(방금 진입)→0, 구간 1(승급 직전)→4
  return Math.round(base + divIdx * perDiv);
}
// (디자인 개선) 세부 티어(1~5) 구간은 아라비아 숫자 대신 로마 숫자로 표기한다 — 인덱스 1~5만
// 쓰이므로(그랜드마스터의 ★프레스티지는 구간과 무관한 별도 카운터라 그대로 아라비아 숫자) 조회
// 테이블 하나로 충분하다.
export const DIVISION_ROMAN = ["", "I", "II", "III", "IV", "V"];
// 위 tierFromXp 결과를 화면에 보여줄 한 줄 라벨로 — "골드 III", 그랜드마스터는 "그랜드마스터 ★2"
// (프레스티지 0단계면 별 표시 없이 이름만). 티어 배지·프로필 필·토스트·여정 지도에서 공유한다.
export function tierDisplayLabel(info) {
  if (info.maxed) return info.tier.label + (info.gmStars > 0 ? " ★" + info.gmStars : "");
  return info.tier.label + " " + DIVISION_ROMAN[info.division];
}
// (v0.1.1) 퍼즐 탭 상단 스트립에서만, 이미지만으로 대신했던 걸 되돌려 다시 텍스트로도 티어를
// 보여준다 — 이번엔 로마 숫자 대신 아라비아 숫자로("골드 3").
export function tierDisplayLabelArabic(info) {
  if (info.maxed) return info.tier.label + (info.gmStars > 0 ? " ★" + info.gmStars : "");
  return info.tier.label + " " + info.division;
}
// 퍼즐 한 라인을 해결할 때 얻는 경험치: {13~17 사이의 난수 × (기존 별 보유 수+1.2)}의 정수 부분.
export function rollLineXp(existingStars) {
  const roll = 13 + Math.floor(Math.random() * 5); // 13~17
  return Math.floor(roll * (existingStars + 1.2));
}
