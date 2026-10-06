import { useRef, useState, useEffect, useCallback, useMemo, useLayoutEffect } from "react";
import { tierFromXp, rollLineXp, TIERS } from "./lib/tierSystem.js";
import { SB_ON, sbRpc } from "./lib/supabaseClient.js";
import { engineNeedsDownload, initDownloadedEngines } from "./lib/engineDownload.js";
import { closeExternalBrowser, decideBackAction, exitApp, installNativeLinkGuard, isNativeApp, listenBackButton, listenDeepLinks, parseAuthFragment, parseDeepLink } from "./lib/nativeApp.js";
import { loadBgmVolume, loadBgmPref, saveBgmPref, saveBgmVolume, loadSfxPref, loadSfxVolume, saveSfxPref, saveSfxVolume, playSfx, loadReviewSpeedPref, saveReviewSpeedPref, loadReviewVolatilityPref, saveReviewVolatilityPref } from "./lib/prefs.js";
import { parseFenFull, sansToFen, stripSuffix } from "./lib/chessRules.js";
import { loadCcSeen, saveCcSeen, latestEndTime, pendingCcGames, ccGameKey, recordAround, ratingDeltaOf } from "./lib/ccGameToast.js";
import { BOARD_SKINS, PIECE_SKINS, T, MOTION_EASE } from "./lib/theme.js";
import { isPuzzleSequenceValid, puzzleEloUpdate } from "./lib/puzzleRating.js";
import { SkinContext } from "./components/pieces.jsx";
import { SITE_FONT } from "./components/engineLines.jsx";
import { Search, Users, MessageCircle, Star, Send, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { CONTENT, CoinIcon, DEFAULT_MOVE_FX_MODE, DEV_ACCOUNT, ENGINE_PROFILES, EngineContext, MaterialIcon, MinigamePrefsContext, PuzzleShareSheet, TITLE_TIERS, VisualPrefsContext, chatConvPrefsFetch, chatFetchAll, chatMarkRead, computeDexLayout, friendAccept, friendEdges, friendRemove, getAnalysisPool, invalidateBookIndex, loadContent, mainQuestOverallProgress, moveFxModeFromSaved, notifyCreate, puzzleDeleteRemote, puzzleFetch, puzzleNo, puzzleShare, puzzleTreeOf, resolveReviewIdentifier, reviewGameIdentifier, reviewGameKey, reviewStorageKey, reviewedGameFetch, reviewedGameShare, setSacConfirmEvaluator, snapNode, solvedLineTagsOf, starsOf, themesOf, todayStr, treeLinesOf, useChessCom, useNarrow, useRealtimeTable, userProfile, usersProfiles } from "./app/common.jsx";
import { ALL_TITLE_IDS, AnnouncementModal, AuthModal, CC_LIVE, ChesscomGameToast, DailyPuzzleNoticeModal, DailyQuestClearedModal, GeoBackdrop, GlobalMinigameRematchBanner, GlobalPvpInviteBanner, HeaderProfileMenu, NewPasswordModal, NotificationBell, TABS, TAB_PATH, TierBadge, TierUpOverlay, TitleEarnedModal, UsernameSetupModal, achievableTitles, authFromHash, authLogout, authRestore, ccFamilyCounts, dailyQuestQuestsValid, defaultEnginePref, familyCounts, findOpeningPathByName, genDailyQuest, isSameLocalDay, loadEnginePref, localKeyFor, parseOAuthError, parseOAuthHash, parseRecoveryHash, preloadMascotArt, progressSave, publishProfile, puzzleCreatorUsernames, puzzleLikeCounts, puzzleLikeToggle, puzzlePopularityScores, puzzleRepostCounts, puzzleRepostToggle, puzzleShareCounts, puzzleShareReward, puzzleSolveCounts, puzzleSolveEventAdd, puzzleSolveInc, puzzleSolverAdd, puzzleSolversBatch, questOpeningCleared, questSlotLabel, refreshAccessToken, saveContent, saveEnginePref, store, tabFromPath, useDailyPuzzle, useEngine, useOpeningTreeAuto } from "./app/shell.jsx";
import { APP_VERSION } from "./app/changelog.js";
import { PLAY_SPECIAL_GAMES, PlayPage } from "./app/play.jsx";
import { ChatsModal, FriendsModal, ProfileWindow, UserProfilePage, UserSearchModal } from "./app/social.jsx";
import { TierJourneyMap } from "./app/profile.jsx";
import { ReviewPage } from "./app/review.jsx";
import { AccountCenterModal, SettingsTab } from "./app/settings.jsx";
import { LearnTab } from "./app/learn.jsx";
import { CollectionTab } from "./app/dex.jsx";
import { PuzzleTab } from "./app/puzzle.jsx";
import { QuestTab } from "./app/quest.jsx";

import { t, tx } from "./lib/i18n.js";
export default function App() {
  const narrowHeader = useNarrow(480);
  // (16차) 주소창의 서브패스(/learn, /book, /puzzle, /setting)로 직접 들어온 경우 그 탭을 우선한다.
  const urlTabRef = useRef(typeof window !== "undefined" ? tabFromPath(window.location.pathname) : null);
  const [tab, setTab] = useState(() => urlTabRef.current || "learn");
  // (버그 수정) 도감 오프닝 트리를 배경에서 계속 더 깊이 채워나가는 useOpeningTreeAuto가 도감 탭
  // 컴포넌트(CollectionTab) 안에서 호출되고 있었다 — {tab === "dex" && <CollectionTab .../>}처럼
  // 탭을 조건부로 마운트하는 구조라, 다른 탭으로 갔다가 돌아오기만 해도(퍼즐 확인 등 흔한 사용
  // 패턴) 이 컴포넌트가 통째로 언마운트·재마운트되어 지금까지 쌓인 깊이가 전부 사라지고 처음부터
  // 다시 시작됐다 — 그래서 짧게 훑어보면 항상 얕은 수(약 6수)에서 멈춘 것처럼 보였다. 항상
  // 마운트돼 있는 App으로 끌어올려, 어느 탭에 있든(도감을 벗어나도) 계속 더 깊이 채워지도록 한다.
  const dexGenPriorityRef = useRef({ selectedKey: null, distanceOf: null });
  const [unlocked, setUnlocked] = useState(new Set());
  const [newUnlocks, setNewUnlocks] = useState(0);
  const [newTitles, setNewTitles] = useState(0); // (버그) 새로 획득한 칭호 수 — 도감 탭 빨간 배지
  const [puzzles, setPuzzles] = useState([]);
  // (버그 수정) 퍼즐 생성(genPuzzleTree)이 집중 분석 화면의 effect에 묶여 있으면, 그 화면이 언마운트되는
  // 탭 전환만으로 아직 안 끝난 생성이 통째로 버려졌다(엔진 자체는 App에 항상 떠 있어 계속 도는데도).
  // 생성 요청·진행률을 이 항상-마운트된 App으로 끌어올려, 어느 탭에 있든 생성이 끝까지 이어지고
  // 완료되면 저장되도록 한다. puzzleGenProgress: 퍼즐 id -> {p(진행률 0~1), path(지금까지 탐색된
  // 수순 — 생성 과정 미리보기용)}, 완료되면 항목 제거.
  const [puzzleGenProgress, setPuzzleGenProgress] = useState({});
  const puzzleGenInFlightRef = useRef(new Set());
  const likeInFlightRef = useRef(new Set());
  const repostInFlightRef = useRef(new Set());
  // (기능) 접속 시 업데이트 공지 — "다시 보지 않기"를 체크하고 닫으면 그 버전 번호를 저장해 두고,
  // 다음에 저장된 값이 현재 APP_VERSION과 다르면(=새 버전이 나오면) 다시 보여준다.
  const [dismissedAnnounceVersion, setDismissedAnnounceVersion] = useState(null);
  const [announceOpen, setAnnounceOpen] = useState(false);
  // (v0.2.0 기능2) 오늘의 퍼즐 알림 — 일일 최초 접속 시 1회, 그 이후로도 일일 퀘스트를 다
  // 클리어하지 않았다면 3시간마다 다시 뜬다. dailyPuzzleLastShownAt(마지막으로 뜬 시각)과
  // dailyPuzzleHideDate("오늘 하루 다시 보지 않기"를 누른 날짜)만 저장해 두면, 그 둘로 매번
  // "지금 띄워야 하는가"를 다시 계산할 수 있어 별도의 "오늘 봤음" 불리언 플래그가 필요 없다.
  const [dailyPuzzleLastShownAt, setDailyPuzzleLastShownAt] = useState(0);
  // (신규 기능, 사용자 요청) 일일 퍼즐 연속 해결(스트릭) — count는 지금 이어지고 있는 연속 일수,
  // best는 역대 최고 기록(배지 판정용, count가 끊겨도 그대로 남는다), lastDate는 마지막으로
  // 반영된 날짜(YYYY-MM-DD, KST) — 오늘 이미 반영했는지 판단하고 중복 집계를 막는 데 쓴다.
  const [dailyPuzzleStreak, setDailyPuzzleStreak] = useState({ count: 0, best: 0, lastDate: null });
  const [dailyPuzzleHideDate, setDailyPuzzleHideDate] = useState(null);
  const [puzzleNoticeOpen, setPuzzleNoticeOpen] = useState(false);
  // (v0.2.9 기능) 일일 퀘스트 전체 클리어 축하 팝업 — 아래 dailyQuest.clearAnnounced effect가 연다.
  const [questClearOpen, setQuestClearOpen] = useState(false);
  const [learnFocus, setLearnFocus] = useState(null);   // (UX4) 탭 이동에도 집중 분석 유지
  // (사용자 요청) 도감 탭 오프닝 트리의 수 카드에서 "오프닝 이름"을 눌러 집중 분석으로 이동했을 때,
  // 집중 분석을 닫으면 도감 탭으로(그것도 떠나기 전 모식도 팬/줌/열린 카드가 그대로 남은 상태로)
  // 돌아가도록 하기 위한 "돌아갈 탭" 표시 — onOpenOpening이 도감 탭에서 불렸을 때만 "dex"로 채워지고,
  // 그 값이 있는 동안은 CollectionTab을 언마운트하지 않고 화면에서만 숨겨(display:none) 내부 상태
  // (팬·줌·펼친 카드·트리 레이아웃 캐시)를 그대로 보존한다. 사용자가 직접 다른 탭을 눌러 이동하면
  // (switchTab) 이 예약은 취소된다 — 도감으로 "자동으로" 돌아가는 건 이 흐름 하나뿐이어야 하므로.
  const [focusReturnTab, setFocusReturnTab] = useState(null);
  // (사용자 요청) 퍼즐 풀이 카드/일일 퍼즐 팝업의 기보를 눌러 집중 분석으로 들어가면 그 화면은
  // 닫힌다(onClose) — 집중 분석을 나갈 때 "같은 화면으로" 돌아가려면 무엇을 다시 열어야 하는지
  // 닫히기 직전에 기억해 둬야 한다. ref로 두는 이유는 이 값 자체가 화면에 그려지지 않고, 리렌더를
  // 일으킬 필요도 없기 때문(집중 분석을 나가는 단 한 번의 effect에서만 읽고 곧장 비운다).
  const savedPuzzleRef = useRef(null);
  const reopenDailyNoticeRef = useRef(false);
  const [puzzleActive, setPuzzleActive] = useState(null);   // (UX4) 탭 이동에도 퍼즐 창 유지
  // (v0.3.4 기능) 딥링크(/(퍼즐 번호)-(라인 번호))로 지정된 라인 — { no, lineNo } | null.
  const [puzzleTargetLine, setPuzzleTargetLine] = useState(null);
  // (v0.1.0) 채팅으로 공유받은 퍼즐을 "풀러 가기"로 열었을 때의 공유 출처 — { msgId, no, fromUid(공유자) }.
  // 지금 열려 있는 puzzleActive가 이 no와 일치하는 동안 라인을 풀면 공유자에게 XP 10%를 돌려준다.
  const [shareReferral, setShareReferral] = useState(null);
  const shareReferralRef = useRef(null);
  useEffect(() => { shareReferralRef.current = shareReferral; }, [shareReferral]);
  const [shareSheetPuzzle, setShareSheetPuzzle] = useState(null); // (v0.1.0) 공유 시트에 띄울 퍼즐(종이비행기 아이콘)
  const [treeFocus, setTreeFocus] = useState([]);   // (UX4) 새로고침해도 이론 트리 에디터의 탐색 위치 유지
  const [deletedPuzzles, setDeletedPuzzles] = useState(new Set()); // (UX5) 삭제한 퍼즐(자동 재생성 방지)
  // (20차 UX6) 추천 퍼즐은 "미해결" 목록과 별도 알고리즘으로 동작한다 — 퍼즐 탭에서 삭제해도 이미
  // 알고 있던 퍼즐 데이터는 여기 보존해 두어, 추천 목록에서는 계속 후보로 남는다(id -> 퍼즐 객체).
  const [archivedPuzzles, setArchivedPuzzles] = useState({});
  const [solveCounts, setSolveCounts] = useState({});              // (UX6) 번호별 전역 풀이수
  const [likeCounts, setLikeCounts] = useState({});                 // (기능) 번호별 전역 좋아요수
  const [repostCounts, setRepostCounts] = useState({});             // (v0.1.0) 번호별 전역 리포스트수
  const [shareCounts, setShareCounts] = useState({});               // (v0.1.0) 번호별 전역 공유수
  const [popularityScores, setPopularityScores] = useState({});     // (사용자 요청) 번호별 인기 점수 — 퍼즐 탭 "인기순" 정렬용
  const [creatorUsernames, setCreatorUsernames] = useState({});      // (사용자 요청) 퍼즐 탭 필터용 — 번호별 생성자 아이디
  const [friendUids, setFriendUids] = useState([]);                // (16차) 수락된 친구 uid 목록
  const [puzzleSolvers, setPuzzleSolvers] = useState({});          // (16차) { [puzzleNo]: uid[] } — 그 퍼즐을 푼 사람들
  const [solverNames, setSolverNames] = useState({});              // (16차) uid -> username (친구 중 해결자만)
  const [earnedTitles, setEarnedTitles] = useState(new Set());     // (기능4) 획득 칭호(영구)
  const [currentTitle, setCurrentTitle] = useState(null);         // 장착 칭호
  const [titleEarnedPopup, setTitleEarnedPopup] = useState(null); // (v0.2.9 기능) 새 칭호 획득 팝업(id) — X/확인으로만 닫힘
  // (20차 기능4) 보드 스킨·기물 스킨은 독립적으로 구매·장착한다 — ownedSkins는 "board:ocean" 같은
  // "종류:id" 키 집합(영구), boardSkin/pieceSkin은 지금 장착 중인 스킨 id(기본 "classic").
  const [ownedSkins, setOwnedSkins] = useState(new Set());
  const [boardSkin, setBoardSkin] = useState("classic");
  const [pieceSkin, setPieceSkin] = useState("classic");
  const [profile, setProfile] = useState({ nickname: "", chesscom: "" });
  const [loaded, setLoaded] = useState(false);
  const [liveOn, setLiveOn] = useState(true);
  const [focusActive, setFocusActive] = useState(false);
  const [toast, setToast] = useState(null);
  const [solved, setSolved] = useState(new Set());
  const [likedPuzzles, setLikedPuzzles] = useState(new Set());   // (기능) 내가 좋아요 누른 퍼즐 id — solved처럼 로컬+계정에 저장
  const [repostedPuzzles, setRepostedPuzzles] = useState(new Set());   // (v0.1.0) 내가 리포스트한 퍼즐 id — likedPuzzles와 동일한 방식으로 로컬+계정에 저장
  const [lineSolves, setLineSolves] = useState({});   // (기능1) { [puzzleId]: string[] } — 라인(tag)별 해결 기록. 전체 라인이 다 모이면 solved로 승격.
  const [totalXp, setTotalXp] = useState(0);   // (15차 기능4) 누적 경험치 — 티어/진행률은 tierFromXp로 매번 도출
  // (v0.4.1 기능, item 3) 공개 퍼즐 레이팅 — puzzleLineBaseRating과 같은 100~3000 척도로 시작값은
  // 그 척도의 가장 낮은 티어(초심자) 근처인 800으로 둔다.
  const [puzzleRating, setPuzzleRating] = useState(800);
  // (신규 기능, 사용자 요청) 적응형 퍼즐 난이도용 — 최근 풀이 컨디션의 지수이동평균(0~1, 0.5 중립).
  // puzzleExposureScore의 adaptiveTargetRating이 이 값으로 추천 목표 레이팅을 즉시 밀어준다(느리게만
  // 움직이는 puzzleRating Elo 자체와 별개).
  const [puzzleMomentum, setPuzzleMomentum] = useState(0.5);
  // (about 페이지 그랜드마스터 카드 연동) 그랜드마스터 티어에 도달하면 전용 보드·기물 스킨을
  // 코인 없이 자동 해금 — 티어에서 다시 내려갈 일이 없으므로 한 번 추가되면 계속 소유한 상태로 남는다.
  useEffect(() => {
    if (tierFromXp(totalXp).tier.key !== "grandmaster") return;
    setOwnedSkins((prev) => {
      const keys = ["board:grandmaster", "piece:grandmaster"];
      if (keys.every((k) => prev.has(k))) return prev;
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      return next;
    });
  }, [totalXp]);
  const [ocCoins, setOcCoins] = useState(0);   // (19차 기능5) OC 나이트 코인 — 일일 퀘스트 전체 완료 시 50개 지급(영구 저장)
  // (v0.2.9 기능 → v0.3.5 리뷰 티켓 제거) 게임 리뷰는 이제 아무 제한 없이 열 수 있다 — reviewUnlocked는
  // 더는 소비되는 재화의 잠금 해제 기록이 아니라, "리뷰한 대국만" 필터(AccountChessStats)를 위해 리뷰를
  // 연 적 있는 대국을 계속 기록해 두는 순수 이력용 집합이다(reviewGameKey(game) 문자열의 Set).
  const [reviewUnlocked, setReviewUnlocked] = useState(new Set());
  // (버그) 개발자 계정 코인 지급을 "코인 기록이 아예 없을 때"로만 한정했더니, 이미 로그인해 progress가
  // 저장돼 있던 기존 개발자·공동 개발자 계정에는 소급 적용되지 않았다. 대신 "1회 지급 여부" 플래그를
  // 따로 저장해, 이미 progress가 있는 계정이라도 아직 못 받았으면 로그인 시 10000개까지 채워준다.
  const [devBonusGranted, setDevBonusGranted] = useState(false);
  const [dailyQuest, setDailyQuest] = useState(null);  // (17차) 오늘의 퀘스트 — { date, featured, puzzleTarget, puzzleCount, ccDone, claimed, bonusClaimed, seen, resetUsed, banned }
  // (사용자 요청) 분석 탭 수 블록의 퀘스트 배지를 누르면 즉시 학습 탭으로 이동하고, 해당하는 일일
  // 퀘스트 오프닝 항목을 명시적으로 표시하는 애니메이션을 재생한다 — nonce는 같은 오프닝을 연달아
  // 눌러도 매번 새로 애니메이션이 재생되도록(리마운트 트리거) 클릭마다 값을 바꾼다.
  const [questHighlight, setQuestHighlight] = useState(null); // { opening, nonce } | null
  const onQuestBadgeClick = useCallback((openingName) => {
    setTab("quest");
    if (openingName) setQuestHighlight({ opening: openingName, nonce: Date.now() });
  }, []);
  // (20차 UI4) 하단 "퀘스트" 탭 아이콘 상태 — 전부 클리어하면 assignment_turned_in, 클리어했지만
  // 아직 확인(seen) 안 한 항목이 있으면 assignment_late, 그 외엔 기본 assignment.
  const questIconName = useMemo(() => {
    if (!dailyQuest || !dailyQuest.claimed) return "assignment";
    const keys = ["puzzle", "cc_0", "cc_1", "cc_2"];
    const allDone = keys.every((k) => dailyQuest.claimed[k]);
    if (allDone) return "assignment_turned_in";
    const hasUnseen = keys.some((k) => dailyQuest.claimed[k] && !((dailyQuest.seen || {})[k]));
    return hasUnseen ? "assignment_late" : "assignment";
  }, [dailyQuest]);
  const [mainQuest, setMainQuest] = useState({ claimed: {} }); // (18차 기능1) 메인 퀘스트 스테이지 보상 수령 여부
  const [recentOpenings, setRecentOpenings] = useState([]);  // (17차) 최근 푼 퍼즐/집중분석한 오프닝 — 일일 퀘스트 후보 풀
  const [user, setUser] = useState(null); // username (표시/검색)
  const [uid, setUid] = useState(null);    // auth uid (데이터 접근)
  const [authOpen, setAuthOpen] = useState(false);
  const [recovery, setRecovery] = useState(null);
  const [needUser, setNeedUser] = useState(null);   // 최초 구글 로그인 → 아이디 설정 대기
  const [authNotice, setAuthNotice] = useState("");   // 구글 콜백 오류 안내
  // (신규 기능) 사용자 요청 — Discord 스타일 초록 점으로 실시간 접속 여부를 보여주기 위해, 로그인해
  // 있는 동안 주기적으로 내 마지막 접속 시각(presence.last_seen)을 서버에 갱신한다. 화면이 백그라운드로
  // 가려져 있을 때는 갱신을 멈춰(visibilitychange) "떠나 있는데 온라인으로 보이는" 오차를 줄인다.
  useEffect(() => {
    if (!uid || !SB_ON) return;
    let cancelled = false;
    const beat = () => { if (!cancelled && document.visibilityState !== "hidden") sbRpc("touch_presence", {}).catch(() => {}); };
    beat();
    const id = setInterval(beat, 25000);
    document.addEventListener("visibilitychange", beat);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener("visibilitychange", beat); };
  }, [uid]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false); // (18차 UX7) 채팅 모아보기
  // (v0.4.4 기능, 사용자 요청) 다른 유저 프로필 — 검색·채팅·/play 친구 목록 등 어디서 열든 이제
  // openchess.kr/user/<MID> 고유 URL을 갖는 실제 페이지(UserProfilePage)로 연결된다. openUserProfile은
  // mid를 이미 알 때(예: 초대 링크 딥링크), openUserProfileByUsername은 username만 있을 때(기존
  // 대부분의 진입점) 쓴다 — 먼저 그 유저의 mid를 조회한 뒤 같은 경로를 탄다.
  const [viewedProfileMid, setViewedProfileMid] = useState(null);
  const [viewedProfileAutoInvite, setViewedProfileAutoInvite] = useState(false);
  const openUserProfile = useCallback((mid, opts) => {
    if (!mid) return;
    const upperMid = mid.toUpperCase();
    setSearchOpen(false); setFriendsOpen(false);
    setViewedProfileMid(upperMid);
    setViewedProfileAutoInvite(!!(opts && opts.invite));
    try {
      const path = "/user/" + upperMid;
      if (window.location.pathname !== path) window.history.pushState({ userProfile: true }, "", path);
    } catch { }
  }, []);
  const openUserProfileByUsername = useCallback(async (username) => {
    if (!username) return;
    const r = await userProfile(username);
    if (r && r.mid) openUserProfile(r.mid);
  }, [openUserProfile]);
  const closeUserProfile = useCallback(() => {
    setViewedProfileMid(null); setViewedProfileAutoInvite(false);
    try { if (window.location.pathname.startsWith("/user/")) window.history.back(); } catch { }
  }, []);
  const [tierMapOpen, setTierMapOpen] = useState(false); // (v0.0.6 개편) 티어 배지를 누르면 여는 여정 지도
  const [pendingFriendCount, setPendingFriendCount] = useState(0);
  // (UI8) 메인 화면 친구 버튼에 보류 중인 요청 수를 배지로 표시 — 요청 탭을 열지 않아도 보이도록
  const checkPending = useCallback(async () => {
    if (!uid) { setPendingFriendCount(0); return; }
    const e = await friendEdges();
    setPendingFriendCount(e.filter((x) => x.status !== "accepted" && x.to_uid === uid).length);
  }, [uid]);
  useEffect(() => { checkPending(); }, [checkPending, friendsOpen]);
  // (v0.0.5 성능) 30초 폴링 대신 나에게 온 친구 요청(friend_edges.to_uid=나) 변경을 Realtime으로 즉시
  // 반영하고, 소켓이 끊겼을 때를 대비해 2분 간격의 느슨한 안전망만 남긴다.
  useRealtimeTable("friend_edges", uid ? "to_uid=eq." + uid : null, checkPending, !!uid, 120000);
  // (18차 보충 UX7) 채팅 버튼에 표시할 "안읽은 채팅" 총 수 — 상대별로 안읽은 메시지가 있는 대화 상대 수(빨간 배지).
  const [unreadChatTotal, setUnreadChatTotal] = useState(0);
  // (v0.1.0) 같은 realtime 이벤트에 여러 컴포넌트가 동시에 반응해 같은 보상 메시지를 두 번 처리하지
  // 않도록, 처리를 시작한 메시지 id를 세션 동안 기억해 둔다(서버의 read=true 마킹과는 별개의 로컬 가드).
  const shareRewardSeenRef = useRef(new Set());
  const checkUnreadChat = useCallback(async () => {
    if (!uid) { setUnreadChatTotal(0); return; }
    const [rows, convPrefs] = await Promise.all([chatFetchAll(uid), chatConvPrefsFetch(uid)]);
    const senders = new Set();
    // (v0.3.4 기능) 알림을 꺼 둔 대화, 내가 지운 시점 이전 메시지는 채팅 버튼 배지에 반영하지 않는다.
    for (const m of rows) {
      if (m.to_uid !== uid || m.read) continue;
      const pref = convPrefs[m.from_uid];
      if (pref && pref.muted) continue;
      if (pref && pref.clearedBefore && new Date(m.created_at) <= new Date(pref.clearedBefore)) continue;
      senders.add(m.from_uid);
    }
    setUnreadChatTotal(senders.size);
    // (v0.1.0) 내가 공유한 퍼즐을 친구가 풀어 생긴 XP 보상 메시지 — 아직 처리 안 한 것만 골라 내 XP에
    // 더하고 실시간 애니메이션으로 보여준 뒤 읽음 처리한다(XP는 본인 클라이언트만 자기 것을 갱신할 수 있음).
    const rewards = rows.filter((m) => m.to_uid === uid && m.share_reward && !m.read && !shareRewardSeenRef.current.has(m.id));
    if (rewards.length) {
      rewards.forEach((m) => shareRewardSeenRef.current.add(m.id));
      const total = rewards.reduce((s, m) => s + (m.share_reward.amount || 0), 0);
      if (total > 0) {
        setTotalXp((x) => x + total);
        setToast({ type: "share_reward", amount: total });
        setTimeout(() => setToast((t) => (t && t.type === "share_reward" ? null : t)), 1800);
      }
      chatMarkRead(rewards);
    }
  }, [uid]);
  useEffect(() => { checkUnreadChat(); }, [checkUnreadChat, chatsOpen]);
  // (v0.0.5 성능) 15초 폴링 대신 나에게 온 채팅(chat_messages.to_uid=나) 변경을 Realtime으로 즉시 반영,
  // 안전망으로 2분 간격 재조회만 남긴다.
  useRealtimeTable("chat_messages", uid ? "to_uid=eq." + uid : null, checkUnreadChat, !!uid, 120000);
  // (17차) 알림 창에서 친구 요청을 바로 수락/거절
  const onAcceptNotif = useCallback(async (n) => {
    const fromUid = n.payload && n.payload.fromUid; if (!fromUid) return;
    await friendAccept(fromUid);
    notifyCreate(fromUid, "friend_accepted", { byUsername: user });
    setPendingFriendCount((c) => Math.max(0, c - 1));
  }, [user]);
  const onRejectNotif = useCallback(async (n) => {
    const fromUid = n.payload && n.payload.fromUid; if (!fromUid) return;
    await friendRemove(fromUid);
    setPendingFriendCount((c) => Math.max(0, c - 1));
  }, []);
  // (v0.5.0 기능, 사용자 요청) daily_puzzle_selected 알림의 "받기" 버튼 — 실제 지급은 이 앱의 다른
  // 보상(일일 퀘스트·티어 승급 등)과 동일하게 클라이언트 progress(ocCoins)에 바로 반영한다(서버는
  // 알림 자체만 SECURITY DEFINER로 만들어 줄 뿐, 코인 액수 자체는 검증하지 않는 기존 구조 그대로).
  const onClaimNotif = useCallback((n) => {
    const amount = (n.payload && n.payload.reward) || 0;
    if (amount > 0) setOcCoins((c) => c + amount);
  }, []);
  const [authMode, setAuthMode] = useState("login");
  const [confirmLogout, setConfirmLogout] = useState(false);
  // (v0.1.4 기능) 앤티크한 체스 분위기의 잔잔한 배경음악(드뷔시 "달빛", 퍼블릭 도메인) — <audio> 엘리먼트
  // 하나를 앱 최상단에 상시 마운트해 탭을 옮겨 다녀도 재생이 끊기지 않게 하고, bgmOn은 그 엘리먼트의
  // 실제 play/pause 이벤트를 그대로 반영한다(자동재생 정책상 첫 클릭 전까지는 무음일 수 있음).
  // (v0.1.4 UI) 켜기/끄기·음량 조절 UI는 헤더에 두지 않고 설정 탭의 "사운드" 카드에서만 노출한다.
  const [bgmOn, setBgmOn] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(loadBgmVolume);
  const bgmRef = useRef(null);
  useEffect(() => {
    const el = bgmRef.current;
    if (!el) return;
    el.volume = bgmVolume;
    const onPlay = () => setBgmOn(true);
    const onPause = () => setBgmOn(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    if (loadBgmPref()) el.play().catch(() => { }); // 이전 방문에서 허용됐다면 자동재생, 아니면 조용히 실패
    return () => { el.removeEventListener("play", onPlay); el.removeEventListener("pause", onPause); };
  }, []);
  const toggleBgm = () => {
    const el = bgmRef.current;
    if (!el) return;
    if (el.paused) { el.play().then(() => saveBgmPref(true)).catch(() => { }); }
    else { el.pause(); saveBgmPref(false); }
  };
  const onBgmVolumeChange = (v) => {
    setBgmVolume(v);
    saveBgmVolume(v);
    if (bgmRef.current) bgmRef.current.volume = v;
  };
  // (v0.1.4 기능) 효과음 on/off·음량 — 설정 탭 UI 표시용 상태일 뿐, 실제 재생(playSfx)은 위치와
  // 무관하게 그때그때 localStorage 값을 직접 읽으므로 이 상태를 어디에도 prop으로 내려줄 필요는 없다.
  const [sfxOn, setSfxOn] = useState(loadSfxPref);
  const [sfxVolume, setSfxVolume] = useState(loadSfxVolume);
  const toggleSfx = () => setSfxOn((v) => { const nv = !v; saveSfxPref(nv); return nv; });
  const onSfxVolumeChange = (v) => { setSfxVolume(v); saveSfxVolume(v); };
  // (v0.1.4 기능) "블록 클릭" 효과음 — 개별 버튼·카드마다 onClick을 일일이 손대는 대신, 사이트 전체가
  // 이미 일관되게 쓰고 있는 .press 클래스(index.css)를 캡처 단계에서 감지해 한 곳에서만 재생한다.
  // 캡처 단계를 쓰는 이유는 일부 하위 요소가 버블링 중 stopPropagation을 호출해도(예: MoveTile의
  // CircleBadge) 그보다 먼저 실행돼 놓치지 않기 위함.
  useEffect(() => {
    const onDocClick = (e) => {
      const t = e.target.closest && e.target.closest(".press");
      if (t && !t.disabled) playSfx("click");
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, []);
  const [contentVer, setContentVer] = useState(0);
  const { data: dexTreeData, version: dexTreeVersion } = useOpeningTreeAuto(dexGenPriorityRef, contentVer);
  // (v0.5.6 성능) 도감 오프닝 트리의 좌표를 앱이 쉬는 틈에 미리 계산해 모듈 캐시에 넣어 둔다 — 도감 탭을 처음 열 때도 계산 없이 곧바로 그린다.
  // 구조가 그대로면 computeDexLayout이 캐시를 그대로 돌려주므로, 채택률 조회로 버전이 자주 올라가도 비용은 구조 확인(수 ms)뿐이다.
  useEffect(() => {
    const idle = typeof window !== "undefined" && window.requestIdleCallback ? window.requestIdleCallback : (f) => setTimeout(f, 1);
    const cancelIdle = typeof window !== "undefined" && window.cancelIdleCallback ? window.cancelIdleCallback : clearTimeout;
    let h = null;
    const t = setTimeout(() => { h = idle(() => { try { computeDexLayout(dexTreeData, contentVer); } catch { /* 미리 계산은 실패해도 탭을 열 때 다시 계산된다 */ } }); }, 1200);
    return () => { clearTimeout(t); if (h != null) cancelIdle(h); };
  }, [dexTreeData, dexTreeVersion, contentVer]);
  const [navNonce, setNavNonce] = useState(0);
  const [devOn, setDevOn] = useState(false);
  const [codevOn, setCodevOn] = useState(false);   // (기능3) 공동 개발자 모드
  const [learnSans, setLearnSans] = useState([]);
  const [learnFuture, setLearnFuture] = useState([]);
  const [learnExtra, setLearnExtra] = useState({});
  // (v0.4.9 기능, 사용자 요청) FEN 기반 퍼즐의 "기보" 자리에 표시되는 FEN 코드를 눌러 학습 탭으로
  // 이동할 때, 그 FEN 포지션을 곧바로 불러오도록 LearnTab에 한 번 흘려보내는 시드 — LearnTab이
  // 마운트된 뒤 이 값을 소비(onLoadFen)하자마자 다시 null로 비운다(onOpenLearnFen 참고).
  const [learnFenSeed, setLearnFenSeed] = useState(null);
  const onOpenLearnFen = useCallback((fen) => {
    const root = fen ? parseFenFull(fen) : null;
    if (!root) return;
    setSearchOpen(false); setFriendsOpen(false); setChatsOpen(false); // (v0.5.7) 채팅 속 FEN 미리보기의 "분석하기"로도 불린다

    // (버그 수정, 사용자 제보) 퍼즐 풀이 화면(전용 URL "/puzzle/(번호)-(라인)")에서 FEN 코드를
    // 누르면, 이 함수 직후 PuzzleSolver가 onClose(PuzzleTab의 closeActive)도 함께 부른다 —
    // closeActive는 "지금 주소가 그 퍼즐 URL 패턴이면" 무조건 history.back()을 호출하는데, 주소를
    // 그대로 두면 그 back()이 방금 바꾼 setTab("learn")을 popstate 핸들러가 다시 "puzzle"로
    // 되돌려버려 처음 눌렀을 땐 그대로 퍼즐 탭에 남아 있는 것처럼 보였다(onOpenLearnFocus의 같은
    // 문제를 고쳤던 것과 동일한 원인 — 그때와 같은 방식으로, 먼저 "/learn"으로 바꿔치기해 둔다).
    try {
      if (/^\/puzzle\/\d{6}-\d+$/.test(window.location.pathname)) {
        window.history.replaceState({ screens: (window.history.state && window.history.state.screens) || [] }, "", TAB_PATH.learn);
      }
    } catch { }
    setTab("learn"); setLearnFocus(null); setLearnSans([]); setLearnFuture([]); setFocusReturnTab(null);
    setLearnFenSeed(root);
  }, []);
  const [enginePref, setEnginePrefState] = useState(loadEnginePref);
  // (v0.6.3) 앱에서 아직 내려받지 않은 큰 엔진은 고르지 못한다(설정 탭이 내려받기 버튼을 보여 준다).
  const setEnginePref = useCallback((v) => { if (engineNeedsDownload(v)) return; setEnginePrefState(v); saveEnginePref(v); }, []);
  // (v0.6.3) 앱: 이미 내려받은 큰 엔진을 연결하고, 저장해 둔 엔진 선택을 되살린다(웹은 즉시 끝나 아무 일도 안 함).
  useEffect(() => { let off = false; initDownloadedEngines(ENGINE_PROFILES).then(() => { if (!off) setEnginePrefState(loadEnginePref()); }).catch(() => { }); return () => { off = true; }; }, []);
  const engine = useEngine(enginePref);
  // (v0.5.9 BUG-038) 분석 탭 후보 블록·FEN 모드·도감처럼 엔진을 직접 들고 있지 않은 동기 채점이 요청하는 희생 엔진 확인은 공용 분석
  // 풀의 마지막 워커로 돌린다(메인 엔진은 실시간 분석 큐가 길 수 있어 피한다). 풀을 못 띄우면 메인 엔진으로.
  useEffect(() => {
    if (engine.status !== "ready") { setSacConfirmEvaluator(null); return; }
    setSacConfirmEvaluator(async (fen) => {
      const pool = await getAnalysisPool(engine.profile, engine.urls).catch(() => []);
      const w = pool && pool.length ? pool[pool.length - 1] : engine;
      return w.evaluate(fen, 14, undefined, 1500);
    });
  }, [engine.status, engine.profile]);
  // (v0.3.9 기능) 사용자 요청 — 설정 탭 "리뷰 설정" 카드의 리뷰 속도(더 빠르게/더 정확하게)·국면
  // 변동성 보정 on/off. 둘 다 이 기기에만 저장되고(엔진 선택과 같은 패턴), ReviewPage에 그대로
  // prop으로 전달한다.
  const [reviewSpeed, setReviewSpeedState] = useState(loadReviewSpeedPref);
  const setReviewSpeed = useCallback((v) => { setReviewSpeedState(v); saveReviewSpeedPref(v); }, []);
  const [reviewSharpOn, setReviewSharpOnState] = useState(loadReviewVolatilityPref);
  const setReviewSharpOn = useCallback((v) => { setReviewSharpOnState(v); saveReviewVolatilityPref(v); }, []);
  // (사용자 요청) 설정 탭 "퍼즐 설정" 카드 — 라인 클리어·퍼즐 클리어 애니메이션, 코치 말풍선 표시를
  // 각각 켜고 끌 수 있다. 위 리뷰 속도·포지션 변동성 보정과 달리 "계정에 영구 저장"을 요청받아,
  // 이 기기에만 남는 localStorage 전용 저장 대신 다른 계정 설정(보드/기물 스킨 등)과 같은 경로 —
  // 아래 큰 로컬 캐시 blob(store.set)과 로그인 시 Supabase user_progress(progressSave)에 함께
  // 실어(다른 기기에서 로그인해도 그대로 따라온다), 마운트 시 두 곳에서 복원한다(아래 loaded 이펙트
  // 참고). 기본값은 모두 켜짐(true) — 저장된 값이 명시적으로 false일 때만 꺼진 상태로 복원한다.
  const [lineClearOn, setLineClearOn] = useState(true);
  const [puzzleClearOn, setPuzzleClearOn] = useState(true);
  // (사용자 요청) 코치 말풍선은 기본값을 꺼짐으로 바꾸고, 화면 안의 토글 버튼은 없앴다 — 오직 이
  // 설정(설정 탭)으로만 켤 수 있다. 저장된 값이 명시적으로 true일 때만 켜진 상태로 복원한다.
  const [coachBubbleOn, setCoachBubbleOn] = useState(false);
  // (v0.5.5, 사용자 요청) 설정 탭 "미니게임 설정" — 나이트 레이스·백랭크 러시아워에서 상대 기물이 통제하는 칸을 보드에 표시할지.
  // 기본값은 꺼짐, 코치 말풍선과 같은 경로(로컬 캐시 + user_progress)로 계정에 저장된다.
  const [mgDangerOn, setMgDangerOn] = useState(false);
  const mgPrefs = useMemo(() => ({ dangerOn: mgDangerOn }), [mgDangerOn]);
  // (v0.6.3) 수 등급 이펙트 표시 범위: "all" | "key"(탁월·유일만) | "off". 예전 불리언 moveFxOn 저장값은 moveFxModeFromSaved가 이어받는다.
  const [moveFxMode, setMoveFxMode] = useState(DEFAULT_MOVE_FX_MODE);
  const visualPrefs = useMemo(() => ({ moveFx: moveFxMode !== "off", moveFxMode }), [moveFxMode]);
  const chesscom = useChessCom(profile.chesscom, CC_LIVE);
  // (v0.5.6 기능, 사용자 요청) chess.com 대국 요약 알림 대기열 — 마지막으로 알림을 띄운 대국의 종료 시각을
  // 계정별로 기억해 두고(loadCcSeen), 그 뒤에 끝난 대국을 오래된 것부터 한 장씩 띄운다. 처음 연동한 계정은
  // 지금까지의 대국을 "이미 본 것"으로 두고 그다음 대국부터 알린다(과거 기록이 한꺼번에 쏟아지지 않게).
  const ccUser = profile.chesscom ? profile.chesscom.toLowerCase().trim() : null;
  const [ccQueue, setCcQueue] = useState([]);
  const ccQueuedRef = useRef(new Set());
  useEffect(() => { setCcQueue([]); ccQueuedRef.current = new Set(); }, [ccUser]);
  useEffect(() => {
    if (!ccUser || chesscom.status !== "ready" || chesscom.stillFetching) return;
    const seen = loadCcSeen(ccUser);
    if (seen === undefined) return; // 저장소를 못 쓰면 알림 없음
    if (seen === null) { saveCcSeen(ccUser, latestEndTime(chesscom.games)); return; }
    const add = pendingCcGames(chesscom.games, seen).filter((g) => !ccQueuedRef.current.has(ccGameKey(g)));
    if (!add.length) return;
    add.forEach((g) => ccQueuedRef.current.add(ccGameKey(g)));
    setCcQueue((q) => [...q, ...add]);
  }, [ccUser, chesscom.status, chesscom.stillFetching, chesscom.games]);
  const ccCur = ccQueue[0] || null;
  const ccCurInfo = useMemo(() => (ccCur ? { rec: recordAround(chesscom.games, ccCur), ratingDelta: ratingDeltaOf(chesscom.games, ccCur) } : null), [ccCur, chesscom.games]);
  // 화면에 뜬 순간 "본 것"으로 기록 — 여러 장을 보다가 새로고침해도 이미 본 대국은 다시 뜨지 않는다.
  useEffect(() => { if (ccUser && ccCur && ccCur.endTime) saveCcSeen(ccUser, ccCur.endTime); }, [ccUser, ccCur]);
  const dismissCcToast = useCallback(() => setCcQueue((q) => q.slice(1)), []);
  // (v0.2.4 성능 → v0.3.5) 게임 리뷰용 분석 엔진 풀을 사용자가 실제로 리뷰를 열기 전에 유휴 시간에
  // 미리 부팅해 둔다 — depth·movetime은 그대로고(analyzeGame 등은 여전히 이 풀을 getAnalysisPool로
  // 재사용), 리뷰를 열었을 때 "부팅부터 기다리는" 체감 지연만 없앤다. 예전엔 게임 리뷰가 항상
  // Stockfish 16("full") 고정이라 그 프로필만 미리 부팅했는데, 이제 리뷰도 사용자가 고른 분석
  // 엔진(enginePref)을 그대로 쓰므로 그 프로필을 미리 부팅한다(학습/퍼즐 탭을 먼저 거치지 않고 공유된
  // 리뷰 링크로 곧장 들어오는 경우에도 대비). requestIdleCallback이 없는 환경(사파리 등)은 넉넉한
  // setTimeout으로 대체한다. 초기 페이지 렌더링·분석 엔진 부팅과 경합하지 않도록 우선순위를 가장 낮춰 둔다.
  useEffect(() => {
    const boot = () => { const p = ENGINE_PROFILES[enginePref] || ENGINE_PROFILES[defaultEnginePref()]; getAnalysisPool(p.id, p.urls); };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(boot, { timeout: 8000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(boot, 3000);
    return () => clearTimeout(id);
  }, [enginePref]);

  useEffect(() => { loadContent().then(() => setContentVer((v) => v + 1)); }, []);
  // (v0.5.7 성능) 마스코트 이미지는 더 이상 번들에 없으므로, 첫 화면이 뜬 뒤 유휴 시간에 미리 받아 둔다(모달에서 빈칸으로 깜박이지 않게).
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") { const id = window.requestIdleCallback(preloadMascotArt, { timeout: 4000 }); return () => window.cancelIdleCallback(id); }
    const id = setTimeout(preloadMascotArt, 2000);
    return () => clearTimeout(id);
  }, []);
  // (버그 수정, 사용자 제보) CONTENT는 이미 호출부에서 동기적으로 다 고쳐 놓은 뒤 이 함수를 부르는데,
  // 예전엔 서버 저장(saveContent, app_content 테이블에 전체 CONTENT blob을 업서트하는 네트워크
  // 왕복)이 다 끝나야만 contentVer를 올려 화면을 다시 그렸다 — 예를 들어 도감 트리에 이론 수를
  // 새로 추가해도, 그 반영(재배치)이 네트워크 왕복이 끝날 때까지 늦어져 "즉각 반영"처럼 느껴지지
  // 않았다. contentVer부터 먼저 올려 로컬 화면은 그 즉시 새 CONTENT 기준으로 다시 그리고, 서버
  // 저장은 그 뒤로 미뤄(실패해도 다음 saveContent 호출 때 최신 CONTENT를 다시 통째로 올리므로 무해)
  // 화면 반응 속도와 무관하게 배경에서 진행한다.
  const bumpContent = useCallback(async () => { invalidateBookIndex(); setContentVer((v) => v + 1); saveContent(); }, []);   // 개발자 편집 → 이론 포지션 색인도 다시(v0.5.9 BUG-039)
  const isDev = user === DEV_ACCOUNT;
  const isCodev = !!user && Array.isArray(CONTENT.codev) && CONTENT.codev.includes(user);
  const canEdit = (isDev && devOn) || (isCodev && codevOn);   // (기능3) 분기점 해설·수 설명·수 키워드 수정 권한
  const canEditLessons = isDev && devOn;   // (기능) 레슨 편집(CMS)은 개발자 계정 전용 — 공동개발자는 제외
  const canAdd = canEdit;
  // (v0.3.4 기능) 사용자 요청 — 한 수에 남길 수 있는 "수 설명"(move_notes) 개수 한도. 개발자·
  // 공동개발자는(각자 모드가 켜져 있는 동안 — 다른 모든 canEdit류 권한과 같은 결이라 그대로
  // canEdit을 재사용) 무제한, 그랜드마스터 티어에 도달한 일반 계정은 2개까지, 그 외는 기존과
  // 같이 1개다. 실제 강제는 서버(move_notes_cap, supabase-setup.sql)가 최종 결정한다 — 여기는
  // UI를 미리 맞게 보여주는 용도.
  const moveNoteCap = useMemo(() => canEdit ? Infinity : (tierFromXp(totalXp).tier.key === "grandmaster" ? 2 : 1), [canEdit, totalXp]);
  const canManageCodev = isDev && devOn;
  const devUnlockAll = (isDev && devOn) || (isCodev && codevOn);                       // 공동 개발자 지정/해제는 개발자만
  const openAuth = (mode) => { setAuthMode(mode); setAuthOpen(true); };
  useEffect(() => { (async () => {
    const _rec = parseRecoveryHash(); if (_rec) setRecovery(_rec);
    const _oauth = _rec ? null : parseOAuthHash();
    if (!_rec && !_oauth) { const _oerr = parseOAuthError(); if (_oerr) { setAuthNotice(t("로그인 실패. 이미 다른 방식으로 가입된 이메일일 수 있음")); try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { } } }
    // (UX7) 세션 복구를 먼저 시도해 uid를 확정한 뒤, 그 uid(없으면 guest) 전용 로컬 캐시만 읽는다 —
    // 순서를 바꾸지 않으면 이전에 이 기기에서 로그인했던 "다른" 계정의 로컬 캐시를 먼저 읽어버린다.
    let acc = null;
    try { if (!_rec && !_oauth) acc = await authRestore(); } catch { }
    const activeUid = acc ? acc.uid : null;
    const raw = await store.get(localKeyFor(activeUid));
    if (raw) { try { const d = JSON.parse(raw); setUnlocked(new Set(d.unlocked || [])); setProfile(d.profile || { nickname: "", chesscom: "" }); setPuzzles(d.puzzles || []); setSolved(new Set(d.solved || [])); setLikedPuzzles(new Set(d.likedPuzzles || [])); setRepostedPuzzles(new Set(d.repostedPuzzles || [])); setLineSolves(d.lineSolves || {}); setTotalXp(d.xp || 0); setPuzzleRating(d.puzzleRating || 800); if (d.puzzleMomentum != null) setPuzzleMomentum(d.puzzleMomentum); setOcCoins(d.coins || 0); setReviewUnlocked(new Set(d.reviewUnlocked || [])); if (d.devBonusGranted) setDevBonusGranted(true); setDeletedPuzzles(new Set(d.deleted || [])); if (d.archivedPuzzles) setArchivedPuzzles(d.archivedPuzzles); setEarnedTitles(new Set(d.titles || [])); if (d.currentTitle) setCurrentTitle(d.currentTitle); setOwnedSkins(new Set(d.ownedSkins || [])); if (d.boardSkin) setBoardSkin(d.boardSkin); if (d.pieceSkin) setPieceSkin(d.pieceSkin); if (d.dailyQuest) setDailyQuest(d.dailyQuest); if (d.mainQuest) setMainQuest(d.mainQuest); if (Array.isArray(d.recentOpenings)) setRecentOpenings(d.recentOpenings); if (Array.isArray(d.learnSans)) setLearnSans(d.learnSans); if (d.learnExtra) setLearnExtra(d.learnExtra); if (d.dismissedAnnounceVersion) setDismissedAnnounceVersion(d.dismissedAnnounceVersion); if (d.dailyPuzzleLastShownAt) setDailyPuzzleLastShownAt(d.dailyPuzzleLastShownAt); if (d.dailyPuzzleHideDate) setDailyPuzzleHideDate(d.dailyPuzzleHideDate); if (d.dailyPuzzleStreak) setDailyPuzzleStreak(d.dailyPuzzleStreak); if (d.lineClearOn === false) setLineClearOn(false); if (d.puzzleClearOn === false) setPuzzleClearOn(false); if (d.coachBubbleOn === true) setCoachBubbleOn(true); if (d.mgDangerOn === true) setMgDangerOn(true); { const _fx = moveFxModeFromSaved(d); if (_fx) setMoveFxMode(_fx); }
      // (UX1) 새로고침해도 현재 탭·집중 분석·퍼즐 진행 상황이 유지되도록 복원
      // (v0.2.3 버그 수정) 복원 대상이 "어제 이전"의 오늘의 퍼즐(id: "daily_YYYY-MM-DD", 그 문자열
      // 자체가 날짜를 담고 있음)이면 복원하지 않는다 — 예전엔 이 값이 그대로 복원돼, 어제 오늘의
      // 퍼즐을 열어본 채로 자정을 넘기면 퍼즐 탭을 눌러도(=puzzleActive가 non-null이라 홈 화면 대신
      // 그 풀이 화면이 곧장 뜸) 전날 퍼즐이 계속 보이는 버그가 있었다(알림 팝업은 todayPuzzle을 매번
      // 새로 계산해 보여주므로 이 버그와 무관하게 항상 정상이었다).
      // (v0.2.4 버그 수정) 리체스 기반 오늘의 퍼즐은 id가 더 이상 "daily_" 접두사가 아니라
      // "XXXXXX-N" 형태라 접두사로는 "어제 이전의 오늘의 퍼즐"인지 구분할 수 없다 — 퍼즐 객체
      // 자체의 isDaily/date 필드로 판정하되(resolveDailyPuzzle이 채움),
      // 이 필드가 없는 배포 전 저장값(구버전 "daily_" id)은 접두사 검사로 그대로 폴백한다.
      const isStaleDaily = (pz) => !pz ? false : (pz.isDaily && pz.date) ? pz.date !== todayStr() : (/^daily_/.test(pz.id) ? pz.id !== "daily_" + todayStr() : false);
      const restoredPuzzleActive = d.puzzleActive && !isStaleDaily(d.puzzleActive) ? d.puzzleActive : null;
      if (d.tab && !urlTabRef.current) setTab(d.tab); if (Array.isArray(d.learnFuture)) setLearnFuture(d.learnFuture); if (d.learnFocus) setLearnFocus(d.learnFocus); if (restoredPuzzleActive) setPuzzleActive(restoredPuzzleActive); if (Array.isArray(d.treeFocus)) setTreeFocus(d.treeFocus);
    } catch { } }
    // (버그 수정 시도 → 되돌림) 개발자 모드에서 XP를 바꾼 직후 곧바로 새로고침하면, 아직 서버에
    // 반영되지 못한(더 오래된) pr.xp가 방금 바꾼 로컬 값을 되돌려버려 "개발자 모드에서 조작한 XP가
    // 반영되지 않는다"는 증상으로 보인 적이 있다. 이를 고치려 "로컬·서버 중 더 큰 값을 신뢰"하거나
    // "서버에 아직 못 올린 변경이 있었는지"를 로컬에 남긴 플래그로 판단하는 방식을 각각 시도했지만,
    // 둘 다 결국 클라이언트가 통제하는 localStorage 값(숫자든 플래그든)에 근거해 서버의 권위를
    // 예외적으로 무시하는 구조라, 브라우저 개발자 도구로 그 값을 직접 써넣으면 서버가 자기 XP를 영영
    // 못 이기게 만들 수 있다는 지적을 보안 검토에서 두 차례 받았다. 이 필드는 원래도 클라이언트가
    // user_progress를 통째로 upsert하는 구조(RLS가 auth.uid()=id만 확인, 서버가 XP 값 자체를 검증하지
    // 않음)라 근본적인 위조 방지는 서버 쪽에 없지만, 그렇다고 로컬 스토리지 편집만으로 더 쉽게 위조할
    // 수 있는 경로를 새로 여는 것은 옳지 않다 — 서버 값을 예외 없이 항상 신뢰하는 원래 동작으로
    // 되돌린다. 새로고침 타이밍이 나쁘면 방금 dev 패널로 바꾼 값이 한 번 되돌아 보일 수 있지만(진짜
    // 서버 저장 자체는 그대로 진행 중이므로 곧 다시 저장되어 정상화된다), 클라이언트가 서버 값을
    // 임의로 이기게 하는 것보다 이 쪽이 안전하다.
    if (acc) { setUser(acc.username); setUid(acc.uid); const pr = acc.progress || {}; if (pr.unlocked) setUnlocked(new Set(pr.unlocked)); if (pr.puzzles) setPuzzles(pr.puzzles); if (pr.solved) setSolved(new Set(pr.solved)); if (pr.likedPuzzles) setLikedPuzzles(new Set(pr.likedPuzzles)); if (pr.repostedPuzzles) setRepostedPuzzles(new Set(pr.repostedPuzzles)); if (pr.lineSolves) setLineSolves(pr.lineSolves); if (pr.xp != null) setTotalXp(pr.xp); if (pr.puzzleRating != null) setPuzzleRating(pr.puzzleRating); if (pr.puzzleMomentum != null) setPuzzleMomentum(pr.puzzleMomentum); if (pr.coins != null) setOcCoins(pr.coins); if (pr.reviewUnlocked) setReviewUnlocked(new Set(pr.reviewUnlocked)); if (pr.devBonusGranted) setDevBonusGranted(true); if (pr.deleted) setDeletedPuzzles(new Set(pr.deleted)); if (pr.archivedPuzzles) setArchivedPuzzles(pr.archivedPuzzles); if (pr.titles) setEarnedTitles(new Set(pr.titles)); if (pr.currentTitle) setCurrentTitle(pr.currentTitle); if (pr.ownedSkins) setOwnedSkins(new Set(pr.ownedSkins)); if (pr.boardSkin) setBoardSkin(pr.boardSkin); if (pr.pieceSkin) setPieceSkin(pr.pieceSkin); if (pr.dailyQuest) setDailyQuest(pr.dailyQuest); if (pr.mainQuest) setMainQuest(pr.mainQuest); if (Array.isArray(pr.recentOpenings)) setRecentOpenings(pr.recentOpenings); if (pr.dismissedAnnounceVersion) setDismissedAnnounceVersion(pr.dismissedAnnounceVersion); if (pr.dailyPuzzleLastShownAt) setDailyPuzzleLastShownAt(pr.dailyPuzzleLastShownAt); if (pr.dailyPuzzleHideDate) setDailyPuzzleHideDate(pr.dailyPuzzleHideDate); if (pr.dailyPuzzleStreak) setDailyPuzzleStreak(pr.dailyPuzzleStreak); if (pr.lineClearOn === false) setLineClearOn(false); if (pr.puzzleClearOn === false) setPuzzleClearOn(false); if (pr.coachBubbleOn === true) setCoachBubbleOn(true); if (pr.mgDangerOn === true) setMgDangerOn(true); { const _fx = moveFxModeFromSaved(pr); if (_fx) setMoveFxMode(_fx); } const pub = acc.pub || {}; if (pub.chesscom || pub.nickname || pub.displayId || pub.photo || pub.firstMoves || pub.legacies || pub.legacyHistory) setProfile((p) => ({ ...p, chesscom: pub.chesscom || p.chesscom, nickname: pub.nickname || p.nickname, displayId: pub.displayId || p.displayId, photo: pub.photo || p.photo, firstMoves: pub.firstMoves || p.firstMoves, chesscomChangedAt: pub.chesscomChangedAt || p.chesscomChangedAt, legacies: pub.legacies || p.legacies, legacyHistory: pub.legacyHistory || p.legacyHistory })); }
    if (_oauth) { try { const oa = await authFromHash(_oauth); try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { } if (oa) { if (oa.username) onAuth(oa); else setNeedUser(oa); } } catch { } }
    try { const counts = await puzzleSolveCounts(); if (counts && Object.keys(counts).length) setSolveCounts(counts); } catch { }
    try { const lcounts = await puzzleLikeCounts(); if (lcounts && Object.keys(lcounts).length) setLikeCounts(lcounts); } catch { }
    try { const rcounts = await puzzleRepostCounts(); if (rcounts && Object.keys(rcounts).length) setRepostCounts(rcounts); } catch { }
    try { const scounts = await puzzleShareCounts(); if (scounts && Object.keys(scounts).length) setShareCounts(scounts); } catch { }
    try { const pscores = await puzzlePopularityScores(); if (pscores && Object.keys(pscores).length) setPopularityScores(pscores); } catch { }
    try { const creators = await puzzleCreatorUsernames(); if (creators && Object.keys(creators).length) setCreatorUsernames(creators); } catch { }
    setLoaded(true);
  })(); }, []);
  // (기능) 저장된 값을 다 복원한 뒤(loaded) 이 버전을 아직 "다시 보지 않기"로 끄지 않았다면(또는
  // 그 이후 버전이 올라와 저장된 값이 최신 버전과 달라졌다면) 공지를 띄운다.
  // (버그 수정) 예전엔 [loaded]에만 의존해 최초 한 번만 판단했는데, 로그인(onAuth)이 그 이후에
  // 서버에 저장된 dismissedAnnounceVersion 값으로 상태를 바꿔도 이 effect가 다시 안 돌아 반영이
  // 안 됐다 — 게스트로 이미 이 버전을 닫아 둔 상태에서 아직 안 닫은 계정으로 로그인해도 공지가
  // 안 뜨고, 반대로 공지가 열린 채로 이미 닫아 둔 계정에 로그인해도 열린 채 남아 있었다.
  // dismissedAnnounceVersion도 의존성에 넣어 로그인·로그아웃으로 그 값이 바뀔 때마다 다시
  // 판단하고, 열기뿐 아니라 닫기도 이 판단에 맡긴다(사용자가 X로 그냥 닫은 경우는 이 값이 안
  // 바뀌므로 이 effect가 다시 안 돌아 그 닫힘을 덮어쓰지 않는다).
  useEffect(() => { if (loaded) setAnnounceOpen(dismissedAnnounceVersion !== APP_VERSION); }, [loaded, dismissedAnnounceVersion]);
  // (v0.2.0 기능2) 오늘의 퍼즐 알림 표시 여부 판단 — "오늘 하루 다시 보지 않기"를 누르지 않았고,
  // (a) 오늘 아직 한 번도 안 떴거나 (b) 오늘 일일 퀘스트를 다 클리어하지 않은 채로 마지막으로 뜬
  // 지 3시간이 지났으면 다시 띄운다. setInterval로 주기적으로 재검사해야 앱을 계속 켜 둔 채로도
  // 3시간 경과 시점을 놓치지 않는다(탭 전환·리렌더만으로는 시간 경과를 감지할 수 없으므로).
  const dailyQuestCleared = !!(dailyQuest && dailyQuest.date === todayStr() && dailyQuest.claimed && dailyQuest.claimed.puzzle && dailyQuest.claimed.dailypuzzle && Array.isArray(dailyQuest.quests) && dailyQuest.quests.every((_, i) => dailyQuest.claimed["cc_" + i]));
  // (버그 수정) 업데이트 공지 모달과 이 알림이 동시에 뜨면 나중에 마운트된 이 모달의 전체화면
  // 배경(backdrop)이 z-index가 같아 위에 깔려, 공지 모달의 닫기 버튼을 완전히 가려 못 누르게
  // 만들었다. announceOpen state로 막으려 했으나, 그 값은 별도 useEffect가 setAnnounceOpen을
  // 호출해야 갱신되는 탓에 같은 커밋 안에서 이 effect가 먼저(또는 갱신 전 값으로) 실행되면 여전히
  // 동시에 열릴 수 있었다 — announceOpen 자체 대신, 그 값을 결정하는 원본 조건
  // (dismissedAnnounceVersion !== APP_VERSION)을 이 effect에서도 똑같이 직접 계산해 지연 없이
  // 막는다.
  const announceWillShow = dismissedAnnounceVersion !== APP_VERSION;
  useEffect(() => {
    if (!loaded || announceWillShow) return;
    const check = () => {
      const t = todayStr();
      if (dailyPuzzleHideDate === t) return;
      const shownToday = dailyPuzzleLastShownAt && todayStr(new Date(dailyPuzzleLastShownAt)) === t;
      const due3h = Date.now() - (dailyPuzzleLastShownAt || 0) >= 3 * 3600e3;
      if (!shownToday || (!dailyQuestCleared && due3h)) setPuzzleNoticeOpen(true);
    };
    check();
    const iv = setInterval(check, 5 * 60e3);
    return () => clearInterval(iv);
  }, [loaded, announceWillShow, dailyPuzzleHideDate, dailyPuzzleLastShownAt, dailyQuestCleared]);
  const closePuzzleNotice = useCallback((hideToday) => {
    setPuzzleNoticeOpen(false);
    setDailyPuzzleLastShownAt(Date.now());
    if (hideToday) setDailyPuzzleHideDate(todayStr());
  }, []);
  // (17차→v0.1.0) 프로필 정보 확장 — 다른 유저 프로필에서 티어/XP·해결한 퍼즐 수도 볼 수 있도록 공개
  // 프로필에 포함. (v0.1.0) 여기에 실제 "푼 퍼즐" 목록(전역 공유 puzzles 테이블의 no만 — 퍼즐 데이터
  // 자체는 이미 공개돼 있으므로 no만 실어도 보는 쪽에서 PuzzleCard를 그대로 그릴 수 있음)과 메인
  // 퀘스트 진척도 요약(전체 챕터/문항 수는 CONTENT 기준이라 개인정보 아님, claimed/doneItems만 개인)도
  // 함께 공개해, 설정 탭 "내 프로필"에서만 보이던 이 두 정보를 유저 검색·친구 프로필에서도 볼 수 있게 한다.
  useEffect(() => { if (loaded && uid && user) publishProfile(uid, user, { nickname: profile.nickname || "", photo: profile.photo || "", bio: profile.bio || "", chesscom: profile.chesscom || "", chesscomChangedAt: profile.chesscomChangedAt || null, title: currentTitle || "", firstMoves: profile.firstMoves || null, xp: totalXp || 0, puzzleRating: puzzleRating || 800, solvedCount: solved.size, displayId: profile.displayId || "", solvedNos: [...solved].map((id) => puzzleNo(id)), mainQuestSummary: mainQuestOverallProgress(mainQuest), legacies: profile.legacies || null, legacyHistory: profile.legacyHistory || null }); }, [loaded, uid, user, profile.nickname, profile.photo, profile.bio, profile.chesscom, profile.chesscomChangedAt, currentTitle, profile.firstMoves, totalXp, puzzleRating, solved, profile.displayId, mainQuest, profile.legacies, profile.legacyHistory]);
  useEffect(() => { if (loaded) store.set(localKeyFor(uid), JSON.stringify({ unlocked: [...unlocked], profile, puzzles, solved: [...solved], likedPuzzles: [...likedPuzzles], repostedPuzzles: [...repostedPuzzles], lineSolves, xp: totalXp, puzzleRating, puzzleMomentum, coins: ocCoins, reviewUnlocked: [...reviewUnlocked], devBonusGranted, deleted: [...deletedPuzzles], archivedPuzzles, titles: [...earnedTitles], currentTitle, ownedSkins: [...ownedSkins], boardSkin, pieceSkin, dailyQuest, mainQuest, recentOpenings, liveOn, learnSans, learnExtra, tab, learnFuture, learnFocus, puzzleActive, treeFocus, dismissedAnnounceVersion, dailyPuzzleLastShownAt, dailyPuzzleHideDate, dailyPuzzleStreak, lineClearOn, puzzleClearOn, coachBubbleOn, mgDangerOn, moveFxMode })); }, [unlocked, profile, puzzles, solved, likedPuzzles, repostedPuzzles, lineSolves, totalXp, puzzleRating, puzzleMomentum, ocCoins, reviewUnlocked, devBonusGranted, deletedPuzzles, archivedPuzzles, earnedTitles, currentTitle, ownedSkins, boardSkin, pieceSkin, dailyQuest, mainQuest, recentOpenings, liveOn, loaded, learnSans, learnExtra, uid, tab, learnFuture, learnFocus, puzzleActive, treeFocus, dismissedAnnounceVersion, dailyPuzzleLastShownAt, dailyPuzzleHideDate, dailyPuzzleStreak, lineClearOn, puzzleClearOn, coachBubbleOn, mgDangerOn, moveFxMode]);
  useEffect(() => { if (loaded && uid) progressSave(uid, { unlocked: [...unlocked], puzzles, solved: [...solved], likedPuzzles: [...likedPuzzles], repostedPuzzles: [...repostedPuzzles], lineSolves, xp: totalXp, puzzleRating, puzzleMomentum, coins: ocCoins, reviewUnlocked: [...reviewUnlocked], devBonusGranted, deleted: [...deletedPuzzles], archivedPuzzles, titles: [...earnedTitles], currentTitle, ownedSkins: [...ownedSkins], boardSkin, pieceSkin, dailyQuest, mainQuest, recentOpenings, dismissedAnnounceVersion, dailyPuzzleLastShownAt, dailyPuzzleHideDate, dailyPuzzleStreak, lineClearOn, puzzleClearOn, coachBubbleOn, mgDangerOn, moveFxMode }); }, [unlocked, puzzles, solved, likedPuzzles, repostedPuzzles, lineSolves, totalXp, puzzleRating, puzzleMomentum, ocCoins, reviewUnlocked, devBonusGranted, deletedPuzzles, archivedPuzzles, earnedTitles, currentTitle, ownedSkins, boardSkin, pieceSkin, dailyQuest, mainQuest, recentOpenings, uid, loaded, dismissedAnnounceVersion, dailyPuzzleLastShownAt, dailyPuzzleHideDate, dailyPuzzleStreak, lineClearOn, puzzleClearOn, coachBubbleOn, mgDangerOn, moveFxMode]);
  // (버그 수정) 개발자·공동 개발자 계정에 나이트 OC 코인 10000개를 1회 지급 — 기존에 이미 가입해
  // progress가 저장돼 있던 계정도 소급 적용된다. devBonusGranted 플래그로 1회만 지급하므로,
  // 이후 코인을 다 쓰더라도 로그인할 때마다 다시 채워주지는 않는다.
  useEffect(() => {
    if (!loaded || !uid || devBonusGranted) return;
    if (!isDev && !isCodev) return;
    setOcCoins((c) => Math.max(c, 10000));
    setDevBonusGranted(true);
  }, [loaded, uid, isDev, isCodev, devBonusGranted]);
  // (16차) 퍼즐 카드에 "친구 N명이 풀었습니다" 표기를 위해, 로그인 시 내 친구 목록과 각 퍼즐의 해결자 uid를 한 번에 조회.
  useEffect(() => {
    if (!loaded) return;
    // (버그 수정) 로그아웃(uid===null)하거나 퍼즐이 없어져 그냥 리턴만 하면, 직전 계정에서 채워
    // 둔 friendUids/puzzleSolvers/solverNames가 그대로 남아 게스트 화면에도 그 계정 친구들의
    // "N명이 풀었습니다" 배지가 계속 보였다 — 이 조건에서는 명시적으로 비운다.
    if (!uid || !puzzles.length) { setFriendUids([]); setPuzzleSolvers({}); setSolverNames({}); return; }
    let cancelled = false;
    (async () => {
      const edges = await friendEdges();
      const fuids = edges.filter((e) => e.status === "accepted" && (e.from_uid === uid || e.to_uid === uid)).map((e) => (e.from_uid === uid ? e.to_uid : e.from_uid));
      if (cancelled) return;
      setFriendUids(fuids);
      const nos = [...new Set(puzzles.map((p) => puzzleNo(p.id)))];
      const solvers = await puzzleSolversBatch(nos);
      if (cancelled) return;
      setPuzzleSolvers(solvers);
      const friendSolverUids = new Set();
      Object.values(solvers).forEach((list) => list.forEach((u) => { if (fuids.includes(u)) friendSolverUids.add(u); }));
      if (friendSolverUids.size) { const pm = await usersProfiles([...friendSolverUids]); if (!cancelled) setSolverNames((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(pm).map(([k, v]) => [k, v.username])) })); }
    })();
    return () => { cancelled = true; };
  }, [loaded, uid, puzzles.length]);
  // (기능4) 해결 횟수로부터 새 칭호 획득 → 영구 저장 + 획득 알림(장착 버튼)
  const titleCounts = useMemo(() => familyCounts(puzzles, solved), [puzzles, solved]);
  // (19차 기능6) chess.com 전체 기간 게임에서 오프닝별 플레이 횟수 — 칭호 조건의 두 번째 축.
  const ccTitleCounts = useMemo(() => ccFamilyCounts(chesscom.games), [chesscom.games]);
  useEffect(() => {
    if (!loaded) return;
    const newly = [...achievableTitles(titleCounts, ccTitleCounts)].filter((id) => !earnedTitles.has(id));
    if (!newly.length) return;
    setEarnedTitles((prev) => { const n = new Set(prev); newly.forEach((id) => n.add(id)); return n; });
    setNewTitles((n) => n + newly.length); // (버그) 새 칭호 획득 → 도감 탭 빨간 배지
    const order = TITLE_TIERS.map((t) => t.rank);
    const top = newly.slice().sort((a, b) => order.indexOf(b.split(":")[1]) - order.indexOf(a.split(":")[1]))[0];
    setTitleEarnedPopup(top); // (v0.2.9 기능) 작은 토스트 대신 X/확인으로만 닫히는 축하 팝업
    if (uid) notifyCreate(uid, "title_earned", { titleId: top }); // (17차) 알림 기록에도 남긴다(팝업은 닫으면 사라지므로)
  }, [titleCounts, ccTitleCounts, loaded]);
  const equipTitle = useCallback((id) => { setCurrentTitle(id); }, []);
  // (20차 기능4) 스킨 구매·장착 — 보드 스킨과 기물 스킨은 독립적으로 사고팔고 섞어서 장착할 수 있다.
  const buySkin = useCallback((kind, id) => {
    const registry = kind === "board" ? BOARD_SKINS : PIECE_SKINS;
    const sk = registry[id]; if (!sk) return false;
    const key = kind + ":" + id;
    if (ownedSkins.has(key)) return true;
    if (ocCoins < sk.price) return false;
    setOcCoins((c) => c - sk.price);
    setOwnedSkins((prev) => new Set(prev).add(key));
    return true;
  }, [ocCoins, ownedSkins]);
  const equipSkin = useCallback((kind, id) => { (kind === "board" ? setBoardSkin : setPieceSkin)(id); }, []);
  const skinValue = useMemo(() => ({ boardSkin, pieceSkin }), [boardSkin, pieceSkin]);

  // (버그 수정) 초기 세션 복구(위 useEffect)와 달리 로그인 시 호출되는 이 콜백은 pr.ownedSkins·
  // pr.boardSkin·pr.pieceSkin을 복원하지 않았다 — 스킨을 구매(서버엔 정상 저장됨)한 뒤 로그아웃했다가
  // 다시 로그인하면 보유 스킨·장착 상태가 기본값으로 되돌아가 마치 구매 내역이 저장 안 된 것처럼 보였다.
  // (버그 수정) "값이 있을 때만 덮어쓰기"(if (pr.X) setX(...))로 해뒀던 것 — 이 계정에 아직 그 필드가
  // 없으면(신규 계정, 혹은 게스트로 퍼즐을 풀어보다 막 로그인한 경우 등) 조건을 그냥 건너뛰어, 직전
  // 계정(또는 로그인 전 게스트 상태)의 메모리 값이 그대로 남아 마치 새로 로그인한 계정의 데이터인
  // 것처럼 보였다("계정을 바꿔도 퍼즐 데이터가 남아있다" 버그의 원인). dismissedAnnounceVersion·
  // 스킨 필드에는 이미 적용돼 있던 "없으면 기본값" 패턴을 나머지 모든 계정 데이터 필드에도 동일하게
  // 적용해, 로그인할 때마다 항상 이 계정의 실제 값(없으면 로그아웃과 동일한 기본값)으로 확정한다.
  // (v0.6.3, 앱) 딥링크 — 시스템 브라우저 로그인 복귀(kr.openchess.app://auth/callback#access_token=…)와 앱 링크(https://openchess.kr/…)로 앱이 열릴 때.
  // 웹에서는 listenDeepLinks가 아무 일도 하지 않는다. 로그인 복귀는 기존 OAuth 해시 경로(authFromHash)와 같은 처리를 거친다.
  const deepLinkRef = useRef(null);
  useEffect(() => listenDeepLinks((url) => { if (deepLinkRef.current) deepLinkRef.current(url); }), []);
  // (v0.6.4) 앱에서 외부 링크(남의 사이트·mailto)가 웹뷰를 덮어쓰지 않고 시스템 브라우저·메일 앱으로 열리게 한다. 웹에서는 아무 일도 안 한다.
  useEffect(() => installNativeLinkGuard(), []);
  // (v0.6.4) 안드로이드 뒤로가기 버튼. 화면 스택(pushScreen·popstate)이 웹뷰 히스토리 위에 쌓여 있으므로 되감을 수 있으면 history.back()이 곧 "한 단계 닫기"다.
  // 더 되감을 곳이 없으면: 홈(분석) 탭이 아닐 때는 홈으로, 홈에서는 "한 번 더 누르면 종료" 안내 후 2초 안에 다시 누르면 종료한다.
  const backRef = useRef({ tab: "learn", armedAt: 0 });
  backRef.current.tab = tab;
  useEffect(() => listenBackButton(({ canGoBack }) => {
    const r = backRef.current;
    const a = decideBackAction({ canGoBack, tab: r.tab, homeTab: "learn", now: Date.now(), armedAt: r.armedAt });
    if (a === "back") { window.history.back(); return; }
    // 홈으로: 더 되감을 히스토리가 없으니 새 항목을 쌓지 않고(쌓으면 다음 뒤로가기가 방금 떠난 탭으로 되돌아가 맴돈다) 현재 항목의 주소만 홈 탭 경로로 바꾼다.
    if (a === "home") { r.armedAt = 0; if (r.goHome) r.goHome(); return; }
    if (a === "exit") { exitApp(); return; }
    r.armedAt = Date.now();
    setToast({ type: "exitHint" });
    setTimeout(() => setToast((x) => (x && x.type === "exitHint" ? null : x)), 2000);
  }), []);
  const onAuth = useCallback((acc) => { if (!acc) return; setUser(acc.username); setUid(acc.uid); const pr = acc.progress || {};
    setUnlocked(new Set(pr.unlocked || [])); setPuzzles(pr.puzzles || []); setSolved(new Set(pr.solved || [])); setLikedPuzzles(new Set(pr.likedPuzzles || [])); setRepostedPuzzles(new Set(pr.repostedPuzzles || [])); setLineSolves(pr.lineSolves || {}); prevTierIndexRef.current = null; setTotalXp(pr.xp != null ? pr.xp : 0); setPuzzleRating(pr.puzzleRating != null ? pr.puzzleRating : 800); setPuzzleMomentum(pr.puzzleMomentum != null ? pr.puzzleMomentum : 0.5); setOcCoins(pr.coins != null ? pr.coins : 0); setDevBonusGranted(!!pr.devBonusGranted); setReviewUnlocked(new Set(pr.reviewUnlocked || [])); setDeletedPuzzles(new Set(pr.deleted || [])); setArchivedPuzzles(pr.archivedPuzzles || {}); setEarnedTitles(new Set(pr.titles || [])); setCurrentTitle(pr.currentTitle || null); setOwnedSkins(new Set(pr.ownedSkins || [])); setBoardSkin(pr.boardSkin || "classic"); setPieceSkin(pr.pieceSkin || "classic"); setDailyQuest(pr.dailyQuest || null); setMainQuest(pr.mainQuest || { claimed: {} }); setRecentOpenings(Array.isArray(pr.recentOpenings) ? pr.recentOpenings : []);
    // (버그 수정) 다른 필드들과 달리 이 값은 "값이 있으면만 덮어쓰기"로 두면 안 된다 — 계정이
    // 한 번도 공지를 닫은 적이 없으면 pr.dismissedAnnounceVersion이 undefined인데, 그때 이
    // if를 건너뛰면 로그인 직전(게스트 상태)의 로컬 값이 그대로 남아 "이 계정도 이미 닫았다"고
    // 잘못 판단해 공지 모달이 안 뜬다 — 계정의 실제 값(없으면 null)으로 항상 동기화한다.
    setDismissedAnnounceVersion(pr.dismissedAnnounceVersion || null);
    setDailyPuzzleLastShownAt(pr.dailyPuzzleLastShownAt || 0); setDailyPuzzleHideDate(pr.dailyPuzzleHideDate || null); setDailyPuzzleStreak(pr.dailyPuzzleStreak || { count: 0, best: 0, lastDate: null });
    // (버그 수정) 이전엔 각 필드를 "없으면 직전 상태(p) 값 유지"로 병합했다 — 새 계정에 닉네임/사진이
    // 아직 없으면 직전 계정(또는 게스트) 것이 화면에 그대로 남아 보이는, 훨씬 눈에 띄는 형태의 같은
    // 버그였다. 병합 대신 이 계정의 실제 값(없으면 빈 값)으로 완전히 교체한다.
    const pub = acc.pub || {}; setProfile({ chesscom: pub.chesscom || "", nickname: pub.nickname || "", bio: pub.bio || "", displayId: pub.displayId || "", photo: pub.photo || "", firstMoves: pub.firstMoves || null, legacies: pub.legacies || null, legacyHistory: pub.legacyHistory || null }); setAuthOpen(false); }, []);
  // (UX7) 로그아웃 시 메모리에 남아있던 이전 계정 데이터를 완전히 비운다 — 그대로 두면 로그아웃 화면에서도
  // 잠깐 보이거나, 다음 로그인이 서버에서 못 채운 필드에 이전 계정 값이 남는 사고로 이어질 수 있음.
  const logout = useCallback(() => {
    authLogout();
    setUser(null); setUid(null); setDevOn(false); setConfirmLogout(false);
    setUnlocked(new Set()); setPuzzles([]); setSolved(new Set()); setLikedPuzzles(new Set()); setRepostedPuzzles(new Set()); setLineSolves({}); prevTierIndexRef.current = null; setTotalXp(0); setOcCoins(0); setReviewUnlocked(new Set()); setDeletedPuzzles(new Set()); setArchivedPuzzles({});
    setEarnedTitles(new Set()); setCurrentTitle(null); setOwnedSkins(new Set()); setBoardSkin("classic"); setPieceSkin("classic"); setProfile({ nickname: "", chesscom: "", displayId: "", photo: "", firstMoves: null, legacies: null }); setDevBonusGranted(false); setLineClearOn(true); setPuzzleClearOn(true); setCoachBubbleOn(false);
    setLearnSans([]); setLearnExtra({}); setTreeFocus([]); setDailyQuest(null); setMainQuest({ claimed: {} }); setRecentOpenings([]);
    // (버그 수정) 이 두 값은 여기서 안 비워지고 있었다 — dismissedAnnounceVersion을 그대로 두면
    // 로그아웃 후 게스트 로컬 저장소에 방금 로그아웃한 계정의 "다시 보지 않기" 값이 그대로 저장돼
    // 게스트가 실제로는 안 닫은 공지를 이미 닫은 것처럼 취급했고, friendUids/puzzleSolvers/
    // solverNames를 그대로 두면(그걸 채우는 effect가 uid===null일 때 그냥 아무것도 안 하고
    // 리턴만 해 초기화가 안 됨) 게스트 화면의 퍼즐 카드에 방금 로그아웃한 계정 친구들의 "N명이
    // 풀었습니다" 배지가 그대로 남아 보였다.
    setDismissedAnnounceVersion(null); setFriendUids([]); setPuzzleSolvers({}); setSolverNames({}); setShareReferral(null);
    setDailyPuzzleLastShownAt(0); setDailyPuzzleHideDate(null);
  }, []);
  deepLinkRef.current = async (url) => {
    const link = parseDeepLink(url);
    if (!link) return;
    if (link.kind === "route") { if (link.path && link.path !== window.location.pathname + window.location.search) window.location.assign(link.path); return; }
    closeExternalBrowser();
    const r = parseAuthFragment(link.hash || link.query);
    if (!r) return;
    if (r.kind === "error") { setAuthNotice(t("로그인 실패. 이미 다른 방식으로 가입된 이메일일 수 있음")); return; }
    if (r.kind === "recovery") { setRecovery(r.session); return; }
    try { const oa = await authFromHash(r.session); if (oa) { if (oa.username) onAuth(oa); else setNeedUser(oa); } } catch { }
  };
  // (v0.4.3 변경, 사용자 요청) "같은 기기(로컬 환경)에서는 로그인이 자동으로 풀리지 않게 해달라" —
  // 30분 유휴 자동 로그아웃(UX7)을 없앤다. 대신, 액세스 토큰(보통 발급 후 1시간 뒤 만료)이 오래
  // 열어 둔 탭에서 조용히 만료돼 API 호출이 하나둘 실패하기 시작하는(겉으로는 "이유 없이 뭔가 안
  // 되는" 것처럼 보이는, 사실상의 숨은 로그아웃) 일이 없도록, 만료 전에 refresh_token으로 미리
  // 갱신하는 타이머로 대체한다 — 유휴 여부와 무관하게 탭이 열려 있는 한 계속 로그인 상태를 유지한다.
  useEffect(() => {
    if (!user) return;
    const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50분마다(액세스 토큰 만료 전에 여유를 두고 갱신)
    const id = setInterval(() => { refreshAccessToken().catch(() => { }); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user]);
  const unlockOpening = useCallback((keyStr) => { let isNew = false; setUnlocked((p) => { if (p.has(keyStr)) return p; isNew = true; const n = new Set(p); const parts = keyStr.split(" ").filter(Boolean); for (let i = 1; i <= parts.length; i++) n.add(parts.slice(0, i).join(" ")); return n; }); if (isNew) setNewUnlocks((n) => n + 1); return isNew; }, []);
  // (v0.5.6, 사용자 요청) 도감 잠금 해제 토스트(onLearned)는 없앴다 — 같은 자리에 chess.com 대국 요약 알림(ChesscomGameToast)이 뜬다.
  const onSavePuzzle = useCallback((pzIn) => {
    if (deletedPuzzles.has(pzIn.id) && !solved.has(pzIn.id)) return;
    // (v0.4.1 기능, item 5) 모든 퍼즐이 시작 포지션을 FEN으로도 갖도록 — 대국 기반(setupSans 있음)
    // 퍼즐은 PGN(setupSans)에서 자동으로 FEN을 계산해 채워 넣는다(PGN→FEN 자동). FEN 기반으로
    // 직접 생성된 퍼즐(setupSans 없음)은 생성 시점에 이미 pz.fen이 채워져 있으므로 그대로 둔다.
    const pz = (pzIn.fen || !pzIn.setupSans || !pzIn.setupSans.length) ? pzIn : { ...pzIn, fen: sansToFen(pzIn.setupSans) };
    if (!isPuzzleSequenceValid(pz)) { console.warn("퍼즐 저장 거부 (불법 수순):", pz.id); return; }
    setPuzzles((prev) => {
      const i = prev.findIndex((x) => x.id === pz.id);
      if (i >= 0) {
        // (20차 기능1) 구버전(선형 라인) 퍼즐이 분기 트리 형식으로 재생성되면 교체(업그레이드)
        // (v0.1.0) 이미 있는 퍼즐에 테마 태그만 새로 얹은 경우(예: 실수 응징 퍼즐과 같은 포지션이던
        // 기물 희생하기 퍼즐이 뒤늦게 병합됨)도 같은 방식으로 교체해 반영한다.
        const themesChanged = themesOf(pz).join(",") !== themesOf(prev[i]).join(",");
        if ((pz.tree && !prev[i].tree) || themesChanged) { puzzleShare(pz); const next = prev.slice(); next[i] = pz; return next; }
        return prev;
      }
      puzzleShare(pz);
      // (버그 수정, 사용자 제보) creatorUsernames(번호별 생성자 아이디, 퍼즐 탭 "내가 만든 퍼즐" 필터가
      // 쓰는 맵)는 앱이 처음 뜰 때 딱 한 번만 서버에서 불러와 두고 이 세션 안에서는 다시 불러오지
      // 않는다 — 그래서 방금 막 만든 퍼즐은 puzzle_claim_creator가 서버에 생성자를 기록해도, 이
      // 세션의 로컬 맵에는 반영이 안 돼 "내가 만든 퍼즐" 필터가 못 찾았다. puzzleShare가 이 세션에서
      // 처음 이 퍼즐을 서버로 올리는 것이므로(=대개 이 사용자가 곧 그 생성자), 서버 응답을 기다리지
      // 않고 낙관적으로 바로 반영한다.
      if (user) setCreatorUsernames((m) => (m[puzzleNo(pz.id)] ? m : { ...m, [puzzleNo(pz.id)]: user }));
      return [...prev, pz];
    });
  }, [deletedPuzzles, solved, user]);
  // (버그 수정) 퍼즐 생성 요청의 단일 창구 — id별로 딱 한 번만 시작하고(다른 컴포넌트가 같은 퍼즐을
  // 다시 요청해도 무시), 요청한 컴포넌트가 이후 언마운트되어도(탭 전환) 이 App은 항상 떠 있으므로
  // run()이 끝까지 실행되어 결과가 저장된다. run은 (onProgress) => Promise<퍼즐객체|null>.
  // (v0.1.4 기능) 진행률(p)뿐 아니라 지금까지 탐색된 수순(path)도 함께 저장해, 집중 분석 화면이
  // 퍼즐이 만들어지는 과정을 미니 보드로 실시간 시각화할 수 있게 한다.
  const requestPuzzleGen = useCallback((id, run) => {
    if (puzzleGenInFlightRef.current.has(id)) return;
    puzzleGenInFlightRef.current.add(id);
    setPuzzleGenProgress((prev) => ({ ...prev, [id]: { p: 0, path: null } }));
    const finish = () => {
      puzzleGenInFlightRef.current.delete(id);
      setPuzzleGenProgress((prev) => { if (!(id in prev)) return prev; const n = { ...prev }; delete n[id]; return n; });
    };
    // (v0.3.1 성능) 이 id(포지션+수)로 만들어지는 퍼즐 트리는 완전히 결정적이라, 이미 다른 유저가(또는
    // 내가 예전 세션에) 같은 위치의 퍼즐을 먼저 만들어 서버(puzzles 테이블, onSavePuzzle→puzzleShare가
    // 이미 모든 생성 퍼즐을 그리로 올려 두고 있었다)에 공유해 뒀다면, 로컬 엔진으로 처음부터 다시
    // genPuzzleTree를 돌릴 필요가 없다 — run()을 부르기 전에 먼저 서버에 이미 있는지 확인하고, 있으면
    // 그 결과를 그대로 쓴다(일일 퍼즐 캐러셀에 적용한 것과 같은 크라우드소싱 캐시 재사용).
    puzzleFetch(puzzleNo(id)).catch(() => null).then((cached) => {
      if (cached && cached.tree) { onSavePuzzle(cached); finish(); return; }
      run((p, path) => setPuzzleGenProgress((prev) => (id in prev ? { ...prev, [id]: { p, path: path || prev[id].path } } : prev)))
        .then((pz) => { if (pz) onSavePuzzle(pz); })
        .catch((e) => console.warn("퍼즐 생성 실패:", id, e))
        .finally(finish);
    });
  }, [onSavePuzzle]);
  // (버그 수정) 서버(puzzles 테이블)에서 실제로 지워지는 걸 먼저 확인한 뒤에야 로컬 상태를 지운다 —
  // 실패(권한 없음·네트워크 오류 등)하면 로컬에도 아무 변화가 없어야 "삭제됐다가 새로고침하면
  // 되살아나는" 것처럼 보이지 않는다. 호출부(PuzzleSolver)가 성공 여부를 보고 안내할 수 있도록
  // boolean을 그대로 돌려준다.
  const onDeletePuzzle = useCallback(async (id) => {
    const ok = await puzzleDeleteRemote(puzzleNo(id));
    if (!ok) return false;
    setPuzzles((prev) => {
      const removed = prev.find((x) => x.id === id);
      if (removed) setArchivedPuzzles((a) => (a[id] ? a : { ...a, [id]: removed }));
      return prev.filter((x) => x.id !== id);
    });
    setDeletedPuzzles((p) => { const n = new Set(p); n.add(id); return n; });
    return true;
  }, []);
  // (v0.5.1 버그 수정, 사용자 제보) "퍼즐 이름을 바꿔도 '내가 만든 퍼즐' 목록에는 예전 이름 그대로
  // 보인다" — 그 목록(PuzzleTab이 받는 puzzles prop)은 이 앱 상태(puzzles, 계정 진행도로도 그대로
  // 저장됨)를 그대로 보여줄 뿐인데, PuzzleSolver의 이름 변경(saveEditName)은 puzzle_set_name RPC로
  // 서버만 갱신하고 이 로컬 상태는 전혀 건드리지 않았다 — PuzzleSolver 안에서만 쓰는 nameOverride
  // state로 그 화면 자신은 바로 갱신됐지만, 그 값이 바깥의 puzzles 배열까지 전파되지 않아 목록
  // 화면(같은 세션이든, 다음 로그인이든 — puzzles가 계정 진행도에 그대로 저장되므로)은 이름이 바뀐
  // 사실 자체를 몰랐다. 이름이 바뀐 그 퍼즐 하나만 배열 안에서 찾아 patch한다(puzzleShare를 다시
  // 거치지 않는다 — 이미 서버에는 puzzle_set_name으로 반영됐고, puzzleShare를 다시 부르면 그 자체가
  // 방금 고친 "옛 스냅샷이 새 이름을 덮어쓰는" 버그의 또 다른 경로가 될 수 있다).
  // (버그 수정, 사용자 제보) "FEN 퍼즐 이름 변경이 창을 닫으면 원래대로 돌아온다" — 위 patch가
  // puzzles 배열만 갱신하고, 지금 열려 있는 퍼즐 화면이 실제로 들고 있는 puzzleActive(별도 top-level
  // state, PuzzleSolver의 puzzle prop 그 자체)는 전혀 건드리지 않았다. PuzzleSolver 자신의
  // nameOverride가 화면에 떠 있는 동안만 새 이름을 가려 보여주다가, 카드를 닫아 그 state가
  // 사라지면 다시 puzzleActive.name(패치되지 않은 옛 이름)으로 되돌아갔다 — puzzles 배열이든
  // archivedPuzzles든 puzzleActive든, 이 id를 들고 있는 모든 로컬 사본을 함께 patch한다.
  const onPuzzleRenamed = useCallback((id, name) => {
    setPuzzles((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    setArchivedPuzzles((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], name } } : prev));
    setPuzzleActive((prev) => (prev && prev.id === id ? { ...prev, name } : prev));
  }, []);
  const onSolved = useCallback((id) => {
    const already = solved.has(id);
    if (!already) setSolved((p) => { const n = new Set(p); n.add(id); return n; });
    if (user && !already) {
      const no = puzzleNo(id);
      puzzleSolveInc(no).then((c) => { if (c != null) setSolveCounts((m) => ({ ...m, [no]: c })); });
      if (uid) puzzleSolverAdd(no, uid).then(() => setPuzzleSolvers((m) => (m[no] && m[no].includes(uid) ? m : { ...m, [no]: [...(m[no] || []), uid] })));
    }
    if (!already) {
      // (17차) 일일 퀘스트 — 오늘 새로 푼 퍼즐 수 누적(목표까지만), 그 오프닝을 "최근 오프닝" 풀에 추가.
      const t = todayStr();
      setDailyQuest((dq) => (dq && dq.date === t && dq.puzzleCount < dq.puzzleTarget) ? { ...dq, puzzleCount: dq.puzzleCount + 1 } : dq);
      const pz = puzzles.find((p) => p.id === id);
      if (pz && pz.opening) setRecentOpenings((prev) => [pz.opening, ...prev.filter((x) => x !== pz.opening)].slice(0, 10));
    }
  }, [user, solved, uid, puzzles]);
  // (기능) 퍼즐 좋아요 — solves(풀이수)와 달리 취소도 가능해야 하므로, 누를 때마다 로컬 상태를
  // 먼저 뒤집어(하트가 바로 채워지거나 비워지도록) 서버 응답을 기다리지 않고 반응하게 하고,
  // 서버가 돌려준 실제 상태(liked/likes)로 뒤늦게 맞춘다 — 실패하면(오프라인 등) 원래대로 되돌린다.
  // (버그 수정) 요청이 오가는 동안 같은 퍼즐을 다시 누르면(연타·더블탭) wasLiked가 아직 리렌더에
  // 반영되지 않은 stale 값이라 두 번째 클릭도 같은 방향으로 낙관적 업데이트를 하고 서버에도 토글이
  // 두 번 나가, 계정 하나로 좋아요 수를 여러 번 늘리거나 반대로 즉시 취소된 것처럼 보이는 경쟁 상태가
  // 있었다 — 같은 퍼즐에 요청이 진행 중인 동안은 추가 클릭을 무시해 애초에 겹친 요청이 나가지 않게 한다.
  const onToggleLike = useCallback((id) => {
    if (!user || !uid) { openAuth("login"); return; }
    if (likeInFlightRef.current.has(id)) return;
    likeInFlightRef.current.add(id);
    const no = puzzleNo(id);
    const wasLiked = likedPuzzles.has(id);
    setLikedPuzzles((p) => { const n = new Set(p); if (wasLiked) n.delete(id); else n.add(id); return n; });
    setLikeCounts((m) => ({ ...m, [no]: Math.max(0, (m[no] || 0) + (wasLiked ? -1 : 1)) }));
    puzzleLikeToggle(no, uid).then((r) => {
      if (!r) {
        setLikedPuzzles((p) => { const n = new Set(p); if (wasLiked) n.add(id); else n.delete(id); return n; });
        setLikeCounts((m) => ({ ...m, [no]: Math.max(0, (m[no] || 0) + (wasLiked ? 1 : -1)) }));
        return;
      }
      setLikeCounts((m) => ({ ...m, [no]: r.likes }));
      setLikedPuzzles((p) => { if (p.has(id) === r.liked) return p; const n = new Set(p); if (r.liked) n.add(id); else n.delete(id); return n; });
    }).finally(() => { likeInFlightRef.current.delete(id); });
  }, [user, uid, likedPuzzles]);
  // (v0.1.0) 퍼즐 리포스트 — onToggleLike와 완전히 동일한 낙관적 업데이트/경쟁 상태 방지 패턴을 그대로 따른다.
  const onToggleRepost = useCallback((id) => {
    if (!user || !uid) { openAuth("login"); return; }
    if (repostInFlightRef.current.has(id)) return;
    repostInFlightRef.current.add(id);
    const no = puzzleNo(id);
    const wasReposted = repostedPuzzles.has(id);
    setRepostedPuzzles((p) => { const n = new Set(p); if (wasReposted) n.delete(id); else n.add(id); return n; });
    setRepostCounts((m) => ({ ...m, [no]: Math.max(0, (m[no] || 0) + (wasReposted ? -1 : 1)) }));
    puzzleRepostToggle(no, uid).then((r) => {
      if (!r) {
        setRepostedPuzzles((p) => { const n = new Set(p); if (wasReposted) n.add(id); else n.delete(id); return n; });
        setRepostCounts((m) => ({ ...m, [no]: Math.max(0, (m[no] || 0) + (wasReposted ? 1 : -1)) }));
        return;
      }
      setRepostCounts((m) => ({ ...m, [no]: r.reposts }));
      setRepostedPuzzles((p) => { if (p.has(id) === r.reposted) return p; const n = new Set(p); if (r.reposted) n.add(id); else n.delete(id); return n; });
    }).finally(() => { repostInFlightRef.current.delete(id); });
  }, [user, uid, repostedPuzzles]);
  // (v0.1.0) 공유 시트(종이비행기 아이콘) — 로그인하지 않았으면 로그인 창을 띄운다.
  const onShare = useCallback((p) => { if (!user || !uid) { openAuth("login"); return; } setShareSheetPuzzle(p); }, [user, uid]);
  // (16차) 추천 랭킹용 — 어떤 라인이든 완료할 때마다(중복 풀이 포함) 기록. XP/해결 트래킹과는 무관.
  const onPuzzleSolveEvent = useCallback((id) => { puzzleSolveEventAdd(puzzleNo(id), uid); }, [uid]);
  // (기능1) 라인(최선/차선/채택률) 하나를 풀 때마다 기록 — 전체 라인이 다 모이면(별 3개) onSolved로 승격해
  // 기존 "해결완료" 트래킹(칭호·전역 풀이수 등)이 그대로 이어지도록 한다.
  // (15차 기능4) 새로 해결한 라인마다 경험치를 지급 — 해당 퍼즐에서 "기존에 이미 보유했던 별 수"를 기준으로 계산한다.
  // 획득량은 화면 중앙 토스트로 크게 표시한다(티어 승급 토스트와 같은 자리를 공유 — 승급이 뒤이어 발생하면 그쪽으로 자연스럽게 대체됨).
  const onLineSolved = useCallback((id, tag, totalLines) => {
    setLineSolves((prev) => {
      const curArr = prev[id] || [];
      if (curArr.includes(tag)) return prev;
      // (20차 기능1) 경험치 배율은 이 퍼즐에서 "기존에 보유한 별 수"(0~3, 해결 라인 수/전체 라인 수 기준) 기준
      const existingStars = starsOf(curArr.length, Math.max(totalLines || 1, curArr.length + 1));
      const gain = rollLineXp(existingStars);
      setTotalXp((x) => x + gain);
      setToast({ type: "xp", amount: gain });
      setTimeout(() => setToast((t) => (t && t.type === "xp" ? null : t)), 1400);
      // (v0.1.0) 채팅으로 공유받은 퍼즐을 "풀러 가기"로 열어 지금 이 퍼즐(no 일치)을 푸는 중이면,
      // 방금 얻은 XP의 10%를 공유해 준 친구에게 돌려준다(친구 본인 클라이언트가 나중에 realtime으로
      // 받아 스스로 적용 — 여기선 서버에 기록만 남긴다).
      const ref = shareReferralRef.current;
      if (ref && uid && ref.no === puzzleNo(id) && ref.fromUid !== uid) {
        puzzleShareReward(ref.msgId, Math.max(1, Math.round(gain * 0.1)));
      }
      return { ...prev, [id]: [...curArr, tag] };
    });
  }, [uid]);
  // (v0.4.1 기능, item 3) 공개 퍼즐 레이팅 갱신 — 추천 랭킹용 이벤트(puzzleLineSolveTimeAdd 등)와
  // 같은 원칙으로, 이미 푼 라인을 다시 풀거나 다시 틀려도 매번(중복 풀이 포함) 그대로 반영한다.
  // XP처럼 "처음 한 번만" 보상하는 게 아니라 실력을 계속 추적하는 지표이기 때문이다.
  const onPuzzleRatingEvent = useCallback((result, oppRating) => {
    if (!oppRating) return;
    setPuzzleRating((r) => puzzleEloUpdate(r, oppRating, result === "win"));
    // (신규 기능) 지수이동평균(α=0.15) — 최근 결과일수록 더 크게 반영되고, 오래된 결과는 서서히
    // 잊혀진다. puzzleRating(K=24 Elo)보다 훨씬 빠르게 반응해 "요즘 컨디션"을 곧바로 드러낸다.
    setPuzzleMomentum((m) => m * 0.85 + (result === "win" ? 1 : 0) * 0.15);
  }, []);
  const tierInfo = useMemo(() => tierFromXp(totalXp), [totalXp]);
  const prevTierIndexRef = useRef(null);
  // (v0.1.1) 작은 토스트 대신 전체 화면 승급 연출(TierUpOverlay)을 띄운다 — 직전 티어의 마지막
  // 구간(1, 가장 높은 구간)에서 새 티어로 넘어온 것으로 보고 시작 이미지를 정한다.
  const [tierUpAnim, setTierUpAnim] = useState(null); // { fromKey, fromDiv, toKey, toDiv, reward } | null
  useEffect(() => {
    if (!loaded) return; // 최초 데이터 복원 시점의 티어 변화는 "승급"으로 취급하지 않는다
    if (prevTierIndexRef.current != null && tierInfo.tierIndex > prevTierIndexRef.current) {
      // (v0.2.3 기능) 티어 승급 보상 — 새로 도달한 티어가 높을수록(tierIndex가 클수록) 더 많은 나이트
      // OC 코인을 지급한다(브론즈 50 ~ 그랜드마스터 300, 50 단위).
      // (v0.2.9 버그 수정) 예전엔 이 보상을 별도 "coins" 토스트(zIndex 65)로 띄웠는데, 같은 순간 뜨는
      // TierUpOverlay(zIndex 200)에 화면 전체가 가려져 사실상 보이지 않았다 — 토스트 대신 승급 연출
      // 카드 안에 직접 보여주도록 tierUpAnim에 실어 보낸다.
      const tierUpReward = tierInfo.tierIndex * 50;
      setTierUpAnim({
        fromKey: TIERS[prevTierIndexRef.current].key, fromDiv: 1,
        toKey: tierInfo.tier.key, toDiv: tierInfo.division,
        reward: tierUpReward,
      });
      if (uid) notifyCreate(uid, "tier_up", { tierLabel: tierInfo.tier.label });
      setOcCoins((c) => c + tierUpReward);
    }
    prevTierIndexRef.current = tierInfo.tierIndex;
  }, [tierInfo.tierIndex, loaded]);
  // (17차) 일일 퀘스트 — 날짜가 바뀌면(또는 최초 로드 시 퀘스트가 없으면) 오늘의 퀘스트를 새로 생성한다.
  useEffect(() => {
    if (!loaded) return;
    const t = todayStr();
    // (18차 보충 UX2) 날짜가 바뀌었거나, 구버전(quests 필드 없는 featured 구조)이면 새 구조로 재생성한다.
    // (v0.1.2 버그 수정) quests 배열은 있지만 그 안의 opening 항목 값이 비어 있는 등 손상된 경우도
    // 함께 걸러 재생성한다(dailyQuestQuestsValid 참고).
    if (!dailyQuest || dailyQuest.date !== t || !dailyQuest.quests || !dailyQuestQuestsValid(dailyQuest.quests)) setDailyQuest(genDailyQuest(recentOpenings, t));
  }, [loaded, dailyQuest, recentOpenings]);
  // (v0.1.2) 일일 퀘스트 개별 클리어 보상을 XP에서 OC 나이트 코인으로 바꿈 — 완료 표시는 한 곳에서
  // 처리(퍼즐/체스닷컴 퀘스트 공용), 이미 지급됐으면 다시 주지 않는다.
  // (v0.2.9 기능) 사용자 요청 — 일일 퀘스트 5개 중 하나를 클리어할 때도(전체 클리어 팝업과는 별개로)
  // 어떤 퀘스트를 깼는지 알아볼 수 있는 팝업을 띄워 달라는 것. 예전엔 어떤 퀘스트인지 알 수 없는
  // 공용 "coins" 토스트(화면 중앙 별 팝업)만 떴다 — questSlotLabel로 그 슬롯의 라벨을 함께 실어
  // 전용 "questClear" 토스트(상단 배너, 라벨+보상 표시)를 띄운다. 다섯 번 다 뜰 수 있으므로 전체 클리어
  // 팝업(DailyQuestClearedModal)과 달리 확인 없이 2.6초 후 자동으로 사라진다.
  const claimQuestCoins = useCallback((questKey, amount) => {
    setDailyQuest((dq) => {
      if (!dq || dq.claimed[questKey]) return dq;
      setOcCoins((c) => c + amount);
      const label = questSlotLabel(questKey, dq);
      setToast({ type: "questClear", amount, label });
      setTimeout(() => setToast((t) => (t && t.type === "questClear" ? null : t)), 2600);
      return { ...dq, claimed: { ...dq.claimed, [questKey]: true } };
    });
  }, []);
  // (20차 기능4) 메인 퀘스트 챕터 — 문항을 맞힐 때마다 기록하고, 챕터를 모두 맞히면 코인 보상을 1회 지급한다.
  const onAnswerChapter = useCallback((chKey, itemIdx) => {
    setMainQuest((mq) => {
      const answered = (mq && mq.answered) || {};
      const chAns = answered[chKey] || {};
      if (chAns[itemIdx]) return mq;
      return { ...mq, answered: { ...answered, [chKey]: { ...chAns, [itemIdx]: true } } };
    });
  }, []);
  const claimMainChapter = useCallback((chKey) => {
    setMainQuest((mq) => {
      const claimed = (mq && mq.claimed) || {};
      if (claimed[chKey]) return mq;
      const ch = CONTENT.lessons[chKey];
      const amount = (ch && ch.reward) || 100;
      setOcCoins((c) => c + amount);
      setToast({ type: "coins", amount });
      setTimeout(() => setToast((t) => (t && t.type === "coins" ? null : t)), 1800);
      return { ...mq, claimed: { ...claimed, [chKey]: true } };
    });
  }, []);
  // 퍼즐 퀘스트 목표 달성 시 지급
  useEffect(() => {
    if (!dailyQuest || dailyQuest.puzzleCount < dailyQuest.puzzleTarget) return;
    claimQuestCoins("puzzle", 10);
  }, [dailyQuest && dailyQuest.puzzleCount, dailyQuest && dailyQuest.puzzleTarget, claimQuestCoins]);
  // (기능2→18차 보충 UX2) chess.com 활동 퀘스트 판정 — 오늘(KST) 대국에서 오프닝 플레이/총 플레이 수/승리 수를 계산해 슬롯별 완료 처리.
  useEffect(() => {
    if (!dailyQuest || !dailyQuest.quests || !chesscom || chesscom.status !== "ready") return;
    const t = todayStr();
    const todays = chesscom.games.filter((g) => isSameLocalDay(g.endTime, t));
    const playCount = todays.length;
    const winCount = todays.filter((g) => g.result === "win").length;
    setDailyQuest((dq) => {
      if (!dq || dq.date !== t || !dq.quests) return dq;
      let changed = false; const done = { ...(dq.done || {}) };
      dq.quests.forEach((q, i) => {
        if (done[i]) return;
        let ok = false;
        if (q.type === "opening") ok = questOpeningCleared(q, todays);
        else if (q.type === "play5") ok = playCount >= 5;
        else if (q.type === "win3") ok = winCount >= 3;
        if (ok) { done[i] = true; changed = true; }
      });
      return changed ? { ...dq, done } : dq;
    });
  }, [dailyQuest && dailyQuest.date, chesscom && chesscom.status, chesscom && chesscom.games]);
  // 활동 퀘스트 XP 지급(각 +10)
  useEffect(() => {
    if (!dailyQuest || !dailyQuest.done) return;
    (dailyQuest.quests || []).forEach((q, i) => { if (dailyQuest.done[i]) claimQuestCoins("cc_" + i, 10); });
  }, [dailyQuest && JSON.stringify(dailyQuest.done), claimQuestCoins]);
  // 4개 퀘스트 모두 완료 시 보너스 +20(한 번만)
  // (v0.2.9 변경) 작은 코인 토스트(1.8초, 다른 보상 토스트와 구분이 안 돼 놓치기 쉬웠다) 대신, 아래
  // DailyQuestClearedModal이 전체 클리어를 명시적으로 알려주므로 이 자리의 토스트는 없앤다.
  useEffect(() => {
    if (!dailyQuest || dailyQuest.bonusClaimed) return;
    const allDone = dailyQuest.claimed.puzzle && dailyQuest.claimed.dailypuzzle && [0, 1, 2].every((i) => dailyQuest.claimed["cc_" + i]);
    if (!allDone) return;
    setTotalXp((x) => x + 20);
    setOcCoins((c) => c + 50); // (19차 기능5) 일일 퀘스트 전체 완료 보상: OC 나이트 코인 50개
    setDailyQuest((dq) => (dq && !dq.bonusClaimed ? { ...dq, bonusClaimed: true } : dq));
  }, [dailyQuest && JSON.stringify(dailyQuest.claimed), dailyQuest && dailyQuest.bonusClaimed]);
  // (v0.2.9 기능) 전체 클리어를 실제로 "봤는지"는 bonusClaimed(보상 지급 여부)와 별개로 추적한다 —
  // 이번 접속에서 방금 클리어했든, 접속하지 않는 사이(예: chess.com 연동 활동만으로) 이미 클리어돼
  // 있었든 상관없이 아직 이 팝업을 못 봤으면(clearAnnounced가 아직 false) 지금 접속에서 반드시 한
  // 번은 명시적으로 띄운다.
  useEffect(() => {
    if (!loaded || !dailyQuest || !dailyQuest.bonusClaimed || dailyQuest.clearAnnounced) return;
    setQuestClearOpen(true);
    setDailyQuest((dq) => (dq && dq.bonusClaimed && !dq.clearAnnounced ? { ...dq, clearAnnounced: true } : dq));
  }, [loaded, dailyQuest && dailyQuest.bonusClaimed, dailyQuest && dailyQuest.clearAnnounced]);
  useEffect(() => {
    // (20차 기능1) 트리 기준 전체 라인을 모두 해결하면(별 3개) '해결완료'로 승격. 현재 트리에 실제로
    // 존재하는 라인 태그만 집계해, 라인이 재생성돼 태그가 바뀐 과거 기록으로 잘못 승격되지 않도록 한다.
    // (버그 수정, 사용자 제보) "FEN 퍼즐 라인을 다 풀어도 카드가 초록색이 안 된다" — PuzzleSolver
    // 자신의 완료 판정(totalLines)은 Math.max(1, allLines.length)라 라인이 실제로 0개로 집계되는
    // 트리(예: treeLinesOf가 요구하는 홀수 길이 조건에 걸리는 특이한 트리 형태)에서도 "1개 중 1개
    // 완료"로 축하 화면을 띄웠는데, 여기 total은 그 보정 없이 0 그대로라 total > 0 가드에 막혀
    // onSolved가 영원히 호출되지 않았다 — 두 판정이 완전히 같은 기준을 쓰도록 여기도 같은 보정을 쓴다.
    puzzles.forEach((p) => {
      const total = Math.max(1, treeLinesOf(puzzleTreeOf(p)).length);
      if (solvedLineTagsOf(p, lineSolves[p.id]).size >= total && !solved.has(p.id)) onSolved(p.id);
    });
  }, [lineSolves, puzzles, solved, onSolved, contentVer]);
  // (v0.4.0 기능) 사용자 요청 — 뒤로가기 전반 정비. 자체 URL 경로가 없는 오버레이(검색·친구·채팅·
  // 프로필창·티어맵·집중 분석 등)는 현재 경로를 바꾸지 않고 history.state.screens 배열에 자기 이름을
  // 얹는 방식으로 "화면 하나 = 히스토리 항목 하나"를 흉내낸다. 여는 곳에서 pushScreen(같은 이름이
  // 이미 있으면 아무 것도 안 함 — 같은 오버레이가 중첩 push되는 것을 막음), 닫는 곳에서 popScreen을
  // 불러 UI로 직접 닫든 뒤로가기로 닫든 히스토리와 상태가 항상 맞물리게 한다(popScreen은 지금 히스토리
  // 항목이 실제로 그 이름을 갖고 있을 때만 history.back()을 호출하므로, 이미 뒤로가기로 빠진 뒤에
  // 다시 호출돼도 한 번 더 뒤로 가버리는 일이 없다).
  const pushScreen = useCallback((name) => {
    try {
      if (typeof window === "undefined") return;
      const cur = (window.history.state && window.history.state.screens) || [];
      if (cur.includes(name)) return;
      window.history.pushState({ ...(window.history.state || {}), screens: [...cur, name] }, "", window.location.pathname);
    } catch { }
  }, []);
  const popScreen = useCallback((name) => {
    try {
      if (typeof window === "undefined") return;
      const cur = (window.history.state && window.history.state.screens) || [];
      if (cur.includes(name)) window.history.back();
    } catch { }
  }, []);
  const switchTab = (k) => {
    if (k === "dex") { setNewUnlocks(0); setNewTitles(0); }
    setNavNonce((n) => n + 1);
    setTab(k);
    urlTabRef.current = k;
    try { const p = TAB_PATH[k]; if (p && window.location.pathname !== p) window.history.pushState({ screens: (window.history.state && window.history.state.screens) || [] }, "", p); } catch { }
    // 사용자가 직접 다른 탭을 골랐으니, 집중 분석을 닫을 때 도감으로 자동으로 되돌아가는 예약은 취소한다.
    setFocusReturnTab(null);
  };
  // (v0.5.0 개편, 사용자 요청) 분석 탭 PLAY 버튼 — 예전엔 openPlay를 곧장 호출해 "분석 탭 위에 겹쳐
  // 뜨는 별도 화면"처럼 동작했다(뒤로가기·닫기를 누르면 분석 탭으로 돌아옴). 이제 플레이 탭과 완전히
  // 같은 경로(switchTab("store"))로 실제 탭 전환을 일으켜, 다른 탭에서 플레이 탭을 누르는 것과
  // 똑같이 "그냥 /play 페이지로 이동"하는 느낌을 준다 — 전환 뒤에는 아래 useLayoutEffect(tab==="store"
  // 감지)가 openPlay를 이어서 호출해 대국 설정 화면을 띄운다.
  const goToPlayTab = () => switchTab("store");
  backRef.current.goHome = () => {
    setNavNonce((n) => n + 1); setTab("learn"); urlTabRef.current = "learn"; setFocusReturnTab(null);
    try { window.history.replaceState({ screens: [] }, "", TAB_PATH.learn); } catch { }
  };
  // (사용자 요청) 집중 분석이 도감 탭·퍼즐 탭(일일 퍼즐 팝업 포함)에서 시작됐다면(focusReturnTab에
  // 그 탭 이름이 담김), 학습이 닫히는(learnFocus가 null로 바뀌는) 순간 그 탭으로 되돌아간다 —
  // switchTab을 쓰면 navNonce가 올라 CollectionTab/PuzzleTab이 강제로 새로 마운트돼(아래 render의
  // "숨겨 두기"가 무의미해짐) 애써 보존한 팬/줌/카드나 풀이 중이던 퍼즐 상태가 사라지므로, navNonce는
  // 건드리지 않고 tab만 직접 되돌린다.
  const prevLearnFocusRef = useRef(learnFocus);
  // (v0.4.0 기능) 사용자 요청 — 집중 분석도 뒤로가기 한 번으로 닫히게 한다. 여는 쪽(위 onOpenOpening/
  // onOpenLearnFocus, 그리고 LearnTab 안 "분석" 버튼이 부르는 setFocus 전부 포함 — 이 effect가 최상위
  // learnFocus 값의 null↔값 전환만 지켜보므로 진입 경로를 하나하나 따로 손댈 필요가 없다)는
  // pushScreen("focus")로 히스토리 항목을 하나 쌓고, 닫히면(뒤로가기든 UI든) popScreen으로 짝을 맞춘다.
  // 특정 탭에서 열었던 경우(focusReturnTab에 그 탭 이름이 담김 — "dex"·"puzzle"뿐 아니라 일일 퍼즐
  // 팝업처럼 "떠 있던 탭 이름을 그대로 기억"하는 경우도 포함)는 그 탭으로 직접 되돌리는 별도 pushState
  // 경로를 쓰고, 그 외(focusReturnTab이 null)에는 popScreen(브라우저 히스토리로 그냥 되돌아가기)을 쓴다.
  useEffect(() => {
    if (!prevLearnFocusRef.current && learnFocus) pushScreen("focus");
    if (prevLearnFocusRef.current && !learnFocus) {
      if (focusReturnTab) {
        setTab(focusReturnTab);
        urlTabRef.current = focusReturnTab;
        try { const p = TAB_PATH[focusReturnTab]; if (p && window.location.pathname !== p) window.history.pushState({ screens: (window.history.state && window.history.state.screens) || [] }, "", p); } catch { }
        // (사용자 요청) 퍼즐 풀이 카드/일일 퍼즐 팝업에서 들어왔다면, onOpenLearnFocus가 닫기 전에
        // savedPuzzleRef/reopenDailyNoticeRef에 남겨 둔 것을 여기서 되살린다 — 탭만 되돌리는 것만으로는
        // 그 화면(닫혔던 퍼즐 풀이 창·팝업)이 다시 뜨지 않으므로 명시적으로 다시 연다.
        if (savedPuzzleRef.current) { setPuzzleActive(savedPuzzleRef.current); savedPuzzleRef.current = null; }
        if (reopenDailyNoticeRef.current) { setPuzzleNoticeOpen(true); reopenDailyNoticeRef.current = false; }
        setFocusReturnTab(null);
      } else {
        popScreen("focus");
      }
    }
    prevLearnFocusRef.current = learnFocus;
  }, [learnFocus, focusReturnTab, pushScreen, popScreen]);
  // (v0.3.4 기능) 사용자 요청 — /review(/(식별자))와 /(퍼즐 번호)-(라인 번호)는 이제 그 URL만으로
  // 실제로 복원 가능하다(아래 딥링크 resolver effect, openReview/onOpenPuzzle이 모두 정의된 뒤에
  // 둔다 — 그 함수들을 그대로 재사용한다). 예전엔 여기서 무조건 /learn으로 되돌렸다.
  // (16차) 브라우저 뒤로/앞으로 가기로 주소가 바뀌면 그에 맞는 탭으로 전환한다.
  useEffect(() => {
    // (v0.2.0 기능) /review에서 브라우저 뒤로가기를 누르면(헤더의 뒤로 버튼이 아니라 실제 브라우저
    // 뒤로가기) reviewGame을 함께 정리해, 이전 화면으로 돌아갔는데 리뷰 오버레이만 계속 남아있는
    // 일이 없게 한다. (v0.3.4) 퍼즐 고유 URL(/(번호)-(라인))에서도 같은 이유로 puzzleActive를 정리한다.
    // (v0.4.0) screens 배열에 없어진 오버레이(검색/친구/채팅/프로필창/티어맵/집중 분석)도 함께 닫는다.
    const onPop = () => {
      const p = window.location.pathname;
      if (!p.startsWith("/review")) setReviewGame(null);
      if (!p.startsWith("/play")) {
        // (사용자 요청) /play에서 실시간 상대와 결과 없이 대국 중이면, 뒤로가기로 이 화면을 벗어나려
        // 할 때 곧장 나가는 대신 "정말 기권할지" 확인 알림을 한 번 띄운다 — pvpPlayActiveRef는
        // PlayPage가 onPvpActiveChange로 최신 값을 계속 올려 보내 둔 것. 이미 그 확인을 거쳐
        // "나가기"를 눌렀을 때만(pendingPlayExitRef가 "confirmed") 그대로 통과시킨다.
        if (pvpPlayActiveRef.current && pendingPlayExitRef.current !== "confirmed") {
          try { window.history.pushState({ ...(window.history.state || {}), play: true }, "", "/play"); } catch { }
          pendingPlayExitRef.current = "nav";
          setPlayExitConfirmOpen(true);
          return;
        }
        pendingPlayExitRef.current = null;
        setPlayGame(null);
      }
      if (!/^\/puzzle\/\d{6}-\d+$/.test(p)) setPuzzleActive(null);
      // (v0.4.4 기능) /user/<MID> 프로필 페이지도 다른 고유 URL(리뷰·퍼즐)과 같은 방식으로 뒤로/앞으로
      // 가기에 반응한다 — 그 경로를 벗어나면 닫고, 다시 그 경로로 돌아오면(앞으로 가기) 되살린다.
      const userMatch = /^\/user\/([A-Za-z]{5}[0-9]{4})$/.exec(p);
      setViewedProfileMid(userMatch ? userMatch[1].toUpperCase() : null);
      if (!userMatch) setViewedProfileAutoInvite(false);
      const k = tabFromPath(p);
      if (k) { urlTabRef.current = k; setTab(k); }
      const screens = (window.history.state && window.history.state.screens) || [];
      setSearchOpen(screens.includes("search"));
      setFriendsOpen(screens.includes("friends"));
      setChatsOpen(screens.includes("chats"));
      setProfileWinOpen(screens.includes("profile"));
      setTierMapOpen(screens.includes("tiermap"));
      setAccountCenterOpen(screens.includes("account-center"));
      setLearnFocus((f) => (f && !screens.includes("focus")) ? null : f);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const onOpenOpening = useCallback((name) => {
    const path = findOpeningPathByName(name);
    // (사용자 요청) 도감 탭에서 부른 경우에만, 집중 분석을 닫을 때 도감 탭으로(모식도 위치를 그대로
    // 보존한 채) 자동으로 돌아가도록 예약해 둔다 — 다른 곳(일일 퀘스트, 프로필 등)에서 불렀을 때는
    // 기존과 동일하게 분석 탭에 그대로 남는다.
    setFocusReturnTab(tab === "dex" ? "dex" : null);
    setTab("learn");
    if (!path || !path.length) return;
    const tSans = path.slice(0, -1); const tSan = path[path.length - 1];
    const pnode = snapNode(tSans); const mm = pnode && pnode.moves.find((x) => stripSuffix(x.san) === stripSuffix(tSan));
    const node2 = snapNode(path); const nm = (node2 && node2.opening) ? node2.opening.name : name;
    setLearnSans(tSans);
    setLearnFocus({ sans: tSans, san: tSan, m: mm || { san: tSan }, ply: tSans.length, isNew: false, name: nm });
    // (17차) 집중 분석에 들어간 오프닝도 "최근 오프닝" 풀에 추가 — 일일 퀘스트 후보로 사용됨.
    if (nm) setRecentOpenings((prev) => [nm, ...prev.filter((x) => x !== nm)].slice(0, 10));
  }, [tab]);
  // (v0.4.0 기능) 퍼즐 카드/오늘의 퍼즐 팝업의 기보에서 수를 클릭하면 — onOpenGame(그냥 그 위치로만
  // 이동)과 달리 onOpenOpening과 같은 방식으로 그 수 위치에서 곧장 집중 분석 모드로 들어간다. 이미
  // 정확한 수순(sans)을 갖고 있으므로 findOpeningPathByName 같은 이름 검색은 필요 없고, onOpenOpening의
  // 나머지 로직(마지막 수를 분리해 learnFocus 구성, 오프닝 이름/수 정보 조회)만 그대로 재사용한다.
  // (사용자 요청) 집중 분석을 나갈 때 "들어왔던 경로로" 돌아가도록, 호출부가 넘겨주는 source에 따라
  // 지금 열려 있던 화면을 나가기 전에 기억해 둔다 — 퍼즐 풀이 카드(source="puzzle")는 지금의
  // puzzleActive를 savedPuzzleRef에, 일일 퍼즐 팝업(source="dailypuzzle")은 reopenDailyNoticeRef를
  // 세워 둔다. 둘 다 focusReturnTab에는 되돌아갈 탭 이름만 남기고(퍼즐은 항상 "puzzle", 팝업은 그
  // 팝업이 지금 떠 있던 탭 그대로 — 팝업은 tab과 무관하게 어느 화면 위에도 뜰 수 있음), 실제 복원은
  // 아래 learnFocus 종료 effect가 focusReturnTab을 보고 한 번에 처리한다. 그 외(도감 오프닝 트리
  // 등은 onOpenOpening이 따로 처리)는 기존처럼 null로 둬 popScreen(브라우저 뒤로가기)에 맡긴다.
  const onOpenLearnFocus = useCallback((sans, source) => {
    if (!sans || !sans.length) return;
    setSearchOpen(false); setFriendsOpen(false);
    if (source === "puzzle") { savedPuzzleRef.current = puzzleActive; setFocusReturnTab("puzzle"); }
    else if (source === "dailypuzzle") { reopenDailyNoticeRef.current = true; setFocusReturnTab(tab); }
    else setFocusReturnTab(null);
    // (버그 수정) 퍼즐 풀이 화면(전용 URL "/puzzle/(번호)-(라인)")에서 기보의 수를 클릭하면, 이 함수
    // 직후 pickToLearn이 onClose(PuzzleTab의 closeActive)도 함께 부른다 — closeActive는 "지금 주소가
    // 그 퍼즐 URL 패턴이면" 무조건 history.back()을 호출하는데, 주소를 그대로 두면 아래 focus 전환
    // effect가 막 쌓은 pushScreen("focus") 히스토리 항목이 그 back()에 곧바로 되감겨 사라져 버린다
    // (집중 분석에 들어간 것처럼 보였다가 곧바로 원래 화면 밖으로 튕겨 나감). 그 충돌을 막기 위해,
    // 지금 주소가 퍼즐 URL이면 먼저 "/learn"으로 바꿔치기(replaceState)해 둔다 — 이러면 뒤이은
    // onClose()가 더는 퍼즐 URL로 인식하지 않아 back()을 부르지 않고, 새로 쌓이는 pushScreen("focus")
    // 항목만 깨끗이 남는다.
    try {
      if (/^\/puzzle\/\d{6}-\d+$/.test(window.location.pathname)) {
        window.history.replaceState({ screens: (window.history.state && window.history.state.screens) || [] }, "", TAB_PATH.learn);
      }
    } catch { }
    setTab("learn");
    const tSans = sans.slice(0, -1); const tSan = sans[sans.length - 1];
    const pnode = snapNode(tSans); const mm = pnode && pnode.moves.find((x) => stripSuffix(x.san) === stripSuffix(tSan));
    const node2 = snapNode(sans); const nm = (node2 && node2.opening) ? node2.opening.name : null;
    setLearnSans(tSans);
    setLearnFocus({ sans: tSans, san: tSan, m: mm || { san: tSan }, ply: tSans.length, isNew: false, name: nm });
    if (nm) setRecentOpenings((prev) => [nm, ...prev.filter((x) => x !== nm)].slice(0, 10));
  }, [tab, puzzleActive]);
  // (프로필) chess.com 최근 대국의 "보기" — 그 대국 기보를 분석 보드로 불러온다(끝 포지션에서 뒤로 넘겨보기 가능).
  const onOpenGame = useCallback((moves) => {
    if (!moves || !moves.length) return;
    // (사용자 요청) 채팅 리뷰 카드의 검색 버튼 등 채팅 모아보기 모달(ChatsModal) 안에서 이 함수가
    // 불렸을 때도, 검색·친구 모달과 마찬가지로 닫고 학습 탭으로 이동한다.
    setSearchOpen(false); setFriendsOpen(false); setChatsOpen(false); // 타 유저 프로필 모달·채팅에서 열었을 때 모달을 닫고 보드로 이동
    setTab("learn"); setLearnFocus(null); setLearnSans(moves); setLearnFuture([]);
    // 이 경로도 분석 탭에 남는 게 목적이므로, 혹시 남아 있을 도감 자동 복귀 예약은 취소한다
    // (그대로 두면 방금 부른 learnFocus(null)이 도감으로 되돌아가는 신호로 잘못 해석될 수 있다).
    setFocusReturnTab(null);
  }, []);
  // (v0.2.0 기능) "게임 리뷰" — 전용 /review 페이지를 별도 히스토리 항목(pushState)으로 띄운다.
  // 예전엔 분석 탭으로 이동시킨 뒤 그 안에서 AnalysisModal을 자동으로 열었지만, 결과·상대·
  // 타임클래스 같은 대국 메타데이터를 갖춘 완전한 리뷰 화면으로 대체한다 — 분석 보드 상태는
  // 건드리지 않는다(onOpenGame과 달리 setTab("learn")을 호출하지 않음).
  const [reviewGame, setReviewGame] = useState(null);
  // (v0.3.9 기능) 사용자 요청 — 내 프로필 카드가 더는 설정 탭에 상시 표시되지 않고, 헤더 드롭다운의
  // 화살표 버튼으로 여는 별도 "프로필 창"(ProfileWindow)이 됐다.
  const [profileWinOpen, setProfileWinOpen] = useState(false);
  // (v0.4.3 기능) 계정 센터(AccountCenterModal) — 다른 오버레이(프로필창·친구·채팅 등)와 같은
  // screens 패턴으로 뒤로가기와 맞물린다.
  const [accountCenterOpen, setAccountCenterOpen] = useState(false);
  // (v0.4.6 기능, 사용자 요청) 로그아웃 상태로 친구 초대 링크를 열었을 때 설정 탭의 계정 박스를
  // 흔들어 로그인이 필요하다는 신호를 준다 — 매번 다른 값이어야 같은 tick이 연달아 와도(예: 같은
  // 링크를 두 번 클릭) useEffect가 다시 반응하므로 증가하는 카운터로 둔다.
  const [loginShakeTick, setLoginShakeTick] = useState(0);
  // (v0.2.9 기능 → v0.3.5 리뷰 티켓 제거) 게임 리뷰는 이제 제한 없이 몇 번이든 열 수 있다. 다만
  // "리뷰한 대국만" 필터(AccountChessStats)가 여전히 reviewUnlocked를 쓰므로, 리뷰를 열 때마다
  // reviewGameKey로 그 대국을 계속 기록은 해 둔다(순수 이력, 더는 아무것도 막거나 소비하지 않는다).
  const openReview = useCallback((game) => {
    // (v0.3.4 기능) FEN 모드 분석은 아직 한 수도 안 뒀어도(그 위치 자체를 분석) 열 수 있게 허용한다
    // — fenRoot가 있으면 sans가 비어 있어도 통과시킨다.
    if (!game || (!game.fenRoot && (!game.sans || !game.sans.length))) return;
    const key = reviewGameKey(game);
    if (key && !reviewUnlocked.has(key)) {
      setReviewUnlocked((prev) => { const n = new Set(prev); n.add(key); return n; });
    }
    // (v0.2.1) 리뷰를 연 경로(검색 모달·설정 탭 내 프로필·집중분석의 마스터 대국 등)를 그대로 유지한다 —
    // 예전엔 검색·친구 모달을 닫아 리뷰를 닫으면 그 원래 화면이 아니라 밑의 탭으로 튕겨 나갔다. 이제 그
    // 모달·오버레이(z-index 90/70)를 그대로 마운트해 두고 리뷰(z-index 300)로 덮기만 하므로, 리뷰를
    // 닫으면(뒤로가기) 곧장 그 경로로 되돌아간다.
    setReviewGame(game);
    // (v0.3.4 기능) 사용자 요청 — 리뷰 페이지 고유 URL. 식별자 계산(특히 PGN 분석 쪽 암호화)이
    // 비동기라 화면은 즉시 열되, 우선 예전과 같은 자리표시자("/review")를 히스토리에 쌓아
    // 뒤로가기/닫기가 곧바로 동작하게 하고, 식별자가 준비되면 그 자리를 실제 주소로 바꿔치기한다
    // (replaceState — 이 열기 동작 하나가 히스토리 항목 두 개를 만들지 않도록).
    try { if (window.location.pathname !== "/review") window.history.pushState({ review: true }, "", "/review"); } catch { }
    if (game.id) reviewedGameShare(game.id, game).catch(() => { });
    reviewGameIdentifier(game).then((id) => {
      if (!id) return;
      try { window.history.replaceState({ review: true }, "", "/review/" + id); } catch { }
    });
  }, [reviewUnlocked]);
  const closeReview = useCallback(() => {
    // (버그 수정, 사용자 제보) 분석 탭·채팅창처럼 대국 메타데이터 없이 sans/fenRoot만으로 여는
    // 리뷰는 같은 수순을 다시 열기 쉬운데, 진입 애니메이션(introRevealDone/boardIntroDone)의
    // "이미 본 적 있음" sessionStorage 캐시는 순전히 그 수순/FEN만으로 키가 정해져 있어, 리뷰를
    // 닫았다가 다시 열어도(진짜 새로고침이 아닌데도) 그대로 "본 적 있음"으로 취급돼 애니메이션이
    // 재생되지 않았다 — chess.com 대국(reviewGameKey로 실제 대국 단위 고유 키를 쓰는 경로)에서는
    // 같은 대국을 매번 다시 열 일이 드물어 눈에 덜 띄었을 뿐, 구조는 동일한 문제였다. 리뷰를 실제로
    // 닫는 이 순간 그 키를 지워, "같은 리뷰를 보던 중 새로고침"(이 핸들러를 거치지 않으므로
    // sessionStorage가 그대로 남아 정상적으로 이어본다)과 "닫고 다시 열기"(항상 처음부터 다시
    // 재생)를 구조적으로 구분한다.
    setReviewGame((prev) => {
      if (prev) { const k = reviewStorageKey(prev); if (k) { try { window.sessionStorage.removeItem(k); } catch { } } }
      return null;
    });
    try { if (window.location.pathname.startsWith("/review")) window.history.back(); } catch { }
  }, []);
  const onOpenGameAnalyze = useCallback((game) => openReview(game), [openReview]);
  // (사용자 요청) PLAY — 봉과 직접 대국하는 전용 페이지(/play). 학습 탭 보드 밑 PLAY 버튼이 지금
  // 보드에 입력된 포지션(sans·fenRoot)을 시드로 넘겨 이 페이지를 연다. /play로 직접 들어오면(주소창에
  // 직접 입력·새로고침) seed 없이 표준 시작 위치로 연다(아래 딥링크 resolver에서 처리).
  const [playGame, setPlayGame] = useState(null); // { sans, fenRoot } | null
  // (v0.5.0 기능, 사용자 요청) 다른 탭에 있는 동안 전역 알람 박스에서 미니게임(좌표 인지 게임·
  // 나이트 경주) 친구 도전장을 수락하면, 이미 매칭된 대국을 PlayPage의 "스페셜" 화면으로 넘겨준다.
  const [specialResume, setSpecialResume] = useState(null); // { gameType, game } | null
  // (v0.5.0 리디자인, 사용자 요청) PlayPage가 더 이상 화면을 통째로 덮는 오버레이가 아니라 다른
  // 탭과 똑같이 <main> 안에서 "플레이" 탭(store)일 때만 그려지는 콘텐츠가 됐으므로, 친구 도전장
  // 수락처럼 어느 탭에 있든 곧장 openPlay를 부르는 진입 경로들도 이제 반드시 함께 탭을 "store"로
  // 옮겨야 그 자리에서 실제로 보인다(예전엔 오버레이라 탭 값과 무관하게 항상 맨 위에 떴다).
  const openPlay = useCallback((seed) => {
    setSearchOpen(false); setFriendsOpen(false);
    setPlayGame(seed || { sans: [], fenRoot: null });
    setTab("store"); urlTabRef.current = "store";
    try { if (!window.location.pathname.startsWith("/play")) window.history.pushState({ play: true }, "", "/play"); } catch { }
  }, []);
  // (v0.5.7, BUG-024) 수락·입장한 실시간 대전을 게임 종류에 맞는 화면으로 연다 — 체스는 PlayPage가 이어받고(resumePvpGame),
  // 미니게임은 플레이 탭의 스페셜 화면이 이어받는다(specialResume). 예전엔 채팅 카드가 항상 체스 쪽으로만 열어, 미니게임 도전장을
  // 채팅에서 수락하면 체스 대국 화면에 미니게임 대전이 물려 엉뚱하게 동작했다. 대전을 여는 모든 경로는 이 함수 하나를 쓴다.
  const enterPvpGame = useCallback((g) => {
    if (!g) return;
    setChatsOpen(false);
    if (PLAY_SPECIAL_GAMES.some((x) => x.gameType === g.game_type)) { setSpecialResume({ gameType: g.game_type, game: g }); openPlay({ sans: [], fenRoot: null }); }
    else openPlay({ sans: [], fenRoot: null, resumePvpGame: g });
  }, [openPlay]);
  const closePlay = useCallback(() => {
    setPlayGame(null);
    try { if (window.location.pathname.startsWith("/play")) window.history.back(); } catch { }
  }, []);
  // (v0.5.0 개편, 사용자 요청) 상점 탭 → 플레이 탭 — 이 탭으로 처음 전환될 때 분석 탭의 PLAY 버튼과
  // 완전히 같은 진입 경로(openPlay)로 대국 설정 화면을 연다. seed에 withStore를 실어 보내
  // PlayPage가 그 화면 밑에 기존 상점 UI를 이어 붙이게 한다(분석 탭 등 다른 진입 경로는 이 플래그가
  // 없어 지금까지와 완전히 동일하게 동작한다). playGame이 이미 있으면(진행 중인 대국을 두고 다른
  // 탭에 갔다가 돌아온 경우, 또는 도전장 수락처럼 openPlay가 직접 이 탭으로 이미 옮겨 둔 경우)
  // 새로 열지 않고 그대로 이어간다 — 그래야 진행 중이던 대국이 탭을 오가도 사라지지 않는다.
  useLayoutEffect(() => { if (tab === "store" && !playGame) openPlay({ sans: [], fenRoot: null, withStore: true }); }, [tab, playGame, openPlay]);
  // (사용자 요청) /play에서 봇이 아닌 실시간 상대와 결과 없이 대국이 진행 중인지 — PlayPage가 렌더마다
  // 최신값을 알려준다(popstate 핸들러가 컴포넌트 밖에서도 읽어야 해서 상태 대신 ref로 둔다).
  const pvpPlayActiveRef = useRef(false);
  const onPvpActiveChange = useCallback((v) => { pvpPlayActiveRef.current = v; }, []);
  // "nav"면 브라우저 뒤로가기가 이미 주소를 옮긴 걸 pushState로 되돌려 둔 상태(확인 후 history.back()으로
  // 마저 나간다), "button"이면 헤더의 닫기 버튼을 눌러 들어온 요청(확인 후 closePlay()를 그대로 부른다).
  const pendingPlayExitRef = useRef(null);
  const [playExitConfirmOpen, setPlayExitConfirmOpen] = useState(false);
  const requestClosePlay = useCallback(() => {
    if (pvpPlayActiveRef.current) { pendingPlayExitRef.current = "button"; setPlayExitConfirmOpen(true); return; }
    closePlay();
  }, [closePlay]);
  const confirmPlayExit = useCallback(() => {
    setPlayExitConfirmOpen(false);
    if (pendingPlayExitRef.current === "nav") { pendingPlayExitRef.current = "confirmed"; try { window.history.back(); } catch { } }
    else { pendingPlayExitRef.current = null; closePlay(); }
  }, [closePlay]);
  const cancelPlayExit = useCallback(() => {
    setPlayExitConfirmOpen(false);
    pendingPlayExitRef.current = null;
  }, []);
  const onOpenPuzzle = useCallback(async (pzId, fallback) => {
    // (v0.1.0) 유저 검색·친구 프로필(공개 프로필의 "푼 퍼즐" 카드)에서도 이 함수로 진입하므로,
    // onOpenGame과 같은 방식으로 열려 있던 모달을 닫고 퍼즐 탭으로 이동시킨다.
    // (버그 수정, 사용자 제보) "푼 퍼즐" 카드를 눌러도 아무 반응이 없어 보이던 문제 — 아래서
    // setTab("puzzle")·setPuzzleActive로 퍼즐 탭 화면 자체는 실제로 바뀌지만, 그 카드를 보여주고
    // 있던 프로필 오버레이(전체 화면 UserProfilePage·ProfileWindow)가 그 위에 그대로 덮인 채 남아
    // 있어 화면상으로는 아무것도 안 바뀐 것처럼 보였다 — searchOpen·friendsOpen처럼 이 함수가
    // 여닫는 모달 목록에 이 둘도 추가한다.
    setSearchOpen(false); setFriendsOpen(false); setProfileWinOpen(false);
    setViewedProfileMid(null); setViewedProfileAutoInvite(false);
    setTab("puzzle");
    let pz = await puzzleFetch(puzzleNo(pzId));   // (기능2) 서버(전역)에서 조회 — 생성자 무관
    if (!pz) pz = fallback || null;               // 서버에 아직 없으면 방금 만든 것
    if (pz) setPuzzleActive(pz);
  }, []);
  // (v0.4.4 기능, 사용자 요청) 집중 분석에서 "퍼즐 만들기"를 누르면 바로 퍼즐 카드로 들어가는 대신
  // 퍼즐 탭의 퍼즐 마법사 화면으로 이동시키고, 그 자리에서 곧장 원하는 수까지 자동으로 채워준다
  // (PuzzleTab이 puzzleWizardSeed를 소비하고 나면 null로 되돌려 재진입 시 중복 실행을 막는다).
  const [puzzleWizardSeed, setPuzzleWizardSeed] = useState(null);
  const onOpenPuzzleWizard = useCallback((seed) => {
    setSearchOpen(false); setFriendsOpen(false);
    setTab("puzzle");
    setPuzzleWizardSeed(seed);
  }, []);
  // (v0.2.0 기능2) 오늘의 퍼즐 — 순수 함수라 매 렌더 다시 계산해도 무방(자정 지나 날짜가
  // 바뀌면 자연히 다음 퍼즐로 넘어간다). 알림 팝업의 "풀러 가기"에서도 그대로 재사용한다.
  const todayPuzzle = useDailyPuzzle(engine);
  const openDailyPuzzle = useCallback(() => {
    setSearchOpen(false); setFriendsOpen(false);
    setTab("puzzle");
    if (todayPuzzle) setPuzzleActive(todayPuzzle);
  }, [todayPuzzle]);
  // (v0.2.2 UI#4) '오늘의 퍼즐 풀기' 고정 퀘스트 — 오늘의 퍼즐(todayPuzzle)을 풀면(solved에 그 id가
  // 들어오면) 완료 처리하고 코인을 1회 지급한다. 퍼즐 카운트 퀘스트와 같은 방식(claimQuestCoins가
  // 중복 지급을 막음).
  useEffect(() => {
    if (!dailyQuest || dailyQuest.date !== todayStr() || !todayPuzzle) return;
    if (solved.has(todayPuzzle.id)) claimQuestCoins("dailypuzzle", 10);
  }, [dailyQuest && dailyQuest.date, todayPuzzle && todayPuzzle.id, solved, claimQuestCoins]);
  // (신규 기능, 사용자 요청) 일일 퍼즐 스트릭 — 오늘의 퍼즐을 풀면 그 즉시(위 코인 지급과 같은
  // 조건) 연속 일수를 갱신한다. lastDate가 이미 오늘이면(재방문·재렌더) 중복 집계하지 않고, 어제였으면
  // 이어서 +1, 그 외(하루 이상 건너뜀·최초 기록)면 1로 리셋한다. best는 count가 끊겨도 그대로 남아
  // 배지(STREAK_BADGES) 판정 기준이 된다.
  useEffect(() => {
    if (!dailyQuest || dailyQuest.date !== todayStr() || !todayPuzzle) return;
    if (!solved.has(todayPuzzle.id)) return;
    const t = todayStr();
    setDailyPuzzleStreak((s) => {
      if (s.lastDate === t) return s;
      const yesterday = todayStr(new Date(Date.now() - 24 * 3600e3));
      const count = s.lastDate === yesterday ? s.count + 1 : 1;
      return { count, best: Math.max(s.best || 0, count), lastDate: t };
    });
  }, [dailyQuest && dailyQuest.date, todayPuzzle && todayPuzzle.id, solved]);
  // (v0.1.0) 채팅의 퍼즐 공유 카드 "풀러 가기" — 그 번호의 퍼즐을 서버에서 불러와 곧장 퍼즐 풀이
  // 화면으로 이동하고, 이 퍼즐을 푸는 동안 얻는 XP의 10%가 공유해 준 친구에게 돌아가도록 출처를 기록한다.
  const onOpenSharedPuzzle = useCallback(async (m) => {
    if (!m || m.puzzle_no == null) return;
    const pz = await puzzleFetch(m.puzzle_no);
    if (!pz) return;
    setSearchOpen(false); setFriendsOpen(false); setChatsOpen(false);
    setTab("puzzle");
    setPuzzleActive(pz);
    setShareReferral({ msgId: m.id, no: m.puzzle_no, fromUid: m.from_uid });
  }, []);
  // (v0.3.4 기능) 사용자 요청 — 채팅의 리뷰 공유 카드 "리뷰 보기" — review_id(reviewGameIdentifier가
  // 만든 딥링크 식별자)를 resolveReviewIdentifier로 복원해 곧장 리뷰 화면을 연다. chess.com 대국은
  // 서버 캐시(reviewed_games)까지 한 번 더 거쳐야 하므로 실패할 수 있다(보낸 사람이 아직 그 대국을
  // 캐시에 올린 적 없는 경우) — 실패하면 조용히 무시한다(ChatPanel이 이미 카드에 "불러올 수 없어요"로
  // 표시해 뒀다).
  const onOpenSharedReview = useCallback(async (m) => {
    if (!m || m.review_id == null) return;
    const resolved = await resolveReviewIdentifier(m.review_id);
    if (!resolved) return;
    if (resolved.kind === "chesscom") {
      const cached = await reviewedGameFetch(resolved.ccId);
      if (cached) openReview(cached);
    } else {
      openReview(resolved.game);
    }
  }, [openReview]);
  // (사용자 요청) 채팅 리뷰 공유 카드의 금색 검색 버튼 — 리뷰 페이지 대신 학습 탭으로 이동해 그
  // 기보를 보드에 그대로 입력한다(onOpenGame과 동일한 경로). 위 onOpenSharedReview와 같은 방식으로
  // review_id를 복원하되, chess.com 대국 객체는 필드명이 .moves, PGN/FEN 객체는 .sans라 그 차이를
  // 여기서 흡수한다.
  const onOpenSharedReviewOnBoard = useCallback(async (m) => {
    if (!m || m.review_id == null) return;
    const resolved = await resolveReviewIdentifier(m.review_id);
    if (!resolved) return;
    const game = resolved.kind === "chesscom" ? await reviewedGameFetch(resolved.ccId) : resolved.game;
    if (!game) return;
    const moves = game.moves || game.sans;
    if (moves && moves.length) onOpenGame(moves);
  }, [onOpenGame]);
  useEffect(() => { if (!puzzleActive) return; setPuzzles((prev) => prev.some((x) => x.id === puzzleActive.id) ? prev : ((deletedPuzzles.has(puzzleActive.id) && !solved.has(puzzleActive.id)) ? prev : [...prev, puzzleActive])); }, [puzzleActive]);   // (UX3) 열어본 퍼즐은 로컬 탭에 추가
  // (v0.1.0) 다른 퍼즐을 열거나(일반 탐색) 퍼즐 창을 닫으면 공유 출처를 지운다 — 공유로 들어온 그
  // 퍼즐을 실제로 풀고 있는 세션에서만 보상이 나가도록 좁힌다.
  useEffect(() => { setShareReferral((r) => (r && puzzleActive && r.no === puzzleNo(puzzleActive.id)) ? r : null); }, [puzzleActive]);
  // (v0.3.4 기능) 사용자 요청 — 퍼즐 풀이 창 고유 URL(openchess.kr/(퍼즐 번호)-(라인 번호)). 처음 열
  // 때(아직 퍼즐 URL이 아닐 때)는 pushState로 새 히스토리 항목을 쌓아 뒤로가기로 닫을 수 있게 하고,
  // 이미 같은 퍼즐을 보고 있는 동안 라인만 바뀌면(PuzzleSolver의 onLineChange) replaceState로
  // 항목을 늘리지 않고 그 자리만 갱신한다.
  const onPuzzleLineChange = useCallback((lineNo) => {
    if (!puzzleActive) return;
    const path = "/puzzle/" + puzzleNo(puzzleActive.id) + "-" + lineNo;
    try {
      if (/^\/puzzle\/\d{6}-\d+$/.test(window.location.pathname)) window.history.replaceState({ puzzle: true }, "", path);
      else window.history.pushState({ puzzle: true }, "", path);
    } catch { }
  }, [puzzleActive]);
  // (v0.3.4 기능) 딥링크(/(퍼즐 번호)-(라인 번호))로 열 라인 — puzzleActive와 번호가 일치할 때만
  // PuzzleTab에 내려준다(다른 퍼즐을 열면 자연히 무시된다, 별도 소비 처리 불필요).
  const puzzleTargetLineNo = (puzzleActive && puzzleTargetLine && puzzleTargetLine.no === puzzleNo(puzzleActive.id)) ? puzzleTargetLine.lineNo : null;
  // (v0.3.4 기능) 사용자 요청 — 앱이 처음 뜰 때(또는 새로고침) 주소가 /review(/(식별자)) 또는
  // /(퍼즐 번호)-(라인 번호) 형태면 그 리뷰·퍼즐을 실제로 되살린다. openReview/onOpenPuzzle이 모두
  // 정의된 뒤라야 호출할 수 있어 이 컴포넌트 마지막 부분에 둔다. 실패하면(식별자가 깨졌거나, 아직
  // 아무도 공유한 적 없는 chess.com 대국이거나) 조용히 /learn으로 되돌린다(예전과 같은 안전한 기본값).
  // (v0.3.5 버그 수정) loaded를 기다리지 않고 마운트 즉시 실행했더니, 이 effect의 deps가 []이라
  // 클로저로 캡처한 openReview가 항상 "최초 렌더 시점"의 것(reviewUnlocked=빈 Set — 아직 로컬/계정
  // 복원 전 기본값)으로 고정됐다. 복원이 끝난 뒤(loaded)에만 실행되도록 바꿔, 그 시점 렌더의 최신
  // openReview를 쓰게 한다.
  useEffect(() => {
    if (typeof window === "undefined" || !loaded) return;
    const path = window.location.pathname;
    (async () => {
      // (v0.4.4 기능, 사용자 요청) /user/<MID>(+ ?invite=friend) 딥링크 — 처음 이 주소로 들어와도
      // (예: 친구 초대 링크를 처음 클릭) 그 프로필 페이지가 곧장 열린다.
      const userMatch = /^\/user\/([A-Za-z]{5}[0-9]{4})$/.exec(path);
      if (userMatch) {
        const mid = userMatch[1].toUpperCase();
        let invite = false;
        try { invite = new URLSearchParams(window.location.search).get("invite") === "friend"; } catch { }
        // (버그 수정, 사용자 요청) 로그아웃 상태로 초대 링크를 열면 프로필 페이지의 자동 친구 요청
        // (autoInvite)이 애초에 로그인 없이는 아무 일도 못 해 조용히 아무 반응 없는 페이지만 보여줬다
        // — 로그인부터 하라는 신호를 명확히 주기 위해, 로그아웃 상태에서는 프로필 페이지 대신 설정
        // 탭으로 보내고 그 안의 계정 박스(로그인 유도 카드)를 흔들어 눈에 띄게 한다.
        if (invite && !user) {
          setTab("set");
          setLoginShakeTick((t) => t + 1);
          try { window.history.replaceState(null, "", "/"); } catch { }
          return;
        }
        setViewedProfileMid(mid);
        setViewedProfileAutoInvite(invite);
        return;
      }
      const puzzleMatch = /^\/puzzle\/(\d{6})-(\d+)$/.exec(path);
      if (puzzleMatch) {
        const no = parseInt(puzzleMatch[1], 10), lineNo = parseInt(puzzleMatch[2], 10);
        const data = await puzzleFetch(no);
        if (!data) { try { window.history.replaceState(null, "", "/analysis"); } catch { } return; }
        setPuzzleTargetLine({ no, lineNo });
        setTab("puzzle");
        setPuzzleActive(data);
        return;
      }
      if (path === "/review" || path.startsWith("/review/")) {
        const idRaw = path === "/review" ? null : path.slice("/review/".length);
        const resolved = idRaw ? await resolveReviewIdentifier(idRaw) : null;
        if (!resolved) { try { window.history.replaceState(null, "", "/analysis"); } catch { } return; }
        if (resolved.kind === "chesscom") {
          const cached = await reviewedGameFetch(resolved.ccId);
          if (!cached) { try { window.history.replaceState(null, "", "/analysis"); } catch { } return; }
          openReview(cached);
        } else {
          openReview(resolved.game);
        }
        return;
      }
      if (path === "/play") { setPlayGame({ sans: [], fenRoot: null }); setTab("store"); urlTabRef.current = "store"; return; }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loaded가 false→true로 바뀌는 최초 진입 주소만 본다(그 뒤의 pushState/replaceState는 이 앱 자신이 하는 것이라 다시 해석할 필요가 없고, openReview/onOpenPuzzle 등은 매번 최신 클로저를 쓰면 충분해 deps에 넣지 않는다).
  }, [loaded]);

  return (
    <EngineContext.Provider value={engine}>
    <SkinContext.Provider value={skinValue}>
    <MinigamePrefsContext.Provider value={mgPrefs}><VisualPrefsContext.Provider value={visualPrefs}>
    <div style={{ minHeight: "100vh", background: "transparent", fontFamily: SITE_FONT }}>
      {/* (17차) 버튼 각진 클리핑(geo-cut)과 카드 모서리 금색 삼각형(geo-card) 장식은 제거하고,
          기하학적 밀도는 배경(GeoBackdrop)에만 추가한다 — 버튼은 원래의 둥근 모서리로 복구. */}
      <style>{"button{transition:transform .08s ease, box-shadow .08s ease} button:not(:disabled):active{transform:scale(.94)} @keyframes lockpop{0%{transform:scale(.6);opacity:0}50%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}} @keyframes xpStarPop{0%{transform:scale(.3) rotate(-20deg);opacity:0}35%{transform:scale(1.25) rotate(10deg);opacity:1}55%{transform:scale(1) rotate(0deg);opacity:1}100%{transform:translateY(-34px) scale(.85);opacity:0}} @keyframes questclear{0%{transform:scale(1)}30%{transform:scale(1.035);box-shadow:0 0 0 3px rgba(120,200,120,.55)}70%{transform:scale(1);box-shadow:0 0 0 6px rgba(120,200,120,0)}100%{transform:scale(1);box-shadow:none}} @keyframes dotbounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}} @keyframes dotbounceSm{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-2.5px)}} @keyframes lineShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2.5px)}80%{transform:translateX(2px)}} @keyframes hintPieceWobble{0%,100%{transform:rotate(0deg)}20%{transform:rotate(-9deg)}45%{transform:rotate(7deg)}70%{transform:rotate(-5deg)}90%{transform:rotate(3deg)}} @keyframes hintSquarePulse{0%,100%{opacity:.45;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}} @keyframes hintSquarePop{0%{opacity:0;transform:scale(.5)}40%{opacity:1;transform:scale(1.1)}100%{opacity:0;transform:scale(1)}} @keyframes condPop{0%{opacity:0;transform:scale(.85)}15%{opacity:1;transform:scale(1)}80%{opacity:1}100%{opacity:0}} .dex-current-line{animation:dexCurrentFlow .5s linear infinite} @keyframes dexCurrentFlow{to{stroke-dashoffset:-24}} .gm-board-shine{position:absolute;inset:0;border-radius:4px;overflow:hidden;pointer-events:none;z-index:4} .gm-board-shine::before{content:\"\";position:absolute;top:-40%;left:0;width:42%;height:180%;background:linear-gradient(105deg,transparent 0%,rgba(255,255,255,.05) 32%,rgba(255,255,255,.42) 50%,rgba(255,255,255,.05) 68%,transparent 100%);filter:blur(2px);transform:translateX(-140%) rotate(8deg);animation:gmBoardShine 5s ease-in-out infinite} @keyframes gmBoardShine{0%{transform:translateX(-140%) rotate(8deg)}55%{transform:translateX(240%) rotate(8deg)}100%{transform:translateX(240%) rotate(8deg)}} .dex-surge-line{animation:dexCurrentFlow .5s linear infinite, dexSurgeGlow 1.3s ease-out} @keyframes dexSurgeGlow{0%{stroke:#EAF9FF;filter:drop-shadow(0 0 7px rgba(34,211,240,.95))}55%{filter:drop-shadow(0 0 5px rgba(34,211,240,.75))}100%{filter:drop-shadow(0 0 0 rgba(34,211,240,0))}} .dex-surge-node{animation:dexNodeSurge 1.2s ease-out} @keyframes dexNodeSurge{0%{box-shadow:0 0 0 0 rgba(34,211,240,0)}22%{box-shadow:0 0 15px 2px rgba(34,211,240,.9);border-color:#22D3F0}100%{box-shadow:0 0 0 0 rgba(34,211,240,0)}} .dex-chip-surge{animation:dexChipSurge 1.2s ease-out} @keyframes dexChipSurge{0%{transform:scale(1)}16%{transform:scale(1.13);box-shadow:0 0 24px 6px rgba(34,211,240,.9),0 0 0 3px rgba(34,211,240,.55)}100%{transform:scale(1)}} @keyframes questRaySpin{to{transform:translate(-50%,-50%) rotate(360deg)}} @keyframes questGlowPulse{0%,100%{box-shadow:inset 0 1px 2px rgba(255,255,255,.5), inset 0 -3px 6px rgba(0,0,0,.25), 0 4px 16px -2px rgba(0,0,0,.5), 0 0 0 0 rgba(243,223,174,.5)}50%{box-shadow:inset 0 1px 2px rgba(255,255,255,.5), inset 0 -3px 6px rgba(0,0,0,.25), 0 4px 16px -2px rgba(0,0,0,.5), 0 0 0 9px rgba(243,223,174,0)}} @keyframes questConfettiFall{0%{transform:translateY(-8px) rotate(0deg);opacity:0}12%{opacity:1}100%{transform:translateY(96px) rotate(300deg);opacity:0}} @keyframes questBadgePop{0%{transform:scale(0) rotate(-8deg)}60%{transform:scale(1.15) rotate(3deg)}100%{transform:scale(1) rotate(0deg)}} @keyframes questRowHighlight{0%{box-shadow:0 0 0 0 rgba(196,154,80,0);transform:scale(1)}15%{box-shadow:0 0 0 7px rgba(196,154,80,.55);transform:scale(1.015)}55%{box-shadow:0 0 0 3px rgba(196,154,80,.25);transform:scale(1)}100%{box-shadow:0 0 0 0 rgba(196,154,80,0);transform:scale(1)}} @keyframes puzzleClearFade{0%{opacity:0}8%{opacity:1}88%{opacity:1}100%{opacity:0}} @keyframes puzzleStarPop{0%{transform:scale(0) rotate(-30deg);opacity:0}55%{transform:scale(1.3) rotate(8deg);opacity:1}100%{transform:scale(1) rotate(0deg);opacity:1}} @keyframes checkDraw{to{stroke-dashoffset:0}} @keyframes miniAccDotPop{0%{transform:translate(-50%,-50%) scale(0);opacity:0}60%{transform:translate(-50%,-50%) scale(1.15);opacity:1}100%{transform:translate(-50%,-50%) scale(1);opacity:1}} @keyframes puzzleLetterPop{0%{transform:translateY(34px) rotate(var(--tr,0deg)) scale(.3);opacity:0}55%{transform:translateY(-7px) rotate(calc(var(--tr,0deg) * -0.3)) scale(1.2);opacity:1}80%{transform:translateY(2px) rotate(0deg) scale(.96)}100%{transform:translateY(0) rotate(0deg) scale(1);opacity:1}} @keyframes tierGlowPulse{0%,100%{opacity:.5;transform:scale(.94)}50%{opacity:1;transform:scale(1.06)}} @keyframes tierFirework{0%{transform:translate(0,0) scale(.3);opacity:0}22%{opacity:1;transform:translate(calc(var(--dx) * .35),calc(var(--dy) * .35)) scale(1)}100%{transform:translate(var(--dx),var(--dy)) scale(.5);opacity:0}} @keyframes pieceBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-13px)}} @keyframes legacyHeroPop{0%{transform:scale(.4);opacity:0}55%{transform:scale(1.35);opacity:1}75%{transform:scale(.92)}100%{transform:scale(1);opacity:1}} @keyframes legacyWaveShake{0%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-3px) rotate(-4deg)}50%{transform:translateY(2px) rotate(3deg)}75%{transform:translateY(-1px) rotate(-1deg)}100%{transform:translateY(0) rotate(0deg)}} @keyframes legacyPieceShake{0%{transform:translate(0,0) rotate(0deg) scale(1)}20%{transform:translate(-4px,3px) rotate(-8deg) scale(1.1)}40%{transform:translate(4px,-3px) rotate(7deg) scale(1.06)}60%{transform:translate(-3px,2px) rotate(-5deg) scale(1.03)}80%{transform:translate(2px,-1px) rotate(2deg) scale(1.01)}100%{transform:translate(0,0) rotate(0deg) scale(1)}} @keyframes legacyBoardFlicker{0%,100%{filter:brightness(1)}25%{filter:brightness(.92)}50%{filter:brightness(1.06)}75%{filter:brightness(.96)}} .hide-scrollbar{scrollbar-width:none;-ms-overflow-style:none} .hide-scrollbar::-webkit-scrollbar{display:none} .puzzle-search-preview{border-radius:12px;cursor:pointer;transition:box-shadow .15s ease} .puzzle-search-preview:hover{box-shadow:0 0 0 2px #C49A50} @keyframes lessonSiren{0%,100%{opacity:.35}50%{opacity:.85}} @keyframes lessonCaretBlink{0%,55%{opacity:1}56%,100%{opacity:0}} @keyframes pvpRadarPulse{0%{transform:scale(.6);opacity:.55}100%{transform:scale(1.9);opacity:0}}"}</style>
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -2, background: "radial-gradient(130% 120% at 50% -10%, #34230F 0%, #150C06 65%)" }} />
      {/* (v0.1.4 기능) 배경음악 — 탭을 옮겨도 끊기지 않도록 앱 최상단에 한 번만 마운트한다. */}
      <audio ref={bgmRef} src="/bgm/clair-de-lune.mp3" loop preload="none" />
      <GeoBackdrop />
      {/* (UI1) 모바일(좁은 화면)에서 로고/닉네임/로그아웃 등이 너무 붙어 보이던 문제 —
          좁은 화면에서는 마스코트/글자 크기와 여백을 줄이고, 그래도 안 맞으면 다음 줄로 감싸(rowGap) 겹치지 않게 한다 */}
      {/* (17차) 헤더가 maxWidth 제약 없이 뷰포트 전체 폭을 썼던 탓에, 아래 본문(maxWidth:1080)과 달리
          넓은 데스크탑 화면에서는 우측 버튼들이 본문 오른쪽 경계를 훌쩍 넘어 화면 맨 끝에 몰려 보였다.
          본문과 동일한 maxWidth 컨테이너로 헤더 내용을 감싸 정렬을 맞춘다. */}
      {/* (사용자 요청, 롤백) 헤더 배경색을 밝게 올렸던 시도는 되돌리고, 하단 본문과의 경계 구분은
          금색(T.brass) 경계선만으로 남긴다 — 배경 자체는 원래 톤(#3A2516→#2A1810) 그대로. */}
      <header style={{ borderBottom: "1px solid " + T.brass, background: "linear-gradient(180deg,#3A2516,#2A1810)" }}>
      {/* (버그 수정) 계정 정보 줄과 아이콘 줄을 따로 두고 줄바꿈에 맡겼더니 헤더가 항상 2줄로 보였다 —
          티어 배지·검색/친구/채팅 묶음·알림·계정(또는 로그인) 메뉴까지 네 덩어리를 한 줄에 두고,
          space-between으로 중앙 공백을 그룹 사이 여백으로 흡수한다. 모바일에서는 아이디 텍스트를
          숨기고 아바타로, 요소 크기를 한 단계씩 줄여 폭이 좁아도 항상 한 줄을 유지한다. */}
      <div className="flex items-center justify-between" style={{ maxWidth: 1080, margin: "0 auto", padding: narrowHeader ? "8px 12px" : "10px 20px", flexWrap: "nowrap", columnGap: narrowHeader ? 6 : 14 }}>
        {/* (버그 수정) 로고 PNG 원본에 상하 약 25%씩 투명 여백이 박혀 있어, height를 크게 잡아도
            실제 보이는 그림은 절반 정도뿐이었다(헤더가 불필요하게 커 보이는 주된 원인). 이미지 자체를
            그 여백 없이 다시 잘라냈으므로, 이제 height 값이 곧 실제 로고 크기와 거의 같다 — 헤더를
            불필요하게 키우지 않도록 훨씬 작은 값으로 지정한다. */}
        {/* (v0.1.2 기능) 로고 아래에 현재 버전을 작은 금색 텍스트로 표기 — CHANGELOG[0]에서 파생되는
            APP_VERSION을 그대로 써서, 새 버전을 낼 때 이 표기도 따로 손댈 필요가 없게 한다.
            (v0.1.2) "OpenChess" 글자 쪽(로고 오른쪽 끝)에 맞춰 오른쪽 정렬, 크기도 한 단계 더 줄임.
            (버그 수정) 로고와 버전 텍스트 사이가 붕 떠 보여 음수 marginTop으로 로고 바로 아래에
            바짝 붙였다. 눌러서 소개 페이지(/about)로 바로 이동할 수 있는 링크로 바꿨다. */}
        <div className="flex flex-col items-end" style={{ flexShrink: 0, gap: 0 }}>
          <a href={isNativeApp() ? "/" : "https://openchess.kr"} style={{ display: "block" }}>
            <img src="/OpenChessLogo.png" alt="OpenChess" style={{ display: "block", height: narrowHeader ? 30 : 46, width: "auto", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.5))", cursor: "pointer" }} />
          </a>
          <a href="/about" style={{ fontSize: 7.5, fontWeight: 700, color: T.brassHi, opacity: .8, letterSpacing: ".02em", textAlign: "right", textDecoration: "none", marginTop: -3, cursor: "pointer" }}>v{APP_VERSION}</a>
        </div>
        <div className="flex items-center" style={{ gap: narrowHeader ? 6 : 12, minWidth: 0 }}>
          {/* (18차 UI8) 티어 UI — 티어명과 XP 게이지가 항상 하나의 배지로 붙어 있다(compact에서도 게이지 유지).
              (v0.0.6 개편) 누르면 여정 지도(TierJourneyMap)가 열린다. */}
          <TierBadge totalXp={totalXp} compact={narrowHeader} onClick={() => { setTierMapOpen(true); pushScreen("tiermap"); }} />
          {/* 검색·친구·채팅을 하나의 세그먼트로 묶는다 — 비로그인 상태에선 검색만 남아 평범한 버튼처럼 보인다.
              (버그 수정) 컨테이너에 overflow:hidden을 걸어 양 끝을 둥글게 깎으면 친구·채팅 배지(음수
              오프셋으로 버튼 밖에 튀어나오는 원)까지 함께 잘려 안 보인다 — 대신 양 끝 버튼에만 바깥쪽
              모서리 radius를 직접 주고 컨테이너는 overflow:visible로 둬 배지가 잘리지 않게 한다. */}
          {/* (버그 수정, 사용자 재제보) outline은 border-radius를 따라 둥글게 그려지는지가 브라우저마다
              달라(구버전 WebKit 계열은 outline이 각진 사각형으로 그려져 둥근 모서리 밖으로 삐져나오거나,
              반대로 옆 버튼 배경에 가려 잘려 보인다) 실기기에서 다시 "테두리가 잘린다"는 제보가 있었다.
              outline 대신 진짜 border를 쓰되 box-sizing:border-box로 바깥 치수(height)는 그대로 두고
              안쪽 내용만 border 두께(1px)만큼 줄어들게 한다 — 자식 버튼들은 고정 height 대신
              alignItems:"stretch"로 그 줄어든 안쪽 높이에 저절로 맞춰지므로, border를 절대 덮어 가리지
              않는다(이제 자식에 height를 따로 지정하지 않는다). 어느 브라우저에서도 border는 항상
              같은 방식으로 그려지므로 이 문제가 구조적으로 재발하지 않는다. */}
          <div className="flex" style={{ height: narrowHeader ? 27 : 34, borderRadius: 9, border: "1px solid " + T.brass, boxSizing: "border-box", alignItems: "stretch", overflow: "visible", flexShrink: 0 }}>
            <button onClick={() => { setSearchOpen(true); pushScreen("search"); }} aria-label={t("유저 검색")} className="press" style={{ width: narrowHeader ? 27 : 34, background: T.ebony3, color: T.brassHi, border: "none", borderRadius: user ? "8px 0 0 8px" : 8, borderRight: user ? "1px solid rgba(196,154,80,.4)" : "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Search size={narrowHeader ? 13 : 16} /></button>
            {user && <button onClick={() => { setFriendsOpen(true); pushScreen("friends"); }} aria-label={t("친구")} className="press" style={{ position: "relative", width: narrowHeader ? 27 : 34, background: T.ebony3, color: T.brassHi, border: "none", borderRight: "1px solid rgba(196,154,80,.4)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={narrowHeader ? 13 : 16} />
              {pendingFriendCount > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 999, background: T.blunder, color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #000", lineHeight: 1, zIndex: 5 }}>{pendingFriendCount > 9 ? "9+" : pendingFriendCount}</span>}
            </button>}
            {/* (18차 UX7) 채팅 모아보기 버튼 — 세그먼트의 마지막 자리 */}
            {user && <button onClick={() => { setChatsOpen(true); pushScreen("chats"); }} aria-label={t("채팅")} className="press" style={{ position: "relative", width: narrowHeader ? 27 : 34, background: T.ebony3, color: T.brassHi, border: "none", borderRadius: "0 8px 8px 0", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <MessageCircle size={narrowHeader ? 13 : 16} />
              {unreadChatTotal > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 999, background: T.blunder, color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #000", lineHeight: 1, zIndex: 5 }}>{unreadChatTotal > 9 ? "9+" : unreadChatTotal}</span>}
            </button>}
          </div>
          {/* (버그 수정) 알림은 시급성이 다른 정보라 세그먼트에 묶지 않고 오른쪽에 따로 분리해 둔다. */}
          {user && <NotificationBell myUid={uid} onAccept={onAcceptNotif} onReject={onRejectNotif} onClaim={onClaimNotif} compact={narrowHeader} />}
          {user ? (
            <HeaderProfileMenu user={user} profile={profile} currentTitle={currentTitle} totalXp={totalXp} puzzleRating={puzzleRating} solvedCount={solved.size} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} compact={narrowHeader} onLogoutClick={() => setConfirmLogout(true)} onGoToProfile={() => { setProfileWinOpen(true); pushScreen("profile"); }} onOpenAccountCenter={() => { setAccountCenterOpen(true); pushScreen("account-center"); }}
              mainQuestSummary={mainQuestOverallProgress(mainQuest)} solvedNos={[...solved].map((id) => puzzleNo(id))} onOpenPuzzle={onOpenPuzzle} mySolved={solved} myLineSolves={lineSolves} myUid={uid}
              likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} />
          ) : (
            <div className="flex items-center" style={{ gap: narrowHeader ? 5 : 10 }}>
              <button onClick={() => openAuth("login")} className="press" style={{ padding: narrowHeader ? "5px 8px" : "6px 12px", borderRadius: 8, background: "transparent", color: T.ivory, border: "1px solid " + T.brass, fontSize: narrowHeader ? 11.5 : 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{t("로그인")}</button>
              <button onClick={() => openAuth("signup")} className="press" style={{ padding: narrowHeader ? "5px 8px" : "6px 12px", borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", border: "none", fontSize: narrowHeader ? 11.5 : 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{t("회원가입")}</button>
            </div>
          )}
        </div>
      </div>
      </header>
      <AnimatePresence>
        {authOpen && <AuthModal key={authMode} initialMode={authMode} onClose={() => setAuthOpen(false)} onAuth={onAuth} />}
      </AnimatePresence>
      {recovery && <NewPasswordModal recovery={recovery} onDone={(acc) => { setRecovery(null); if (acc) onAuth(acc); }} onClose={() => setRecovery(null)} />}
      {announceOpen && <AnnouncementModal onClose={() => { setAnnounceOpen(false); setDismissedAnnounceVersion(APP_VERSION); }} />}
      {/* (사용자 요청) 기보의 수를 눌러 집중 분석으로 들어가면 이 팝업은 닫히지만(onOpenLearnFocus가
          호출 전에 기억해 둠), 집중 분석을 나가면 App.jsx가 puzzleNoticeOpen을 다시 true로 되돌려
          같은 팝업이 그대로 다시 뜬다. */}
      {puzzleNoticeOpen && todayPuzzle && <DailyPuzzleNoticeModal puzzle={todayPuzzle} solveCount={Math.max((solveCounts && solveCounts[puzzleNo(todayPuzzle.id)]) || 0, solved.has(todayPuzzle.id) ? 1 : 0)} onOpen={() => { openDailyPuzzle(); closePuzzleNotice(false); }} onClose={(hideToday) => closePuzzleNotice(hideToday)} onOpenLearn={(sans) => onOpenLearnFocus(sans, "dailypuzzle")} />}
      <AnimatePresence>{questClearOpen && <DailyQuestClearedModal key="questClearModal" dailyQuest={dailyQuest} chesscom={chesscom} onOpenGameAnalyze={onOpenGameAnalyze} onClose={() => setQuestClearOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{titleEarnedPopup && <TitleEarnedModal key="titleEarnedModal" id={titleEarnedPopup} currentTitle={currentTitle} onEquip={equipTitle} onClose={() => setTitleEarnedPopup(null)} />}</AnimatePresence>
      {authNotice && <div onClick={() => setAuthNotice("")} style={{ position: "fixed", left: "50%", bottom: 90, transform: "translateX(-50%)", zIndex: 95, maxWidth: 340, width: "calc(100% - 32px)", background: "#241509", color: "#F2E8D5", border: "1px solid #C49A50", borderRadius: 12, padding: "12px 14px", fontSize: 13, lineHeight: 1.5, boxShadow: "0 12px 30px -8px rgba(0,0,0,.6)", cursor: "pointer" }}>{authNotice} <span style={{ opacity: .7, fontSize: 11 }}>{t("(탭하여 닫기)")}</span></div>}
      {needUser && <UsernameSetupModal account={needUser} onDone={(acc) => { setNeedUser(null); if (acc) onAuth(acc); }} onCancel={async () => { try { await authLogout(); } catch { } setNeedUser(null); setUser(null); setUid(null); }} />}
      {searchOpen && <UserSearchModal me={user} myUid={uid} onClose={() => { setSearchOpen(false); popScreen("search"); }} onOpenUserProfile={openUserProfileByUsername} />}
      {friendsOpen && <FriendsModal me={user} myUid={uid} onOpenBoardFen={onOpenLearnFen} onOpenBoardSans={onOpenGame} onClose={() => { setFriendsOpen(false); popScreen("friends"); }} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} onOpenSharedPuzzle={onOpenSharedPuzzle} onOpenSharedReview={onOpenSharedReview} onOpenSharedReviewOnBoard={onOpenSharedReviewOnBoard} onAcceptPvpInvite={enterPvpGame} onOpenPuzzle={onOpenPuzzle} onOpenUserProfile={openUserProfileByUsername} mySolved={solved} myLineSolves={lineSolves} myLegacies={profile.legacies} myIsGM={tierFromXp(totalXp || 0).tier.key === "grandmaster"} myChesscomGames={chesscom.games} engine={engine}
        solveCounts={solveCounts} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} />}
      <AnimatePresence>{chatsOpen && <ChatsModal key="chatsModal" me={user} myUid={uid} onOpenBoardFen={onOpenLearnFen} onOpenBoardSans={onOpenGame} onClose={() => { setChatsOpen(false); popScreen("chats"); }} onOpenSharedPuzzle={onOpenSharedPuzzle} onOpenSharedReview={onOpenSharedReview} onOpenSharedReviewOnBoard={onOpenSharedReviewOnBoard} onAcceptPvpInvite={enterPvpGame} onOpenUserProfile={openUserProfileByUsername} myLegacies={profile.legacies} myIsGM={tierFromXp(totalXp || 0).tier.key === "grandmaster"} myChesscomGames={chesscom.games} engine={engine}
        mySolved={solved} myLineSolves={lineSolves} solveCounts={solveCounts} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} />}</AnimatePresence>
      {shareSheetPuzzle && <PuzzleShareSheet puzzle={shareSheetPuzzle} myUid={uid} onClose={() => setShareSheetPuzzle(null)} onShared={() => setShareCounts((m) => ({ ...m, [puzzleNo(shareSheetPuzzle.id)]: (m[puzzleNo(shareSheetPuzzle.id)] || 0) + 1 }))} />}
      {tierMapOpen && <TierJourneyMap totalXp={totalXp} onClose={() => { setTierMapOpen(false); popScreen("tiermap"); }} />}
      {reviewGame && <ReviewPage game={reviewGame} onClose={closeReview} myUid={uid} engine={engine} reviewSpeed={reviewSpeed} sharpOn={reviewSharpOn} />}
      {user && <GlobalPvpInviteBanner myUid={uid} onAccepted={enterPvpGame} />}
      {user && <GlobalMinigameRematchBanner myUid={uid} onAccepted={enterPvpGame} />}
      {/* (사용자 요청) /play에서 실시간 상대와 대국 중 나가려 하면(뒤로가기·닫기 버튼) 곧장 나가는
          대신 정말 기권 처리해도 되는지 한 번 확인한다. */}
      <AnimatePresence>
        {playExitConfirmOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(10,6,3,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <motion.div initial={{ opacity: 0, y: 12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: .97 }} transition={{ duration: 0.2, ease: MOTION_EASE }}
              style={{ width: "100%", maxWidth: 320, background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid " + T.brass, borderRadius: 14, padding: 20, textAlign: "center", boxShadow: "0 20px 50px -12px rgba(0,0,0,.7)" }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ivoryHi, marginBottom: 6 }}>{t("대국에서 나갈까요?")}</div>
              <div style={{ fontSize: 12.5, color: "rgba(244,238,226,.7)", marginBottom: 18, lineHeight: 1.5 }}>{t("지금 나가면 기권 처리")}</div>
              <div className="flex gap-2">
                <button onClick={cancelPlayExit} className="press" style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: T.ivoryHi, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{t("계속 두기")}</button>
                <button onClick={confirmPlayExit} className="press" style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "linear-gradient(180deg,#E05C5C,#B23A3A)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{t("나가기(기권)")}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {viewedProfileMid && <UserProfilePage mid={viewedProfileMid} autoInvite={viewedProfileAutoInvite} onClose={closeUserProfile} me={user} myUid={uid} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} onOpenPuzzle={onOpenPuzzle} mySolved={solved} myLineSolves={lineSolves} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} />}
      {profileWinOpen && user && (
        <ProfileWindow onClose={() => { setProfileWinOpen(false); popScreen("profile"); }} profile={profile} setProfile={setProfile} user={user} myUid={uid} currentTitle={currentTitle} totalXp={totalXp} puzzleRating={puzzleRating} solvedCount={solved.size}
          onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze}
          mainQuest={mainQuest} puzzles={puzzles} solved={solved} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} onOpenPuzzle={onOpenPuzzle} reviewUnlocked={reviewUnlocked} engine={engine}
          earnedTitles={earnedTitles} onEquipTitle={equipTitle} isDev={isDev} isCodev={isCodev} devOn={devOn} codevOn={codevOn} chesscomStatus={chesscom.status} chesscom={chesscom} />
      )}
      {tierUpAnim && <TierUpOverlay fromTierKey={tierUpAnim.fromKey} fromDivision={tierUpAnim.fromDiv} toTierKey={tierUpAnim.toKey} toDivision={tierUpAnim.toDiv} reward={tierUpAnim.reward} onDone={() => setTierUpAnim(null)} />}
      <AnimatePresence>
        {accountCenterOpen && user && (
          <AccountCenterModal
            myUid={uid}
            username={user}
            onClose={() => { setAccountCenterOpen(false); popScreen("account-center"); }}
            onLogoutClick={() => { setAccountCenterOpen(false); popScreen("account-center"); setConfirmLogout(true); }}
            onAccountDeleted={() => { setAccountCenterOpen(false); popScreen("account-center"); logout(); }}
          />
        )}
      </AnimatePresence>
      {confirmLogout && (
        <div onClick={() => setConfirmLogout(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 85, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 300, width: "100%", background: "linear-gradient(180deg,#F2E8D5,#E2D2B2)", borderRadius: 14, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 6 }}>{t("로그아웃")}</div>
            <p style={{ fontSize: 13, color: T.inkSoft, marginBottom: 16 }}>{tx("{0} 계정에서 로그아웃할까요?", user)}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmLogout(false)} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 700, cursor: "pointer" }}>{t("취소")}</button>
              <button onClick={logout} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: T.blunder, color: "#fff", fontWeight: 800, cursor: "pointer" }}>{t("로그아웃")}</button>
            </div>
          </div>
        </div>
      )}

      {/* (16차) XP 획득은 도형(배경 블록) 없이, 별을 하나 얻는 듯한 느낌의 반짝이는 애니메이션 + 작은 금색 텍스트로 표시한다. */}
      {toast && toast.type === "xp" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 65, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ animation: "xpStarPop .9s ease forwards", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <Star size={40} fill={T.brass} style={{ color: T.brass, filter: "drop-shadow(0 0 12px rgba(196,154,80,.85))" }} />
            <div style={{ fontSize: 15, fontWeight: 800, color: T.brass, letterSpacing: "-.01em" }}>+{toast.amount} XP</div>
          </div>
        </div>
      )}
      {/* (v0.6.4) 안드로이드 뒤로가기: 홈에서 한 번 눌렀을 때 뜨는 종료 안내 */}
      {toast && toast.type === "exitHint" && (
        <div role="status" style={{ position: "fixed", left: 0, right: 0, bottom: "calc(env(safe-area-inset-bottom) + 84px)", zIndex: 65, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ padding: "9px 16px", borderRadius: 999, background: "rgba(27,16,9,.92)", color: "#EBDDC4", fontSize: 12.5, fontWeight: 700, border: "1px solid rgba(196,154,80,.45)", boxShadow: "0 8px 24px -8px rgba(0,0,0,.6)" }}>{t("한 번 더 누르면 종료")}</div>
        </div>
      )}
      {/* (19차 기능5) 일일 퀘스트 전체 완료 → OC 나이트 코인 지급 토스트 */}
      {toast && toast.type === "coins" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 65, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ animation: "xpStarPop 1.1s ease forwards", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <CoinIcon size={58} />
            <div style={{ fontSize: 16, fontWeight: 800, color: T.brass, letterSpacing: "-.01em" }}>+{tx("{0} OC 나이트 코인", toast.amount)}</div>
          </div>
        </div>
      )}
      {/* (v0.5.6) chess.com 대국 요약 알림 — 화면 맨 위(헤더를 덮는 자리, 본문 정보를 가리지 않게). 리뷰·PLAY 화면, 접속 직후 뜨는 창(업데이트
          소식·오늘의 퍼즐·퀘스트 완료)이 위에 있거나 다른 토스트가 떠 있는 동안에는 띄우지 않고 기다린다(대기열은 그대로, 닫히면 이어서). */}
      <div style={{ position: "fixed", top: "calc(8px + env(safe-area-inset-top, 0px))", left: "50%", transform: "translateX(-50%)", zIndex: 80, width: "calc(100% - 32px)", maxWidth: 360, pointerEvents: "none" }}>
        <AnimatePresence mode="wait">
          {ccCur && ccCurInfo && !reviewGame && !playGame && !announceOpen && !puzzleNoticeOpen && !questClearOpen && !(toast && toast.type !== "xp" && toast.type !== "coins") && (
            <ChesscomGameToast key={ccGameKey(ccCur)} game={ccCur} rec={ccCurInfo.rec} ratingDelta={ccCurInfo.ratingDelta} more={ccQueue.length - 1}
              onClose={dismissCcToast}
              onSearch={() => { dismissCcToast(); onOpenGame(ccCur.moves); }}
              onReview={() => { const g = ccCur; dismissCcToast(); onOpenGameAnalyze({ sans: g.moves, color: g.color, result: g.result, rating: g.rating, timeClass: g.timeClass, opening: g.opening, endTime: g.endTime, username: profile.chesscom, white: g.white, black: g.black, id: g.id }); }} />
          )}
        </AnimatePresence>
      </div>
      {toast && toast.type !== "xp" && toast.type !== "coins" && (
        <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 60, animation: "lockpop .4s ease", width: "calc(100% - 32px)", maxWidth: 360 }}>
          {toast.type === "share_reward" ? (
            /* (v0.1.0) 내가 공유한 퍼즐을 친구가 풀어 XP를 나눠 받았을 때 — 실시간으로 도착하는 순간 뜨는 알림. */
            <div className="flex items-center gap-2" style={{ background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, padding: "12px 18px", borderRadius: 12, border: "1px solid " + T.brass, boxShadow: "0 10px 30px -8px rgba(0,0,0,.7)" }}>
              <span style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(196,154,80,.18)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Send size={20} style={{ color: T.brassHi }} /></span>
              <div><div style={{ fontWeight: 800, fontSize: 13, color: T.brassHi }}>{t("공유 보상")}</div><div style={{ fontSize: 12 }}>{tx("친구가 공유한 퍼즐을 풀어 {0} 획득", <b>+{toast.amount} XP</b>)}</div></div>
            </div>
          ) : toast.type === "questClear" ? (
            /* (v0.2.9 기능) 일일 퀘스트 5개 중 하나를 클리어할 때 — 전체 클리어 팝업(DailyQuestClearedModal)과
                같은 시각 언어(체크 배지·금속 광택 스윕)를 축소해 쓰되, 확인 없이 자동으로 사라지는 가벼운
                배너로 둔다(하루에 최대 5번 뜰 수 있어 매번 클릭을 요구하면 번거롭다). */
            <div className="flex items-center gap-2" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, padding: "12px 14px", borderRadius: 13, border: "1px solid " + T.brass, boxShadow: "0 10px 30px -8px rgba(0,0,0,.7)" }}>
              <span className="gm-board-shine" style={{ borderRadius: 13 }} />
              <span style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: T.best, animationName: "questBadgePop", animationDuration: ".5s", animationTimingFunction: "cubic-bezier(.34,1.56,.64,1)" }}><Check size={18} color="#fff" strokeWidth={3} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: T.brassHi }}>{t("퀘스트 완료")}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ivoryHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toast.label}</div>
              </div>
              <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                <span className="flex items-center gap-1" style={{ fontSize: 13, fontWeight: 800, color: T.brassHi }}>+{toast.amount}<CoinIcon size={20} /></span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* (버그 수정) 하단 고정 내비게이션(66px + safe-area) 위 여백이 아슬아슬해, 실기기(특히 주소창이
          동적으로 접히는 안드로이드 브라우저)에서 목록 맨 마지막 카드가 하단 탭에 살짝 가려 보이는
          경우가 있었다 — 여유를 더 둔다. */}
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "22px 18px 150px" }}>
        {/* (버그 수정) 엔진 라인 타이핑이 도중에 멈추는 문제의 진짜 원인 — ReviewPage(reviewGame)는
            어느 탭에서 열렸든 그 탭을 언마운트하지 않고 위에 오버레이로만 덮는다(openReview가 setTab을
            부르지 않음, 뒤로가기 시 원래 탭으로 돌아가기 위함). 그런데 LearnTab·PuzzleTab은 여전히
            마운트된 채로 liveOn이 켜져 있으면 배경에서 실시간 엔진 평가를 계속 돌리고, 이건 리뷰
            페이지와 정확히 같은 공용 워커 풀(getAnalysisPool, profile당 하나만 캐시됨)을 나눠 쓴다 —
            "분석 탭과 별도 독립 풀을 쓴다"는 주석은 useEngine(단일 공유 워커)과는 독립이라는 뜻이었을
            뿐, 같은 profile의 분석 풀 자체는 앱 전체에서 하나뿐이라 전혀 독립적이지 않았다. 리뷰가
            열려 있는 동안 이 두 탭에는 liveOn을 강제로 꺼서(!reviewGame) 분석 풀 전체를 리뷰 페이지에
            양보한다 — "분석 모달이 열려 있는 동안 분석 탭 실시간 평가를 멈춘다"던 예전 주석이 가리키던
            의도가 ReviewPage로 교체되며 실제로는 빠져 있었다. (버그 수정) PLAY 페이지도 같은 이유로
            !playGame을 추가했다 — PlayPage가 전체 화면으로 덮어도 밑에 있는 학습 탭 LearnTab은
            언마운트되지 않고 계속 liveOn 실시간 평가를 돌려, useEngine의 단일 공유 워커 큐를 끝없이
            채워 넣는 바람에 PlayPage의 봉 수 요청(engine.evaluateMulti)이 차례를 영영 못 받고 무한정
            "생각하는 중..."에 멈춰 있던 문제(사용자 제보)의 원인이었다. */}
        {tab === "learn" && <LearnTab engine={engine} liveOn={liveOn && !reviewGame && !playGame} onFocusActive={setFocusActive} unlockOpening={unlockOpening} chesscom={chesscom} contentVer={contentVer} canEdit={canEdit} canAdd={canAdd} bumpContent={bumpContent} sans={learnSans} setSans={setLearnSans} future={learnFuture} setFuture={setLearnFuture} extra={learnExtra} setExtra={setLearnExtra} focus={learnFocus} setFocus={setLearnFocus} puzzles={puzzles} onOpenPuzzle={onOpenPuzzle} onOpenPuzzleWizard={onOpenPuzzleWizard} onOpenFocusBranch={setTab} onOpenReview={openReview} onOpenPlay={goToPlayTab} dailyQuest={dailyQuest} uid={uid} user={user} noteCap={moveNoteCap} onQuestBadgeClick={onQuestBadgeClick} fenSeed={learnFenSeed} onConsumeFenSeed={() => setLearnFenSeed(null)} />}
        {/* (사용자 요청) 도감 탭에서 오프닝 이름을 눌러 집중 분석으로 이동한 경우(focusReturnTab === "dex"),
            집중 분석이 열려 있는 동안에도 이 탭을 언마운트하지 않고 화면에서만 숨긴다 — 그래야 집중
            분석을 닫고 돌아왔을 때 모식도의 팬·줌·펼친 카드가 떠나기 전 그대로 남아 있다(언마운트했다
            재마운트하면 이 상태가 전부 초기화되고, 트리 로딩 연출도 처음부터 다시 재생된다). */}
        {(tab === "dex" || focusReturnTab === "dex") && (
          <div style={tab === "dex" ? undefined : { display: "none" }}>
            <CollectionTab onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} key={"dex-" + navNonce} unlockAll={devUnlockAll} liveOn={liveOn} contentVer={contentVer} chesscom={chesscom} earnedTitles={devUnlockAll ? new Set(ALL_TITLE_IDS) : earnedTitles} titleCounts={titleCounts} ccTitleCounts={ccTitleCounts} currentTitle={currentTitle} onEquipTitle={equipTitle} coins={ocCoins} ownedSkins={ownedSkins} boardSkin={boardSkin} pieceSkin={pieceSkin} onBuySkin={buySkin} onEquipSkin={equipSkin} canAdd={canAdd} bumpContent={bumpContent} onOpenOpening={onOpenOpening} onOpenLearn={onOpenGame} treeData={dexTreeData} treeVersion={dexTreeVersion} genPriorityRef={dexGenPriorityRef} />
          </div>
        )}
        {/* (사용자 요청) 퍼즐 풀이 카드의 기보를 눌러 집중 분석으로 이동하면 이 화면은 닫히지만
            (onOpenLearn → PuzzleSolver의 pickToLearn이 onClose도 함께 부름), App.jsx의
            onOpenLearnFocus가 닫히기 전 puzzleActive를 기억해 뒀다가 집중 분석을 나가면 그 퍼즐을
            같은 라인 그대로 다시 열어준다. */}
        {tab === "puzzle" && <PuzzleTab puzzles={puzzles} archivedPuzzles={archivedPuzzles} solved={solved} lineSolves={lineSolves} onLineSolved={onLineSolved} onPuzzleSolveEvent={onPuzzleSolveEvent} onPuzzleRatingEvent={onPuzzleRatingEvent} onSavePuzzle={onSavePuzzle} onDeletePuzzle={onDeletePuzzle} onPuzzleRenamed={onPuzzleRenamed} solveCounts={solveCounts} puzzleSolvers={puzzleSolvers} friendUids={friendUids} solverNames={solverNames} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} popularityScores={popularityScores} myUid={uid} myUsername={user} puzzleRating={puzzleRating} chesscom={chesscom} chesscomUsername={profile.chesscom} active={puzzleActive} setActive={setPuzzleActive} engine={engine} liveOn={liveOn && !reviewGame && !playGame} canEdit={canEdit} bumpContent={bumpContent} totalXp={totalXp} onOpenTierMap={() => setTierMapOpen(true)} targetLineNo={puzzleTargetLineNo} onLineChange={onPuzzleLineChange} onOpenLearn={(sans) => onOpenLearnFocus(sans, "puzzle")} creatorUsernames={creatorUsernames} lineClearOn={lineClearOn} puzzleClearOn={puzzleClearOn} coachBubbleOn={coachBubbleOn} contentVer={contentVer} createSeed={puzzleWizardSeed} onConsumeCreateSeed={() => setPuzzleWizardSeed(null)} onOpenProfile={openUserProfileByUsername} onOpenLearnFen={onOpenLearnFen} dailyPuzzleStreak={dailyPuzzleStreak} puzzleMomentum={puzzleMomentum} />}
        {tab === "quest" && <QuestTab dailyQuest={dailyQuest} setDailyQuest={setDailyQuest} recentOpenings={recentOpenings} onOpenOpening={onOpenOpening} hasChesscom={!!profile.chesscom} mainQuest={mainQuest} onAnswerChapter={onAnswerChapter} onClaimChapter={claimMainChapter} canEdit={canEdit} canEditLessons={canEditLessons} bumpContent={bumpContent} contentVer={contentVer} questHighlight={questHighlight} />}
        {/* (v0.5.0 리디자인, 사용자 요청) 플레이 탭도 다른 탭처럼 상단 헤더·하단 탭바가 보이도록,
            화면을 통째로 덮는 오버레이 대신 <main> 안에서 그려지는 평범한 탭 콘텐츠로 바꿨다. 도감
            탭과 같은 이유(위 CollectionTab 주석 참고)로 언마운트는 하지 않고 display:none으로만
            숨긴다 — 그래야 실시간 대국·봇 대국 도중 다른 탭을 잠깐 둘러보고 돌아와도(친구 도전장
            수락처럼 다른 탭에서 openPlay를 직접 부르는 경로 포함) 대국이 끊기거나 기권 처리되지
            않는다(위 openPlay/useLayoutEffect가 이 탭으로 자동 전환해 곧장 보여준다). */}
        {playGame && (
          <div style={tab === "store" ? undefined : { display: "none" }}>
            <PlayPage seed={playGame} onClose={requestClosePlay} engine={engine} onOpenReview={openReview} profile={profile} username={user} myUid={uid} onOpenProfile={openUserProfileByUsername} onPvpActiveChange={onPvpActiveChange} storeProps={playGame.withStore ? { coins: ocCoins, ownedSkins, boardSkin, pieceSkin, onBuySkin: buySkin, onEquipSkin: equipSkin } : null} specialResume={specialResume} onConsumeSpecialResume={() => setSpecialResume(null)} onResumeSpecial={(g) => setSpecialResume({ gameType: g.game_type, game: g })} myPuzzleRating={puzzleRating} canEditContent={isDev || isCodev} />
          </div>
        )}
        {tab === "set" && <SettingsTab key={"set-" + navNonce} profile={profile} setProfile={setProfile} engine={engine} engineStatus={engine.status} liveOn={liveOn} setLiveOn={setLiveOn} enginePref={enginePref} setEnginePref={setEnginePref} reviewSpeed={reviewSpeed} setReviewSpeed={setReviewSpeed} sharpOn={reviewSharpOn} setSharpOn={setReviewSharpOn} chesscomStatus={chesscom.status} chesscom={chesscom} user={user} myUid={uid} isDev={isDev} isCodev={isCodev} devOn={devOn} setDevOn={setDevOn} codevOn={codevOn} setCodevOn={setCodevOn} canManageCodev={canManageCodev} canEdit={canEdit} bumpContent={bumpContent} contentVer={contentVer} openAuth={openAuth} earnedTitles={earnedTitles} currentTitle={currentTitle} onEquipTitle={equipTitle} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} totalXp={totalXp} setTotalXp={setTotalXp} puzzleRating={puzzleRating} ocCoins={ocCoins} setOcCoins={setOcCoins} solvedCount={solved.size} mainQuest={mainQuest} puzzles={puzzles} solved={solved} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} onOpenPuzzle={onOpenPuzzle} bgmOn={bgmOn} bgmVolume={bgmVolume} onToggleBgm={toggleBgm} onBgmVolumeChange={onBgmVolumeChange} sfxOn={sfxOn} sfxVolume={sfxVolume} onToggleSfx={toggleSfx} onSfxVolumeChange={onSfxVolumeChange} reviewUnlocked={reviewUnlocked} lineClearOn={lineClearOn} setLineClearOn={setLineClearOn} puzzleClearOn={puzzleClearOn} setPuzzleClearOn={setPuzzleClearOn} coachBubbleOn={coachBubbleOn} setCoachBubbleOn={setCoachBubbleOn} mgDangerOn={mgDangerOn} setMgDangerOn={setMgDangerOn} moveFxMode={moveFxMode} setMoveFxMode={setMoveFxMode} onOpenAccountCenter={() => { setAccountCenterOpen(true); pushScreen("account-center"); }} loginShakeTick={loginShakeTick} onOpenUserProfile={openUserProfileByUsername} />}
      </main>

      {/* (버그 수정) 안드로이드 Chrome은 스크롤 중 주소창이 접히고 펼쳐지며 뷰포트 높이가 실시간으로
          바뀌는데, 이때 하단 고정 내비게이션이 별도의 GPU 합성 레이어로 승격돼 있지 않으면 방금
          스크롤된 페이지 내용이 잠깐 다시 그려지며 내비게이션 위로 겹쳐 보이는 경우가 있었다.
          transform으로 강제로 자체 레이어를 만들고 z-index를 명시해 항상 맨 위에 고정되게 한다. */}
      <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, background: "linear-gradient(180deg,#2E1B10,#160C06)", borderTop: "1px solid #000", height: 66, paddingBottom: "env(safe-area-inset-bottom)", transform: "translateZ(0)", willChange: "transform" }}>
        {(
          /* (버그·모바일) 6개 탭을 균등 분배 — 고정폭+큰 gap이면 좁은 화면에서 버튼이 찌그러져 라벨이 세로로 깨졌다. */
          <div className="flex" style={{ margin: "0 auto", height: "100%", maxWidth: 560, padding: "0 4px" }}>
            {TABS.map(({ key, label, Icon }) => { const on = tab === key; const badge = key === "dex" ? newUnlocks + newTitles : 0; return (
              <button key={key} onClick={() => switchTab(key)} className="flex flex-col items-center justify-center gap-1" style={{ flex: 1, minWidth: 0, maxWidth: 96, color: on ? T.brassHi : "#8A7458", position: "relative", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                {on && <span style={{ position: "absolute", top: 0, height: 3, width: 30, borderRadius: 3, background: T.brass }} />}
                <span style={{ position: "relative" }}>{key === "quest" ? <MaterialIcon name={questIconName} size={20} /> : key === "puzzle" ? <MaterialIcon name="extension" size={20} /> : key === "learn" ? <MaterialIcon name="analytics" size={20} /> : <Icon size={20} />}{badge > 0 && <span style={{ position: "absolute", top: -5, right: -8, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, background: "#D33", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{badge}</span>}</span>
                <span style={{ fontSize: 11, fontWeight: on ? 700 : 500, whiteSpace: "nowrap" }}>{label}</span>
              </button>); })}
          </div>
        )}
      </nav>
    </div>
    </VisualPrefsContext.Provider></MinigamePrefsContext.Provider>
    </SkinContext.Provider>
    </EngineContext.Provider>
  );
}