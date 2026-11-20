// (v0.7.9 성능, 번들 분할) 첫 화면에 바로 필요 없는 탭·창을 그 화면을 처음 열 때 받는다.
// 예전엔 App이 모든 탭(플레이·소셜·학습·도감·설정)과 리뷰·마스터·채팅·친구 창을 정적으로 import해, 어느 주소로 들어와도
// 메인 번들 하나(약 3MB)를 통째로 받고 해석한 뒤에야 화면이 떴다. 지금은 분석 탭(첫 화면 기본값)과 공용 코드만 먼저 받고,
// 나머지는 화면별 파일로 나눠 처음 열 때 받는다. 첫 화면이 그려진 뒤 쉬는 시간(requestIdleCallback)에 미리 받아 두므로
// 보통은 탭을 누를 때 기다림이 없다(데이터 절약 모드·느린 회선이면 미리 받기를 건너뛴다).
// 새 화면을 App에 붙일 때: 탭·창 파일을 App.jsx에서 정적으로 import하지 말고 여기에 lazyScreen으로 추가한다(check-bundle-split이 검사).
import { lazy, Suspense } from "react";
import { afterFullCatalog } from "../lib/i18n.js";   // (v0.7.9) 화면 파일보다 그 화면 번역(나머지 번역)을 먼저 받는다

const LOADERS = {
  play: afterFullCatalog(() => import("./play.jsx")),
  puzzle: afterFullCatalog(() => import("./puzzle.jsx")),
  learn: afterFullCatalog(() => import("./learn.jsx")),
  dex: afterFullCatalog(() => import("./dex.jsx")),
  settings: afterFullCatalog(() => import("./settings.jsx")),
  review: afterFullCatalog(() => import("./review.jsx")),
  master: afterFullCatalog(() => import("./masterPage.jsx")),
  social: afterFullCatalog(() => import("./social.jsx")),
  profileEdit: afterFullCatalog(() => import("./profileEdit.jsx")),
  legacy: afterFullCatalog(() => import("./legacyFeed.jsx")),
};

// 같은 파일을 두 번 요청하지 않도록 Promise를 기억한다(미리 받기와 실제 열기가 겹쳐도 한 번).
const pending = {};
const load = (key) => (pending[key] ||= LOADERS[key]().catch((e) => { delete pending[key]; throw e; }));

/** 파일 key의 이름 있는 export를 지연 컴포넌트로. fallback: 처음 받는 동안 그 자리에 둘 것(탭은 높이만 잡은 빈 칸, 창은 null). */
function lazyScreen(key, name, fallback = null) {
  const Lazy = lazy(() => load(key).then((m) => ({ default: m[name] })));
  function Screen(props) {
    return <Suspense fallback={fallback}><Lazy {...props} /></Suspense>;
  }
  Screen.displayName = "Lazy(" + name + ")";
  return Screen;
}

// 탭 본문은 받는 동안 높이를 잡아 둬 하단 탭바·푸터가 위로 튀지 않게 한다.
const TAB_FALLBACK = <div aria-busy="true" style={{ minHeight: "70vh" }} />;

export const PlayPage = lazyScreen("play", "PlayPage", TAB_FALLBACK);
export const PuzzleTab = lazyScreen("puzzle", "PuzzleTab", TAB_FALLBACK);
export const LearnTab = lazyScreen("learn", "LearnTab", TAB_FALLBACK);
export const CollectionTab = lazyScreen("dex", "CollectionTab", TAB_FALLBACK);
export const SettingsTab = lazyScreen("settings", "SettingsTab", TAB_FALLBACK);
export const AccountCenterModal = lazyScreen("settings", "AccountCenterModal");
export const DeletionPendingModal = lazyScreen("settings", "DeletionPendingModal");
export const ReviewPage = lazyScreen("review", "ReviewPage");
export const MasterPage = lazyScreen("master", "MasterPage");
export const LegacyPostPage = lazyScreen("legacy", "LegacyPostPage");
export const ChatsModal = lazyScreen("social", "ChatsModal");
export const ChatWindow = lazyScreen("social", "ChatWindow");
export const FriendsModal = lazyScreen("social", "FriendsModal");
export const UserProfilePage = lazyScreen("social", "UserProfilePage");
export const UserSearchModal = lazyScreen("social", "UserSearchModal");
export const ProfileEditSheet = lazyScreen("profileEdit", "ProfileEditSheet");

/** 첫 화면이 그려진 뒤 쉬는 시간에 나머지 화면 파일을 하나씩 미리 받는다. first: 지금 탭에 해당하는 key를 먼저. */
export function prefetchScreens(first) {
  if (typeof window === "undefined") return () => {};
  const conn = navigator.connection;
  if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ""))) return () => {};
  const order = [...new Set([first, "play", "puzzle", "learn", "dex", "social", "review", "settings", "profileEdit", "legacy", "master"].filter((k) => k && LOADERS[k]))];
  let cancelled = false, handle = null;
  const idle = window.requestIdleCallback ? (cb) => window.requestIdleCallback(cb, { timeout: 4000 }) : (cb) => setTimeout(cb, 1200);
  const cancelIdle = window.cancelIdleCallback ? (h) => window.cancelIdleCallback(h) : (h) => clearTimeout(h);
  const next = () => {
    if (cancelled || !order.length) return;
    const key = order.shift();
    load(key).catch(() => {}).finally(() => { if (!cancelled) handle = idle(next); });
  };
  handle = idle(next);
  return () => { cancelled = true; if (handle != null) cancelIdle(handle); };
}
