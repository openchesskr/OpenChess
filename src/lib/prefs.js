// (v0.3.9 기능) 사용자 요청 — 설정 탭 "리뷰 설정" 카드의 리뷰 속도(더 빠르게=depth 20 그대로/
// 더 정확하게=depth 25) 선택. 엔진 선택과 같은 패턴으로 이 기기에만 저장한다.
export const REVIEW_SPEED_PREF_KEY = "occ_review_speed_pref";
export function loadReviewSpeedPref() { try { return window.localStorage.getItem(REVIEW_SPEED_PREF_KEY) === "accurate" ? "accurate" : "fast"; } catch { return "fast"; } }
export function saveReviewSpeedPref(v) { try { window.localStorage.setItem(REVIEW_SPEED_PREF_KEY, v); } catch { } }
// (v0.3.9 기능) 사용자 요청 — 포지션 변동성 보정(sharpLossMultiplier, "날카로운 국면일수록 실수를 더
// 엄격하게 반영") on/off. 기본은 켜짐(기존 동작 그대로) — 꺼도 재분석이 필요 없다(원본 손실·날카로움
// 값은 그대로 저장돼 있고, 최종 정확도 변환에서만 이 배율을 적용하거나 건너뛴다).
export const REVIEW_VOLATILITY_PREF_KEY = "occ_review_volatility_pref";
export function loadReviewVolatilityPref() { try { return window.localStorage.getItem(REVIEW_VOLATILITY_PREF_KEY) !== "0"; } catch { return true; } }
export function saveReviewVolatilityPref(v) { try { window.localStorage.setItem(REVIEW_VOLATILITY_PREF_KEY, v ? "1" : "0"); } catch { } }
// (v0.1.4 기능) 배경음악(BGM) on/off 기기별 저장 — 브라우저 자동재생 정책상 첫 방문에는 소리 있는
// 재생이 항상 막히므로, 이 값은 "사용자의 의도"만 기억하고 실제 재생 성공 여부는 <audio> 이벤트로
// 별도 추적한다(loadBgmPref()가 true여도 처음엔 무음 상태로 시작할 수 있음 — 버튼을 한 번 누르면
// 재생되고, 그 이후 방문부터는 브라우저가 자동재생을 허용해 줄 수도 있다).
export function loadBgmPref() { try { return window.localStorage.getItem("occ_bgm_on") !== "0"; } catch { return true; } }
export function saveBgmPref(v) { try { window.localStorage.setItem("occ_bgm_on", v ? "1" : "0"); } catch { } }
export function loadBgmVolume() { try { const v = parseFloat(window.localStorage.getItem("occ_bgm_vol")); return isNaN(v) ? 0.35 : Math.min(1, Math.max(0, v)); } catch { return 0.35; } }
export function saveBgmVolume(v) { try { window.localStorage.setItem("occ_bgm_vol", String(v)); } catch { } }
// (v0.1.4 기능) 효과음(SFX) — 블록 클릭 + 체스판 위 수(이동/기물 포획)에 짧은 효과음을 재생한다.
// BGM과 달리 항상 실제 사용자 클릭 제스처 안에서 재생을 시작하므로 자동재생 정책에 걸릴 일이 없어,
// 매번 즉석에서 새 Audio 인스턴스를 만들어 재생한다(연타해도 이전 소리와 겹쳐 들리도록). go()/tryUserMove()처럼
// 최상위 App 컴포넌트와 멀리 떨어진 곳에서도 prop 없이 바로 쓸 수 있도록 설정값은 그때그때 localStorage에서 읽는다.
export function loadSfxPref() { try { return window.localStorage.getItem("occ_sfx_on") !== "0"; } catch { return true; } }
export function saveSfxPref(v) { try { window.localStorage.setItem("occ_sfx_on", v ? "1" : "0"); } catch { } }
export function loadSfxVolume() { try { const v = parseFloat(window.localStorage.getItem("occ_sfx_vol")); return isNaN(v) ? 0.6 : Math.min(1, Math.max(0, v)); } catch { return 0.6; } }
export function saveSfxVolume(v) { try { window.localStorage.setItem("occ_sfx_vol", String(v)); } catch { } }
// (v0.4.5 기능, 사용자 요청) 매칭 대기 화면 궤도 아이콘이 "직전에 플레이한 대국"의 실제 수 체계를
// 반영하도록, 그 대국이 끝날 때 classifyOwnMovesFast가 백그라운드로 계산한 개수를 여기 저장해 둔다
// (새 대국이 끝날 때마다 덮어써 항상 "가장 최근" 하나만 유지 — 여러 대국을 누적할 필요는 없다).
export function loadLastGameQuality() { try { const raw = window.localStorage.getItem("occ_last_game_quality"); return raw ? JSON.parse(raw) : null; } catch { return null; } }
export function saveLastGameQuality(counts) { try { window.localStorage.setItem("occ_last_game_quality", JSON.stringify({ counts, at: Date.now() })); } catch { } }
export const SFX_SRC = { click: "/sfx/click.mp3", move: "/sfx/move.mp3", capture: "/sfx/capture.mp3", electric: "/sfx/freesound_community-circuit-bent-stylophone-75384.mp3" };
// (v0.2.2) maxMs를 주면 그 시간이 지난 뒤 재생을 멈춘다 — 회로 전기음처럼 긴 음원의 앞부분만 쓸 때.
export function playSfx(name, maxMs) {
  if (!loadSfxPref()) return;
  const src = SFX_SRC[name]; if (!src) return;
  try { const el = new Audio(src); el.volume = loadSfxVolume(); el.play().catch(() => { }); if (maxMs) setTimeout(() => { try { el.pause(); el.currentTime = 0; } catch { } }, maxMs); } catch { }
}
// (v0.1.4 기능) SAN 표기상 포획 수는 항상 "x"를 포함(앙파상 포함) — 이 규칙만으로 클릭/무브 소리 중
// 어느 쪽을 재생할지 나무 "탁" 소리(clack)와 "퍽" 소리(thud, 기물이 실제로 잡히는 느낌)로 나눈다.
export function playMoveSfx(san) { playSfx(san && san.includes("x") ? "capture" : "move"); }
