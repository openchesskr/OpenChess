// (v0.6.0, App.jsx 분할) 'social' 화면과 그 화면만 쓰는 조각
// 동작 변경 없이 App.jsx에서 그대로 옮겼다(REFACTOR_NOTES.md Phase 3 참고).
import { SB_ON, sbInsert, sbRpc, sbSelect, SB_URL, sbHeaders, sbUpsert, sbClient } from "../lib/supabaseClient.js";
import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from "react";
import { sanSrc, stripSuffix, startBoard, boardFromSans, sansToFen, MAX_SEARCH_DEPTH, fenOfRoot, pvUciToSans, parseFenFull, looksLikeFen, gameEndState, drawKindLabel, applySan, moveNumber } from "../lib/chessRules.js";
import { T, MOTION_EASE } from "../lib/theme.js";
import { gmPhotoRingStyle, tierFromXp } from "../lib/tierSystem.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { Check, UserPlus, ArrowLeft, X, UserCheck, Clock, Sparkles, Search, Send, Smile, Gem, Crown, Wrench, Pin, BellOff, PinOff, Bell, Trash2, Eye, Users, MessageCircle } from "lucide-react";
import { chesscomChangeDaysLeft } from "../lib/chesscom.js";
import { chatBlocksFetch, chatBlockSet, userReport, chatFetchPage, CHAT_PAGE, chatFetchByIds, chatReactionsFetch, chatPollVotesFetch, chatReactToggle, chatPollVote, chatSendMessage, chatSearch, chatRoomsFetch } from "../lib/chatApi.js";
import { AnimatePresence, motion } from "framer-motion";
import { ReportSheet, UserSafetyMenu, ChatHeaderActions, ChatSearchPanel, CHAT_MENU_W, ChatMsgMenu, PollCard, CoboCard, ReactionChips, ReplyQuote, chessSnippetOf, ChessSnippetCard, ChatCommandPalette, ChatHelpCard, ReplyBar, AttachButton, ChatAttachMenu, chatSnippet, PositionPickSheet, CoBoardScreen } from "../components/chatPlus.jsx";
import { PieceGlyph } from "../components/pieces.jsx";
import { deriveBlindGame, parseChatCommand, blindMoveToken, chatCommandSuggestions, CHAT_COMMANDS as CHAT_CMD_LIST, chatCommandAvailable } from "../lib/chatCommands.js";
import { parsePgnSans, sanSequenceValid, sansToPgnText, parsePgnMoves } from "../lib/pgn.js";
import { BestMoveJumpButton } from "../components/uiPrimitives.jsx";
import { QCOLOR } from "../lib/moveKinds.js";
import { badgeIcon, QLABEL } from "../components/badges.jsx";
import { Board, CONTENT, ChesscomLogo, DEV_ACCOUNT, FadeIn, FriendSendList, InviteLinkBox, LEGACY_TYPES, LegacyStoneTile, MoveLongPressPreview, ONLINE_WINDOW_MS, OnlineDot, PVP_GAME_TYPE, ShareSheetFrame, PuzzleCard, PuzzleShareSheet, REVIEW_DEPTH, REVIEW_MOVETIME_MS, SolvedPuzzlesBlock, TIME_CLASS_LABEL, TierStatPill, analyzeGame, chatConvPrefsFetch, chatFetchAll, chatMarkRead, fetchChesscomProfile, fmtClock, fmtFull, friendAccept, friendEdges, friendRemove, getAnalysisPool, inviteFailText, isPuzzlePlayable, legacyBaseKey, legacyMoveLabel, mainQuestOverallProgress, notifyCreate, notifySetResult, openingNameOf, poolWorker, presenceLabel, puzzleFetch, puzzleNo, puzzleShareSend, relTime, relTimeFromMs, resolveReviewIdentifier, reviewGameIdentifier, reviewPlayerInfo, reviewShareSend, reviewedGameFetch, reviewedGameShare, roleIcon, timeControlFromKey, useNarrow, usePresenceMap, useRealtimeTable, usersProfiles, tcCatLabel } from "./common.jsx";
import { AccountChessStats, LegacyRevealScreen, ProfileStatsPanel, PublicProfileStats, TierRatingRow } from "./profile.jsx";
import { PLAY_SPECIAL_GAMES } from "./play.jsx";

import { t, tx } from "../lib/i18n.js";
import UgcText from "../components/UgcText.jsx";
// (v0.2.6 버그 수정) 수 체계 설명 말풍선·채팅 롱프레스 메뉴·알림 카드가 화면 가장자리 근처의 기준
// 요소에서 열리면, 원래 자리(중앙 정렬 또는 좌우 끝 맞춤) 그대로 뜨면서 팝업 폭만큼 화면 밖으로
// 잘려 나갔다. 기준 요소의 화면상 위치(anchorRect)를 이용해, 팝업이 그 자리 그대로(정렬 방식에
// 따라 중앙/오른쪽 끝/왼쪽 끝 맞춤) 뜬다고 가정했을 때의 좌우 경계가 화면 정중앙 기준 안전 영역
// (margin)을 벗어나는 만큼만 반대 방향으로 밀어내는 오프셋(px)을 계산한다 — 세 곳(CircleBadge
// 설명 말풍선, 채팅 롱프레스 메뉴, 알림 카드) 공용.
// (v0.3.3 기능) bounds — 기본은 화면 전체(window)지만, 채팅 메시지 목록처럼 그 안(스크롤 컨테이너)
// 에서만 잘리지 않으면 되는 경우 실제로 잘리는 경계인 컨테이너의 getBoundingClientRect()를 넘기면
// 그 범위를 기준으로 안전 오프셋을 계산한다 — window 기준으로는 "화면 위쪽 절반"이라 문제없어
// 보여도, 정작 그 좁은 컨테이너 안에서는 가장자리에 붙어 있어 여전히 컨테이너 밖으로 잘릴 수 있다.
function safeAreaDx(anchorRect, popupW, align, margin = 10, bounds) {
  if (!anchorRect || typeof window === "undefined") return 0;
  const left = bounds ? bounds.left : 0, right = bounds ? bounds.right : window.innerWidth;
  const naturalLeft = align === "right" ? anchorRect.right - popupW : align === "left" ? anchorRect.left : anchorRect.left + anchorRect.width / 2 - popupW / 2;
  if (naturalLeft < left + margin) return (left + margin) - naturalLeft;
  if (naturalLeft + popupW > right - margin) return (right - margin) - (naturalLeft + popupW);
  return 0;
}
// (v0.3.4 UX) 채팅 메시지 수정/삭제 메뉴 전용 배치 — 예전엔 말풍선 바로 위/아래로 열었는데, 메시지
// 줄 간격이 6px뿐이라 34px짜리 메뉴가 항상 바로 위/아래 이웃 메시지와 겹쳤다(v0.3.3의 dy 보정은
// 겹침을 줄였을 뿐 구조적으로 없애지는 못했다). 대신 그 메시지의 세로 중앙 높이에 맞춰, 말풍선이
// 없는 쪽 여백(내 메시지는 왼쪽, 상대 메시지는 오른쪽 — 항상 대화창 중앙을 향하는 쪽)에 옆으로
// 띄운다. 그 여백엔 애초에 다른 말풍선이 없으므로 어떤 메시지 밀도에서도 구조적으로 겹칠 일이 없다.
// dx/dy는 이 "자연 위치"가 실제로 잘리는 경계(bounds, 없으면 window) 밖으로 나갈 때만(화면이 아주
// 좁거나 말풍선이 거의 꽉 찼을 때) 안쪽으로 당기는 보정값이다.
function sideBubbleAnchor(anchorRect, popupW, popupH, mine, margin = 10, bounds) {
  if (!anchorRect || typeof window === "undefined") return { dx: 0, dy: 0 };
  const left = bounds ? bounds.left : 0, right = bounds ? bounds.right : window.innerWidth;
  const top = bounds ? bounds.top : 0, bottom = bounds ? bounds.bottom : window.innerHeight;
  const naturalLeft = mine ? anchorRect.left - margin - popupW : anchorRect.right + margin;
  const naturalTop = anchorRect.top + anchorRect.height / 2 - popupH / 2;
  let dx = 0;
  if (naturalLeft < left + margin) dx = (left + margin) - naturalLeft;
  else if (naturalLeft + popupW > right - margin) dx = (right - margin) - (naturalLeft + popupW);
  let dy = 0;
  if (naturalTop < top + margin) dy = (top + margin) - naturalTop;
  else if (naturalTop + popupH > bottom - margin) dy = (bottom - margin) - (naturalTop + popupH);
  return { dx, dy };
}
// 채팅 "/play 3", "/play 15+10" 명령어의 인자 파싱 — 분(정수) 또는 "분+증가초" 형식만 인정한다.
// 유효하지 않으면 null.
function parsePlayCommandArg(raw) {
  const s = (raw || "").trim();
  const m = /^(\d{1,3})(?:\s*\+\s*(\d{1,3}))?$/.exec(s);
  if (!m) return null;
  const min = parseInt(m[1], 10);
  if (!min || min < 1 || min > 180) return null;
  const inc = m[2] ? parseInt(m[2], 10) : 0;
  if (inc < 0 || inc > 180) return null;
  return timeControlFromKey((min * 60) + "-" + inc);
}
// (사용자 요청) 유산 공유 — 퍼즐 공유와 같은 패턴으로, 대화창에 유산 미리보기 카드(legacy_slot이
// 설정된 chat_messages 행)로 남긴다. 유산은 번호별 전역 저장소(puzzles 테이블 같은 것)가 따로
// 없으므로 퍼즐처럼 데이터 자체를 복제해 두지 않고, 그 슬롯 키(best/only/brilliant, 그랜드마스터
// 보너스 칸이면 best2 등)만 저장한다 — 받는 쪽 화면이 from_uid(보낸 사람=유산 주인)의 공개 프로필에서
// 그 슬롯을 그대로 읽어와 보여준다(그 사람이 나중에 그 칸을 바꾸면 공유된 카드도 최신 내용을 보여줌).
async function legacyShareSend(fromUid, toUid, slotKey) {
  if (!SB_ON || !fromUid || !toUid || !slotKey) return false;
  try { await sbInsert("chat_messages", { from_uid: fromUid, to_uid: toUid, legacy_slot: slotKey }); return true; }
  catch { return false; }
}
/* ============================================================ 설정 탭 ============================================================ */
// (17차) "자주 두는 첫 수" 입력에 비합법적인 수(SAN으로 해석 불가하거나 해당 포지션에서 불법인 수)를
// 저장하지 못하도록 검증한다. 타이핑 중에는 자유롭게 입력하게 두고(글자 단위로 막으면 애초에 입력이
// 불가능해짐), blur 시점에만 sanSrc로 합법성을 확인해 저장(commit)한다 — 실패하면 에러만 표시하고
// 이전 값을 유지한다.
function ValidatedMoveInput({ value, onCommit, board, color, placeholder, style }) {
  const [text, setText] = useState(value || "");
  const [err, setErr] = useState(false);
  useEffect(() => { setText(value || ""); setErr(false); }, [value]);
  const commit = () => {
    const t = text.trim();
    if (!t) { setErr(false); setText(""); onCommit(""); return; }
    if (sanSrc(board, t, color)) { setErr(false); onCommit(t); }
    else { setErr(true); }
  };
  return (
    <div style={{ minWidth: 0 }}>
      <input value={text} onChange={(e) => { setText(e.target.value); if (err) setErr(false); }} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        placeholder={placeholder} style={{ ...style, border: err ? "1px solid " + T.blunder : style.border }} />
      {err && <div style={{ fontSize: 10.5, color: T.blunder, marginTop: 2 }}>{t("이 위치에서 둘 수 없는 수")}</div>}
    </div>
  );
}
// (기능5) 프로필 편집 — 사진/이름/칭호/자주 두는 첫 수/국적
// (사용자 요청) 프로필 소개 — 짧은 한 줄 소개라 넉넉히 60자로 제한(프로필 카드·검색 결과 행 모두
// 한 줄 표시를 전제로 하므로 너무 길면 다른 요소를 밀어내거나 줄바꿈되어 레이아웃이 깨진다).
const PROFILE_BIO_MAX_LEN = 60;
function ProfileEditor({ profile, setProfile, earnedTitles, currentTitle, onEquipTitle, card, user, isDev, isCodev, totalXp, solvedCount, chesscom }) {
  const set = (patch) => setProfile({ ...profile, ...patch });
  const fm = profile.firstMoves || { white: "", black: {} };
  const setFM = (patch) => set({ firstMoves: { ...fm, ...patch } });
  // (v0.2.2 기능) 연동된 chess.com 계정이 있으면, 아직 비어 있는 "자주 두는 첫 수" 칸만 실제 대국
  // 통계(가장 많이 둔 수)로 기본값을 채운다 — 사용자가 이미 입력했거나 직접 지운 칸은 덮어쓰지 않는다.
  useEffect(() => {
    if (!chesscom || chesscom.status !== "ready" || !chesscom.games || !chesscom.games.length) return;
    const topMove = (games, ply) => {
      const counts = {};
      for (const g of games) { const s = g.moves && g.moves[ply]; if (s) counts[stripSuffix(s)] = (counts[stripSuffix(s)] || 0) + 1; }
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return best ? best[0] : null;
    };
    const patch = {};
    if (!fm.white) {
      const w = topMove(chesscom.games.filter((g) => g.color === "w"), 0);
      if (w) patch.white = w;
    }
    const curBlack = fm.black || {};
    const blackPatch = {};
    ["e4", "d4", "c4", "Nf3"].forEach((w) => {
      if (curBlack[w]) return;
      const b = topMove(chesscom.games.filter((g) => g.color === "b" && g.moves && stripSuffix(g.moves[0]) === w), 1);
      if (b) blackPatch[w] = b;
    });
    if (Object.keys(blackPatch).length) patch.black = { ...curBlack, ...blackPatch };
    if (Object.keys(patch).length) setFM(patch);
  }, [chesscom && chesscom.status, chesscom && chesscom.games]);
  const onPhotoFile = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, 256 / Math.max(img.width, img.height));
        const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        set({ photo: cv.toDataURL("image/jpeg", 0.85) });   // 256px로 축소해 저장 용량 최소화
      };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  };
  const field = { width: "100%", padding: "8px 11px", borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 13, boxSizing: "border-box" };
  const lab = { fontSize: 12, fontWeight: 800, color: T.ink, margin: "14px 0 6px" };
  return (
    <div style={card}>
      {/* (17차 후속) 카드 상단의 계정 요약 줄(아바타+아이디+"진도가 서버에 저장됩니다")은 프로필 편집 정보와 중복이라 제거 */}
      <div style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{t("프로필 편집")}</div>
      <div className="flex items-center gap-3" style={{ margin: "12px 0" }}>
        {profile.photo ? <img src={profile.photo} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", border: "1px solid #C9B58C", ...(gmPhotoRingStyle(tierFromXp(totalXp || 0).tier.key === "grandmaster") || {}) }} />
          : <span style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 24 }}>{(profile.nickname || "?")[0].toUpperCase()}</span>}
        <div style={{ minWidth: 0 }}>
          {/* (UI2) 설정 탭에서는 칭호를 고를 수 없고, 장착된 칭호만 닉네임 위에 작게 표시 */}
          {/* (18차 UI11) 칭호 텍스트 대신 칭호 이미지로 표시 */}
          <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{profile.nickname || t("이름 미설정")}</div>
        </div>
      </div>
      {/* (17차) 프로필 정보 확장 — 티어(현재 XP 숫자 명시)와 해결한 퍼즐 개수를 한눈에 볼 수 있게 표시 */}
      {totalXp != null && (
        <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
          <TierStatPill totalXp={totalXp} />
          {solvedCount != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, background: "rgba(0,0,0,.05)", border: "1px solid #DCCBA8", color: T.ink, fontSize: 11.5, fontWeight: 800 }}>{tx("퍼즐 {0}개 해결", fmtFull(solvedCount))}</span>}
        </div>
      )}
      <div style={lab}>{t("프로필 사진")}</div>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        <label className="press" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, fontSize: 12, cursor: "pointer", border: "none" }}>{t("파일에서 선택")}<input type="file" accept="image/*" onChange={onPhotoFile} style={{ display: "none" }} />
        </label>
        {profile.photo && <button onClick={() => set({ photo: "" })} className="press" style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid " + T.blunder, background: "transparent", color: T.blunder, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{t("제거")}</button>}
      </div>
      <input value={(profile.photo || "").startsWith("data:") ? "" : (profile.photo || "")} onChange={(e) => set({ photo: e.target.value })} placeholder={t("또는 이미지 주소(URL) 입력")} style={field} />
      <div style={lab}>{t("이름")}</div>
      <input value={profile.nickname || ""} onChange={(e) => set({ nickname: e.target.value })} placeholder={t("표시 이름")} style={field} />
      {/* (사용자 요청) 소개 — 프로필 카드·검색 창에서 닉네임 바로 밑에 표시되는 한 줄 자기소개. */}
      <div className="flex items-center justify-between" style={lab}>
        <span>{t("소개")}</span>
        <span style={{ fontWeight: 600, color: T.inkSoft, fontSize: 11 }}>{(profile.bio || "").length}/{PROFILE_BIO_MAX_LEN}</span>
      </div>
      <input value={profile.bio || ""} onChange={(e) => set({ bio: e.target.value.slice(0, PROFILE_BIO_MAX_LEN) })} maxLength={PROFILE_BIO_MAX_LEN} placeholder={t("예: 시칠리안을 좋아하는 클럽 플레이어")} style={field} />
      <div style={lab}>{tx("자주 두는 첫 수: 백{0}", chesscom && chesscom.status === "ready" && <span style={{ fontWeight: 600, color: T.inkSoft }}>{" "}{t("(chess.com 기록으로 자동 입력, 직접 수정 가능)")}</span>)}</div>
      <ValidatedMoveInput value={fm.white || ""} onCommit={(v) => setFM({ white: v })} board={startBoard()} color="w" placeholder={t("예: e4 (생략 가능)")} style={{ ...field, fontFamily: SITE_FONT }} />
      <div style={lab}>{t("자주 두는 첫 수: 흑 (백의 첫 수별, 생략 가능)")}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        {["e4", "d4", "c4", "Nf3"].map((w) => (
          <div key={w} className="flex items-center gap-2">
            <span style={{ fontSize: 12, fontFamily: SITE_FONT, color: T.inkSoft, width: 56, flexShrink: 0 }}>vs 1.{w}</span>
            <ValidatedMoveInput value={(fm.black || {})[w] || ""} onCommit={(v) => setFM({ black: { ...(fm.black || {}), [w]: v } })} board={boardFromSans([w])} color="b" placeholder={t("응수")} style={{ ...field, fontFamily: SITE_FONT }} />
          </div>
        ))}
      </div>
    </div>
  );
}
// (18차 UI10) 설정 탭의 "내 프로필" 블록 — 유저 검색의 프로필 상세 UI와 동일한 구성으로 내 정보를 보여주고,
// "프로필 편집" 버튼을 누르면 기존 프로필 편집 블록(+chess.com 연동)이 모달 창으로 뜬다.
// (사용자 요청) 통계 분리 토글 — 처음엔 카드 최상단에 큰 세그먼트 바로 뒀는데, 그만큼 세로 공간을
// 먼저 차지해 아이디·이름이 아래로 밀렸다. 아이디 라벨과 같은 줄, 그 줄 오른쪽 여백(우상단)에 들어갈
// 만큼 작은 아이콘 두 개로 줄여 그 자리로 옮긴다. MyProfileCard(내 프로필 카드)와 친구·검색 프로필
// 상세(ProfileStatsPanel을 쓰는 곳)가 이 헬퍼 하나를 공유해 완전히 같은 모양을 쓴다.
// (사용자 요청) /user 페이지에서만 이 토글을 75% 더 크게(scale=1.75) 보여준다 — 다른 화면(내 프로필
// 카드·친구 모달 등)은 기존 크기 그대로 scale=1 기본값을 쓴다.
function statsViewToggle(statsView, setStatsView, scale = 1) {
  const s = (n) => Math.round(n * scale);
  return (
    <div className="flex items-center" style={{ padding: s(2), borderRadius: s(9), background: "rgba(0,0,0,.08)", border: "1px solid #DCCBA8", gap: s(2), flexShrink: 0 }}>
      {[["oc", "OpenChess", t("OpenChess 통계")], ["cc", "chess.com", t("Chess.com 통계")]].map(([key, label, aria]) => (
        <button key={key} onClick={() => setStatsView(key)} aria-label={aria} title={aria} aria-pressed={statsView === key} className="press" style={{ height: s(26), padding: "0 " + s(8) + "px", borderRadius: s(7), border: "none", cursor: "pointer", background: statsView === key ? "#fff" : "transparent", boxShadow: statsView === key ? "0 1px 4px rgba(0,0,0,.28)" : "none", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background .15s ease", fontSize: s(11), fontWeight: 800, letterSpacing: "-.02em", whiteSpace: "nowrap", color: statsView === key ? "#3B2A1A" : "rgba(59,42,26,.55)" }}>{label}</button>
      ))}
    </div>
  );
}
// (사용자 요청) chess.com 통계 보기의 카드 상단 신원 표시 — 사진·아이디는 여기 한 곳에서만 보여주고
// (AccountChessStats 안의 중복 사진·아이디 줄은 compact 옵션으로 생략), 국적·시간 규정별 레이팅도
// 이 자리로 끌어올려 함께 보여준다. MyProfileCard·UserSearchModal·FriendsModal이 모두 공유한다.
function ChesscomHeaderIdentity({ ccHeaderProf, fallbackUsername, noMargin }) {
  const name = (ccHeaderProf && ccHeaderProf.username) || fallbackUsername;
  return (
    // (사용자 요청) alignItems를 center에서 start로 바꿔, 아래쪽 줄(실명·마지막 접속)이 있고 없고에
    // 따라 이 열 전체 높이가 바뀌어도 이름 줄(첫 줄)의 y좌표는 항상 아바타 상단에 고정된다 — 예전엔
    // items-center라 내용이 짧을 때(실명·접속시각 없음) 이름이 아바타 중앙으로 밀려 내려왔다.
    // (사용자 요청) 국적 표시 박스를 없앴고, 이름 줄에 함께 있던 래피드/블리츠/불릿 레이팅도 뺐다
    // (그 정보는 이제 오른쪽 통계 열에서 티어/퍼즐 레이팅 자리를 대신한다) — 그 결과 닉네임·소개·
    // 최근 접속 세 줄의 폰트 크기·marginTop·minHeight가 OpenChess 신원 블록과 값 그대로 완전히
    // 같아져 y좌표가 완전히 통일된다. 아이디도 더는 레이팅 칸과 폭을 나눠 쓰지 않아 덜 잘린다.
    <div className="flex items-start gap-3" style={{ marginBottom: noMargin ? 0 : 14 }}>
      {ccHeaderProf && ccHeaderProf.avatar ? <img src={ccHeaderProf.avatar} alt="" style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover", border: "1px solid #C9B58C", flexShrink: 0 }} />
        : <span style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(180deg,#7FA650,#5C8038)", color: "#0F1A08", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 26, flexShrink: 0 }}>{(name || "?")[0].toUpperCase()}</span>}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        {/* (사용자 요청) 실명 줄도 프로필 카드의 소개(bio)와 같은 이유로 항상 자리를 차지해 둔다. */}
        <div style={{ fontSize: 12, color: T.ink, marginTop: 5, minHeight: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(ccHeaderProf && ccHeaderProf.name) || ""}</div>
        {ccHeaderProf && ccHeaderProf.lastOnline && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>chess.com {tx("{0} 접속", relTimeFromMs(ccHeaderProf.lastOnline))}</div>}
      </div>
    </div>
  );
}
function MyProfileCard({ card, profile, setProfile, user, myUid, currentTitle, totalXp, puzzleRating, solvedCount, onOpenOpening, onOpenGame, onOpenGameAnalyze, chesscomUi, profileEditor, mainQuest, puzzles, solved, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare, onOpenPuzzle, reviewUnlocked, engine }) {
  const [editOpen, setEditOpen] = useState(false);
  // (사용자 요청) 최상단 선택 박스 — OpenChess 자체 통계(퀘스트·퍼즐)와 chess.com 통계를 한 카드에
  // 같이 쌓아 보여주던 것을 분리해, 아이콘 두 개(검은 나이트=OpenChess, 초록 폰=chess.com)로 어느
  // 쪽을 볼지 고르게 한다.
  const [statsView, setStatsView] = useState("oc"); // "oc" | "cc"
  // (사용자 요청) 유산(Legacy) 관리 — 어떤 종류(best/only/brilliant)를 편집 중인지 키만 들고 있는다.
  const [managingLegacy, setManagingLegacy] = useState(null);
  // (사용자 요청) 유산 공유 — 어떤 슬롯을 공유 시트로 열었는지 키만 들고 있는다.
  const [sharingLegacy, setSharingLegacy] = useState(null);
  const myPub = { nickname: profile.nickname, photo: profile.photo, bio: profile.bio, chesscom: profile.chesscom, title: currentTitle, firstMoves: profile.firstMoves, xp: totalXp || 0, puzzleRating: puzzleRating || 800, solvedCount, displayId: profile.displayId, legacies: profile.legacies, legacyHistory: profile.legacyHistory };
  const { cc, setCc, ccState, verifyChesscom, linked, changeChesscom, chesscomStatus, chesscom, chesscomDaysLeft } = chesscomUi;
  // (신규 기능) 사용자 요청 — chess.com 통계 보기를 고르면 카드 상단 신원 표시(사진·아이디·소개)도
  // OpenChess 것 대신 chess.com 것으로 완전히 바꿔 보여준다(같은 위치·같은 크기). chess.com은 자기소개
  // 텍스트를 제공하지 않아, 그 자리엔 실명(name, 있을 때만)을 대신 보여준다.
  const [ccHeaderProf, setCcHeaderProf] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!myPub.chesscom) { setCcHeaderProf(null); return; }
    fetchChesscomProfile(myPub.chesscom).then((p) => { if (!cancelled) setCcHeaderProf(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [myPub.chesscom]);
  // (기능6) 프로필에서 메인 퀘스트 진척도·푼 퍼즐을 한눈에 볼 수 있게 표시.
  const mq = useMemo(() => mainQuestOverallProgress(mainQuest), [mainQuest]);
  const mqPct = mq.totalChapters ? Math.round((100 * mq.claimed) / mq.totalChapters) : 0;
  const solvedPuzzles = useMemo(() => {
    if (!puzzles || !solved) return [];
    return puzzles.filter((p) => solved.has(p.id)).sort((a, b) => (a.opening || "").localeCompare(b.opening || "") || (a.name || "").localeCompare(b.name || ""));
  }, [puzzles, solved]);
  return (
    <div style={card}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12, flexWrap: "wrap", gap: "8px 10px" }}>
        {/* (v0.6.4 UI 수정) 좁은 화면에서 긴 @아이디가 "프로필 편집"·통계 토글과 한 줄에 겹치던 문제 — 라벨은 줄어들 수 있게(minWidth 0 + 말줄임) 하고,
            버튼 묶음은 자리가 모자라면 아래 줄로 내려가 오른쪽 정렬로 둔다. 아래 /user 검색 모달의 같은 헤더도 같은 규칙. */}
        {/* (사용자 요청) 이 자리의 라벨을 "내 프로필" 대신 @아이디로 표시 — 아래 이름·소개 사이에 있던
            별도 @아이디 표시는 지우고 이 라벨 하나로 합친다. (사용자 요청, v0.3.9) 통계 분리 토글은
            카드 최상단의 큰 세그먼트 바 대신 이 헤더 줄 우상단 여백으로 옮겨, 편집 버튼과 나란히 둔다. */}
        <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: SITE_FONT, flex: "1 1 150px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{(myPub.displayId || user)}{roleIcon(user)}</span>
        {/* (v0.6.4) 통계 토글은 왼쪽, 프로필 편집은 오른쪽 — 한 줄이든 두 줄이든 이 순서·정렬을 유지한다. */}
        <div className="flex items-center justify-between gap-2" style={{ flex: "1 1 270px", minWidth: 0 }}>
          {statsViewToggle(statsView, setStatsView)}
          <button onClick={() => setEditOpen(true)} className="press" style={{ padding: "6px 13px", borderRadius: 8, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 700, fontSize: 12, border: "none", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{t("프로필 편집")}</button>
        </div>
      </div>
      {statsView === "cc" && myPub.chesscom ? (
        <ChesscomHeaderIdentity ccHeaderProf={ccHeaderProf} fallbackUsername={myPub.chesscom} />
      ) : (
        // (사용자 요청) items-start로 — 소개(bio)가 없어도 이름 y좌표가 항상 고정되도록.
        <div className="flex items-start gap-3" style={{ marginBottom: 14 }}>
          <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
            {myPub.photo ? <img src={myPub.photo} alt="" style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover", border: "1px solid #C9B58C", ...(gmPhotoRingStyle(tierFromXp(myPub.xp || 0).tier.key === "grandmaster") || {}) }} />
              : <span style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 26 }}>{(myPub.nickname || user || "?")[0].toUpperCase()}</span>}
            <OnlineDot lastSeenMs={Date.now()} overlay size={13} />
          </span>
          <div style={{ minWidth: 0 }}>
            {/* (디자인) 칭호는 이름 위에 표시 */}
            <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{myPub.nickname || myPub.displayId || user}</div>
            {/* (사용자 요청) 소개 — 닉네임 바로 밑에 표시한다. 비어 있어도 항상 자리를 차지해 아래
                줄(접속 표시)이 끌려 올라오지 않게 한다(이름 y좌표 고정 목적). */}
            <div style={{ fontSize: 12, color: T.ink, marginTop: 5, minHeight: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{myPub.bio || ""}</div>
            {/* (사용자 요청) 다른 사람 프로필과 마찬가지로 이름 밑에 OpenChess 최근 접속(내 프로필이라 항상 온라인) 표시. */}
            <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>OpenChess {presenceLabel(Date.now())}</div>
          </div>
        </div>
      )}
      {/* (사용자 요청) 위 선택 박스로 OpenChess 자체 통계(퀘스트·퍼즐)와 chess.com 통계를 완전히
          분리했다 — 예전엔 이 카드 하나에 둘 다 순서대로(OC 먼저, chess.com은 점선 아래) 쌓아
          보여줬지만, 이제 한 번에 한 쪽만 보인다. */}
      {statsView === "oc" ? (
        <>
          <PublicProfileStats pub={myPub} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} hideChesscom onManageLegacy={(key) => setManagingLegacy(key)} onShareLegacy={(key) => setSharingLegacy(key)} ownerUid={myUid} viewerUid={myUid} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} />
          {sharingLegacy && profile.legacies && profile.legacies[sharingLegacy] && (
            <LegacyShareSheet
              slotKey={sharingLegacy}
              typeInfo={LEGACY_TYPES.find((t) => t.key === legacyBaseKey(sharingLegacy))}
              entry={profile.legacies[sharingLegacy]}
              myUid={myUid}
              onClose={() => setSharingLegacy(null)}
              onShared={() => {}}
            />
          )}
          {managingLegacy && (
            <LegacyManageModal
              typeInfo={LEGACY_TYPES.find((t) => t.key === legacyBaseKey(managingLegacy))}
              slotKey={managingLegacy}
              existingEntry={profile.legacies && profile.legacies[managingLegacy]}
              chesscom={chesscom}
              username={profile.chesscom}
              engine={engine}
              onClose={() => setManagingLegacy(null)}
              // (사용자 요청) 지워진 유산까지 다시 볼 수 있는 이력 기능 — 새로 저장(덮어쓰기)하거나
              // 삭제해서 그 칸에서 밀려나는 기존 유산을 profile.legacyHistory에 보존해 둔다(그 칸 자체는
              // 최신 것만 담으므로, 밀려나는 순간의 기존 값만 옮겨 적으면 된다).
              onSave={(key, entry) => { setProfile((p) => { const prev = p.legacies && p.legacies[key]; const history = prev ? [...(p.legacyHistory || []), { slotKey: key, entry: prev, replacedAt: Date.now() }] : (p.legacyHistory || null); return { ...p, legacies: { ...(p.legacies || {}), [key]: entry }, legacyHistory: history }; }); setManagingLegacy(null); }}
              onDelete={() => { setProfile((p) => { const prev = p.legacies && p.legacies[managingLegacy]; const history = prev ? [...(p.legacyHistory || []), { slotKey: managingLegacy, entry: prev, replacedAt: Date.now() }] : (p.legacyHistory || null); return { ...p, legacies: { ...(p.legacies || {}), [managingLegacy]: null }, legacyHistory: history }; }); setManagingLegacy(null); }}
            />
          )}
          {mq.totalChapters > 0 && (
            <div style={{ marginTop: 4, marginBottom: 14, paddingTop: 12, borderTop: "1px solid #E4D5B6" }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("레슨 진척도")}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, fontFamily: SITE_FONT }}>{mq.claimed}/{tx("{0} 레슨 완료", mq.totalChapters)}</span>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: "#EEE2C6", overflow: "hidden", border: "1px solid #DCCBA8" }}>
                <div style={{ width: mqPct + "%", height: "100%", background: "linear-gradient(90deg,#8A6A2F," + T.brass + ")", transition: "width .5s ease" }} />
              </div>
              {/* (사용자 요청) "문제 a/b개 정답" 텍스트 삭제 — 위 진행 바로 충분히 전달된다. */}
            </div>
          )}
          {puzzles && solved && (
            <div style={{ paddingTop: mq.totalChapters > 0 ? 0 : 12, borderTop: mq.totalChapters > 0 ? "none" : "1px solid #E4D5B6" }}>
              <SolvedPuzzlesBlock puzzles={solvedPuzzles} total={solvedPuzzles.length} loading={false} onOpenPuzzle={onOpenPuzzle}
                renderCard={(p, onClick) => <PuzzleCard key={p.id} p={p} isSolved onClick={onClick} isLiked={likedPuzzles ? likedPuzzles.has(p.id) : false} likeCount={(likeCounts && likeCounts[puzzleNo(p.id)]) || 0} onToggleLike={onToggleLike}
                  isReposted={repostedPuzzles ? repostedPuzzles.has(p.id) : false} repostCount={(repostCounts && repostCounts[puzzleNo(p.id)]) || 0} onToggleRepost={onToggleRepost}
                  shareCount={(shareCounts && shareCounts[puzzleNo(p.id)]) || 0} onShare={onShare} />} />
            </div>
          )}
        </>
      ) : linked ? (
        <AccountChessStats chesscom={chesscom} username={profile.chesscom} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} reviewUnlocked={reviewUnlocked} compact />
      ) : (
        // chess.com 미연동 상태에서 이 탭을 고르면 통계 대신 연동 안내 — 아래 편집 모달의 계정
        // 섹션으로 바로 이어지도록 편집 버튼을 함께 둔다.
        <div style={{ textAlign: "center", padding: "22px 10px" }}>
          <ChesscomLogo height={28} />
          <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "10px 0 14px", lineHeight: 1.6 }}>{t("chess.com 계정을 연동하면 실전 대국 통계 표시")}</p>
          <button onClick={() => setEditOpen(true)} className="press" style={{ padding: "8px 16px", borderRadius: 9, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 700, fontSize: 12.5, border: "none", cursor: "pointer" }}>{t("연동하기")}</button>
        </div>
      )}
      {editOpen && (
        <div onClick={() => setEditOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 85, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 460, background: T.paper, borderRadius: 16, border: "1px solid #DCCBA8", padding: 18, boxShadow: "0 20px 50px -12px rgba(0,0,0,.6)", marginBottom: 40 }}>
            <button onClick={() => setEditOpen(false)} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 12, right: 12, zIndex: 10, width: 28, height: 28, borderRadius: 8, border: "none", background: "#0002", color: T.ink, cursor: "pointer" }}>✕</button>
            {profileEditor}
            {/* chess.com 연동 — 기존 설정 탭 블록에서 모달로 이동 */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #E4D5B6" }}>
              <label className="flex items-center" style={{ gap: 6, fontSize: 13, fontWeight: 700, color: T.ink }}>{tx("{0} 계정", <ChesscomLogo height={19} />)}</label>
              <p style={{ fontSize: 11.5, color: T.inkSoft, margin: "4px 0 10px" }}>{t("최근 기보로 수별 전적·승률과 오프닝 실수를 집중 분석 모드에서 분석")}</p>
              {linked ? (
                <div>
                  <div className="flex items-center gap-2">
                    <button disabled className="flex items-center justify-center gap-2" style={{ flex: 1, padding: "10px 14px", borderRadius: 9, background: "linear-gradient(180deg,#3C8A3C,#2E6E2E)", color: "#fff", fontWeight: 800, border: "none", cursor: "default" }}>{tx("{0} 연동 완료 · {1}{2}", <Check size={16} />, profile.chesscom, chesscomStatus === "loading" ? t(" (불러오는 중…)") : "")}</button>
                    <button onClick={changeChesscom} disabled={chesscomDaysLeft > 0} title={chesscomDaysLeft > 0 ? t("{0}일 후 변경 가능", (chesscomDaysLeft)) : undefined} className="press" style={{ padding: "10px 13px", borderRadius: 9, background: "transparent", color: chesscomDaysLeft > 0 ? T.inkSoft : T.ink, fontWeight: 700, border: "1px solid #C9B58C", cursor: chesscomDaysLeft > 0 ? "not-allowed" : "pointer", opacity: chesscomDaysLeft > 0 ? 0.55 : 1, whiteSpace: "nowrap" }}>{t("계정 변경")}</button>
                  </div>
                  {chesscomDaysLeft > 0 && <p style={{ fontSize: 10.5, color: T.inkSoft, margin: "6px 0 0" }}>{tx("계정 변경은 30일에 한 번만 가능 · {0}일 후 변경 가능", chesscomDaysLeft)}</p>}
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={cc} onChange={(e) => setCc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && verifyChesscom()} placeholder={t("chess.com 사용자명")} style={{ flex: 1, minWidth: 0, padding: "9px 11px", borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink, boxSizing: "border-box" }} />
                  <button onClick={verifyChesscom} disabled={ccState === "checking"} className="press" style={{ padding: "9px 16px", borderRadius: 9, background: ccState === "failed" ? T.blunder : "linear-gradient(180deg,#3A2516,#241509)", color: ccState === "failed" ? "#fff" : T.ivoryHi, fontWeight: 700, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>{ccState === "checking" ? t("확인 중…") : ccState === "failed" ? t("연동 실패") : t("연동하기")}</button>
                </div>
              )}
              {linked && <AccountChessStats chesscom={chesscom} username={profile.chesscom} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} reviewUnlocked={reviewUnlocked} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// (사용자 요청, v0.3.9) "프로필 창" — 예전엔 MyProfileCard가 설정 탭에 항상 펼쳐져 있었지만, 이제
// 헤더 드롭다운(HeaderProfileMenu)의 화살표 버튼을 눌러야만 여는 별도 모달로 옮긴다. chess.com 계정
// 연동 플로우(아이디 입력·검증·확인 모달)도 예전엔 SettingsTab이 들고 있었는데, MyProfileCard 없이는
// 쓸 데가 없어져 이 컴포넌트로 그대로 옮겨왔다 — SettingsTab에는 더 이상 이 상태가 필요 없다.
// z-index는 MyProfileCard 자신의 "프로필 편집" 모달(85)보다 낮고, 그 안에서 다시 뜨는 chess.com
// 계정 확인 모달(90)보다도 낮게(80) 잡아, 세 겹이 항상 이 순서로 쌓이게 한다.
export function ProfileWindow({ onClose, profile, setProfile, user, myUid, currentTitle, totalXp, puzzleRating, solvedCount, onOpenOpening, onOpenGame, onOpenGameAnalyze, mainQuest, puzzles, solved, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare, onOpenPuzzle, reviewUnlocked, engine, earnedTitles, onEquipTitle, isDev, isCodev, devOn, codevOn, chesscomStatus, chesscom }) {
  const [cc, setCc] = useState(profile.chesscom || "");
  const [ccState, setCcState] = useState("idle");   // idle | checking | failed
  const [pending, setPending] = useState(null);
  useEffect(() => { setCc(profile.chesscom || ""); }, [profile.chesscom]);
  const linked = !!profile.chesscom;
  const verifyChesscom = async () => {
    const name = cc.trim(); if (!name) return;
    setCcState("checking");
    try { const p = await fetchChesscomProfile(name); setPending(p); setCcState("idle"); }
    catch { setCcState("failed"); setTimeout(() => setCcState("idle"), 1700); }
  };
  const confirmLink = () => { setProfile({ ...profile, chesscom: (pending && pending.username) || cc.trim(), chesscomChangedAt: Date.now() }); setPending(null); };
  const chesscomChangeBypass = (isDev && devOn) || (isCodev && codevOn);
  const chesscomDaysLeft = chesscomChangeBypass ? 0 : chesscomChangeDaysLeft(profile.chesscomChangedAt);
  const changeChesscom = () => { if (chesscomDaysLeft > 0) return; setProfile({ ...profile, chesscom: "" }); setCc(""); setCcState("idle"); };
  const card = { background: T.paper, borderRadius: 12, padding: 16, border: "1px solid #DCCBA8" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 80, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 460, marginBottom: 40 }}>
        <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: -12, right: -12, zIndex: 10, width: 32, height: 32, borderRadius: "50%", border: "1px solid #DCCBA8", background: T.paper, color: T.ink, cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,.35)" }}>✕</button>
        <MyProfileCard card={card} profile={profile} setProfile={setProfile} user={user} myUid={myUid} currentTitle={currentTitle} totalXp={totalXp} puzzleRating={puzzleRating} solvedCount={solvedCount} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze}
          chesscomUi={{ cc, setCc, ccState, verifyChesscom, linked, changeChesscom, chesscomStatus, chesscom, chesscomDaysLeft }}
          mainQuest={mainQuest} puzzles={puzzles} solved={solved} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} onOpenPuzzle={onOpenPuzzle} reviewUnlocked={reviewUnlocked} engine={engine}
          profileEditor={<ProfileEditor profile={profile} setProfile={setProfile} earnedTitles={earnedTitles} currentTitle={currentTitle} onEquipTitle={onEquipTitle} card={{ background: "transparent", padding: 0, marginTop: 0 }} user={user} isDev={isDev} isCodev={isCodev} totalXp={totalXp} solvedCount={solvedCount} chesscom={chesscom} />} />
      </div>
      {/* chess.com 계정 확인 모달 */}
      {pending && (
        <div onClick={(e) => { e.stopPropagation(); setPending(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 320, width: "100%", background: "linear-gradient(180deg,#F2E8D5,#E2D2B2)", borderRadius: 16, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}>
            <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
              {pending.avatar ? <img src={pending.avatar} alt="" style={{ width: 46, height: 46, borderRadius: 10 }} /> : <span style={{ width: 46, height: 46, borderRadius: 10, background: T.brass, color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20 }}>{pending.username[0].toUpperCase()}</span>}
              <div><div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{pending.username}</div><div style={{ fontSize: 11.5, color: T.inkSoft }}>{tx("플레이한 게임 {0}국", fmtFull(pending.games))}</div></div>
            </div>
            <div className="flex gap-2" style={{ marginBottom: 14 }}>
              {[[t("래피드"), pending.rapid], [t("블리츠"), pending.blitz], [t("불릿"), pending.bullet]].map(([lb, v]) => (
                <div key={lb} style={{ flex: 1, textAlign: "center", background: "rgba(0,0,0,.05)", borderRadius: 9, padding: "8px 4px" }}><div style={{ fontSize: 10.5, color: T.inkSoft, fontWeight: 700 }}>{lb}</div><div style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: SITE_FONT }}>{v != null ? v : "—"}</div></div>
              ))}
            </div>
            <p style={{ fontSize: 12.5, color: T.ink, fontWeight: 600, marginBottom: 14 }}>{t("이 계정이 맞나요?")}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPending(null)} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 700, cursor: "pointer" }}>{t("아니요")}</button>
              <button onClick={confirmLink} className="press" style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "linear-gradient(180deg,#3C8A3C,#2E6E2E)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>{t("이 계정으로 연동")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// (v0.4.4 기능, 사용자 요청) MID(영문 대문자 5자리+숫자 4자리 회원 번호) 형식 — 검색창·URL 양쪽에서
// "#ABCDE1234"·"ABCDE1234" 모두 인식하도록 앞의 "#"은 선택으로 둔다.
const MID_RE = /^#?([A-Za-z]{5}[0-9]{4})$/;
// (사용자 요청) "#"로 시작하면(아직 9자 전체를 다 입력하지 않았어도) 입력 중인 문자열에 따라 계속
// 실시간으로 갱신되는 후보 목록을 보여준다 — 서버 RPC(profiles_search_by_mid_prefix)가 그 접두어로
// 시작하는 MID들을 유사도(similarity, pg_trgm) 내림차순으로, 동률이면 XP 내림차순으로 정렬해 돌려준다.
async function userSearchByMidPrefix(partial, limit) {
  if (!SB_ON || !partial) return [];
  try { const rows = await sbRpc("profiles_search_by_mid_prefix", { p_query: partial, p_limit: limit || 20 }); return Array.isArray(rows) ? rows : []; }
  catch { return []; }
}
async function userSearch(q) {
  if (!SB_ON || !q) return [];
  const trimmed = q.trim();
  if (trimmed.startsWith("#")) {
    const partial = trimmed.slice(1);
    return partial ? await userSearchByMidPrefix(partial) : [];
  }
  const midMatch = MID_RE.exec(trimmed);
  if (midMatch) { const row = await userProfileByMid(midMatch[1]); return row ? [row] : []; }
  try { const rows = await sbSelect("profiles?username=ilike." + encodeURIComponent(q.toLowerCase() + "*") + "&select=id,username,pub&limit=20"); return rows || []; } catch { return []; }
}
// (v0.4.4 기능, 사용자 요청) MID로 프로필 조회 — #MID 검색과 /user/<MID> 프로필 페이지가 함께 쓴다.
async function userProfileByMid(mid) { if (!SB_ON || !mid) return null; try { const rows = await sbSelect("profiles?mid=eq." + encodeURIComponent(mid.toUpperCase()) + "&select=id,username,pub,mid&limit=1"); return rows && rows[0] ? rows[0] : null; } catch { return null; } }
// (기능) 유저 검색 기본 추천 — 아직 아무것도 입력하지 않았을 때 "친구의 친구"(friend_suggestions)와
// "티어 리더보드"(leaderboard_top)를 보여준다. 둘 다 서버 RPC로 계산한다: 친구의 친구는 다른 사람의
// friend_edges를 직접 읽어야 하는데 RLS가 본인이 관련된 행만 읽도록 막아 두어(supabase-setup.sql
// "friend edges select own") 클라이언트에서 직접 조합할 수 없고, 리더보드는 XP가 profiles.pub 안의
// jsonb 텍스트라 PostgREST의 문자열 정렬(order=pub->>xp)로는 "100"이 "20"보다 앞에 오는 등 숫자
// 크기와 다르게 정렬될 수 있어 서버에서 숫자로 캐스팅해 정렬해야 한다.
async function friendSuggestions(limit) { if (!SB_ON) return []; try { const r = await sbRpc("friend_suggestions", { p_limit: limit || 8 }); return Array.isArray(r) ? r : []; } catch { return []; } }
async function leaderboardTop(limit) { if (!SB_ON) return []; try { const r = await sbRpc("leaderboard_top", { p_limit: limit || 8 }); return Array.isArray(r) ? r : []; } catch { return []; } }
/* ---- 친구 시스템 (요청 → 수락). Auth 미사용·anon 접근이라 기존 profiles_public/puzzle_solve와 동일 보안 수준 ---- */
async function friendRequest(toUsername) { if (!SB_ON || !toUsername) return { ok: false, error: "offline" }; try { const r = await sbRpc("friend_request", { p_to_username: toUsername.toLowerCase() }); const s = (Array.isArray(r) ? r[0] : r) || ""; return { ok: !["unauth", "notfound", "self", "blocked"].includes(s), status: s }; } catch { return { ok: false, error: "network" }; } }
// (v0.4.4 기능, 사용자 요청) MID 초대 링크(openchess.kr/user/<MID>?invite=friend)로 들어오면 자동으로 부른다.
async function friendRequestByMid(mid) { if (!SB_ON || !mid) return { ok: false, error: "offline" }; try { const r = await sbRpc("friend_request_by_mid", { p_mid: mid.toUpperCase() }); const s = (Array.isArray(r) ? r[0] : r) || ""; return { ok: !["unauth", "notfound", "self", "blocked"].includes(s), status: s }; } catch { return { ok: false, error: "network" }; } }
// (버그 수정) 친구 요청을 알림 창의 수락/거절 버튼이 아니라 "친구" 모달(요청 탭·프로필 서브뷰)에서
// 처리해도, 그 요청을 알렸던 notifications 행 자체는 손대지 않아 알림 창엔 계속 수락/거절 버튼이
// (이미 처리된 뒤에도) 남아 있었다. 어느 경로로 처리하든 그 알림도 함께 "수락함/거절함"으로 정리한다.
async function notifyResolveFriendRequest(myUid, fromUid, result) {
  if (!SB_ON || !myUid || !fromUid) return;
  try {
    const rows = await sbSelect("notifications?to_uid=eq." + myUid + "&kind=eq.friend_request&payload->>fromUid=eq." + encodeURIComponent(fromUid) + "&select=id,payload");
    await Promise.all((rows || []).map((r) => notifySetResult(r, result)));
  } catch { }
}
/* (17차) 친구 채팅 — 텍스트 + 이모티콘 */
async function chatSend(myUid, toUid, body, emoji) { if (!SB_ON || !myUid || !toUid) return false; try { await sbInsert("chat_messages", { from_uid: myUid, to_uid: toUid, body: body || null, emoji: emoji || null }); return true; } catch { return false; } }
// (v0.1.4 기능) 채팅 메시지 수정/삭제 — 수정은 소유권 검증이 필요해 RPC로, 삭제는 puzzle_likes와
// 같은 RLS 소유자 delete 정책 패턴으로 REST DELETE를 직접 쓴다(notifyDelete와 달리 정책이 있다).
async function chatEditMessage(id, body) { if (!SB_ON || id == null) return false; try { await sbRpc("chat_edit_message", { p_id: id, p_body: body }); return true; } catch { return false; } }
async function chatDeleteMessage(id) { if (!SB_ON || id == null) return false; try { const r = await fetch(SB_URL + "/rest/v1/chat_messages?id=eq." + id, { method: "DELETE", headers: { ...sbHeaders(), Prefer: "return=minimal" } }); return r.ok; } catch { return false; } }
// (v0.3.4 기능) ChatPanel이 특정 상대와의 대화를 열 때 — 목록(ChatsModal)을 거치지 않고 다른 곳
// (예: 친구 프로필)에서 곧장 열리는 경로에서도 "나에게서만 삭제" 워터마크가 똑같이 적용되도록,
// 대화 하나(=행 하나)만 가볍게 조회한다.
async function chatConvPrefGet(myUid, otherUid) {
  if (!SB_ON || !myUid || !otherUid) return null;
  try {
    const rows = await sbSelect("chat_conv_prefs?uid=eq." + myUid + "&other_uid=eq." + otherUid + "&select=cleared_before&limit=1");
    return (rows && rows[0] && rows[0].cleared_before) || null;
  } catch { return null; }
}
async function chatConvSetPref(myUid, otherUid, patch) {
  if (!SB_ON || !myUid || !otherUid) return false;
  try { await sbUpsert("chat_conv_prefs", { uid: myUid, other_uid: otherUid, updated_at: new Date().toISOString(), ...patch }); return true; } catch { return false; }
}
async function chatClearConversation(otherUid) {
  if (!SB_ON || !otherUid) return false;
  try { await sbRpc("chat_clear_conversation", { p_other: otherUid }); return true; } catch { return false; }
}
// (17차) 이모티콘 24종(MILKU/KOKOA 각 12종) — 정사각형으로 잘라 public/emoji에 미리 저장해둔 것을 사용.
// (20차 UI3) 한 번에 24개를 다 보여주면 아이콘이 너무 작아 잘 안 보이던 문제 — MILKU/KOKOA를
// 각각 한 페이지씩 좌우로 넘겨보도록 나눠, 페이지당 12개만 훨씬 크게 표시했었다.
// (버그 수정, 사용자 요청) 이 박스가 이제 뷰포트 전체 폭을 쓰도록 넓어져 24개를 한 번에 큼직하게
// 보여줄 자리가 충분해졌다 — 페이지 넘기기를 없애고, 6열×4행 한 판에 위 두 줄(6×2=12)은 MILKU,
// 아래 두 줄은 KOKOA가 오도록 순서 그대로 나열한다(grid가 행 우선으로 채우므로 별도 계산 없이
// MILKU 12개 다음 KOKOA 12개를 그대로 이어 붙이면 된다).
const EMOJI_GROUPS = [
  { label: "MILKU", codes: Array.from({ length: 12 }, (_, i) => "milku_" + (i + 1)) },
  { label: "KOKOA", codes: Array.from({ length: 12 }, (_, i) => "kokoa_" + (i + 1)) },
];
const EMOJI_CODES = EMOJI_GROUPS.flatMap((g) => g.codes);
// (버그 수정, 사용자 요청) 예전엔 채팅 패널 안쪽 기준 position:absolute라 채팅 패널 자체 폭(데스크톱
// 플로팅 카드 등)에 갇혀 있었다 — position:fixed + left:0/right:0으로 어떤 조상의 폭과도 무관하게
// 항상 뷰포트 전체 폭을 채우게 한다. bottom은 ChatPanel이 이모티콘 버튼의 실제 화면 좌표를 열 때
// 한 번 재서 넘겨준 값(pos.bottom)을 그대로 써 버튼 바로 위에 붙는다.
function EmojiPicker({ pos, onPick, onClose }) {
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: 0, right: 0, bottom: pos.bottom, background: T.paper, borderTop: "1px solid #DCCBA8", borderBottom: "1px solid #DCCBA8", boxShadow: "0 -12px 30px -8px rgba(0,0,0,.5), 0 12px 30px -8px rgba(0,0,0,.5)", padding: "10px 16px", zIndex: 95 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.brass, textAlign: "center", marginBottom: 8 }}>MILKU&amp;KOKOA</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
          {EMOJI_CODES.map((code) => (
            <button key={code} onClick={() => { onPick(code); onClose(); }} className="press" style={{ padding: 4, border: "none", background: "transparent", cursor: "pointer", borderRadius: 8 }}>
              <img src={"/emoji/" + code + ".png"} alt={code} style={{ width: "100%", display: "block" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
// (17차) 친구 채팅 — 텍스트 + 이모티콘. 열려있는 동안 짧은 주기로 폴링해 새 메시지를 반영한다.
// (v0.2.6 기능) 채팅 메시지에서 "@아이디" 멘션을 찾는다. 아이디 규칙(ALNUM, 3~20자)과 동일한
// 글자 집합만 인정한다.
const MENTION_RX = /@([A-Za-z0-9]{3,20})/g;
function firstMention(body) {
  if (!body) return null;
  MENTION_RX.lastIndex = 0;
  const m = MENTION_RX.exec(body);
  return m ? m[1] : null;
}
// 메시지 본문에서 "@아이디" 부분만 볼드체로 감싸 렌더링한다.
function renderMentionText(body) {
  if (!body) return body;
  MENTION_RX.lastIndex = 0;
  const parts = []; let last = 0, m;
  while ((m = MENTION_RX.exec(body))) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(<b key={m.index}>{m[0]}</b>);
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}
// (v0.2.6 기능) 채팅에서 상대 프로필 사진·멘션을 클릭했을 때 뜨는 간단한 프로필 보기 모달 —
// UserSearchModal의 프로필 상세 화면과 같은 구성(PublicProfileStats 재사용)을 아이디 하나만으로 연다.
// (v0.4.4 기능, 사용자 요청) 다른 유저의 프로필 — 예전엔 검색·채팅·/play 친구 목록마다 각자
// 오버레이 모달을 띄웠지만, 이제 openchess.kr/user/<MID> 고유 URL을 갖는 하나의 실제 페이지로
// 통합했다. MID 초대 링크(계정 센터에서 복사)로 들어오면 자동으로 친구 요청까지 보낸다(autoInvite).
// 데스크톱처럼 폭이 넉넉하면 신원/친구 요청을 왼쪽 고정 열에, 통계·활동을 오른쪽 넓은 열에 나란히
// 배치해 한 화면에 더 많이 보이도록 한다 — 좁은 화면(모바일)에서는 세로로 쌓인다.
export function UserProfilePage({ mid, autoInvite, onClose, me, myUid, onOpenOpening, onOpenGame, onOpenGameAnalyze, onOpenPuzzle, mySolved, myLineSolves, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare }) {
  const [pub, setPub] = useState(null);
  const [pubUid, setPubUid] = useState(null);
  const [pubUsername, setPubUsername] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [statsView, setStatsView] = useState("oc");
  const [ccHeaderProf, setCcHeaderProf] = useState(null);
  const [reqState, setReqState] = useState(null); // null | "pending" | "accepted" | "exists"
  const [reqBusy, setReqBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  // (버그 수정, 사용자 요청) 초대 링크로 들어와 자동으로 친구 요청이 나갔을 때, 카드 안쪽의 작은
  // 문구(inviteMsg)만으로는 눈에 잘 안 띈다는 피드백 — 화면 위쪽에 잠깐 떴다 사라지는 팝업 알림도
  // 함께 띄운다("~님에게 친구 요청을 보냈습니다!"). 수동으로 "친구 요청" 버튼을 눌렀을 때도 같은
  // 팝업을 보여줘 두 경로의 피드백을 통일한다.
  const [reqPopup, setReqPopup] = useState("");
  useEffect(() => {
    if (!reqPopup) return;
    const t = setTimeout(() => setReqPopup(""), 2600);
    return () => clearTimeout(t);
  }, [reqPopup]);
  const wide = !useNarrow(880);
  const selPresence = usePresenceMap(pubUid ? [pubUid] : []);
  // (v0.6.0, 스토어 심사 대비) 프로필 신고·차단 — 채팅 밖에서도 사용자 콘텐츠(닉네임·사진·소개)를 신고하고 차단할 수 있어야 한다.
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [safetyMsg, setSafetyMsg] = useState("");
  useEffect(() => { if (!safetyMsg) return undefined; const t = setTimeout(() => setSafetyMsg(""), 2600); return () => clearTimeout(t); }, [safetyMsg]);
  useEffect(() => {
    if (!myUid || !pubUid || myUid === pubUid) { setBlockedByMe(false); return undefined; }
    let off = false;
    chatBlocksFetch(myUid).then((l) => { if (!off) setBlockedByMe(l.includes(pubUid)); });
    return () => { off = true; };
  }, [myUid, pubUid]);
  const setBlocked = async (on) => {
    const ok = await chatBlockSet(myUid, pubUid, on);
    if (ok) { setBlockedByMe(on); setSafetyMsg(on ? t("차단됨") : t("차단 해제됨")); } else setSafetyMsg(on ? t("차단 실패") : t("차단 해제 실패"));
    return ok;
  };
  const submitProfileReport = async (reason, detail, alsoBlock) => {
    const r = await userReport(pubUid, null, reason, detail);
    if (r.ok) { if (alsoBlock && !blockedByMe) await setBlocked(true); setSafetyMsg(t("신고 접수. 검토 후 조치")); }
    return r;
  };

  useEffect(() => {
    let cancelled = false;
    setPub(null); setPubUid(null); setPubUsername(null); setNotFound(false);
    setStatsView("oc"); setCcHeaderProf(null); setReqState(null); setInviteMsg("");
    userProfileByMid(mid).then((r) => {
      if (cancelled) return;
      if (!r) { setNotFound(true); return; }
      setPub(r.pub || {}); setPubUid(r.id); setPubUsername(r.username || "");
    });
    return () => { cancelled = true; };
  }, [mid]);
  useEffect(() => {
    let cancelled = false;
    const ccUsername = pub && pub.chesscom;
    if (!ccUsername) { setCcHeaderProf(null); return; }
    fetchChesscomProfile(ccUsername).then((p) => { if (!cancelled) setCcHeaderProf(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [pub && pub.chesscom]);
  // (버그 수정, 사용자 제보) reqState는 예전엔 이 화면에서 직접 요청을 보냈을 때(수동 버튼·자동
  // 초대)만 채워지고, 이미 친구이거나 이미 요청을 보내 둔 상대의 프로필을 열었을 때는 계속 null로
  // 남아 있어 "친구 요청" 버튼이 매번 다시 떴다 — friend_edges에서 나와 이 상대 사이의 기존 관계를
  // 조회해 초기값을 채운다. 사용자가 방금 이 화면에서 직접 요청을 보내 reqState가 이미 채워졌다면
  // (autoInvite 효과와의 경합) 덮어쓰지 않는다.
  useEffect(() => {
    if (!myUid || !pubUid || myUid === pubUid) return;
    let cancelled = false;
    friendEdges().then((edges) => {
      if (cancelled) return;
      const edge = edges.find((e) => (e.from_uid === myUid && e.to_uid === pubUid) || (e.from_uid === pubUid && e.to_uid === myUid));
      if (!edge) return;
      setReqState((prev) => (prev === null ? (edge.status === "accepted" ? "accepted" : "exists") : prev));
    });
    return () => { cancelled = true; };
  }, [myUid, pubUid]);
  // (기능) 초대 링크(?invite=friend)로 들어왔고, 로그인한 상태에서 상대 uid가 확인되면 한 번만
  // 자동으로 친구 요청을 보낸다 — 새로고침·재방문 시 매번 다시 보내지 않도록 mid가 바뀔 때만 다시 시도한다.
  const autoInviteTriedRef = useRef(null);
  useEffect(() => {
    if (!autoInvite || !me || !myUid || !pubUid || autoInviteTriedRef.current === mid) return;
    if (pubUid === myUid) return;
    autoInviteTriedRef.current = mid;
    (async () => {
      const r = await friendRequestByMid(mid);
      if (r && r.status === "blocked") { setInviteMsg(t("요청할 수 없는 사용자")); return; }
      if (r && r.ok) {
        const status = r.status === "accepted" ? "accepted" : (r.status === "exists" ? "exists" : "pending");
        const name = (pub && pub.nickname) || pubUsername || t("상대");
        setReqState(status);
        setInviteMsg(status === "accepted" ? t("친구 추가 완료") : status === "exists" ? t("이미 친구이거나 요청함") : t("친구 요청을 자동 발송"));
        if (status === "pending") { notifyCreate(pubUid, "friend_request", { fromUsername: me, fromUid: myUid }); setReqPopup(t("{0}님에게 친구 요청 발송", (name))); }
        else if (status === "accepted") { notifyCreate(pubUid, "friend_accepted", { byUsername: me }); notifyResolveFriendRequest(myUid, pubUid, "accepted"); setReqPopup(t("{0}님과 친구 추가 완료", (name))); }
      }
    })();
  }, [autoInvite, me, myUid, pubUid, mid]);
  const doReq = async () => {
    if (!me || reqBusy || !pubUid) return;
    setReqBusy(true);
    const r = await friendRequestByMid(mid);
    setReqBusy(false);
    if (r && r.status === "blocked") { setInviteMsg(t("요청할 수 없는 사용자")); return; }
    if (r && r.ok) {
      const status = r.status === "accepted" ? "accepted" : (r.status === "exists" ? "exists" : "pending");
      const name = (pub && pub.nickname) || pubUsername || t("상대");
      if (status === "pending") setReqPopup(t("{0}님에게 친구 요청 발송", (name)));
      else if (status === "accepted") setReqPopup(t("{0}님과 친구 추가 완료", (name)));
      setReqState(status);
      if (status === "pending") notifyCreate(pubUid, "friend_request", { fromUsername: me, fromUid: myUid });
      else if (status === "accepted") { notifyCreate(pubUid, "friend_accepted", { byUsername: me }); notifyResolveFriendRequest(myUid, pubUid, "accepted"); }
    }
  };
  const isSelf = !!(myUid && pubUid && myUid === pubUid);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.paper, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      {safetyMsg && <div role="status" style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 410, padding: "10px 16px", borderRadius: 12, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, border: "1px solid " + T.brass, fontSize: 12.5, fontWeight: 700 }}>{safetyMsg}</div>}
      <AnimatePresence>
        {reportOpen && <ReportSheet key="profile-report" targetName={(pub && pub.nickname) || pubUsername || t("사용자")} snippet={null} alreadyBlocked={blockedByMe} onSubmit={submitProfileReport} onClose={() => setReportOpen(false)} />}
      </AnimatePresence>
      {/* (사용자 요청) 친구 요청이 나갔을 때(초대 링크 자동 요청·수동 버튼 공통) 화면 위쪽에 잠깐
          떴다 사라지는 팝업 알림 — 카드 안쪽의 작은 inviteMsg 문구만으로는 눈에 잘 안 띈다는 피드백. */}
      <AnimatePresence>
        {reqPopup && (
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: 0.3, ease: MOTION_EASE }}
            style={{ position: "fixed", top: 16, left: "50%", x: "-50%", zIndex: 400, width: "calc(100% - 32px)", maxWidth: 340, pointerEvents: "none" }}>
            <div className="flex items-center gap-2" style={{ background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, padding: "12px 16px", borderRadius: 12, border: "1px solid " + T.brass, boxShadow: "0 10px 30px -8px rgba(0,0,0,.7)" }}>
              <span style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(196,154,80,.18)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><UserPlus size={17} style={{ color: T.brassHi }} /></span>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{reqPopup}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center justify-between" style={{ padding: "14px 16px", borderBottom: "1px solid #E4D5B6", position: "sticky", top: 0, background: T.paper, zIndex: 5 }}>
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label={t("뒤로")} className="press" style={{ width: 30, height: 30, borderRadius: 9, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={16} /></button>
          {/* (v0.6.1, 사용자 요청) "프로필" 글자 자리에 @아이디 — 카드 안의 @아이디 줄은 없앴다. */}
          <span style={{ fontSize: 15, fontWeight: 800, color: T.ink, fontFamily: SITE_FONT }}>{pub || pubUsername ? <>@{(pub && pub.displayId) || pubUsername}{roleIcon(pubUsername)}</> : t("프로필")}</span>
        </div>
        {/* (v0.6.1) 우상단 X 버튼은 없애고 그 자리를 점 3개 메뉴(신고·차단)로 — 내 프로필이면 자리만 비운다. */}
        {me && pubUid && !isSelf ? <UserSafetyMenu blocked={blockedByMe} onReport={() => setReportOpen(true)} onToggleBlock={() => setBlocked(!blockedByMe)} /> : <span style={{ width: 30 }} />}
      </div>
      <div style={{ maxWidth: wide ? 920 : 480, margin: "0 auto", padding: wide ? "26px 24px 60px" : "18px 16px 60px" }}>
        {notFound ? (
          <p style={{ fontSize: 13, color: T.inkSoft, textAlign: "center", padding: "40px 0" }}>{t("이 MID의 유저 없음")}</p>
        ) : !pub ? (
          <p style={{ fontSize: 12.5, color: T.inkSoft, textAlign: "center", padding: "40px 0" }}>{t("불러오는 중…")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: wide ? "row" : "column", gap: wide ? 84 : 0, alignItems: "flex-start" }}>
            {/* 왼쪽(데스크톱) / 상단(모바일) — 신원·MID·친구 요청. 처음 진입할 때 한 번, 왼쪽에서
                살짝 미끄러지며 나타난다(오른쪽 통계 열보다 살짝 먼저) — 페이지 전체가 한 번에
                뚝 나타나는 대신 두 축(신원 → 활동)이 순서대로 눈에 들어오게 한다. */}
            <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: MOTION_EASE }}
              style={{ width: wide ? 300 : "100%", flexShrink: 0, position: wide ? "sticky" : "static", top: wide ? 78 : undefined }}>
              <div className="flex items-center justify-end" style={{ marginBottom: 12 }}>
                {/* (사용자 요청, 재조정) /user 페이지 전용 토글 크기 — 이전 1.75배와 0.5배의 중간값. */}
                {statsViewToggle(statsView, setStatsView, 1.1)}
              </div>
              {/* (사용자 요청) 순위 배지는 삭제했다. */}
              {/* (사용자 요청) 신원 블록(사진+이름) 오른쪽에, 사진과 y좌표를 맞춰(alignItems:flex-start)
                  친구 요청 버튼 영역을 별도 칸으로 오른쪽 정렬한다. */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {statsView === "cc" && pub.chesscom ? (
                    <ChesscomHeaderIdentity ccHeaderProf={ccHeaderProf} fallbackUsername={pub.chesscom} noMargin />
                  ) : (
                    <div className="flex items-start gap-3">
                      {/* (버그 수정, 사용자 요청) MID를 사진과 무관하게 카드 하단에 "MID ABCDE1234"로 한
                          줄 따로 차지하던 것을, 프로필 사진 바로 아래에 "#ABCDE1234" 형태로 가운데 정렬해
                          붙였다 — 사진의 일부처럼 보이도록. */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                        {/* (사용자 요청) 지금 접속 중이면 아바타 테두리를 따라 은은하게 퍼지는 링을 계속
                            내보낸다 — 친구 로스터의 접속 표시와 같은 시각 언어(teal)를 프로필 히어로에도 이어,
                            "정적인 사진"이 아니라 "지금 여기 있는 사람"으로 느껴지게 한다. */}
                        {/* (버그 수정, 사용자 제보) 그랜드마스터 프로필(무지개 테두리)에서 이 링이 겹쳐
                            보일 때 한 바퀴가 끝나고 다음 바퀴가 시작되는 순간 부자연스럽게 깜빡였다 —
                            opacity가 [0.55, 0]으로 시작값이 0이 아니라, 매 반복 경계에서 0(이전 바퀴의
                            끝)에서 0.55(다음 바퀴의 시작)로 순간이동해 눈에 띄는 "팝"이 생겼다(v0.4.5
                            매칭 대기 화면 궤도 애니메이션과 같은 종류의 원인). opacity가 매 바퀴 시작과
                            끝 모두에서 0이 되도록(가운데서만 0.55까지 올라갔다 다시 0으로) 바꿔, 반복
                            경계가 항상 "안 보이는" 상태끼리 이어지게 했다 — 순간이동 자체는 여전히
                            있지만 그 순간 아무것도 안 보이므로 체감상 끊김이 사라진다. */}
                        {!!selPresence[pubUid] && (Date.now() - selPresence[pubUid]) < ONLINE_WINDOW_MS && (
                          <motion.span
                            animate={{ scale: [1, 1.14, 1.28], opacity: [0, 0.55, 0] }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", times: [0, 0.35, 1] }}
                            style={{ position: "absolute", inset: -3, borderRadius: 18, border: "2px solid " + T.brilliant, pointerEvents: "none" }}
                          />
                        )}
                        {pub.photo ? <img src={pub.photo} alt="" style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover", border: "1px solid #C9B58C", ...(gmPhotoRingStyle(tierFromXp(pub.xp || 0).tier.key === "grandmaster") || {}) }} />
                          : <span style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 26 }}>{(pub.nickname || pubUsername || "?")[0].toUpperCase()}</span>}
                        <OnlineDot lastSeenMs={selPresence[pubUid]} overlay size={13} />
                      </span>
                      {!!mid && <div style={{ fontSize: 9.5, fontWeight: 700, color: T.inkSoft, fontFamily: "ui-monospace,monospace", marginTop: 4 }}>#{mid}</div>}
                      </div>
                      {/* (사용자 요청) 이름이 항상 고정된 y좌표에 오도록 — 소개(bio)가 없어도 그 자리를
                          그대로 비워 둔다(항상 렌더링하되 내용만 비게 두면 아래 presence 줄이 끌려
                          올라오지 않는다). */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{pub.nickname || pub.displayId || pubUsername}</div>
                        <div style={{ fontSize: 12, color: T.ink, marginTop: 5, minHeight: 15 }}>{pub.bio ? <UgcText text={pub.bio} kind="bio" inline render={(shown, tg) => <>{tg}{shown}</>} /> : ""}</div>
                        {presenceLabel(selPresence[pubUid]) && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>OpenChess {presenceLabel(selPresence[pubUid])}</div>}
                      </div>
                    </div>
                  )}
                </div>
                {/* (버그 수정, 사용자 제보) 이 칸이 flexShrink:0 + 내부 문구들이 전부 whiteSpace:nowrap
                    이라, "이미 친구이거나 요청 중입니다"처럼 긴 문구가 뜨면 그 문구의 전체 폭만큼
                    이 칸이 넓어지면서 flex:1인 왼쪽 신원 블록을 그만큼 눌러 이름·소개가 부자연스럽게
                    줄바꿈되곤 했다 — 이 칸에 항상 같은 최대 폭을 주고, 그 폭 안에서는 문구가 줄바꿈
                    되도록(whiteSpace:nowrap 제거) 바꿔 어떤 상태가 떠도 옆 블록을 밀어내지 않는다. */}
                <div style={{ flexShrink: 0, maxWidth: 132, textAlign: "right" }}>
                  {!isSelf && (
                    me ? (
                      reqState === "accepted" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: T.ink }}><UserCheck size={14} style={{ flexShrink: 0 }} /></span>
                        : reqState === "pending" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}><Clock size={14} style={{ flexShrink: 0 }} /></span>
                          : reqState === "exists" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}><UserCheck size={14} style={{ flexShrink: 0 }} /></span>
                            : <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} onClick={doReq} disabled={reqBusy} aria-label={t("친구 요청")} title={t("친구 요청")} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, border: "none", cursor: reqBusy ? "default" : "pointer", opacity: reqBusy ? 0.6 : 1, fontSize: 12.5, whiteSpace: "nowrap" }}><UserPlus size={14} /></motion.button>
                    ) : null
                  )}
                </div>
              </div>
              {inviteMsg && <div style={{ fontSize: 11.5, fontWeight: 700, color: T.best, marginBottom: 10, padding: "7px 10px", borderRadius: 8, background: "rgba(120,200,120,.15)", border: "1px solid rgba(120,200,120,.4)" }}>{inviteMsg}</div>}
              {/* (사용자 요청) 데스크톱 레이아웃에서는 티어·퍼즐 레이팅을 오른쪽 통계 열(토글에 따라
                  바뀌는 패널)이 아니라 이 왼쪽 열, 유저 정보 바로 아래에 항상 표시한다 — 오른쪽
                  패널(ProfileStatsPanel)에는 hideTierRow로 같은 내용이 중복 렌더링되지 않게 한다. */}
              {/* (사용자 요청) 티어·퍼즐 레이팅은 OpenChess 통계에서만, chess.com 통계에서는 그 자리에
                  대신 래피드/블리츠/불릿 레이팅을 보여준다. */}
              {wide && (statsView === "oc" ? <TierRatingRow pub={pub} /> : <ChesscomRatingRow ccHeaderProf={ccHeaderProf} />)}
            </motion.div>
            {/* 오른쪽(데스크톱) / 하단(모바일) — 통계·활동. 왼쪽 열보다 살짝 늦게, 아래에서 위로
                떠오르며 들어온다 — "신원을 먼저 확인하고, 그 사람의 활동이 뒤이어 펼쳐진다"는 순서. */}
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08, ease: MOTION_EASE }}
              style={{ flex: 1, minWidth: 0, width: "100%" }}>
              {/* (사용자 요청) OC/Chess.com 통계 토글이 뚝 바뀌는 대신 부드럽게 크로스페이드된다. */}
              <AnimatePresence mode="wait">
                <motion.div key={statsView} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: MOTION_EASE }}>
                  <ProfileStatsPanel pub={pub} statsView={statsView} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} onOpenPuzzle={onOpenPuzzle} hideTierRow={wide} mySolved={mySolved} myLineSolves={myLineSolves} ownerUid={pubUid} viewerUid={myUid} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
// (v0.4.3 기능, 사용자 요청) 친구에게 대국을 신청하면(pvp_invite_friend) 같은 내용을 채팅에도
// 남긴다 — 전역 알람 박스(GlobalPvpInviteBanner)와 같은 디자인의 카드로, 상대(받은 쪽)는 여기서
// 바로 수락/거절할 수 있고 보낸 쪽은 취소할 수 있다. 초대 상태는 이 메시지 행이 아니라 매번
// pvp_invites를 다시 읽어(+실시간 구독) 확인하므로, 전역 알람 박스에서 먼저 응답해도 여기 카드가
// 곧바로 같이 갱신된다.
function PvpInviteChatCard({ msg, mine, otherUsername, otherPhoto, onAccepted }) {
  const [inv, setInv] = useState(null);
  const load = useCallback(async () => {
    try { const rows = await sbSelect("pvp_invites?id=eq." + msg.pvp_invite_id + "&select=*"); setInv((rows && rows[0]) || null); } catch { }
  }, [msg.pvp_invite_id]);
  useEffect(() => { load(); }, [load]);
  useRealtimeTable("pvp_invites", "id=eq." + msg.pvp_invite_id, (payload) => { if (payload && payload.new) setInv(payload.new); else load(); }, true, 8000);
  const respond = async (accept) => {
    try {
      const r = await sbRpc("pvp_invite_respond", { p_invite_id: msg.pvp_invite_id, p_accept: accept });
      if (r) setInv(r);
      if (accept && r && r.game_id && onAccepted) {
        const rows = await sbSelect("pvp_games?id=eq." + r.game_id + "&select=*");
        if (rows && rows[0]) onAccepted(rows[0]);
      }
    } catch { }
  };
  const cancel = async () => {
    try { await sbRpc("pvp_invite_cancel", { p_invite_id: msg.pvp_invite_id }); setInv((c) => (c ? { ...c, status: "cancelled" } : c)); } catch { }
  };
  const status = inv ? inv.status : "pending";
  // (v0.5.7) 미니게임 대결 신청이면 게임 이름을 보여 주고, 수락된 뒤 대전이 아직 진행 중이면 양쪽 모두 "입장하기"로 곧장 들어간다
  // (예전엔 "PLAY 탭에서 확인하세요" 안내뿐이라, 채팅에서 신청한 사람은 스스로 찾아 들어가야 했다).
  const special = inv ? PLAY_SPECIAL_GAMES.find((g) => g.gameType === inv.game_type) : null;
  // (v0.5.7, 사용자 요청 "미니게임 도전장도 일반 도전장과 똑같은 디자인") 제목 한 줄은 같은 틀로 두고, 무엇을 하는지는 그 아래 한 줄로 —
  // 체스는 시간 제한, 미니게임은 게임 이름. 게임 이름을 제목에 넣으면 줄이 바뀌어 카드 모양이 달라졌다.
  const what = special ? t("실시간 대결") : t("실시간 대국");
  const detail = !inv ? "" : special ? special.name : (() => { const tc = timeControlFromKey(inv.time_control); return tc.label + (tc.cat ? " · " + tcCatLabel(tc.cat) : ""); })();
  const [liveGame, setLiveGame] = useState(null);
  const gameId = inv && inv.status === "accepted" ? inv.game_id : null;
  useEffect(() => {
    if (gameId == null) { setLiveGame(null); return; }
    let off = false;
    sbSelect("pvp_games?id=eq." + gameId + "&select=*").then((rows) => { if (!off) setLiveGame((rows && rows[0]) || null); }).catch(() => { });
    return () => { off = true; };
  }, [gameId]);
  const canEnter = !!(liveGame && liveGame.status === "active" && onAccepted);
  // 보낸 사람이 이 카드를 보고 있는 동안 상대가 수락하면(대기 중 → 수락을 이 화면에서 직접 본 경우만) 곧장 입장한다 —
  // 친구 로스터에서 보낸 도전장이 수락되면 바로 대전이 열리는 것과 같게. 예전에 이미 수락된 카드는 저절로 열리지 않는다.
  const sawPendingRef = useRef(false), autoEnteredRef = useRef(false);
  useEffect(() => { if (inv && inv.status === "pending") sawPendingRef.current = true; }, [inv]);
  useEffect(() => {
    if (mine && canEnter && sawPendingRef.current && !autoEnteredRef.current) { autoEnteredRef.current = true; onAccepted(liveGame); }
  }, [mine, canEnter, liveGame, onAccepted]);
  // (사용자 요청) 실시간 대국 신청 카드도 일반 메시지처럼 보낸 사람 기준으로 좌/우 정렬하고, 누가
  // 보냈는지가 문장 앞머리에서 바로 드러나도록 한다 — 내가 보냈으면 "OO님에게", 상대가 보냈으면 "OO님이".
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div style={{ width: 240, padding: "11px 13px", borderRadius: 12, background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid " + T.brass, boxShadow: "0 8px 20px -8px rgba(0,0,0,.5)" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 9 }}>
          {otherPhoto ? <img src={otherPhoto} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            : <span style={{ width: 26, height: 26, borderRadius: "50%", background: T.brass, color: "#241509", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{(otherUsername || "?")[0].toUpperCase()}</span>}
          <div style={{ minWidth: 0, fontSize: 12, fontWeight: 800, color: T.ivoryHi }}>
            {mine ? t("{0}님에게 {1} 신청함", (otherUsername), what) : t("{0}님이 {1} 신청함", (otherUsername), what)}
            <span style={{ display: "block", minHeight: 14, fontSize: 10.5, fontWeight: 700, color: "rgba(244,238,226,.6)", marginTop: 2 }}>{detail}</span>
          </div>
        </div>
        {status === "pending" ? (
          mine ? (
            <button onClick={cancel} className="press" style={{ width: "100%", padding: "7px 0", borderRadius: 8, border: "1px solid #C9B58C", background: "transparent", color: T.ivoryHi, fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}>{t("취소")}</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => respond(true)} className="press" style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}>{t("수락")}</button>
              <button onClick={() => respond(false)} className="press" style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid #C9B58C", background: "transparent", color: T.ivoryHi, fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}>{t("거절")}</button>
            </div>
          )
        ) : (
          canEnter ? (
            <button onClick={() => onAccepted(liveGame)} className="press" style={{ width: "100%", padding: "7px 0", borderRadius: 8, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}>{t("수락됨. 입장하기")}</button>
          ) : (
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(244,238,226,.65)" }}>
              {status === "accepted" ? (liveGame ? (special ? t("대결 종료됨") : t("대국 종료됨")) : t("수락됨")) : status === "declined" ? t("거절됨") : t("취소됨")}
            </div>
          )
        )}
      </div>
    </div>
  );
}
// 블라인드 대국 상태(blindMoveToken·deriveBlindGame)는 src/lib/chatCommands.js로 옮겼다(v0.5.7 — 검사 스크립트가 직접 부르도록).
// (v0.5.7, 사용자 요청) 블라인드 대국에서 실제 수로 인식된 메시지 — 일반 말풍선과 구분되게, 백의 수는 크림색·흑의 수는 갈색 판에
// 금색 글씨로 그리고, 움직인 기물(SAN 첫 글자, 캐슬링은 킹) 아이콘을 앞에 붙인다. 어느 말풍선이 수인지는 deriveBlindGame.moveColors가 정한다.
const BLIND_MOVE_STYLE = {
  w: { bg: "linear-gradient(180deg,#FCF6E8,#EEDFBE)", border: "#D6BC85", text: "#86601D", shadow: "0 2px 6px -2px rgba(120,86,30,.35)", glyph: "drop-shadow(0 0 .6px #86601D) drop-shadow(0 0 .6px #86601D)" },
  b: { bg: "linear-gradient(180deg,#4A2F1C,#27170B)", border: "#8A6530", text: T.brassHi, shadow: "0 2px 8px -2px rgba(0,0,0,.5)", glyph: "drop-shadow(0 0 .6px " + T.brassHi + ") drop-shadow(0 0 .6px " + T.brassHi + ")" },
};
function BlindMoveBubble({ body, color }) {
  const st = BLIND_MOVE_STYLE[color] || BLIND_MOVE_STYLE.w;
  const s = (body || "").trim();
  const pm = /^(\d+\.(?:\.\.)?)\s*(.*)$/.exec(s);
  const prefix = pm ? pm[1] : "", san = pm ? pm[2] : s;
  const pieceType = /^O-O/.test(san) ? "K" : /^[KQRBN]/.test(san) ? san[0] : "P";
  return (
    <span aria-label={t("{0}의 수 {1}", (color === "w" ? t("백") : t("흑")), s)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px 5px 7px", borderRadius: 12, background: st.bg, border: "1px solid " + st.border, boxShadow: st.shadow, color: st.text, fontWeight: 800, fontSize: 14, lineHeight: 1.2, letterSpacing: ".01em", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
      <span style={{ display: "inline-flex", width: 20, height: 20, flexShrink: 0, filter: st.glyph }}><PieceGlyph type={pieceType} color={color} size={20} /></span>
      <span><span style={{ opacity: .62, fontWeight: 700, fontSize: 12 }}>{prefix}</span>{san}</span>
    </span>
  );
}
// /eval 명령어 표시 형식 — 예: "+0.31(depth=25)", 메이트는 "#3(depth=25)"/"-#3(depth=25)".
function formatBlindEval(ev) {
  if (!ev) return t("분석 중…");
  const depth = ev.depth != null ? ev.depth : "?";
  if (ev.mate != null) return (ev.mate > 0 ? "#" : "-#") + Math.abs(ev.mate) + "(depth=" + depth + ")";
  const cp = ev.cp || 0;
  return (cp >= 0 ? "+" : "") + (cp / 100).toFixed(2) + "(depth=" + depth + ")";
}
function ChatPanel({ myUid, myUsername, otherUid, otherUsername, otherPhoto, onBack, onOpenSharedPuzzle, onOpenSharedReview, onOpenSharedReviewOnBoard, onAcceptPvpInvite, onOpenUserProfile, fillNarrow, onOpenBoardFen, onOpenBoardSans, myLegacies, myIsGM, myChesscomGames, mySolved, myLineSolves, solveCounts, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare, engine }) {
  // (UI) 사용자 요청 — 채팅에 공유된 퍼즐 블록도 퍼즐 탭(PuzzleCard)과 완전히 같은 UI를 쓴다.
  // puzzlePreviews에 담긴 pz는 puzzles.data(전체 퍼즐 레코드, id 포함)라 PuzzleCard가 그대로 쓸 수
  // 있고, 좋아요·리포스트·공유·풀이수는 전역 상태(위 props)에서 puzzle_no로 바로 조회한다.
  const chatPuzzleCardProps = (no, pz) => ({
    isSolved: mySolved && pz ? mySolved.has(pz.id) : false,
    solvedTags: myLineSolves && pz ? myLineSolves[pz.id] : null,
    friendSolverNames: null,
    solveCount: Math.max((solveCounts && solveCounts[no]) || 0, (mySolved && pz && mySolved.has(pz.id)) ? 1 : 0),
    isLiked: likedPuzzles && pz ? likedPuzzles.has(pz.id) : false,
    likeCount: (likeCounts && likeCounts[no]) || 0,
    onToggleLike: onToggleLike && pz ? () => onToggleLike(pz.id) : undefined,
    isReposted: repostedPuzzles && pz ? repostedPuzzles.has(pz.id) : false,
    repostCount: (repostCounts && repostCounts[no]) || 0,
    onToggleRepost: onToggleRepost && pz ? () => onToggleRepost(pz.id) : undefined,
    shareCount: (shareCounts && shareCounts[no]) || 0,
    onShare: onShare && pz ? () => onShare(pz) : undefined,
  });
  // (사용자 요청) 모바일 전체 화면 모드(ChatsModal이 narrow일 때만 fillNarrow=true로 넘겨준다)에서는
  // 메시지 목록이 고정 320px가 아니라 남은 세로 공간을 채우도록(flex:1) 바꾼다 — 이 루트가 height:100%로
  // 늘어나려면 부모도 그만큼의 높이를 flex로 마련해 둬야 하므로, 그런 부모를 보장하지 않는 다른
  // 호출부(FriendsModal의 미니 채팅 뷰 등)는 이 prop을 넘기지 않아 기존 고정 높이 레이아웃을 그대로 쓴다.
  const narrow = fillNarrow;
  const otherPresence = usePresenceMap(otherUid ? [otherUid] : []);
  const [msgs, setMsgs] = useState([]);
  // ---- (v0.5.7 기능, 사용자 요청 "채팅을 실제 SNS 수준으로") 채팅 강화 — src/components/chatPlus.jsx·src/lib/chatApi.js ----
  const [reactions, setReactions] = useState({});   // messageId -> [{uid, emoji}]
  const [pollVotes, setPollVotes] = useState({});   // messageId -> [{uid, san}]
  const [replyTo, setReplyTo] = useState(null);     // 답장할 메시지
  const [searchOpen, setSearchOpen] = useState(false);
  const [reportFor, setReportFor] = useState(null); // { msg } | { msg: null } — 신고 시트
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pickSheet, setPickSheet] = useState(null); // "poll" | "cobo" | null
  const [coboMsg, setCoboMsg] = useState(null);     // 열려 있는 같이 보기 보드
  const [hasOlder, setHasOlder] = useState(false);  // 서버에 더 이전 메시지가 있는지
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [flashId, setFlashId] = useState(null);     // 답장 인용·검색으로 이동한 메시지 잠깐 강조
  const [notice, setNotice] = useState("");         // "복사했어요" 같은 잠깐 뜨는 안내
  const [helpOpen, setHelpOpen] = useState(false);  // (v0.5.7) /help — 보내지 않고 나에게만 보이는 명령어 카드
  const [cmdIdx, setCmdIdx] = useState(0);          // (v0.5.7) 명령어 자동완성에서 고른 줄
  const noticeTimerRef = useRef(null);
  const showNotice = useCallback((t) => { setNotice(t); clearTimeout(noticeTimerRef.current); noticeTimerRef.current = setTimeout(() => setNotice(""), 1600); }, []);
  const scrollModeRef = useRef("bottom");           // 다음 목록 변화 때 스크롤 처리: "bottom" | { keepFrom: 이전 scrollHeight } | { jumpTo: id }
  const nameOf = useCallback((uid) => (uid === myUid ? (myUsername || t("나")) : otherUsername), [myUid, myUsername, otherUsername]);
  // (v0.4.8 기능) 지금 이 대화의 블라인드 대국 상태 — deriveBlindGame 참고(대화 기록 자체가 유일한
  // 진실 공급원이라 서버에 별도로 저장하지 않는다).
  const blindGame = useMemo(() => deriveBlindGame(msgs), [msgs]);
  // (v0.4.8 기능) 블라인드 대국이 진행 중인 동안 지금 포지션을 depth를 계속 높여가며 백그라운드로
  // 분석해 둔다(학습 탭 FEN 모드 실시간 평가와 같은 패턴 — 전용 워커 풀에서 movetime을 점점 늘려가며
  // 반복 호출해 Stockfish의 progressive depth를 그대로 흘려보낸다) — /eval 명령어는 매번 새로
  // 계산을 시작하는 대신, 그 순간까지 이렇게 미리 계산해 둔 값을 그대로 보여준다. state로 두면 매
  // depth 갱신마다 리렌더가 일어나므로(화면에 실시간으로 보여줄 필요는 없다, /eval을 직접 칠 때만
  // 필요) ref로만 들고 있는다.
  const blindEvalRef = useRef(null);
  useEffect(() => {
    blindEvalRef.current = null;
    if (!blindGame.active || !engine || engine.status !== "ready") return;
    let cancelled = false;
    const sans = blindGame.sans;
    const fen = sansToFen(sans);
    const sideMult = sans.length % 2 === 0 ? 1 : -1; // 항상 백 관점(+가 백에게 유리)으로 보여준다.
    const onLines = (raw) => {
      if (cancelled || !raw || !raw[0]) return;
      const top = raw[0];
      if (top.cp == null && top.mate == null) return;
      const prev = blindEvalRef.current;
      if (top.depth != null && prev && prev.depth != null && top.depth < prev.depth) return;
      blindEvalRef.current = { cp: top.cp != null ? top.cp * sideMult : null, mate: top.mate != null ? top.mate * sideMult : null, depth: top.depth };
    };
    (async () => {
      try {
        const pool = await getAnalysisPool(engine.profile, engine.urls);
        const w = poolWorker(pool, 0, engine);
        let mt = 700;
        for (let i = 0; i < 100 && !cancelled; i++) {
          const pvs = await w.evaluateMulti(fen, MAX_SEARCH_DEPTH, 1, mt, onLines, "blind-eval");
          if (cancelled) return;
          onLines(pvs);
          mt = Math.min(mt * 2, 8000);
        }
      } catch { }
    })();
    return () => { cancelled = true; };
  }, [blindGame.active, blindGame.sans.join(" "), engine && engine.status, engine && engine.profile]);
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  // (사용자 요청) 이모티콘 박스가 이제 뷰포트 전체 폭을 채우는 position:fixed라, 이 채팅 패널
  // 자체가 화면 어디에 떠 있든(데스크톱 플로팅 카드 포함) 이모티콘 버튼 바로 위에 딱 붙도록 그
  // 버튼의 실제 화면 좌표를 열 때 한 번 재서 bottom 값을 넘긴다.
  const pickerAnchorRef = useRef(null);
  const [pickerPos, setPickerPos] = useState(null);
  const togglePicker = () => {
    setPickerOpen((v) => {
      const next = !v;
      if (next && pickerAnchorRef.current) {
        const rect = pickerAnchorRef.current.getBoundingClientRect();
        setPickerPos({ bottom: window.innerHeight - rect.top + 8 });
      }
      return next;
    });
  };
  const [sending, setSending] = useState(false);
  // (v0.2.7 버그 수정) "/puzzle 000000" 명령어가 존재하지 않는 번호를 그대로 공유 카드로 보내버려,
  // 받는 쪽에는 빈/깨진 미리보기만 남는 문제가 있었다 — 전송 전 그 번호가 실제로 존재하는지 확인해,
  // 없으면 전송 자체를 막고 이 메시지로 알려준다.
  const [cmdError, setCmdError] = useState("");
  // (v0.1.4 기능) 수정 중인 메시지 id — 설정돼 있으면 입력창은 그 메시지 본문을 수정하는 모드로 동작.
  const [editingId, setEditingId] = useState(null);
  // (v0.1.4 기능) 꾹 눌러 연 수정/삭제(또는 전달/삭제) 메뉴가 떠 있는 메시지 id.
  const [menuFor, setMenuFor] = useState(null);
  // (v0.3.4 UX) 메뉴는 항상 말풍선이 없는 쪽 여백(대화창 중앙 쪽)에 세로 중앙 정렬로 뜬다 — 이
  // dx/dy는 그 "자연 위치"가 화면(또는 목록 상자) 가장자리를 벗어날 때만 안쪽으로 당기는 보정값.
  const [menuDx, setMenuDx] = useState(0);
  const [menuDy, setMenuDy] = useState(0);
  // (v0.1.4 기능) 퍼즐 카드의 "전달" 버튼으로 다른 친구에게 다시 공유할 때 띄우는 시트의 대상 퍼즐.
  const [forwardTarget, setForwardTarget] = useState(null);
  // (v0.2.6 기능 → v0.4.4 개편) 프로필 사진·멘션을 누르면 이제 로컬 모달 대신, App 루트가 넘겨준
  // onOpenUserProfile(username)로 openchess.kr/user/<MID> 프로필 페이지를 연다.
  const setViewProfile = (username) => onOpenUserProfile && onOpenUserProfile(username);
  // (v0.1.0) 퍼즐 공유 카드 미리보기 — puzzle_no가 설정된 메시지가 보이면 그 번호의 퍼즐 데이터를
  // 지연 조회해 캐싱한다(no -> 퍼즐 데이터 | null(찾을 수 없음), 아직 없으면 로딩 중으로 취급).
  const [puzzlePreviews, setPuzzlePreviews] = useState({});
  useEffect(() => {
    const nos = [...new Set(msgs.filter((m) => m.puzzle_no != null).map((m) => m.puzzle_no))].filter((no) => !(no in puzzlePreviews));
    if (!nos.length) return;
    let cancelled = false;
    (async () => {
      const fetched = await Promise.all(nos.map((no) => puzzleFetch(no)));
      if (cancelled) return;
      // (사용자 요청) 찾을 수 없거나(fetch 결과 없음) 라인이 하나도 없어 풀 수 없는(손상된) 퍼즐
      // 공유 카드는 대화 기록에서 자동으로 지운다 — 내가 보낸 메시지는 실제로 삭제하고(그 메시지의
      // 삭제 권한은 보낸 사람 본인에게만 있으므로, chat_messages RLS "chat delete own"), 상대가
      // 보낸 메시지는 서버에서 지울 권한이 없어 이 대화창에서만 조용히 숨긴다(둘 다 화면에는 안
      // 보이게 되는 결과는 같다).
      const broken = new Set();
      nos.forEach((no, i) => { if (!fetched[i] || !isPuzzlePlayable(fetched[i])) broken.add(no); });
      if (broken.size) {
        const brokenMsgs = msgs.filter((m) => m.puzzle_no != null && broken.has(m.puzzle_no));
        setMsgs((prev) => prev.filter((m) => !(m.puzzle_no != null && broken.has(m.puzzle_no))));
        brokenMsgs.filter((m) => m.from_uid === myUid).forEach((m) => { chatDeleteMessage(m.id).catch(() => {}); });
      }
      if (cancelled) return;
      setPuzzlePreviews((prev) => { const n = { ...prev }; nos.forEach((no, i) => { n[no] = (fetched[i] && isPuzzlePlayable(fetched[i])) ? fetched[i] : null; }); return n; });
    })();
    return () => { cancelled = true; };
  }, [msgs]);
  // (사용자 요청) 유산 공유 카드 미리보기 — legacy_slot이 설정된 메시지가 보이면, 보낸 사람(from_uid,
  // 즉 그 유산의 주인)의 공개 프로필에서 그 슬롯을 지연 조회해 캐싱한다(키: "uid|slot" ->
  // {entry,typeInfo} | null(그 사이 삭제·교체돼 더 이상 없음), 아직 없으면 로딩 중으로 취급) — 퍼즐과
  // 달리 유산은 번호별 전역 저장소가 없어, 매번 그 사람의 "지금" 프로필을 그대로 읽어와 보여준다.
  const [legacyPreviews, setLegacyPreviews] = useState({});
  useEffect(() => {
    const keys = [...new Set(msgs.filter((m) => m.legacy_slot != null).map((m) => m.from_uid + "|" + m.legacy_slot))].filter((k) => !(k in legacyPreviews));
    if (!keys.length) return;
    let cancelled = false;
    (async () => {
      const fromUids = [...new Set(keys.map((k) => k.split("|")[0]))];
      const profiles = await usersProfiles(fromUids);
      if (cancelled) return;
      setLegacyPreviews((prev) => {
        const n = { ...prev };
        keys.forEach((k) => {
          const [fu, slot] = k.split("|");
          const pub = (profiles[fu] && profiles[fu].pub) || {};
          const entry = pub.legacies && pub.legacies[slot];
          const typeInfo = LEGACY_TYPES.find((t) => t.key === legacyBaseKey(slot));
          n[k] = (entry && typeInfo) ? { entry, typeInfo } : null;
        });
        return n;
      });
    })();
    return () => { cancelled = true; };
  }, [msgs]);
  // (v0.3.4 기능) 사용자 요청 — 리뷰 공유 카드 미리보기. review_id는 reviewGameIdentifier가 만든 딥링크
  // 식별자 자체라(resolveReviewIdentifier의 역변환) FEN·PGN 리뷰는 그 자리에서 바로 복원되고,
  // chess.com 리뷰만 reviewedGameFetch로 서버 캐시(reviewed_games)를 한 번 더 조회한다(보낸 사람이
  // 그 대국을 이미 한 번 열어 캐시에 업로드해 뒀을 것이라 가정 — 실패하면 카드가 "볼 수 없음"으로
  // 표시된다).
  const [reviewPreviews, setReviewPreviews] = useState({});
  useEffect(() => {
    const ids = [...new Set(msgs.filter((m) => m.review_id != null).map((m) => m.review_id))].filter((id) => !(id in reviewPreviews));
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(ids.map((id) => resolveReviewIdentifier(id)));
      if (cancelled) return;
      const withGames = await Promise.all(resolved.map(async (r) => {
        if (!r) return null;
        if (r.kind === "chesscom") { const g = await reviewedGameFetch(r.ccId); return g ? { game: g } : null; }
        return { game: r.game };
      }));
      if (cancelled) return;
      setReviewPreviews((prev) => {
        const n = { ...prev };
        ids.forEach((id, i) => {
          const w = withGames[i];
          if (!w) { n[id] = null; return; }
          const g = w.game;
          const hasPD = !!(g.white || g.black || g.color);
          const label = hasPD ? (reviewPlayerInfo(g, "w").name + " vs " + reviewPlayerInfo(g, "b").name) : (g.fenRoot && (!g.sans || !g.sans.length) ? t("FEN 포지션 분석") : t("PGN 대국 리뷰"));
          n[id] = { game: g, label };
        });
        return n;
      });
    })();
    return () => { cancelled = true; };
  }, [msgs]);
  // (사용자 요청) 유산 공유 카드의 "유산 보기"로 열어 둔 재생 화면 대상.
  const [viewLegacy, setViewLegacy] = useState(null);
  // (18차 보충 UX7) 인스타그램식 홀드-드래그 — 메시지를 좌우로 밀면 생긴 공간에 보낸 시각을 표시(내용은 유지).
  const [drag, setDrag] = useState(null);       // { id, dx }
  const dragRef = useRef(null);                  // { id, startX, mine }
  // (v0.1.4 기능) 꾹 누르기(long-press) 판정 — 드래그와 같은 down/move/up 핸들러를 공유하되, 큰 이동이
  // 없이 일정 시간 눌려 있으면 수정/삭제(또는 전달/삭제) 메뉴를 연다.
  const longPressTimerRef = useRef(null);
  const listRef = useRef(null);
  const clearedBeforeRef = useRef(null);
  const load = useCallback(async () => {
    const [rows, clearedBefore] = await Promise.all([chatFetchPage(myUid, otherUid), chatConvPrefGet(myUid, otherUid)]);
    clearedBeforeRef.current = clearedBefore;
    // (v0.3.4 기능) ChatsModal 목록을 거치지 않고 곧장 이 대화가 열리는 경로(예: 친구 프로필에서
    // 채팅 시작)에서도 "나에게서만 삭제" 워터마크가 똑같이 적용되도록 여기서도 걸러낸다.
    const visible = clearedBefore ? rows.filter((m) => new Date(m.created_at) > new Date(clearedBefore)) : rows;
    // (v0.5.7) 최신 페이지만 다시 받으므로, 위로 스크롤해 불러 둔 더 이전 메시지(이번 페이지의 가장 오래된 것보다 앞선 것)는 그대로 둔다.
    const full = rows.length >= CHAT_PAGE;
    setMsgs((prev) => {
      if (!full || !visible.length) return visible;
      const oldest = visible[0].created_at, ids = new Set(visible.map((m) => m.id));
      return [...prev.filter((m) => m.created_at < oldest && !ids.has(m.id)), ...visible];
    });
    setHasOlder((h) => h || (full && visible.length === rows.length));
    const unread = visible.filter((m) => m.to_uid === myUid && !m.read);
    if (unread.length) chatMarkRead(unread);
  }, [myUid, otherUid]);
  useEffect(() => { load(); }, [load]);
  // (v0.0.5 성능) 3초 폴링 대신 이 대화(나↔상대) 관련 chat_messages 변경(새 메시지 수신·읽음 표시)을
  // Realtime으로 즉시 반영 — 안전망으로 1분 간격 재조회만 남긴다. postgres_changes 필터는 단일 컬럼
  // 비교만 지원해 "나에게 온 메시지"/"내가 보낸 메시지의 읽음 갱신"을 각각 구독해야 한다.
  const onRt = useCallback((payload) => {
    const row = payload && (payload.new || payload.old);
    if (row && row.from_uid !== otherUid && row.to_uid !== otherUid) return; // 이 대화 상대 관련 변경이 아니면 무시
    load();
  }, [load, otherUid]);
  useRealtimeTable("chat_messages", myUid ? "to_uid=eq." + myUid : null, onRt, !!(myUid && otherUid), 60000);
  useRealtimeTable("chat_messages", myUid ? "from_uid=eq." + myUid : null, onRt, !!(myUid && otherUid), 60000);
  // (v0.5.7) 위로 스크롤하면 이전 페이지(CHAT_PAGE개)를 앞에 붙인다 — 스크롤 위치는 보던 메시지 그대로.
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasOlder || !msgs.length) return [];
    setLoadingOlder(true);
    const rows = await chatFetchPage(myUid, otherUid, msgs[0].created_at);
    const cb = clearedBeforeRef.current;
    const visible = cb ? rows.filter((m) => new Date(m.created_at) > new Date(cb)) : rows;
    if (listRef.current) scrollModeRef.current = { keepFrom: listRef.current.scrollHeight - listRef.current.scrollTop };
    setMsgs((prev) => { const ids = new Set(prev.map((m) => m.id)); return [...visible.filter((m) => !ids.has(m.id)), ...prev]; });
    setHasOlder(rows.length >= CHAT_PAGE && visible.length === rows.length);
    setLoadingOlder(false);
    return visible;
  }, [loadingOlder, hasOlder, msgs, myUid, otherUid]);
  const onListScroll = (e) => { if (e.currentTarget.scrollTop < 60 && hasOlder && !loadingOlder) loadOlder(); };
  // 답장 인용·검색 결과로 원문 메시지까지 이동 — 아직 안 불러온 옛 메시지면 거기까지 이전 페이지를 이어서 불러온다.
  const jumpTo = useCallback(async (id, createdAt) => {
    if (id == null) return;
    let have = msgs.some((m) => m.id === id);
    let guard = 0, oldest = msgs.length ? msgs[0].created_at : null, more = hasOlder;
    const extra = [];
    while (!have && more && oldest && (!createdAt || createdAt < oldest) && guard++ < 10) {
      const rows = await chatFetchPage(myUid, otherUid, oldest);
      extra.unshift(...rows);
      have = rows.some((m) => m.id === id);
      more = rows.length >= CHAT_PAGE;
      oldest = rows.length ? rows[0].created_at : null;
    }
    if (extra.length) { setMsgs((prev) => { const ids = new Set(prev.map((m) => m.id)); return [...extra.filter((m) => !ids.has(m.id)), ...prev]; }); setHasOlder(more); }
    if (!have) { showNotice(t("원문 메시지 없음")); return; }
    scrollModeRef.current = { jumpTo: id };
    setFlashId(id); setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1800);
    if (!extra.length) { const el = document.getElementById("chatmsg-" + id); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" }); scrollModeRef.current = "bottom"; }
  }, [msgs, hasOlder, myUid, otherUid, showNotice]);
  const msgIdsKey = msgs.map((m) => m.id).join(",");
  // (v0.5.7) 답장 인용의 원문이 아직 안 불러온 옛 메시지면 그것만 따로 받아 둔다(id -> 메시지).
  const [replyCache, setReplyCache] = useState({});
  useEffect(() => {
    const have = new Set(msgs.map((m) => m.id));
    const need = [...new Set(msgs.map((m) => m.reply_to).filter((id) => id != null && !have.has(id) && !(id in replyCache)))];
    if (!need.length) return undefined;
    let off = false;
    chatFetchByIds(need).then((rows) => {
      if (off) return;
      setReplyCache((prev) => { const n = { ...prev }; need.forEach((id) => { n[id] = rows.find((r) => r.id === id) || null; }); return n; });
    });
    return () => { off = true; };
  }, [msgIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const replyTargetOf = (id) => msgs.find((x) => x.id === id) || replyCache[id] || null;
  // (v0.5.7) 반응·투표 — 보이는 메시지의 것을 모아 받는다. 상대가 새로 단 것은 Realtime(상대 uid 필터)으로, 내 것은 바로 로컬 반영.
  const pollIdsKey = msgs.filter((m) => m.poll).map((m) => m.id).join(",");
  const loadReactions = useCallback(async () => {
    const ids = msgs.map((m) => m.id);
    const [rx, pv] = await Promise.all([chatReactionsFetch(ids), chatPollVotesFetch(msgs.filter((m) => m.poll).map((m) => m.id))]);
    setReactions(rx); setPollVotes(pv);
  }, [msgIdsKey, pollIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (msgs.length) loadReactions(); }, [loadReactions]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtimeTable("chat_reactions", otherUid ? "uid=eq." + otherUid : null, () => loadReactions(), !!(myUid && otherUid), 0);
  useRealtimeTable("chat_poll_votes", otherUid ? "uid=eq." + otherUid : null, () => loadReactions(), !!(myUid && otherUid), 0);
  const toggleReaction = async (m, emoji, on) => {
    setMenuFor(null);
    setReactions((prev) => {
      const list = (prev[m.id] || []).filter((r) => !(r.uid === myUid && r.emoji === emoji));
      return { ...prev, [m.id]: on ? [...list, { uid: myUid, emoji }] : list };
    });
    const ok = await chatReactToggle(m.id, myUid, emoji, on);
    if (!ok) { showNotice(t("반응 등록 실패")); loadReactions(); }
  };
  const castVote = async (m, san) => {
    setPollVotes((prev) => ({ ...prev, [m.id]: [...(prev[m.id] || []).filter((v) => v.uid !== myUid), { uid: myUid, san }] }));
    const ok = await chatPollVote(m.id, myUid, san);
    if (!ok) { showNotice(t("투표 실패")); loadReactions(); }
  };
  // (v0.5.7) 차단 — 내가 이 상대를 차단했는지. 차단하면 입력창 대신 안내가 뜨고, 서버도 양쪽 전송을 막는다.
  useEffect(() => { let off = false; chatBlocksFetch(myUid).then((l) => { if (!off) setBlockedByMe(l.includes(otherUid)); }); return () => { off = true; }; }, [myUid, otherUid]);
  const setBlocked = async (on) => {
    const ok = await chatBlockSet(myUid, otherUid, on);
    if (ok) { setBlockedByMe(on); showNotice(on ? t("{0}님 차단됨", (otherUsername)) : t("차단 해제됨")); }
    else showNotice(on ? t("차단 실패") : t("차단 해제 실패"));
    return ok;
  };
  const submitReport = async (reason, detail, alsoBlock) => {
    const target = reportFor && reportFor.msg;
    const r = await userReport(otherUid, target ? target.id : null, reason, detail);
    if (r.ok) { if (alsoBlock && !blockedByMe) await setBlocked(true); showNotice(t("신고 접수. 검토 후 조치")); }
    return r;
  };
  // (v0.5.7) 수 투표 엔진 정답 — 앱의 분석 엔진으로 그 포지션의 최선의 수를 찾는다(최대 약 2.5초).
  const engineBest = useCallback(async (root) => {
    if (!engine || engine.status !== "ready") return null;
    try {
      const pool = await getAnalysisPool(engine.profile, engine.urls);
      const w = poolWorker(pool, 0, engine);
      const fen = fenOfRoot(root, []);
      const pvs = await w.evaluateMulti(fen, MAX_SEARCH_DEPTH, 1, 2500, () => {}, "chat-poll");
      const top = pvs && pvs[0];
      if (!top || !top.pv || !top.pv.length || (top.cp == null && top.mate == null)) return null;
      const san = pvUciToSans([], top.pv, 1, root)[0];
      const sign = root.turn === "w" ? 1 : -1;
      const evalTxt = top.mate != null ? "#" + (top.mate * sign > 0 ? "" : "-") + Math.abs(top.mate) : ((top.cp * sign) / 100 > 0 ? "+" : "") + ((top.cp * sign) / 100).toFixed(2);
      return san ? { san, evalTxt } : null;
    } catch { return null; }
  }, [engine]);
  // (v0.1.4 기능) 실시간 타이핑 표시 — DB에 쓰지 않는 Supabase Realtime broadcast 채널을 대화 상대와
  // 공유(두 uid를 정렬해 채널명을 고정)해, 입력창에 글자를 칠 때마다 가벼운 "타이핑 중" 신호만 주고받는다.
  // self: false라 내가 보낸 신호는 내게 되돌아오지 않으므로, 이 채널에서 받는 이벤트는 항상 상대방 것이다.
  const [otherTyping, setOtherTyping] = useState(false);
  const typingChanRef = useRef(null);
  const typingHideRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  useEffect(() => {
    if (!sbClient || !myUid || !otherUid) return;
    const chanName = "typing:" + [myUid, otherUid].sort().join(":");
    const channel = sbClient.channel(chanName, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "typing" }, () => {
      setOtherTyping(true);
      clearTimeout(typingHideRef.current);
      typingHideRef.current = setTimeout(() => setOtherTyping(false), 2500);
    }).subscribe();
    typingChanRef.current = channel;
    return () => { sbClient.removeChannel(channel); typingChanRef.current = null; clearTimeout(typingHideRef.current); setOtherTyping(false); };
  }, [myUid, otherUid]);
  // (v0.5.7) 목록이 바뀌면 보통은 맨 아래로 — 이전 메시지를 앞에 붙였을 땐 보던 자리를 지키고, 원문으로 이동할 땐 그 메시지로.
  useLayoutEffect(() => {
    const el = listRef.current; if (!el) return;
    const mode = scrollModeRef.current;
    scrollModeRef.current = "bottom";
    if (mode && mode.keepFrom != null) { el.scrollTop = el.scrollHeight - mode.keepFrom; return; }
    if (mode && mode.jumpTo != null) { const t = document.getElementById("chatmsg-" + mode.jumpTo); if (t) { t.scrollIntoView({ block: "center" }); return; } }
    el.scrollTop = el.scrollHeight;
  }, [msgs.length, otherTyping]);
  // (v0.1.4 기능) 메시지 바깥을 클릭/터치하면 열려 있던 수정/삭제 메뉴를 닫는다(NotificationBell과 동일 패턴).
  useEffect(() => {
    if (menuFor == null) return;
    const close = () => setMenuFor(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); };
  }, [menuFor]);
  const onTextChange = (e) => {
    const v = e.target.value;
    setText(v);
    if (cmdError) setCmdError("");
    if (helpOpen && v.startsWith("/")) setHelpOpen(false); // 새 명령어를 치기 시작하면 도움말 대신 자동완성이 뜬다
    if (!typingChanRef.current || editingId != null) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now;
      typingChanRef.current.send({ type: "broadcast", event: "typing", payload: { uid: myUid } });
    }
  };
  // (v0.5.7, 사용자 요청 "명령어 체계 정리") 보내기 — "/…"는 src/lib/chatCommands.js의 parseChatCommand 하나로 해석한다(목록·자동완성과
  // 같은 표). 명령어가 아니면 블라인드 대국 수인지 보고, 그것도 아니면 평범한 메시지(답장 포함)로 보낸다.
  const failMsg = t("전송 실패. 잠시 후 다시 시도");
  const finish = (ok, err) => { if (ok) { setText(""); setReplyTo(null); load(); } else if (err) setCmdError(err); };
  const send = async (body, emoji) => {
    if (sending) return;
    if (editingId != null) {
      if (!body) return;
      setCmdError("");
      setSending(true);
      const ok = await chatEditMessage(editingId, body);
      setSending(false);
      if (ok) { setEditingId(null); setText(""); load(); }
      else setCmdError(t("메시지 수정 실패. 잠시 후 다시 시도"));
      return;
    }
    if (!body && !emoji) return;
    const cmd = body ? parseChatCommand(body, { blindActive: blindGame.active }) : null;
    if (cmd && cmd.error) { setCmdError(cmd.error); return; }
    setCmdError("");
    const nameFor = (uid) => uid === myUid ? (myUsername || t("나")) : otherUsername;
    if (cmd) {
      switch (cmd.name) {
        // /help는 보내지 않고 입력창 위 도움말 카드로만(사용자 결정 — 상대 채팅 기록에 남지 않게).
        case "help": setHelpOpen(true); setText(""); return;
        // (v0.5.7, 사용자 결정) 블라인드 대국은 /blind로 명시적으로 준비한다 — 그 뒤 첫 "1.xx" 수가 대국을 시작한다(deriveBlindGame).
        case "blind": {
          setSending(true);
          const ok = await chatSend(myUid, otherUid, "/blind", null);
          if (ok) await chatSend(myUid, otherUid, "블라인드 대국 준비 완료. 백을 맡은 사람이 \"1.e4\"처럼 첫 수를 보내면 시작", null);
          setSending(false); finish(ok, failMsg); return;
        }
        case "resign": {
          setSending(true);
          const ok = await chatSend(myUid, otherUid, "/resign", null);
          if (ok) await chatSend(myUid, otherUid, nameFor(myUid) + "님 기권 " + nameFor(otherUid) + "님 승리", null);
          setSending(false); finish(ok, t("명령어 처리 실패. 잠시 후 다시 시도")); return;
        }
        case "draw": {
          // (버그 수정, 사용자 제보) /draw는 상대의 동의가 있어야 끝난다 — 내가 이미 제안했으면 중복이라 막고, 상대가 먼저
          // 제안해 둔 상태에서 내가 보내면 그게 동의라 대국이 끝난다.
          if (blindGame.drawOfferUid === myUid) { setCmdError(t("이미 무승부 제안 중. 상대 응답 대기")); return; }
          setSending(true);
          const isAccepting = blindGame.drawOfferUid === otherUid;
          const ok = await chatSend(myUid, otherUid, "/draw", null);
          if (ok) await chatSend(myUid, otherUid, isAccepting ? "합의 무승부로 대국 종료" : nameFor(myUid) + "님이 무승부 제안. /draw로 동의하면 대국 종료", null);
          setSending(false); finish(ok, t("명령어 처리 실패. 잠시 후 다시 시도")); return;
        }
        case "eval": {
          setSending(true);
          const ok = await chatSend(myUid, otherUid, formatBlindEval(blindEvalRef.current), null);
          setSending(false); finish(ok, t("명령어 처리 실패. 잠시 후 다시 시도")); return;
        }
        case "puzzle": {
          // (v0.2.7 버그 수정) 존재하지 않는 퍼즐 번호는 공유 카드로 보낼 수 없다 — 서버에 실제로 있는지 먼저 확인한다.
          setSending(true);
          const data = puzzlePreviews[cmd.no] !== undefined ? puzzlePreviews[cmd.no] : await puzzleFetch(cmd.no);
          if (!data) { setSending(false); setCmdError(t("#{0} 번호의 퍼즐 없음. 전송 불가", cmd.no)); return; }
          const ok = await puzzleShareSend(cmd.no, myUid, otherUid);
          setSending(false); finish(ok, t("퍼즐 전송 실패. 잠시 후 다시 시도")); return;
        }
        case "legacy": {
          const slotKey = LEGACY_SLOT_ORDER[cmd.slot - 1];
          if (cmd.slot >= 4 && !myIsGM) { setCmdError(t("추가 유산은 그랜드마스터 티어부터 설정 가능")); return; }
          if (!myLegacies || !myLegacies[slotKey]) { setCmdError(t("#{0}번 유산 미등록", cmd.slot)); return; }
          setSending(true);
          const ok = await legacyShareSend(myUid, otherUid, slotKey);
          setSending(false); finish(ok, t("유산 전송 실패. 잠시 후 다시 시도")); return;
        }
        case "review": {
          // 코드가 실제로 재생 가능한지(sanSequenceValid)부터 확인하고 보낸다 — 틀린 /review는 평범한 텍스트로 흘려보내지 않는다(사용자 요청).
          let game = null;
          if (cmd.kind === "recent") {
            if (!myChesscomGames || !myChesscomGames.length) { setCmdError(t("연동된 chess.com 계정의 최근 대국 없음")); return; }
            const g = [...myChesscomGames].sort((x, y) => (y.endTime || 0) - (x.endTime || 0))[0];
            game = { sans: g.moves, color: g.color, result: g.result, rating: g.rating, timeClass: g.timeClass, opening: g.opening, endTime: g.endTime, white: g.white, black: g.black, id: g.id };
          } else if (cmd.kind === "pgn") {
            const fenTagMatch = /\[FEN\s+"([^"]+)"\]/.exec(cmd.code);
            const fenRoot = fenTagMatch ? parseFenFull(fenTagMatch[1]) : null;
            const sans = parsePgnSans(cmd.code);
            if ((fenTagMatch && !fenRoot) || !sans.length || !sanSequenceValid(sans, fenRoot)) { setCmdError(t("유효하지 않은 PGN 코드. 사용법: /review pgn <코드>")); return; }
            game = { sans, fenRoot: fenTagMatch ? fenTagMatch[1] : null };
          } else {
            if (!looksLikeFen(cmd.code) || !parseFenFull(cmd.code)) { setCmdError(t("유효하지 않은 FEN 코드. 사용법: /review fen <코드>")); return; }
            game = { sans: [], fenRoot: cmd.code };
          }
          setSending(true);
          const rid = await reviewGameIdentifier(game);
          if (!rid) { setSending(false); setCmdError(t("유효하지 않은 코드")); return; }
          if (game.id) reviewedGameShare(game.id, game).catch(() => { });
          const ok = await reviewShareSend(myUid, otherUid, rid);
          setSending(false); finish(ok, t("리뷰 전송 실패. 잠시 후 다시 시도")); return;
        }
        case "play": {
          // (v0.5.7, 사용자 요청) 미니게임 대결 — 친구 로스터의 도전장과 같은 RPC(p_game_type만 다름)라, 수락되면 두 사람 모두 그 미니게임 대전으로 들어간다.
          if (cmd.gameType) {
            setSending(true);
            try { await sbRpc("pvp_invite_friend", { p_to_uid: otherUid, p_time_control: "0-0", p_game_type: cmd.gameType }); finish(true); }
            catch (e) { setCmdError(inviteFailText(e, t("대결"))); }
            setSending(false); return;
          }
          const tc = parsePlayCommandArg(cmd.arg);
          if (!tc) { setCmdError(t("시간은 1~180분, 증가는 0~180초예요. 사용법: /play <분>[+<초>]")); return; }
          // 채팅을 보낼 수 있다는 건 이미 accepted 친구라는 뜻이라 pvp_invite_friend의 친구 검사도 통과한다. RPC가 카드 메시지를 함께 남긴다.
          setSending(true);
          try { await sbRpc("pvp_invite_friend", { p_to_uid: otherUid, p_time_control: tc.key, p_game_type: PVP_GAME_TYPE }); finish(true); }
          catch (e) { setCmdError(inviteFailText(e, t("대국"))); }
          setSending(false); return;
        }
        case "poll": case "board": {
          // FEN을 비우면 포지션 고르기 창(+ 메뉴와 같은 창)을 연다.
          if (!cmd.fen) { setText(""); setPickSheet(cmd.name === "poll" ? "poll" : "cobo"); return; }
          if (!parseFenFull(cmd.fen)) { setCmdError(t("FEN을 읽을 수 없어요. 사용법: {0}", cmd.name === "poll" ? "/poll [FEN]" : "/board [FEN]")); return; }
          setText("");
          await sendSpecial(cmd.name === "poll" ? { poll: { fen: cmd.fen } } : { cobo: { fen: cmd.fen, sans: [] } });
          return;
        }
        default: break;
      }
    }
    // 블라인드 대국의 수 — 준비(/blind)된 상태면 첫 "1.xx"가 대국을 시작하고, 진행 중이면 다음 차례 접두사+SAN만 수로 인식한다.
    if (body && !blindGame.active && blindGame.armed) {
      const startTok = blindMoveToken(body, 0);
      if (startTok && sanSrc(startBoard(), startTok, "w")) {
        setSending(true);
        const ok = await chatSend(myUid, otherUid, body, null);
        if (ok) await chatSend(myUid, otherUid, "블라인드 대국 시작", null);
        setSending(false); finish(ok, failMsg); return;
      }
    }
    if (body && blindGame.active) {
      const ply = blindGame.sans.length;
      const mvTok = blindMoveToken(body, ply);
      if (mvTok) {
        const color = ply % 2 === 0 ? "w" : "b";
        const board = boardFromSans(blindGame.sans);
        if (sanSrc(board, mvTok, color)) {
          const whiteUid = blindGame.whiteFromUid, blackUid = whiteUid === myUid ? otherUid : myUid;
          // (버그 수정, 사용자 제보) 상대가 둘 차례면 보내도 수로 인식되지 않으므로 미리 막고 안내한다.
          if ((color === "w" ? whiteUid : blackUid) !== myUid) { setCmdError(t("상대가 응수할 차례")); return; }
          setSending(true);
          const ok = await chatSend(myUid, otherUid, body, null);
          if (ok) {
            const end = gameEndState([...blindGame.sans, mvTok]).end;
            finish(true);
            if (end === "checkmate") await chatSend(myUid, otherUid, "체크메이트. " + nameFor(myUid) + "님 승리", null);
            else if (end === "stalemate") await chatSend(myUid, otherUid, "스테일메이트로 무승부", null);
            else if (end === "threefold") await chatSend(myUid, otherUid, "3회 동형 반복으로 무승부", null);
          } else setCmdError(failMsg);
          setSending(false); return;
        }
      }
    }
    setSending(true);
    // (v0.5.7) 답장 중이면 원문 id를 함께 보낸다(일반 텍스트·이모티콘만).
    const ok = await chatSendMessage(myUid, otherUid, body, emoji, replyTo ? { reply_to: replyTo.id } : null);
    setSending(false);
    if (ok) { setText(""); setReplyTo(null); load(); }
    else setCmdError(blockedByMe ? t("차단한 사용자에게는 메시지 전송 불가") : t("전송 실패. 상대가 대화를 막았거나 연결이 불안정"));
  };
  // (v0.5.7) 수 투표·같이 보기 카드 보내기
  const sendSpecial = async (extra) => {
    setPickSheet(null); setCmdError("");
    const ok = await chatSendMessage(myUid, otherUid, null, null, extra);
    if (ok) load(); else setCmdError(t("전송 실패. 잠시 후 다시 시도"));
  };
  // (v0.5.7) 명령어 자동완성 — 이름을 치는 중이면 후보 목록, 이름 뒤 공백까지 쳤으면 쓰는 법 힌트.
  const cmdSugg = useMemo(() => chatCommandSuggestions(text, { blindActive: blindGame.active }), [text, blindGame.active]);
  useEffect(() => { setCmdIdx(0); }, [cmdSugg.mode, cmdSugg.items.length]);
  const pickCommand = (c) => {
    // 인자가 없는 명령어는 이름만 채워 바로 보낼 수 있게, 인자가 있으면 이름 뒤 공백까지 채워 힌트로 넘어간다.
    const noArg = !/[<[]/.test(c.usage);
    setText("/" + c.name + (noArg ? "" : " "));
    setCmdError("");
  };
  const onInputKeyDown = (e) => {
    const listOpen = cmdSugg.mode === "list" && cmdSugg.items.length > 0;
    if (listOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setCmdIdx((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + cmdSugg.items.length) % cmdSugg.items.length);
      return;
    }
    if (listOpen && e.key === "Escape") { e.preventDefault(); setText(""); return; }
    if (helpOpen && e.key === "Escape") { e.preventDefault(); setHelpOpen(false); return; }
    // 이름을 다 치지 않았으면 Tab·Enter는 고른 명령어로 채우기 — 이름을 정확히 다 친 인자 없는 명령어(/help 등)는 Enter로 바로 보낸다.
    if (listOpen && (e.key === "Tab" || (e.key === "Enter" && !cmdSugg.exact))) {
      e.preventDefault();
      pickCommand(cmdSugg.items[Math.min(cmdIdx, cmdSugg.items.length - 1)]);
      return;
    }
    if (e.key === "Enter") send(text.trim(), null);
  };
  const startEdit = (m) => { setMenuFor(null); setEditingId(m.id); setText(m.body || ""); };
  const cancelEdit = () => { setEditingId(null); setText(""); };
  // (v0.3.4 버그 수정) 예전엔 삭제 버튼을 누르면 곧장 목록에서 지우고, 서버 삭제가 실패했을 때만
  // load()로 되돌렸다 — 실패해도 에러 표시가 전혀 없어 메시지가 잠깐 사라졌다 되돌아오는 것으로만
  // 보였고("삭제가 안 된다"는 체감), 성공 여부와 무관하게 항상 낙관적으로 지워지다 보니 실제 실패
  // 원인(권한 없음 등)을 알 방법이 없었다. 서버 확인 후에만 목록에서 지우고, 실패하면 이유를
  // 알 수 있도록 명확한 에러 문구를 띄운다.
  const doDelete = async (m) => {
    setMenuFor(null);
    setCmdError("");
    const ok = await chatDeleteMessage(m.id);
    if (ok) setMsgs((prev) => prev.filter((x) => x.id !== m.id));
    else setCmdError(t("메시지 삭제 실패. 잠시 후 다시 시도"));
  };
  // (v0.3.4 버그 수정) 메시지끼리 간격이 좁아(6px) 위/아래로 여는 메뉴(34px)가 항상 이웃 메시지와
  // 겹쳤다 — 메뉴를 말풍선 위/아래가 아니라 말풍선이 없는 쪽 여백(대화창 중앙 쪽, 내 메시지는
  // 왼쪽·상대 메시지는 오른쪽)에 그 메시지 높이만큼 세로 중앙 정렬로 띄운다. 그 여백엔 다른 말풍선이
  // 없으므로 구조적으로 겹칠 일이 없다. dx/dy는 이 "자연 위치"가 실제로 잘리는 경계(listRef, 없으면
  // window) 밖으로 나갈 때만(화면이 아주 좁거나 말풍선이 거의 꽉 찼을 때) 안쪽으로 당기는 보정값.
  const MSG_MENU_W = 110, MSG_MENU_H = 36;
  // (v0.5.7) 텍스트·이모티콘 메시지는 반응 줄이 있는 큰 메뉴(ChatMsgMenu, 약 214×220)라 크기를 따로 넘긴다.
  const openMsgMenu = (id, anchorEl, mine, w = MSG_MENU_W, h = MSG_MENU_H) => {
    setMenuFor(id);
    const bounds = listRef.current ? listRef.current.getBoundingClientRect() : undefined;
    const { dx, dy } = sideBubbleAnchor(anchorEl.getBoundingClientRect(), w, h, mine, 8, bounds);
    setMenuDx(dx); setMenuDy(dy);
  };
  // (v0.6.1, 사용자 요청) 채팅에 보이는 모든 요소(말풍선·카드·시스템 알림)에 반응을 달 수 있게 한다 — 각 종류의 렌더(renderMsg)는 그대로 두고, 이 래퍼가
  // ① 더블클릭(터치는 빠른 두 번 탭)하면 하트 반응(이미 눌러 둔 하트는 다시 더블클릭하면 해제) ② 반응 칩을 말풍선 바로 아래에 붙여 표시 ③ 자체 메뉴가 없는 카드(대국 신청·명령어 카드·보상 알림)는
  // 우클릭·꾹 누르기로 반응 메뉴를 연다. 반응 칩과 메뉴의 반응 줄은 모든 종류가 같은 toggleReaction을 쓴다.
  const heartGuardRef = useRef({ id: null, t: 0 });
  const lastTapRef = useRef({ id: null, t: 0 });
  const tapMovedRef = useRef(false);
  const [heartPop, setHeartPop] = useState(null); // { id, k }
  const heartMsg = (m) => {
    const now = Date.now();
    if (heartGuardRef.current.id === m.id && now - heartGuardRef.current.t < 600) return; // 더블클릭 + 터치 탭이 한 번에 두 번 불리는 것 방지
    heartGuardRef.current = { id: m.id, t: now };
    // (v0.6.2, 사용자 요청) 이미 내가 하트를 눌러 둔 요소를 다시 더블클릭하면 하트가 사라진다(토글) — 팝 애니메이션은 켤 때만.
    if ((reactions[m.id] || []).some((r) => r.uid === myUid && r.emoji === "❤️")) { toggleReaction(m, "❤️", false); return; }
    setHeartPop({ id: m.id, k: now });
    setTimeout(() => setHeartPop((p) => (p && p.k === now ? null : p)), 900);
    toggleReaction(m, "❤️", true);
  };
  const wrapMsg = (m, el) => {
    const mine = m.from_uid === myUid;
    const rx = reactions[m.id];
    const generic = m.pvp_invite_id != null || !!m.share_reward || !!(m.body && /^\/help$/i.test(m.body.trim()));
    const myReacts = new Set((rx || []).filter((r) => r.uid === myUid).map((r) => r.emoji));
    const textInput = (e) => e.target && e.target.closest && e.target.closest("input, textarea");
    const handlers = {
      onDoubleClick: (e) => { if (!textInput(e)) heartMsg(m); },
      onTouchStart: (e) => {
        tapMovedRef.current = false;
        if (generic) { const anchor = e.currentTarget; clearTimeout(longPressTimerRef.current); longPressTimerRef.current = setTimeout(() => openMsgMenu(m.id, anchor, mine, CHAT_MENU_W, 60), 520); }
      },
      onTouchMove: () => { tapMovedRef.current = true; if (generic) clearTimeout(longPressTimerRef.current); },
      onTouchEnd: (e) => {
        if (generic) clearTimeout(longPressTimerRef.current);
        if (tapMovedRef.current || textInput(e)) return;
        const now = Date.now();
        if (lastTapRef.current.id === m.id && now - lastTapRef.current.t < 320) { lastTapRef.current = { id: null, t: 0 }; heartMsg(m); }
        else lastTapRef.current = { id: m.id, t: now };
      },
    };
    if (generic) handlers.onContextMenu = (e) => { e.preventDefault(); openMsgMenu(m.id, e.currentTarget, mine, CHAT_MENU_W, 60); };
    return (
      <div key={m.id} {...handlers} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 6 }}>
        {el}
        {generic && menuFor === m.id && (
          <ChatMsgMenu style={{ [mine ? "right" : "left"]: 8, top: 0, transform: "none" }} myReacts={myReacts}
            onReact={(emoji) => toggleReaction(m, emoji, !myReacts.has(emoji))} />
        )}
        <AnimatePresence>
          {heartPop && heartPop.id === m.id && (
            <motion.span key={heartPop.k} aria-hidden="true" initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.35, 1.1, 1.5], y: [0, 0, -4, -14] }} transition={{ duration: 0.85, times: [0, 0.25, 0.6, 1] }}
              style={{ position: "absolute", left: "50%", top: "42%", marginLeft: -15, fontSize: 30, lineHeight: 1, zIndex: 40, pointerEvents: "none", filter: "drop-shadow(0 2px 4px rgba(120,20,20,.35))" }}>❤️</motion.span>
          )}
        </AnimatePresence>
        {/* 반응 칩 — 말풍선 아래에 바짝 붙여(겹쳐) 표시한다. 상대 말풍선은 프로필 사진 폭만큼 들여 쓴다. */}
        {rx && rx.length > 0 && (
          <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", paddingLeft: mine ? 0 : 26 + 6 + 6, paddingRight: mine ? 6 : 0, marginTop: -13, position: "relative", zIndex: 2 }}>
            <ReactionChips list={rx} myUid={myUid} align={mine ? "flex-end" : "flex-start"} dense onToggle={(emoji, on) => toggleReaction(m, emoji, on)} />
          </div>
        )}
      </div>
    );
  };
  const renderMsg = (m, i) => {
          const mine = m.from_uid === myUid;
          // (v0.4.3 기능) 실시간 대국 신청 카드 — pvp_invite_friend가 함께 남긴 메시지.
          if (m.pvp_invite_id != null) {
            return <div key={m.id}><PvpInviteChatCard msg={m} mine={mine} otherUsername={otherUsername} otherPhoto={otherPhoto} onAccepted={onAcceptPvpInvite} /></div>;
          }
          // (사용자 요청) "/help"를 실제로 보내면(위 send()) 입력창 위 임시 미리보기 대신 대화
          // 기록에 명령어 목록 카드로 남는다 — 다른 명령어(퍼즐·유산·리뷰 공유, 대국 신청)와 같은
          // 패턴으로, 보낸 사람 기준 좌/우 정렬만 되고 텍스트 말풍선은 아니다.
          if (m.body && /^\/help$/i.test(m.body.trim())) {
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div style={{ width: 260, padding: "10px 13px", borderRadius: 12, background: "#fff", border: "1px solid #E4D5B6" }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: T.brass, marginBottom: 4 }}>{t("사용 가능한 명령어")}</div>
                  {CHAT_CMD_LIST.map((c) => (
                    <div key={c.name} style={{ fontSize: 11, color: T.ink, fontWeight: 600, marginTop: 1 }}><b style={{ fontFamily: SITE_FONT }}>{c.usage}</b> <span style={{ color: T.inkSoft }}>{c.desc}</span></div>
                  ))}
                </div>
              </div>
            );
          }
          // (v0.1.0) 공유 보상 시스템 메시지 — 릴스 댓글창의 "선물" 알림처럼 좌우 정렬 없이 가운데 배지로 표시.
          // from_uid=이 메시지를 발생시킨 쪽(퍼즐을 푼 사람), to_uid=XP를 받은 쪽(공유한 사람) — 어느
          // 쪽에서 보든 뜻이 분명하도록 누가 풀었고 누가 받았는지를 매번 명시한다.
          if (m.share_reward) {
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: "center" }}>
                <div className="flex items-center gap-1" style={{ padding: "5px 10px", borderRadius: 999, background: "rgba(196,154,80,.18)", border: "1px solid " + T.brass, color: T.brass, fontSize: 10.5, fontWeight: 800, textAlign: "center" }}>
                  <Sparkles size={11} />
                  {mine
                    ? t("{0}님이 공유한 퍼즐을 풀어서 {1}님에게 XP +{2} 선물", (otherUsername), otherUsername, m.share_reward.amount)
                    : t("{0}님이 내가 공유한 퍼즐을 풀어서 XP +{1} 획득", (otherUsername), m.share_reward.amount)}
                </div>
              </div>
            );
          }
          // (사용자 요청) 유산 공유 카드 — 보낸 사람의 유산(등급 배지+새겨진 수) 미리보기 + "유산 보기"
          // 버튼. 퍼즐 카드와 같은 패턴(당겨서 시각 확인 + 꾹 누르기/오른쪽 클릭으로 삭제 메뉴, 내가
          // 보낸 것만)을 따른다 — 다만 유산은 "전달"(다시 공유) 대신 삭제만 지원한다.
          if (m.legacy_slot != null) {
            const key = m.from_uid + "|" + m.legacy_slot;
            const lp = legacyPreviews[key]; // undefined=로딩중, null=찾을 수 없음, {entry,typeInfo}
            const dx = drag && drag.id === m.id ? drag.dx : 0;
            const d = new Date(m.created_at);
            const hh = d.getHours(); const ampm = hh < 12 ? "AM" : "PM"; const h12 = String(hh % 12 === 0 ? 12 : hh % 12).padStart(2, "0");
            const timeTxt = String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0") + " " + ampm + " " + h12 + ":" + String(d.getMinutes()).padStart(2, "0");
            const onDown = (e) => {
              dragRef.current = { id: m.id, startX: e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0, mine };
              {
                clearTimeout(longPressTimerRef.current);
                const anchorEl = e.currentTarget;
                longPressTimerRef.current = setTimeout(() => {
                  openMsgMenu(m.id, anchorEl, mine, CHAT_MENU_W, 60);
                  dragRef.current = null; setDrag(null);
                }, 480);
              }
            };
            const onMove = (e) => {
              if (!dragRef.current || dragRef.current.id !== m.id) return;
              const x = e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0;
              let d2 = x - dragRef.current.startX;
              if (Math.abs(d2) > 6) clearTimeout(longPressTimerRef.current);
              d2 = mine ? Math.max(-96, Math.min(0, d2)) : Math.min(96, Math.max(0, d2));
              setDrag({ id: m.id, dx: d2 });
            };
            const onUp = () => { clearTimeout(longPressTimerRef.current); dragRef.current = null; setDrag(null); };
            const onContext = (e) => { e.preventDefault(); clearTimeout(longPressTimerRef.current); dragRef.current = null; setDrag(null); openMsgMenu(m.id, e.currentTarget, mine, CHAT_MENU_W, 60); };
            const showAvatar = !mine && (i === 0 || msgs[i - 1].from_uid !== m.from_uid);
            return (
              <div key={m.id} className="flex items-end" style={{ justifyContent: mine ? "flex-end" : "flex-start", gap: 6, position: "relative" }}>
                {!mine && (showAvatar
                  ? <button onClick={() => setViewProfile(otherUsername)} className="press" aria-label={t("프로필 보기")} style={{ flexShrink: 0, padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                      {otherPhoto ? <img src={otherPhoto} alt="" style={{ width: 26, height: 26, borderRadius: 8, objectFit: "cover", border: "1px solid #C9B58C" }} />
                        : <span style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11 }}>{(otherUsername || "?")[0].toUpperCase()}</span>}
                    </button>
                  : <div style={{ width: 26, flexShrink: 0 }} />)}
                <div style={{ display: "flex", flexDirection: "column", flex: "0 1 auto", position: "relative" }}
                  onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                  onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} onContextMenu={onContext}>
                {Math.abs(dx) > 6 && <span style={{ position: "absolute", [mine ? "right" : "left"]: 2, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 700, fontFamily: SITE_FONT, color: T.inkSoft, whiteSpace: "nowrap", pointerEvents: "none" }}>{timeTxt}</span>}
                {menuFor === m.id && (
                  <ChatMsgMenu style={{ [mine ? "right" : "left"]: "calc(100% + 8px)", top: "50%", transform: "translate(" + menuDx + "px, calc(-50% + " + menuDy + "px))" }}
                    myReacts={new Set((reactions[m.id] || []).filter((r) => r.uid === myUid).map((r) => r.emoji))}
                    onReact={(emoji) => toggleReaction(m, emoji, !(reactions[m.id] || []).some((r) => r.uid === myUid && r.emoji === emoji))}
                    onDelete={mine ? () => doDelete(m) : null} />
                )}
                <div style={{ position: "relative", transform: "translateX(" + dx + "px)", transition: dx === 0 ? "transform .18s ease" : "none", touchAction: "pan-y" }}>
                  {/* (v0.3.4 UI) 프로필 카드의 유산 타일(LegacyStoneTile)과 정확히 같은 디자인으로 통일 —
                      예전엔 채팅 전용으로 따로 만든 원형 배지+텍스트 카드였다. 고정 픽셀 크기(size)로
                      재사용하고, 편집·공유 아이콘은 넘기지 않아 "보기 전용"이 된다(누르면 그대로 재생). */}
                  <div style={{ width: 150, userSelect: "none", WebkitUserSelect: "none" }}>
                    {lp === undefined ? <div style={{ width: 150, aspectRatio: "1 / 1", boxSizing: "border-box", borderRadius: 14, border: "1.5px solid " + T.brass, background: "linear-gradient(155deg, " + T.ebony3 + " 0%, " + T.ebony2 + " 55%, " + T.ebony + " 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.ivory }}>{t("불러오는 중…")}</div>
                      : lp === null ? <div style={{ width: 150, aspectRatio: "1 / 1", boxSizing: "border-box", borderRadius: 14, border: "1.5px solid " + T.brass, background: "linear-gradient(155deg, " + T.ebony3 + " 0%, " + T.ebony2 + " 55%, " + T.ebony + " 100%)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 10, fontSize: 11, color: T.ivory }}>{t("유산 없음")}</div>
                      : <LegacyStoneTile typeInfo={lp.typeInfo} entry={lp.entry} onOpen={() => setViewLegacy(lp)} size={150} />}
                  </div>
                </div>
                </div>
              </div>
            );
          }
          // (v0.3.4 기능) 사용자 요청 — 리뷰 공유 카드. 유산 카드와 같은 단순한 패턴(전달 없이 보기+
          // 삭제만) — reviewPreviews[review_id]가 undefined면 로딩 중, null이면 복원 실패(예: chess.com
          // 대국인데 아직 아무도 캐시에 올린 적 없음), 그 외엔 {game,label}.
          if (m.review_id != null) {
            const rp = reviewPreviews[m.review_id];
            const dx = drag && drag.id === m.id ? drag.dx : 0;
            const d = new Date(m.created_at);
            const hh = d.getHours(); const ampm = hh < 12 ? "AM" : "PM"; const h12 = String(hh % 12 === 0 ? 12 : hh % 12).padStart(2, "0");
            const timeTxt = String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0") + " " + ampm + " " + h12 + ":" + String(d.getMinutes()).padStart(2, "0");
            const onDown = (e) => {
              dragRef.current = { id: m.id, startX: e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0, mine };
              {
                clearTimeout(longPressTimerRef.current);
                const anchorEl = e.currentTarget;
                longPressTimerRef.current = setTimeout(() => {
                  openMsgMenu(m.id, anchorEl, mine, CHAT_MENU_W, 60);
                  dragRef.current = null; setDrag(null);
                }, 480);
              }
            };
            const onMove = (e) => {
              if (!dragRef.current || dragRef.current.id !== m.id) return;
              const x = e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0;
              let d2 = x - dragRef.current.startX;
              if (Math.abs(d2) > 6) clearTimeout(longPressTimerRef.current);
              d2 = mine ? Math.max(-96, Math.min(0, d2)) : Math.min(96, Math.max(0, d2));
              setDrag({ id: m.id, dx: d2 });
            };
            const onUp = () => { clearTimeout(longPressTimerRef.current); dragRef.current = null; setDrag(null); };
            const onContext = (e) => { e.preventDefault(); clearTimeout(longPressTimerRef.current); dragRef.current = null; setDrag(null); openMsgMenu(m.id, e.currentTarget, mine, CHAT_MENU_W, 60); };
            const showAvatar = !mine && (i === 0 || msgs[i - 1].from_uid !== m.from_uid);
            return (
              <div key={m.id} className="flex items-end" style={{ justifyContent: mine ? "flex-end" : "flex-start", gap: 6, position: "relative" }}>
                {!mine && (showAvatar
                  ? <button onClick={() => setViewProfile(otherUsername)} className="press" aria-label={t("프로필 보기")} style={{ flexShrink: 0, padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                      {otherPhoto ? <img src={otherPhoto} alt="" style={{ width: 26, height: 26, borderRadius: 8, objectFit: "cover", border: "1px solid #C9B58C" }} />
                        : <span style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11 }}>{(otherUsername || "?")[0].toUpperCase()}</span>}
                    </button>
                  : <div style={{ width: 26, flexShrink: 0 }} />)}
                <div style={{ display: "flex", flexDirection: "column", flex: "0 1 auto", position: "relative" }}
                  onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                  onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} onContextMenu={onContext}>
                {Math.abs(dx) > 6 && <span style={{ position: "absolute", [mine ? "right" : "left"]: 2, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 700, fontFamily: SITE_FONT, color: T.inkSoft, whiteSpace: "nowrap", pointerEvents: "none" }}>{timeTxt}</span>}
                {menuFor === m.id && (
                  <ChatMsgMenu style={{ [mine ? "right" : "left"]: "calc(100% + 8px)", top: "50%", transform: "translate(" + menuDx + "px, calc(-50% + " + menuDy + "px))" }}
                    myReacts={new Set((reactions[m.id] || []).filter((r) => r.uid === myUid).map((r) => r.emoji))}
                    onReact={(emoji) => toggleReaction(m, emoji, !(reactions[m.id] || []).some((r) => r.uid === myUid && r.emoji === emoji))}
                    onDelete={mine ? () => doDelete(m) : null} />
                )}
                <div style={{ position: "relative", transform: "translateX(" + dx + "px)", transition: dx === 0 ? "transform .18s ease" : "none", touchAction: "pan-y" }}>
                  {/* (사용자 요청) 리뷰 공유 카드의 chess.com 대국 표시를 /user 프로필의 chess.com
                      통계(AccountChessStats)가 그리는 "최근 대국" 행과 완전히 동일하게 맞춘다 — 진영
                      색 막대 크기(5px/최소 30px), 결과·타임클래스·날짜·무승부 종류·상대 닉네임(굵게)·
                      레이팅·오프닝 이름까지 같은 글꼴 크기·배치로 표시한다(레이팅 변동(rc)만 예외 —
                      이 카드는 유저의 전체 대국 목록 맥락이 없어 계산할 수 없다). PGN/FEN 대국은
                      1번째 줄에 "PGN"/"FEN" 라벨, 2번째 줄에 그 코드(PGN은 처음 6수만) — PGN이면
                      그 아래 인식되는 오프닝 이름(OpenChess 수 체계, openingNameOf)까지 표시한다.
                      우측 버튼(리뷰 보기)의 동작은 그대로 둔다. */}
                  <div style={{ width: 248, borderRadius: 14, padding: "9px 10px", border: "1px solid #DCCBA8", background: "#fff", boxShadow: "0 3px 10px -4px rgba(0,0,0,.4)", userSelect: "none", WebkitUserSelect: "none", display: "flex", alignItems: "center", gap: 6 }}>
                    {rp === undefined ? <div style={{ fontSize: 11, color: T.inkSoft, padding: "10px 0" }}>{t("불러오는 중…")}</div>
                      : rp === null ? <div style={{ fontSize: 11, color: T.inkSoft, padding: "10px 0" }}>{t("리뷰 로드 실패")}</div>
                      : (() => {
                          const g = rp.game;
                          const hasPD = !!(g.white || g.black || g.color);
                          if (hasPD) {
                            const won = g.result === "win", lost = g.result === "loss";
                            const oppSide = g.color === "w" ? g.black : g.white;
                            const fmtD = (t) => { if (!t) return ""; const d = new Date(t * 1000); return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0"); };
                            return (
                              <>
                                <span title={g.color === "w" ? t("백") : t("흑")} style={{ width: 5, alignSelf: "stretch", minHeight: 30, flexShrink: 0, borderRadius: 3, background: g.color === "w" ? "linear-gradient(180deg,#FFFDF7,#E7DABB)" : "linear-gradient(180deg,#4A3826,#241509)", border: "1px solid " + (g.color === "w" ? "#D8C9A8" : "#000") }} />
                                <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                                  <div style={{ fontSize: 12.5, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    <b style={{ color: won ? T.best : lost ? T.blunder : T.inkSoft }}>{won ? t("승리") : lost ? t("패배") : t("무승부")}</b>
                                    {!won && !lost && g.sans && <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color: T.inkSoft }}>({drawKindLabel(g.sans)})</span>}
                                    {g.timeClass && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>{TIME_CLASS_LABEL[g.timeClass] || g.timeClass}{g.endTime ? " (" + fmtD(g.endTime) + ")" : ""}</span>}
                                  </div>
                                  {oppSide && oppSide.username && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>vs <b style={{ color: T.ink }}>{oppSide.username}</b>{oppSide.rating != null && <span style={{ fontFamily: SITE_FONT }}>({oppSide.rating})</span>}</div>}
                                  {g.opening && <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.opening}</div>}
                                </div>
                              </>
                            );
                          }
                          const isFenOnly = g.fenRoot && (!g.sans || !g.sans.length);
                          const opening = (!isFenOnly && g.sans && g.sans.length) ? openingNameOf(g.sans) : null;
                          const startColor = g.fenRoot ? (parseFenFull(g.fenRoot) || {}).turn : undefined;
                          const codeText = isFenOnly ? g.fenRoot : (sansToPgnText(g.sans.slice(0, 6), startColor) || "");
                          return (
                            <>
                              <span style={{ width: 5, alignSelf: "stretch", minHeight: 30, flexShrink: 0, borderRadius: 3, background: "linear-gradient(180deg,#DCCBA8,#B59A6E)", border: "1px solid #B59A6E" }} />
                              <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                                <div style={{ fontSize: 10.5, fontWeight: 800, color: T.brass }}>{isFenOnly ? "FEN" : "PGN"}</div>
                                <div style={{ fontSize: 10, color: T.ink, fontFamily: SITE_FONT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{codeText}</div>
                                {opening && <div style={{ fontSize: 9.5, color: T.inkSoft, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opening}</div>}
                              </div>
                            </>
                          );
                        })()}
                    {/* (사용자 요청) 금색 검색 버튼 — 학습 탭으로 이동해 그 기보를 보드에 그대로
                        입력한다(리뷰 페이지 대신). 초록색 리뷰 버튼을 오른쪽에 추가해, 그 버튼만
                        실제 리뷰 페이지로 이동한다. 두 버튼 모두 /user의 chess.com 최근 대국 행과
                        같은 크기(30x30, 아이콘 13px)로 맞춘다. */}
                    <button onClick={() => onOpenSharedReviewOnBoard && onOpenSharedReviewOnBoard(m)} disabled={!rp} aria-label={t("학습 탭에서 보기")} title={t("학습 탭에서 보기")} className="press" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: rp ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "#C9B58C", color: "#241509", border: "none", cursor: rp ? "pointer" : "default", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Search size={13} /></button>
                    <BestMoveJumpButton size={30} disabled={!rp} title={t("리뷰 보기")} onClick={() => onOpenSharedReview && onOpenSharedReview(m)} />
                  </div>
                </div>
                </div>
              </div>
            );
          }
          // (v0.1.0) 퍼즐 공유 카드 — 인스타그램 릴스 공유처럼 미리보기 + "풀러 가기" 버튼.
          // (v0.1.4 기능) 텍스트 메시지와 동일하게 당겨서 시각 확인 + 꾹 눌러 전달/삭제 메뉴를 지원한다.
          if (m.puzzle_no != null) {
            const pz = puzzlePreviews[m.puzzle_no];
            const dx = drag && drag.id === m.id ? drag.dx : 0;
            const d = new Date(m.created_at);
            const hh = d.getHours(); const ampm = hh < 12 ? "AM" : "PM"; const h12 = String(hh % 12 === 0 ? 12 : hh % 12).padStart(2, "0");
            const timeTxt = String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0") + " " + ampm + " " + h12 + ":" + String(d.getMinutes()).padStart(2, "0");
            const onDown = (e) => {
              dragRef.current = { id: m.id, startX: e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0, mine };
              clearTimeout(longPressTimerRef.current);
              const anchorEl = e.currentTarget;
              longPressTimerRef.current = setTimeout(() => {
                openMsgMenu(m.id, anchorEl, mine, CHAT_MENU_W, 120);
                dragRef.current = null; setDrag(null);
              }, 480);
            };
            const onMove = (e) => {
              if (!dragRef.current || dragRef.current.id !== m.id) return;
              const x = e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0;
              let d2 = x - dragRef.current.startX;
              if (Math.abs(d2) > 6) clearTimeout(longPressTimerRef.current);
              d2 = mine ? Math.max(-96, Math.min(0, d2)) : Math.min(96, Math.max(0, d2));
              setDrag({ id: m.id, dx: d2 });
            };
            const onUp = () => { clearTimeout(longPressTimerRef.current); dragRef.current = null; setDrag(null); };
            // (사용자 요청) 컴퓨터(마우스) 환경에서는 꾹 누르기 대신 오른쪽 클릭으로도 전달/삭제
            // 메뉴를 열 수 있게 한다 — 브라우저 기본 컨텍스트 메뉴는 막고, 같은 openMsgMenu(안전한
            // 중앙 쪽 배치 계산까지 그대로 재사용)로 연다.
            const onContext = (e) => { e.preventDefault(); clearTimeout(longPressTimerRef.current); dragRef.current = null; setDrag(null); openMsgMenu(m.id, e.currentTarget, mine, CHAT_MENU_W, 120); };
            // (v0.2.6 기능) 상대 말풍선 묶음 중 가장 위에만 프로필 사진을 왼쪽에 표시.
            const showAvatar = !mine && (i === 0 || msgs[i - 1].from_uid !== m.from_uid);
            return (
              <div key={m.id} className="flex items-end" style={{ justifyContent: mine ? "flex-end" : "flex-start", gap: 6, position: "relative" }}>
                {!mine && (showAvatar
                  ? <button onClick={() => setViewProfile(otherUsername)} className="press" aria-label={t("프로필 보기")} style={{ flexShrink: 0, padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                      {otherPhoto ? <img src={otherPhoto} alt="" style={{ width: 26, height: 26, borderRadius: 8, objectFit: "cover", border: "1px solid #C9B58C" }} />
                        : <span style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11 }}>{(otherUsername || "?")[0].toUpperCase()}</span>}
                    </button>
                  : <div style={{ width: 26, flexShrink: 0 }} />)}
                <div style={{ display: "flex", flexDirection: "column", flex: mine ? "0 1 auto" : "0 1 auto", position: "relative" }}
                  onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                  onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} onContextMenu={onContext}>
                {Math.abs(dx) > 6 && <span style={{ position: "absolute", [mine ? "right" : "left"]: 2, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 700, fontFamily: SITE_FONT, color: T.inkSoft, whiteSpace: "nowrap", pointerEvents: "none" }}>{timeTxt}</span>}
                {menuFor === m.id && (
                  <ChatMsgMenu style={{ [mine ? "right" : "left"]: "calc(100% + 8px)", top: "50%", transform: "translate(" + menuDx + "px, calc(-50% + " + menuDy + "px))" }}
                    myReacts={new Set((reactions[m.id] || []).filter((r) => r.uid === myUid).map((r) => r.emoji))}
                    onReact={(emoji) => toggleReaction(m, emoji, !(reactions[m.id] || []).some((r) => r.uid === myUid && r.emoji === emoji))}
                    onForward={pz ? () => { setMenuFor(null); setForwardTarget(pz); } : null}
                    onDelete={mine ? () => doDelete(m) : null} />
                )}
                <div style={{ position: "relative", transform: "translateX(" + dx + "px)", transition: dx === 0 ? "transform .18s ease" : "none", touchAction: "pan-y" }}>
                  {/* (UI) 사용자 요청 — 채팅 공유 퍼즐 블록도 퍼즐 탭의 PuzzleCard와 동일한 UI를 그대로 쓴다. */}
                  {(pz === undefined || pz === null) ? (
                    <div style={{ width: 200, borderRadius: 14, overflow: "hidden", border: "1px solid #DCCBA8", background: "#fff", boxShadow: "0 3px 10px -4px rgba(0,0,0,.4)", userSelect: "none", WebkitUserSelect: "none" }}>
                      <div style={{ padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <div style={{ fontSize: 11, color: T.inkSoft, padding: "20px 0" }}>{pz === undefined ? t("불러오는 중…") : t("퍼즐 없음")}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: 200, userSelect: "none", WebkitUserSelect: "none" }}>
                      <PuzzleCard p={pz} onClick={() => onOpenSharedPuzzle && onOpenSharedPuzzle(m)} {...chatPuzzleCardProps(m.puzzle_no, pz)} />
                    </div>
                  )}
                </div>
                </div>
              </div>
            );
          }
          // (v0.5.7 기능) 수 투표·같이 보기 카드 — 다른 공유 카드처럼 보낸 사람 쪽으로 정렬한다. 꾹 누르기/오른쪽 클릭 메뉴는 반응·답장·삭제·신고.
          // 카드 안(보드)은 자기 조작을 위해 mousedown/touchstart를 막으므로, 꾹 누르기 타이머는 캡처 단계에서 건다.
          if (m.poll || m.cobo) {
            const showAvatarC = !mine && (i === 0 || msgs[i - 1].from_uid !== m.from_uid);
            const openMenuC = (el) => openMsgMenu(m.id, el, mine, CHAT_MENU_W, 190);
            const cancelPress = () => clearTimeout(longPressTimerRef.current);
            return (
              <React.Fragment key={m.id}>
                <div id={"chatmsg-" + m.id} className="flex items-end" style={{ justifyContent: mine ? "flex-end" : "flex-start", gap: 6, position: "relative", borderRadius: 14, transition: "background-color .4s", background: flashId === m.id ? "rgba(236,203,134,.45)" : "transparent" }}>
                  {!mine && (showAvatarC
                    ? <button onClick={() => setViewProfile(otherUsername)} className="press" aria-label={t("프로필 보기")} style={{ flexShrink: 0, padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                        {otherPhoto ? <img src={otherPhoto} alt="" style={{ width: 26, height: 26, borderRadius: 8, objectFit: "cover", border: "1px solid #C9B58C" }} />
                          : <span style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11 }}>{(otherUsername || "?")[0].toUpperCase()}</span>}
                      </button>
                    : <div style={{ width: 26, flexShrink: 0 }} />)}
                  <div style={{ position: "relative" }} onContextMenu={(e) => { e.preventDefault(); openMenuC(e.currentTarget); }}
                    onTouchStartCapture={(e) => { const el = e.currentTarget; cancelPress(); longPressTimerRef.current = setTimeout(() => openMenuC(el), 520); }}
                    onTouchMoveCapture={cancelPress} onTouchEndCapture={cancelPress}>
                    {menuFor === m.id && (
                      <ChatMsgMenu style={{ [mine ? "right" : "left"]: "calc(100% + 8px)", top: "50%", transform: "translate(" + menuDx + "px, calc(-50% + " + menuDy + "px))" }}
                        myReacts={new Set((reactions[m.id] || []).filter((r) => r.uid === myUid).map((r) => r.emoji))}
                        onReact={(emoji) => toggleReaction(m, emoji, !(reactions[m.id] || []).some((r) => r.uid === myUid && r.emoji === emoji))}
                        onReply={() => { setMenuFor(null); setReplyTo(m); }}
                        onDelete={mine ? () => doDelete(m) : null}
                        onReport={!mine ? () => { setMenuFor(null); setReportFor({ msg: m }); } : null} />
                    )}
                    {m.poll
                      ? <PollCard Board={Board} msg={m} votes={pollVotes[m.id]} myUid={myUid} nameOf={nameOf} mine={mine} onVote={(san) => castVote(m, san)} engineBest={engine ? engineBest : null} />
                      : <CoboCard msg={m} mine={mine} otherName={otherUsername} onJoin={() => setCoboMsg(m)} />}
                  </div>
                </div>
              </React.Fragment>
            );
          }
          // (18차 UX7) 3분 이내 연속 전송된 내 메시지 묶음에서는 마지막 메시지에만 읽음 여부를 표시한다.
          const next = msgs[i + 1];
          const groupEnd = !next || next.from_uid !== m.from_uid || (new Date(next.created_at) - new Date(m.created_at)) > 3 * 60e3;
          const showRead = mine && m.read && groupEnd;
          const d = new Date(m.created_at);
          const hh = d.getHours(); const ampm = hh < 12 ? "AM" : "PM"; const h12 = String(hh % 12 === 0 ? 12 : hh % 12).padStart(2, "0");
          const timeTxt = String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0") + " " + ampm + " " + h12 + ":" + String(d.getMinutes()).padStart(2, "0");
          const dx = drag && drag.id === m.id ? drag.dx : 0;
          const onDown = (e) => {
            dragRef.current = { id: m.id, startX: e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0, mine };
            // (v0.1.4 기능 → v0.5.7) 꾹 누르면 메시지 메뉴 — 이제 상대 메시지도(반응·답장·복사·신고).
            clearTimeout(longPressTimerRef.current);
            const anchorEl = e.currentTarget;
            longPressTimerRef.current = setTimeout(() => {
              openMsgMenu(m.id, anchorEl, mine, CHAT_MENU_W, 220);
              dragRef.current = null; setDrag(null);
            }, 480);
          };
          const onMove = (e) => {
            if (!dragRef.current || dragRef.current.id !== m.id) return;
            const x = e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0;
            let d2 = x - dragRef.current.startX;
            // 이동이 있으면(=드래그 의도) 꾹 누르기 타이머는 취소한다.
            if (Math.abs(d2) > 6) clearTimeout(longPressTimerRef.current);
            // 내 메시지(우측 정렬)는 왼쪽으로만, 상대 메시지(좌측 정렬)는 오른쪽으로만 밀린다.
            // (19차 선행) 시각 텍스트(~90px)가 벌어진 공간에 온전히 보이도록 최대 드래그 폭을 96px로.
            d2 = mine ? Math.max(-96, Math.min(0, d2)) : Math.min(96, Math.max(0, d2));
            setDrag({ id: m.id, dx: d2 });
          };
          // (v0.2.6 기능) 손을 뗐을 때 드래그도 아니고(제자리 탭) 롱프레스 메뉴도 안 열렸다면, 본문에
          // 담긴 "@아이디" 멘션의 프로필로 리디렉션한다.
          // (버그 수정) 이 요소는 onTouchEnd와 onMouseUp을 동시에 처리한다 — 모바일에서 touchend를
          // preventDefault하지 않으면 브라우저가 같은 지점에 합성(ghost) mouseup·click 이벤트를 뒤이어
          // (최대 수백ms 지연) 한 번 더 발생시킨다. 멘션을 탭해 프로필 창을 연 뒤 곧바로(그 지연 시간
          // 안에) 창을 닫으면, 이 메시지 요소에 남아 있던 그 합성 mouseup이 뒤늦게 도착해 onUp이 다시
          // 실행되며 wasTap이 그대로 참이 돼 프로필 창이 자동으로 다시 열리는 문제가 있었다. 실제
          // touchend에서 preventDefault를 호출해 뒤이은 합성 마우스 이벤트 자체가 생성되지 않게 한다.
          const onUp = (e) => {
            // (버그 수정, 사용자 제보) 이 요소는 onMouseUp뿐 아니라 onMouseLeave에도 같은 onUp을
            // 연결해 뒀는데(드래그 중 말풍선 밖으로 커서가 나가도 드래그 상태를 정리하기 위함), 정작
            // 마우스 버튼을 누른 적이 전혀 없이(mousedown 없이) 그냥 지나가듯 마우스만 올렸다 떼도
            // onMouseLeave가 그대로 발생해 이 onUp이 실행됐다 — dragRef가 비어 있어 dx가 항상 0으로
            // 남아 있으니 wasTap 조건(|dx|<6)이 항상 참이 되고, 그 즉시 "@아이디" 멘션 프로필로
            // 이동해 버렸다(클릭 한 번 없이 마우스만 올려도 이동하는 것처럼 보인 원인). 이 메시지에
            // 대해 실제로 눌렀던 적이 있을 때(dragRef.current.id === m.id)만 탭으로 인정한다.
            if (!dragRef.current || dragRef.current.id !== m.id) return;
            if (e && e.type === "touchend" && e.cancelable) e.preventDefault();
            clearTimeout(longPressTimerRef.current);
            const wasTap = Math.abs(dx) < 6 && menuFor !== m.id;
            dragRef.current = null; setDrag(null);
            if (wasTap) { const mention = firstMention(m.body); if (mention) setViewProfile(mention); }
          };
          // (사용자 요청) 컴퓨터(마우스) 환경에서는 꾹 누르기 대신 오른쪽 클릭으로도 수정/삭제 메뉴를
          // 열 수 있게 한다 — 내가 보낸 메시지만(꾹 누르기와 동일한 제약), 같은 openMsgMenu로 연다.
          const onContext = (e) => { e.preventDefault(); clearTimeout(longPressTimerRef.current); dragRef.current = null; setDrag(null); openMsgMenu(m.id, e.currentTarget, mine, CHAT_MENU_W, 220); };
          // (v0.2.6 기능) 상대 말풍선 묶음 중 가장 위에만 프로필 사진을 왼쪽에 표시.
          const showAvatar = !mine && (i === 0 || msgs[i - 1].from_uid !== m.from_uid);
          return (
            <React.Fragment key={m.id}>
              {/* (v0.1.4 기능) 읽음 표시와 달리 말풍선 상단에 별도 줄로 "수정됨"을 표시한다. */}
              {m.edited && <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}><span style={{ fontSize: 9, color: T.inkSoft, fontWeight: 700, opacity: .75 }}>{t("수정됨")}</span></div>}
              <div id={"chatmsg-" + m.id} className="flex items-end" style={{ justifyContent: mine ? "flex-end" : "flex-start", gap: 6, position: "relative", borderRadius: 12, transition: "background-color .4s", background: flashId === m.id ? "rgba(236,203,134,.45)" : "transparent" }}>
                {!mine && (showAvatar
                  ? <button onClick={() => setViewProfile(otherUsername)} className="press" aria-label={t("프로필 보기")} style={{ flexShrink: 0, padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                      {otherPhoto ? <img src={otherPhoto} alt="" style={{ width: 26, height: 26, borderRadius: 8, objectFit: "cover", border: "1px solid #C9B58C" }} />
                        : <span style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11 }}>{(otherUsername || "?")[0].toUpperCase()}</span>}
                    </button>
                  : <div style={{ width: 26, flexShrink: 0 }} />)}
              <div className="flex items-center" style={{ gap: 4, position: "relative" }}
                onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} onContextMenu={onContext}>
                {mine && showRead && Math.abs(dx) < 4 && <span style={{ fontSize: 9, color: T.inkSoft, fontWeight: 700, flexShrink: 0 }}>{t("읽음")}</span>}
                {/* (18차 보충 UX7 → 19차 선행) 드래그로 생긴 공간에 보낸 시각 표시 — 내 메시지는 오른쪽, 상대 메시지는 왼쪽.
                    래퍼를 inline-block으로 두어 transform이 정상 적용(말풍선 왜곡 해소)되고, overflow 미적용으로 시각이 가려지지 않는다. */}
                {Math.abs(dx) > 6 && <span style={{ position: "absolute", [mine ? "right" : "left"]: 2, fontSize: 10, fontWeight: 700, fontFamily: SITE_FONT, color: T.inkSoft, whiteSpace: "nowrap", pointerEvents: "none" }}>{timeTxt}</span>}
                {/* (v0.1.4 기능) 꾹 눌러 연 수정/삭제 메뉴 — 이모티콘 메시지는 수정 대상이 아니므로 본문(body)이 있을 때만 수정 버튼을 보여준다.
                    (v0.3.4 UX) 말풍선과 겹치지 않도록, 말풍선을 감싸는 transform 요소 밖(이 position:relative 컨테이너)에 두고
                    말풍선이 없는 쪽 여백(대화창 중앙 쪽)에 세로 중앙 정렬로 띄운다. */}
                {menuFor === m.id && (
                  <ChatMsgMenu style={{ [mine ? "right" : "left"]: "calc(100% + 8px)", top: "50%", transform: "translate(" + menuDx + "px, calc(-50% + " + menuDy + "px))" }}
                    myReacts={new Set((reactions[m.id] || []).filter((r) => r.uid === myUid).map((r) => r.emoji))}
                    onReact={(emoji) => toggleReaction(m, emoji, !(reactions[m.id] || []).some((r) => r.uid === myUid && r.emoji === emoji))}
                    onReply={() => { setMenuFor(null); setReplyTo(m); }}
                    onCopy={m.body ? () => { setMenuFor(null); try { navigator.clipboard.writeText(m.body); showNotice(t("복사됨")); } catch { showNotice(t("복사 실패")); } } : null}
                    onEdit={mine && m.body != null ? () => startEdit(m) : null}
                    onDelete={mine ? () => doDelete(m) : null}
                    onReport={!mine ? () => { setMenuFor(null); setReportFor({ msg: m }); } : null} />
                )}
                <span style={{ display: "inline-flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", position: "relative", transform: "translateX(" + dx + "px)", transition: dx === 0 ? "transform .18s ease" : "none", userSelect: "none", WebkitUserSelect: "none", touchAction: "pan-y" }}>
                  {m.reply_to != null && (() => { const t_ = replyTargetOf(m.reply_to); return <ReplyQuote target={t_} authorName={t_ ? nameOf(t_.from_uid) : t("답장")} mine={mine} onJump={() => jumpTo(m.reply_to, t_ && t_.created_at)} />; })()}
                  {m.emoji ? <img src={"/emoji/" + m.emoji + ".png"} alt="" draggable={false} style={{ display: "block", width: 72, height: 72 }} />
                    : blindGame.moveColors[m.id] ? <BlindMoveBubble body={m.body} color={blindGame.moveColors[m.id]} />
                    : <span style={{ display: "inline-block", maxWidth: "min(50vw, 320px)", padding: "7px 11px", borderRadius: 12, fontSize: 12.5, lineHeight: 1.4, background: mine ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "#fff", color: mine ? "#241509" : T.ink, border: mine ? "none" : "1px solid #E4D5B6", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{renderMentionText(m.body)}</span>}
                </span>
              </div>
              </div>
              {(() => {
                // (v0.5.7) 본문 속 FEN·수순은 미니 보드로, 반응은 말풍선 아래 칩으로.
                const snip = m.body ? chessSnippetOf(m.body) : null;
                if (!snip) return null;
                return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", paddingLeft: mine ? 0 : 32, marginTop: -2 }}>
                    <ChessSnippetCard Board={Board} snippet={snip} onOpen={() => (snip.kind === "fen" ? onOpenBoardFen && onOpenBoardFen(snip.fen) : onOpenBoardSans && onOpenBoardSans(snip.sans))} />
                  </div>
                );
              })()}
            </React.Fragment>
          );
  };
  return (
    <div style={{ padding: 18, display: narrow ? "flex" : undefined, flexDirection: narrow ? "column" : undefined, height: narrow ? "100%" : undefined, boxSizing: "border-box" }}>
      {/* (v0.3.3 UI) 채팅창 자체가 "채팅"+닫기(X) 헤더를 따로 갖는 곳(ChatsModal)에서는 대화를
          선택하면 그 헤더를 숨기므로, 이 헤더 하나가 뒤로가기(←)·닫기 역할을 모두 겸한다 —
          ←·상대 프로필 사진·아이디를 좌상단에 순서대로 배치한다. */}
      <div className="flex items-center gap-2" style={{ marginBottom: 12, flexShrink: 0 }}>
        <button onClick={onBack} aria-label={t("뒤로")} className="press" style={{ width: 28, height: 28, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ArrowLeft size={15} /></button>
        {/* (버그 수정, 사용자 요청) 프로필 사진의 Discord식 접속 표시(OnlineDot)를 채팅창에도 —
            지금 이 대화 상대 한 명의 접속 여부만 필요하므로 usePresenceMap([otherUid])로 가볍게 구독.
            (사용자 요청) 사진·아이디 크기를 1.5배(28→42, 14→21)로 키우고, 둘 다 누르면 그 유저의
            프로필로 이동한다(onOpenUserProfile이 이미 pushState로 히스토리를 쌓아 두므로 뒤로가기를
            누르면 popstate 핸들러가 이 채팅창 위의 프로필 오버레이만 닫고 채팅창으로 자연스럽게
            돌아온다 — 별도 배선 불필요). */}
        <button onClick={() => setViewProfile(otherUsername)} aria-label={t("{0} 프로필 보기", (otherUsername))} className="press" style={{ position: "relative", display: "inline-flex", flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          {otherPhoto ? <img src={otherPhoto} alt="" style={{ width: 42, height: 42, borderRadius: 11, objectFit: "cover", border: "1px solid #C9B58C", flexShrink: 0 }} />
            : <span style={{ width: 42, height: 42, borderRadius: 11, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, flexShrink: 0 }}>{(otherUsername || "?")[0].toUpperCase()}</span>}
          <OnlineDot lastSeenMs={otherPresence[otherUid]} overlay size={13} />
        </button>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <button onClick={() => setViewProfile(otherUsername)} className="press" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", minWidth: 0, textAlign: "left" }}>
            <span style={{ fontSize: 21, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{otherUsername}</span>
          </button>
          {/* (v0.6.1, 사용자 요청) 아이디 아래 작은 글씨로 마지막 접속 시각 */}
          {!!otherPresence[otherUid] && <span style={{ fontSize: 10.5, fontWeight: 600, color: T.inkSoft, marginTop: 1, whiteSpace: "nowrap" }}>{t("최근 활동 : {0}", relTimeFromMs(otherPresence[otherUid]))}</span>}
        </div>
        {/* (v0.5.7) 대화 검색·신고·차단 */}
        <ChatHeaderActions onSearch={() => setSearchOpen((v) => !v)} onReport={() => setReportFor({ msg: null })} blocked={blockedByMe} onToggleBlock={() => setBlocked(!blockedByMe)} />
      </div>
      {searchOpen && <ChatSearchPanel onSearch={(q) => chatSearch(myUid, otherUid, q)} nameOf={nameOf} onClose={() => setSearchOpen(false)} onPick={(m) => { setSearchOpen(false); jumpTo(m.id, m.created_at); }} />}
      {/* (사용자 요청) 위 사진·아이디가 1.5배 커진 만큼(28→42px, 대략 14px 차이), 그 여백을 대화 목록
          높이에서 그대로 빼 전체 카드 크기는 늘어나지 않도록 한다. */}
      <div ref={listRef} onScroll={onListScroll} style={{ height: narrow ? undefined : 306, flex: narrow ? "1 1 auto" : undefined, minHeight: narrow ? 0 : undefined, overflowY: "auto", background: "#FBF5E8", border: "1px solid #E4D5B6", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {msgs.length === 0 && <div style={{ fontSize: 12, color: T.inkSoft, textAlign: "center", marginTop: 20 }}>{t("대화 없음. 첫 메시지 보내기")}</div>}
        {/* (v0.5.7) 위로 스크롤하면 이전 메시지를 이어서 불러온다(버튼으로도) */}
        {hasOlder && msgs.length > 0 && (
          <div style={{ display: "flex", justifyContent: "center", padding: "2px 0 6px" }}>
            {loadingOlder ? <span style={{ fontSize: 10.5, color: T.inkSoft, fontWeight: 700 }}>{t("이전 메시지 불러오는 중…")}</span>
              : <button onClick={loadOlder} className="press" style={{ fontSize: 10.5, fontWeight: 800, color: T.inkSoft, background: "#fff", border: "1px solid #E4D5B6", borderRadius: 999, padding: "3px 10px", cursor: "pointer" }}>{t("이전 메시지 더 보기")}</button>}
          </div>
        )}
        {msgs.map((m, i) => wrapMsg(m, renderMsg(m, i)))}
        {/* (v0.1.4 기능) 실시간 타이핑 표시 — 3-dot 바운스 모션 + "입력 중" 텍스트. */}
        <AnimatePresence>
        {otherTyping && (
          // (v0.2.6 버그 수정) 입력 중 말풍선은 투명도 50%로 표시해 "아직 확정된 메시지가 아님"을 시각적으로 구분한다.
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 0.5, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.15 }} style={{ display: "flex", justifyContent: "flex-start" }}>
            <div className="flex items-center" style={{ gap: 6, padding: "7px 11px", borderRadius: 12, background: "#fff", border: "1px solid #E4D5B6" }}>
              <span style={{ fontSize: 10.5, color: T.inkSoft, fontWeight: 700 }}>{t("입력 중")}</span>
              <span className="flex items-center" style={{ gap: 3 }}>
                {[0, 1, 2].map((di) => <motion.span key={di} animate={{ y: [0, -4, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: di * 0.15, ease: "easeInOut" }} style={{ width: 5, height: 5, borderRadius: 999, background: T.inkSoft, display: "inline-block" }} />)}
              </span>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
      <div style={{ position: "relative", flexShrink: 0 }}>
        {pickerOpen && pickerPos && <EmojiPicker pos={pickerPos} onPick={(code) => send(null, code)} onClose={() => setPickerOpen(false)} />}
        {editingId != null && (
          <div className="flex items-center justify-between" style={{ marginBottom: 6, padding: "5px 10px", borderRadius: 8, background: "rgba(196,154,80,.15)", border: "1px solid " + T.brass }}>
            <span style={{ fontSize: 10.5, color: T.brass, fontWeight: 800 }}>{t("메시지 수정 중")}</span>
            <button onClick={cancelEdit} aria-label={t("수정 취소")} className="press" style={{ background: "none", border: "none", color: T.inkSoft, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
          </div>
        )}
        {/* (v0.5.7, 사용자 요청 "명령어 체계 정리") "/"를 치면 전체 목록 대신, 친 글자로 좁혀지는 자동완성(↑↓·Tab·Enter)이 뜨고
            명령어 이름 뒤엔 쓰는 법 힌트가 뜬다. 목록은 src/lib/chatCommands.js 하나에서 온다. /help는 나에게만 보이는 카드. */}
        {editingId == null && !helpOpen && <ChatCommandPalette sugg={cmdSugg} activeIdx={cmdIdx} onHover={setCmdIdx} onPick={pickCommand} onPickChoice={(c, v) => { setText("/" + c.name + " " + v); setCmdError(""); }} />}
        {helpOpen && <ChatHelpCard commands={CHAT_CMD_LIST.filter((c) => chatCommandAvailable(c, { blindActive: blindGame.active }))} onClose={() => setHelpOpen(false)} onPick={(c) => { setHelpOpen(false); pickCommand(c); }} />}
        {replyTo && editingId == null && <ReplyBar target={replyTo} authorName={nameOf(replyTo.from_uid)} onCancel={() => setReplyTo(null)} />}
        {/* (v0.5.7) /blind로 준비만 된 상태 — 첫 수를 어떻게 보내는지 입력창 바로 위에서 알려 준다(대국이 시작되면 사라짐). */}
        {blindGame.armed && editingId == null && (
          <p style={{ margin: "0 0 6px", padding: "5px 10px", borderRadius: 8, background: "rgba(196,154,80,.12)", border: "1px dashed " + T.brass, fontSize: 10.5, lineHeight: 1.45, color: T.inkSoft, fontWeight: 700 }}>
            <span style={{ color: T.brass, fontWeight: 800 }}>{t("블라인드 대국 준비됨")}</span> · {tx("{0}처럼 백의 첫 수를 보내면 시작", <b style={{ color: T.ink }}>1.e4</b>)}</p>
        )}
        {cmdError && <p style={{ fontSize: 11, color: T.blunder, fontWeight: 700, margin: "0 0 6px" }}>{cmdError}</p>}
        <AnimatePresence>
          {notice && (
            <motion.div key="notice" initial={{ opacity: 0, transform: "translateY(4px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} exit={{ opacity: 0 }}
              style={{ position: "absolute", left: "50%", bottom: "calc(100% + 8px)", marginLeft: -110, width: 220, textAlign: "center", zIndex: 25, pointerEvents: "none", fontSize: 11.5, fontWeight: 800, color: T.ivoryHi, background: "rgba(36,21,9,.88)", borderRadius: 999, padding: "5px 12px" }}>{notice}</motion.div>
          )}
        </AnimatePresence>
        {blockedByMe ? (
          <div className="flex items-center justify-between" style={{ gap: 8, padding: "9px 12px", borderRadius: 10, background: "#fff", border: "1px solid #E4D5B6" }}>
            <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 700 }}>{t("차단한 사용자. 서로 메시지 전송 불가")}</span>
            <button onClick={() => setBlocked(false)} className="press" style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 8, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}>{t("차단 해제")}</button>
          </div>
        ) : (
        <div className="flex items-center gap-2" style={{ position: "relative" }}>
          {/* (v0.5.7) "+" — 수 투표·같이 보기 보드 */}
          <AttachButton open={attachOpen} onClick={() => setAttachOpen((v) => !v)} />
          {attachOpen && <ChatAttachMenu onClose={() => setAttachOpen(false)} onPoll={() => { setAttachOpen(false); setPickSheet("poll"); }} onCobo={() => { setAttachOpen(false); setPickSheet("cobo"); }} />}
          <button ref={pickerAnchorRef} onClick={togglePicker} className="press" aria-label={t("이모티콘")} style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9, background: pickerOpen ? T.brass : "#fff", color: pickerOpen ? "#241509" : T.inkSoft, border: "1px solid #C9B58C", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Smile size={17} /></button>
          <input value={text} onChange={onTextChange} onKeyDown={onInputKeyDown} placeholder={editingId != null ? t("수정할 내용 입력…") : t("메시지 입력…")} style={{ flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 13, boxSizing: "border-box" }} />
          <button onClick={() => send(text.trim(), null)} disabled={!text.trim() || sending} className="press" style={{ padding: "9px 14px", borderRadius: 9, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: text.trim() ? "pointer" : "default", opacity: text.trim() ? 1 : 0.5, fontSize: 12 }}>{editingId != null ? t("수정") : t("전송")}</button>
        </div>
        )}
      </div>
      {/* (v0.5.7) 신고·포지션 고르기(투표/같이 보기)·같이 보기 화면 */}
      <AnimatePresence>
        {reportFor && <ReportSheet key="report" targetName={otherUsername} snippet={reportFor.msg ? chatSnippet(reportFor.msg) : null} alreadyBlocked={blockedByMe} onSubmit={submitReport} onClose={() => setReportFor(null)} />}
        {pickSheet && <PositionPickSheet key="pick" Board={Board} title={pickSheet === "poll" ? t("\"여기서 뭐 둘래?\" 투표 만들기") : t("같이 보기 보드 시작")} cta={pickSheet === "poll" ? t("이 포지션으로 투표 보내기") : t("이 포지션으로 같이 보기")}
          onClose={() => setPickSheet(null)} onSend={(fen) => sendSpecial(pickSheet === "poll" ? { poll: { fen } } : { cobo: { fen, sans: [] } })} />}
        {coboMsg && <CoBoardScreen key="cobo" Board={Board} sbClient={sbClient} msg={coboMsg} myUid={myUid} myName={myUsername} otherName={otherUsername} onClose={() => setCoboMsg(null)}
          onOpenAnalysis={(root, sans) => { setCoboMsg(null); const fen = fenOfRoot(root, sans); if (root || !sans.length) { onOpenBoardFen && onOpenBoardFen(fen); } else { onOpenBoardSans && onOpenBoardSans(sans); } }} />}
      </AnimatePresence>
      {forwardTarget && <PuzzleShareSheet puzzle={forwardTarget} myUid={myUid} onClose={() => setForwardTarget(null)} onShared={() => setForwardTarget(null)} />}
      <AnimatePresence>
        {viewLegacy && <LegacyRevealScreen typeInfo={viewLegacy.typeInfo} entry={viewLegacy.entry} onClose={() => setViewLegacy(null)} />}
      </AnimatePresence>
    </div>
  );
}
// (사용자 요청) 채팅 명령어 "/legacy N"(1~6)이 가리키는 슬롯 순서 — 1~3은 기본 칸(최선/유일/탁월),
// 4~6은 그랜드마스터 보너스 칸(같은 순서로 다시).
const LEGACY_SLOT_ORDER = ["best", "only", "brilliant", "best2", "only2", "brilliant2"];
// (사용자 요청) 유산 공유 — 퍼즐 공유(PuzzleShareSheet)와 같은 패턴의 친구 선택 시트. 위쪽에 공유할
// 유산 미리보기(등급 배지+새겨진 수)를 보여주고, 아래 친구 목록에서 보낼 대상을 고른다.
function LegacyShareSheet({ slotKey, typeInfo, entry, myUid, onClose, onShared }) {
  const color = QCOLOR[typeInfo.kind];
  return (
    <ShareSheetFrame title={t("유산 공유")} onClose={onClose}>
      <div className="flex items-center gap-2" style={{ padding: "12px 16px", borderBottom: "1px solid #E4D5B6", background: "rgba(0,0,0,.03)" }}>
        <span style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{badgeIcon(typeInfo.kind, 20)}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, fontFamily: SITE_FONT }}>{legacyMoveLabel(entry)}</div>
          <div style={{ fontSize: 10.5, color: T.inkSoft }}>{typeInfo.label}</div>
        </div>
      </div>
      <FriendSendList myUid={myUid} send={(toUid) => legacyShareSend(myUid, toUid, slotKey)} onSent={onShared} />
    </ShareSheetFrame>
  );
}
// 유산 만들기/편집 — PGN 직접 입력 또는 chess.com 대국 선택 → analyzeGame으로 전체 채점 → 그
// 유산이 요구하는 등급(typeInfo.kind)을 만족하는 수만 고를 수 있게 필터링 → 재생할 수 개수 입력 → 저장.
function LegacyManageModal({ typeInfo, slotKey, existingEntry, chesscom, username, onClose, onSave, onDelete, engine }) {
  const [step, setStep] = useState("source"); // source | paste | analyzing | pick | count
  // (사용자 요청) "chess.com 대국에서 선택"을 눌러도 창을 한 번 더 띄우지 않고, 이 자리 바로 아래에
  // 프로필 카드가 쓰는 것과 같은 chess.com 통계 UI(AccountChessStats)를 펼친다.
  const [showChesscomStats, setShowChesscomStats] = useState(false);
  const chesscomReady = !!(chesscom && chesscom.status === "ready" && chesscom.games && chesscom.games.length);
  const [pgnText, setPgnText] = useState("");
  const [pgnErr, setPgnErr] = useState("");
  const [sans, setSans] = useState(null);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [analyzeErr, setAnalyzeErr] = useState(false);
  const [moveIndex, setMoveIndex] = useState(null);
  const [playCount, setPlayCount] = useState(5);
  // (사용자 요청) 지정한 수 앞으로도 몇 수 함께 재생할 수 있게 — 뒤(과거)에서부터 beforeCount수만큼
  // 앞당겨 시작해, 그 수까지 이어지는 흐름을 보여준 뒤 지정한 수부터는 기존처럼 playCount만큼 이어간다.
  const [beforeCount, setBeforeCount] = useState(0);
  // (사용자 요청) PGN 직접 입력은 대국 데이터에 진영 정보가 없어, 재생 화면에서 어느 쪽을 아래에 둘지
  // 알 수 없었다 — 사용자가 직접 고른 진영을 저장해 항상 그 진영이 아래에 오도록 보드를 뒤집는다.
  // chess.com 대국 선택은 g.color로 이미 알 수 있어 자동으로 채운다(onSelectGame에서 setSide).
  const [side, setSide] = useState("w");
  const loadPgnText = () => {
    const raw = pgnText.trim();
    if (!raw) { setPgnErr(t("PGN 입력 필요")); return; }
    const tokens = parsePgnMoves(raw);
    if (!tokens.length) { setPgnErr(t("기보를 읽을 수 없음")); return; }
    // (검증) NotationTools.submit과 동일한 방식 — 시작 위치부터 한 수씩 실제로 재생해, 불법적인
    // 수가 섞여 있으면(오타·변화수 등) 저장 전에 걸러낸다.
    let board = startBoard(); const validated = [];
    for (const t_ of tokens) {
      const color = validated.length % 2 === 0 ? "w" : "b";
      const clean = t_.replace(/[+#]/g, "");
      const src = sanSrc(board, clean, color);
      if (!src) { setPgnErr(t("기보에 불법적인 수가 포함되어 있어요({0}번째 수).", validated.length + 1)); return; }
      board = applySan(board, t_, color);
      validated.push(t_);
    }
    if (validated.length < 1) { setPgnErr(t("기보가 너무 짧음")); return; }
    setPgnErr(""); setSans(validated); setStep("analyzing");
  };
  // (v0.3.5 버그 수정) ReviewPage와 같은 이유 — engine이 항상 "ready"였던 전용 훅(useReviewEngine) 대신
  // 실제 useEngine(enginePref)을 받으므로, "analyzing" 단계에 막 들어선 시점엔 아직 엔진이 부팅 중일
  // 수 있다. 부팅 여부와 무관하게 매번 결과를 초기화하던 것과 실제 분석 시작을 분리해, engine.status가
  // 뒤늦게 "ready"로 바뀌어도(analyzeStartedRef로 중복 시작만 막고) 다시 시도하도록 고쳤다.
  const analyzeStartedRef = useRef(false);
  useEffect(() => {
    if (step === "analyzing") { setResult(null); setProgress(0); setAnalyzeErr(false); analyzeStartedRef.current = false; }
  }, [step]);
  useEffect(() => {
    if (step !== "analyzing" || !sans || analyzeStartedRef.current || !engine) return;
    if (engine.status === "off") { setAnalyzeErr(true); return; }
    if (engine.status !== "ready") return; // 아직 부팅 중 — status가 바뀌면 다시 확인한다.
    if (sans.length < 1) { setAnalyzeErr(true); return; }
    analyzeStartedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const r = await analyzeGame(sans, engine, REVIEW_DEPTH, (p) => { if (!cancelled) setProgress(p); }, REVIEW_MOVETIME_MS,
          (partial) => { if (!cancelled) setResult(partial); });
        if (!cancelled) { setResult(r); setStep("pick"); }
      } catch { if (!cancelled) setAnalyzeErr(true); }
    })();
    return () => { cancelled = true; };
  }, [step, sans, engine && engine.status]);
  const qualifying = result ? result.moves.filter((m) => m.kind === typeInfo.kind) : [];
  const maxPlayCount = sans && moveIndex != null ? Math.max(1, sans.length - moveIndex) : 20;
  const maxBeforeCount = moveIndex != null ? moveIndex : 0;
  // (사용자 요청) 앞뒤 수는 1~7수 범위로만 고를 수 있다(직접 입력 대신 선택 박스).
  const playOptions = useMemo(() => Array.from({ length: Math.max(1, Math.min(7, maxPlayCount)) }, (_, i) => i + 1), [maxPlayCount]);
  const beforeOptions = useMemo(() => Array.from({ length: Math.max(0, Math.min(7, maxBeforeCount)) }, (_, i) => i + 1), [maxBeforeCount]);
  const save = () => {
    if (moveIndex == null || !sans) return;
    const kinds = result ? sans.map((_, i) => { const m = result.moves.find((mm) => mm.ply === i); return m ? m.kind : "pending"; }) : null;
    onSave(slotKey || typeInfo.key, { sans, moveIndex, playCount: Math.max(1, Math.min(playCount, maxPlayCount)), beforeCount: Math.max(0, Math.min(beforeCount, maxBeforeCount)), kinds, side, savedAt: Date.now() });
  };
  // (v0.3.4 UI) 채팅·프로필·검색·친구 창과 같은 모바일 전체 화면 패턴 — 이 창은 chess.com 대국
  // 선택 시 AccountChessStats(필터·대국 목록)까지 펼쳐지므로 좁은 화면에서 특히 필요했다.
  const narrow = useNarrow(640);
  // (사용자 요청) 이번 버전에 새로 만든 퍼즐 만들기 마법사와 레이아웃·디자인을 통일한다 — 어두운
  // 바탕 위에 단계마다 번호가 붙은 밝은 박스(T.paper 카드)를 얹는 형태로, 창 배경도 다른 전체 화면
  // 마법사들과 같은 어두운 라디얼 그라데이션으로 바꾼다.
  const stepNo = step === "source" || step === "paste" ? 1 : step === "analyzing" ? 1 : step === "pick" ? 2 : 3;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,6,3,.6)", zIndex: 220, display: "flex", alignItems: narrow ? "stretch" : "flex-start", justifyContent: "center", padding: narrow ? 0 : "40px 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: narrow ? "100%" : 460, height: narrow ? "100%" : undefined, maxHeight: narrow ? "100%" : "min(720px, 85vh)", display: "flex", flexDirection: "column", background: "radial-gradient(130% 120% at 50% -10%, #34230F 0%, #150C06 65%)", borderRadius: narrow ? 0 : 16, border: narrow ? "none" : "1px solid " + T.brass, boxShadow: narrow ? "none" : "0 20px 50px -12px rgba(0,0,0,.6)", overflow: "hidden" }}>
        <div className="flex items-center justify-between" style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.12)", flexShrink: 0 }}>
          <div className="flex items-center gap-2"><Gem size={17} style={{ color: QCOLOR[typeInfo.kind] }} /><span style={{ fontSize: 15, fontWeight: 800, color: T.ivoryHi }}>{tx("유산 • {0}", typeInfo.short)}</span></div>
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 28, height: 28, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
        </div>
        <div style={{ padding: 18, flex: "1 1 auto", overflowY: "auto" }}>
        {(step === "source" || step === "paste") && (
          <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 13 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{tx("{0}. 대국 선택", stepNo)}</div>
        {step === "source" && (
          <div>
            <p style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 12 }}>{tx("이 유산에 새길 대국 선택. {0}은 \"{1}\" 등급의 수만 지정 가능", typeInfo.label, QLABEL[typeInfo.kind])}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => setStep("paste")} className="press" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid " + T.brass, background: "transparent", color: T.ink, fontWeight: 800, fontSize: 13, cursor: "pointer", textAlign: "left" }}>{t("PGN 직접 입력")}</button>
              <button onClick={() => setShowChesscomStats((v) => !v)} disabled={!chesscomReady} className="press" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid " + T.brass, background: showChesscomStats ? "rgba(196,154,80,.14)" : "transparent", color: chesscomReady ? T.ink : T.inkSoft, fontWeight: 800, fontSize: 13, cursor: chesscomReady ? "pointer" : "default", opacity: chesscomReady ? 1 : 0.5, textAlign: "left" }}>{tx("chess.com 대국에서 선택{0}", !chesscomReady ? t(" (설정에서 chess.com 계정 연동 시 이용 가능)") : "")}</button>
            </div>
            {/* (사용자 요청) 별도 창 대신, 프로필 카드가 쓰는 것과 같은 chess.com 통계 UI를 바로 아래에
                펼친다 — 각 대국 줄의 검색·리뷰 버튼 자리에는 onSelectGame으로 "선택" 버튼만 놓인다. */}
            {showChesscomStats && chesscomReady && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E4D5B6" }}>
                <AccountChessStats chesscom={chesscom} username={username} onSelectGame={(g) => { setSans(g.moves); setSide(g.color); setStep("analyzing"); }} />
              </div>
            )}
            {existingEntry && <button onClick={onDelete} className="press" style={{ marginTop: 14, padding: "8px 0", width: "100%", borderRadius: 9, border: "1px solid " + T.blunder, background: "transparent", color: T.blunder, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{t("이 유산 삭제")}</button>}
          </div>
        )}
        {step === "paste" && (
          <div>
            <textarea value={pgnText} onChange={(e) => setPgnText(e.target.value)} placeholder={t("PGN을 붙여넣으세요 (예: 1.e4 e5 2.Nf3 Nc6 ...)")} rows={7} style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 9, border: "1px solid " + (pgnErr ? T.blunder : "#C9B58C"), fontFamily: SITE_FONT, fontSize: 12.5, resize: "vertical" }} />
            {pgnErr && <div style={{ fontSize: 11.5, color: T.blunder, marginTop: 6 }}>{pgnErr}</div>}
            {/* (사용자 요청) 어느 진영으로 플레이했는지 골라 두면, 재생 화면에서 항상 그 진영이 아래에 오도록 보드를 뒤집는다. */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: T.ink, marginBottom: 5 }}>{t("플레이한 진영")}</div>
              <div className="inline-flex" style={{ borderRadius: 9, background: "rgba(0,0,0,.06)", padding: 3, gap: 2 }}>
                {[["w", t("백")], ["b", t("흑")]].map(([k, lab]) => (
                  <button key={k} type="button" onClick={() => setSide(k)} className="press" style={{ padding: "6px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 800, background: side === k ? "linear-gradient(180deg,#3A2516,#241509)" : "transparent", color: side === k ? T.ivoryHi : T.inkSoft }}>{lab}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2" style={{ marginTop: 10 }}>
              <button onClick={() => setStep("source")} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{t("뒤로")}</button>
              <button onClick={loadPgnText} className="press" style={{ flex: 1, padding: "8px 14px", borderRadius: 9, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, fontSize: 12.5, border: "none", cursor: "pointer" }}>{t("불러오기")}</button>
            </div>
          </div>
        )}
          </div>
        )}
        {step === "analyzing" && (
          <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: "24px 13px", textAlign: "center" }}>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 10 }}>{tx("대국을 분석하는 중이에요… ({0}", Math.round(progress * 100))}%)</div>
            <div style={{ height: 8, borderRadius: 999, background: "#EEE2C6", overflow: "hidden", border: "1px solid #DCCBA8", maxWidth: 260, margin: "0 auto" }}>
              <div style={{ width: (progress * 100) + "%", height: "100%", background: "linear-gradient(90deg,#8A6A2F," + T.brass + ")", transition: "width .3s ease" }} />
            </div>
            {analyzeErr && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11.5, color: T.blunder, marginBottom: 8 }}>{t("분석 실패. 다시 시도")}</div>
                <button onClick={() => setStep("source")} className="press" style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{t("뒤로")}</button>
              </div>
            )}
          </div>
        )}
        {step === "pick" && result && (
          <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 13 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{tx("{0}. 수 선택", stepNo)}</div>
            {qualifying.length === 0 ? (
              <div style={{ fontSize: 12.5, color: T.inkSoft, textAlign: "center", padding: "16px 0" }}>{tx("이 대국에는 \"{0}\" 등급의 수 없음. 다른 대국 선택", QLABEL[typeInfo.kind])}</div>
            ) : (
              <>
                <p style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 8 }}>"{tx("{0}\" 등급의 수 중 하나 선택", QLABEL[typeInfo.kind])}</p>
                <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                  {qualifying.map((m) => (
                    <MoveLongPressPreview key={m.ply} priorSans={sans.slice(0, m.ply)} san={m.san} kind={m.kind} flip={side === "b"}>
                      <button onClick={() => { setMoveIndex(m.ply); setPlayCount(Math.min(5, Math.max(1, sans.length - m.ply))); setBeforeCount(Math.min(3, m.ply)); setStep("count"); }} className="press" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, border: "1px solid " + QCOLOR[m.kind], background: "#fff", cursor: "pointer", textAlign: "left", width: "100%", boxSizing: "border-box" }}>
                        <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: QCOLOR[m.kind], color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{badgeIcon(m.kind, 14)}</span>
                        <span style={{ fontFamily: SITE_FONT, fontWeight: 800, fontSize: 13, color: T.ink }}>{moveNumber(m.ply)}{m.san}</span>
                      </button>
                    </MoveLongPressPreview>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => setStep("source")} className="press" style={{ marginTop: 12, padding: "8px 14px", borderRadius: 9, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{t("다른 대국 선택")}</button>
          </div>
        )}
        {step === "count" && moveIndex != null && sans && (
          <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 13 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{tx("{0}. 재생 범위 설정", stepNo)}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, marginBottom: 4 }}>{moveNumber(moveIndex)}{sans[moveIndex]}</div>
            {/* (사용자 요청) 지정한 수 앞뒤로 몇 수 함께 보여줄지를 직접 입력이 아니라 1~7수 범위의
                선택 박스로 고른다. */}
            <p style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 6 }}>{t("이 수보다 몇 수 전부터 표시할지 선택")}</p>
            {beforeOptions.length > 0 ? (
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                <select value={beforeCount} onChange={(e) => setBeforeCount(parseInt(e.target.value, 10))} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #C9B58C", fontFamily: SITE_FONT, fontSize: 13, background: "#fff" }}>
                  {beforeOptions.map((n) => <option key={n} value={n}>{tx("{0}수", n)}</option>)}
                </select>
                <span style={{ fontSize: 11.5, color: T.inkSoft }}>{t("전부터")}</span>
              </div>
            ) : (
              <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 12 }}>{t("이 수보다 앞선 수 없음")}</p>
            )}
            <p style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 10 }}>{t("이 수부터 몇 수까지 재생할지 선택")}</p>
            <div className="flex items-center gap-2">
              <select value={playCount} onChange={(e) => setPlayCount(parseInt(e.target.value, 10))} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #C9B58C", fontFamily: SITE_FONT, fontSize: 13, background: "#fff" }}>
                {playOptions.map((n) => <option key={n} value={n}>{tx("{0}수", n)}</option>)}
              </select>
              <span style={{ fontSize: 11.5, color: T.inkSoft }}>{t("까지")}</span>
            </div>
            <div className="flex gap-2" style={{ marginTop: 14 }}>
              <button onClick={() => setStep("pick")} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{t("뒤로")}</button>
              <button onClick={save} className="press" style={{ flex: 1, padding: "8px 14px", borderRadius: 9, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, fontSize: 12.5, border: "none", cursor: "pointer" }}>{t("저장")}</button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
// (사용자 요청) chess.com 통계를 보는 동안엔 티어·퍼즐 레이팅(OpenChess 전용 지표) 대신, 같은 자리에
// 래피드/블리츠/불릿 레이팅을 보여준다 — TierRatingRow와 같은 줄 높이·배지 모양을 그대로 쓴다.
function ChesscomRatingRow({ ccHeaderProf }) {
  if (!ccHeaderProf) return null;
  const items = [
    { label: t("래피드"), v: ccHeaderProf.rapid },
    { label: t("블리츠"), v: ccHeaderProf.blitz },
    { label: t("불릿"), v: ccHeaderProf.bullet },
  ].filter((x) => x.v != null);
  if (!items.length) return null;
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 8, flexWrap: "wrap" }}>
      {items.map((x) => (
        <span key={x.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, background: "rgba(0,0,0,.05)", border: "1px solid #DCCBA8", color: T.ink, fontSize: 11.5, fontWeight: 800 }}>
          {x.label} {x.v}
        </span>
      ))}
    </div>
  );
}
// (기능) 유저 검색 결과 한 줄 — 검색 결과와 기본 추천(친구의 친구·리더보드)이 같은 모양을 공유한다.
// right는 오른쪽 끝에 덧붙일 부가 정보(같이 아는 친구 수, 티어 등) — 없으면 기존과 똑같은 모양이다.
// (about 페이지 그랜드마스터 카드 연동) 검색 결과·티어 리더보드에서 그랜드마스터는 오로라 톤
// 골드 테두리로 항상 강조 표시 — 실제로 티어를 올려야 얻는 결과라 배지처럼 남용될 일이 없다.
// (v0.2.2 UI#7) opts.rank(1부터) — 리더보드에서 프로필 사진 왼쪽에 순위를 표시한다(상위 3명은 순위
// 숫자 대신 전용 메달 이미지 /rank-{1,2,3}.png). opts.isMe면 내 행을 금색 윤곽선으로 강조하고,
// opts.compact면 블록 두께를 약 65%로 줄인다.
// (v0.2.2 UI#7 후속) 순위 메달을 "숫자를 둘러싼 육각형"이 세 이미지 모두 같은 크기로 보이도록 순위별
// 높이를 다르게 준다(측정: 하단 육각형 폭/이미지높이 = 1위 0.195·2위 0.214·3위 0.332 → 이 비를 상쇄).
// 1위가 자연히 가장 크게 표시돼 "1등 뱃지 크게" 요구도 함께 만족한다.
// (v0.2.2 후속) 스크린샷 피드백 — 1위가 왕관 때문에 본체가 작아 보여 2위가 가장 커 보이고 3위가 너무
// 작던 문제. 표시 높이를 1위>2위>3위로 뚜렷이 차등해(왕관 높이만큼 1위를 더 크게), 3위도 충분히
// 보이게 키운다.
const RANK_MEDAL_H = { normal: { 1: 54, 2: 44, 3: 40 }, compact: { 1: 48, 2: 39, 3: 35 } };
// (사용자 요청) 검색 결과의 개발자/공동 개발자 표시를 이모티콘(👑/🔧) 대신 아이콘 컴포넌트로 —
// 개발자는 왕관, 공동 개발자는 도구(렌치) 아이콘으로 구분한다.
function SearchRoleIcon({ username }) {
  if (!username) return null;
  if (username === DEV_ACCOUNT) return <Crown size={12} style={{ color: T.brass, flexShrink: 0 }} />;
  if (Array.isArray(CONTENT.codev) && CONTENT.codev.includes(username)) return <Wrench size={11} style={{ color: T.brass, flexShrink: 0 }} />;
  return null;
}
function userSearchRow(r, onClick, right, opts) {
  const p = r.pub || {};
  const isGM = tierFromXp(p.xp || 0).tier.key === "grandmaster";
  const { rank, isMe, compact } = opts || {};
  const avatar = compact ? 28 : 34;
  // (v0.2.2 UI#7 후속) 모든 블록에서 요소 x좌표가 고정되도록 순위 칸을 고정폭 슬롯으로, 블록은 전체 폭으로.
  const slotW = compact ? 52 : 58, slotH = compact ? 48 : 54;
  const medalH = (RANK_MEDAL_H[compact ? "compact" : "normal"])[rank];
  return (
    <button key={r.id} onClick={onClick} className="press" style={{ width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", gap: compact ? 8 : 10, padding: compact ? "4px 8px" : 9, borderRadius: 10, border: isMe ? "2px solid " + T.brass : isGM ? "1.5px solid #C9A6FF" : "1px solid #E4D5B6", background: isMe ? "linear-gradient(180deg,#FFFBF0,#F3E7CB)" : "#FBF5E8", boxShadow: isMe ? "0 0 0 2px rgba(196,154,80,.3)" : isGM ? "0 0 0 1px rgba(185,131,255,.35), 0 0 10px rgba(110,231,200,.25)" : "none", cursor: "pointer", textAlign: "left" }}>
      {rank != null && (
        <span style={{ width: slotW, height: slotH, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          {rank <= 3
            ? <img src={"/rank-" + rank + ".png"} alt={t("{0}위", (rank))} style={{ height: medalH, width: "auto", maxWidth: slotW, filter: "drop-shadow(0 1px 2px rgba(0,0,0,.3))" }} />
            : <span style={{ fontSize: 14, fontWeight: 900, color: T.inkSoft, fontFamily: SITE_FONT }}>{rank}</span>}
        </span>
      )}
      {p.photo ? <img src={p.photo} alt="" style={{ width: avatar, height: avatar, borderRadius: 9, objectFit: "cover", flexShrink: 0, ...(gmPhotoRingStyle(isGM, 2) || {}) }} /> : <span style={{ width: avatar, height: avatar, borderRadius: 9, flexShrink: 0, background: T.brass, color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{(p.nickname || r.username || "?")[0].toUpperCase()}</span>}
      <div style={{ minWidth: 0, flex: 1 }}>
        {/* (사용자 요청) "나" 표시는 그랜드마스터 왕관 아이콘보다 오른쪽에 온다. */}
        <div className="flex items-center gap-1"><span style={{ fontSize: 13, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nickname || (p.displayId || r.username)}</span>{isGM && <Crown size={12} style={{ color: "#9B6BFF", flexShrink: 0 }} />}{isMe && <span style={{ fontSize: 9.5, fontWeight: 800, color: T.brass, flexShrink: 0 }}>{t("나")}</span>}</div>
        {/* (사용자 요청) 소개 — 닉네임 바로 밑, @핸들 위. 촘촘한 리더보드(compact)에서는 줄 수를
            늘리지 않도록 생략한다. */}
        {!compact && p.bio && <div style={{ fontSize: 11, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><UgcText text={p.bio} kind="bio" inline render={(shown, tg) => <>{tg}{shown}</>} /></div>}
        <div className="flex items-center gap-1" style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: SITE_FONT, overflow: "hidden" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{(p.displayId || r.username)}</span>
          <SearchRoleIcon username={r.username} />
        </div>
      </div>
      {right}
    </button>
  );
}
export function UserSearchModal({ onClose, me, myUid, onOpenUserProfile }) {
  const [q, setQ] = useState(""); const [results, setResults] = useState([]); const [busy, setBusy] = useState(false); const [searched, setSearched] = useState(false);
  const run = async () => { if (!q.trim()) return; setBusy(true); setSearched(true); const r = await userSearch(q.trim()); setResults(r); setBusy(false); };
  // (버그 수정) 검색 버튼을 눌러야만 검색되던 것 — 입력할 때마다(살짝 debounce해) 자동으로
  // 실시간 검색되도록 한다. 검색 버튼은 그대로 두어 즉시 재검색하고 싶을 때도 쓸 수 있게 한다.
  useEffect(() => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setBusy(true);
    const id = setTimeout(() => { run(); }, 300);
    return () => clearTimeout(id);
  }, [q]);
  // (기능) 아직 아무것도 검색하지 않은 기본 화면에 빈 목록만 보여주지 않고, 먼저 둘러볼 만한
  // 후보를 미리 띄워 둔다 — 내 친구의 친구(친구가 될 법한 사람)와 지금 티어가 높은 플레이어
  // (리더보드) 두 갈래. 로그인하지 않았거나 둘 다 비었으면 그 섹션은 그냥 렌더링하지 않는다.
  const [sugFriends, setSugFriends] = useState([]);
  const [sugTop, setSugTop] = useState([]);
  const [sugLoading, setSugLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setSugLoading(true);
    (async () => {
      const [fr, top] = await Promise.all([me ? friendSuggestions(8) : Promise.resolve([]), leaderboardTop(100)]);
      if (cancelled) return;
      setSugFriends(fr);
      // (v0.2.2 UI#7) 리더보드에 나 자신도 그대로 표시한다(내 행은 금색 윤곽선으로 강조).
      setSugTop(top || []);
      setSugLoading(false);
    })();
    return () => { cancelled = true; };
  }, [me, myUid]);
  // (v0.4.4 개편, 사용자 요청) 검색 결과를 누르면 이 모달 안에 자체 프로필 서브뷰를 그리는 대신,
  // openchess.kr/user/<MID> 고유 페이지(UserProfilePage)로 이동한다 — App 루트의
  // openUserProfileByUsername이 mid를 조회해 그 경로로 넘어간다.
  const open = (username) => onOpenUserProfile && onOpenUserProfile(username);
  // (사용자 요청) 모바일에서는 이 검색 창을 카드가 아니라 전체 화면으로 띄운다.
  const narrow = useNarrow(640);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,6,3,.6)", zIndex: 80, display: "flex", alignItems: narrow ? "stretch" : "flex-start", justifyContent: "center", padding: narrow ? 0 : "60px 16px" }}>
      {/* (버그 수정) 모달 카드에 높이 제한·스크롤이 없어, 프로필 내용이 화면보다 길면 카드가 뷰포트
          밖으로 그냥 넘쳐 하단 내용을 볼 수 없었고, 스크롤하면 카드 뒤의 탭 본문이 대신 스크롤됐다 —
          카드 자체에 최대 높이와 세로 스크롤을 줘서 모달 안에서 스크롤이 끝나도록 한다. */}
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: narrow ? "100%" : 420, height: narrow ? "100%" : undefined, maxHeight: narrow ? "100%" : "min(640px, 85vh)", display: "flex", flexDirection: "column", background: T.paper, borderRadius: narrow ? 0 : 16, border: narrow ? "none" : "1px solid #DCCBA8", overflow: "hidden", boxShadow: narrow ? "none" : "0 20px 50px -12px rgba(0,0,0,.6)" }}>
        <div className="flex items-center justify-between" style={{ padding: "14px 16px", borderBottom: "1px solid #E4D5B6", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t("유저 검색")}</span>
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 28, height: 28, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={15} /></button>
        </div>
        <div style={{ padding: 16, overflowY: "auto" }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
            {/* (v0.4.4 기능, 사용자 요청) "#ABCDE1234"처럼 MID로도 검색할 수 있다 — userSearch가 이
                입력 형태를 인식해 mid로 곧장 조회한다. */}
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder={t("아이디 또는 #MID로 검색")} autoFocus style={{ flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 13 }} />
            <button onClick={run} className="press" style={{ padding: "9px 14px", borderRadius: 9, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: "pointer", fontSize: 12 }}>{t("검색")}</button>
          </div>
          {q.trim() ? (
            busy ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("검색 중…")}</div>
              : results.length === 0 ? (searched ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("일치하는 유저 없음")}</div> : null)
                // (사용자 요청) 검색어로 찾은 결과도 기본(추천) 목록과 완전히 같은 블록 UI를 쓴다 —
              // 리더보드 행과 똑같이 우측에 티어 십각형 아이콘을, isMe 옵션으로 "나" 표시까지 그대로 준다.
              : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><AnimatePresence>{results.map((r, i) => <FadeIn key={r.id} index={i}>{userSearchRow(r, () => open(r.username),
                  <span style={{ flexShrink: 0 }}><TierStatPill totalXp={(r.pub && r.pub.xp) || 0} size={40} gauge={false} /></span>,
                  { isMe: r.id === myUid })}</FadeIn>)}</AnimatePresence></div>
          ) : sugLoading ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("불러오는 중…")}</div>
            : (sugFriends.length === 0 && sugTop.length === 0) ? null
              : <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {sugFriends.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: T.inkSoft, marginBottom: 6 }}>{t("알 수도 있는 사람")}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {sugFriends.map((r, i) => <FadeIn key={r.id} index={i}>{userSearchRow(r, () => open(r.username),
                          <span style={{ fontSize: 10.5, color: T.inkSoft, flexShrink: 0, whiteSpace: "nowrap" }}>{tx("같이 아는 친구 {0}명", r.mutual)}</span>)}</FadeIn>)}
                      </div>
                    </div>
                  )}
                  {sugTop.length > 0 && (
                    <div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {sugTop.map((r, i) => <FadeIn key={r.id} index={i} style={{ width: "100%" }}>{userSearchRow(r, () => open(r.username),
                          <span style={{ flexShrink: 0 }}><TierStatPill totalXp={(r.pub && r.pub.xp) || 0} size={40} gauge={false} /></span>,
                          { rank: i + 1, isMe: r.id === myUid, compact: true })}</FadeIn>)}
                      </div>
                    </div>
                  )}
                </div>}
        </div>
      </div>
    </div>
  );
}
function FriendRow({ id, pub, right, onClick, lastSeenMs }) {
  const p = pub || {};
  const isGM = tierFromXp(p.xp || 0).tier.key === "grandmaster";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, borderRadius: 10, border: isGM ? "1.5px solid #C9A6FF" : "1px solid #E4D5B6", background: "#FBF5E8", boxShadow: isGM ? "0 0 0 1px rgba(185,131,255,.35), 0 0 10px rgba(110,231,200,.25)" : "none" }}>
      <button onClick={onClick} className="press" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: onClick ? "pointer" : "default", textAlign: "left", padding: 0 }}>
        {/* (신규 기능) 사용자 요청 — 아바타 우하단에 Discord 스타일 초록 점으로 실시간 접속 여부 표시. */}
        <span style={{ position: "relative", flexShrink: 0, display: "inline-flex" }}>
          {p.photo ? <img src={p.photo} alt="" style={{ width: 34, height: 34, borderRadius: 9, objectFit: "cover", ...(gmPhotoRingStyle(isGM, 2) || {}) }} />
            : <span style={{ width: 34, height: 34, borderRadius: 9, background: T.brass, color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{(p.nickname || id || "?")[0].toUpperCase()}</span>}
          <OnlineDot lastSeenMs={lastSeenMs} overlay size={9} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-1"><span style={{ fontSize: 13, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nickname || id}</span>{isGM && <Crown size={12} style={{ color: "#9B6BFF", flexShrink: 0 }} />}</div>
          <div style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: SITE_FONT }}>@{id}{presenceLabel(lastSeenMs) && <span> · {presenceLabel(lastSeenMs)}</span>}</div>
        </div>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>{right}</div>
    </div>
  );
}
// (18차 UX7) 채팅 모아보기 모달 — 대화가 있었던 상대를 최근 메시지와 함께 나열, 클릭하면 해당 채팅으로.
export function ChatsModal({ me, myUid, onClose, onOpenBoardFen, onOpenBoardSans, onOpenSharedPuzzle, onOpenSharedReview, onOpenSharedReviewOnBoard, onAcceptPvpInvite, onOpenUserProfile, myLegacies, myIsGM, myChesscomGames, mySolved, myLineSolves, solveCounts, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare, engine }) {
  const [rows, setRows] = useState(null);
  // (버그 수정, 사용자 요청) 프로필 사진의 Discord식 접속 표시(OnlineDot)를 채팅 목록에도.
  const chatPresence = usePresenceMap(useMemo(() => (rows || []).map((r) => r.uid), [rows]));
  const [profiles, setProfiles] = useState({});
  const [chatWith, setChatWith] = useState(null);
  // (사용자 요청) 모바일에서는 이 채팅 창을 카드가 아니라 전체 화면으로 띄운다.
  const narrow = useNarrow(640);
  // (v0.3.4 기능) 대화방별 설정(고정/알림 끄기)을 목록과 함께 불러와, 내가 지운 시점(clearedBefore)
  // 이전 메시지는 애초에 목록 계산에서 제외하고(=대화가 사라짐), 고정한 대화는 항상 맨 위로 올린다.
  const loadRows = useCallback(async () => {
    // (v0.5.7 버그 수정 BUG-019) 대화방 목록을 서버 요약(chat_rooms RPC — 방마다 마지막 메시지·안 읽은 수, 워터마크 반영)으로 받는다.
    // 예전 방식(최근 메시지 200개로 추정)은 오래된 방이 빠지고 안 읽은 수가 모자랐다. RPC가 아직 없으면(SQL 미반영) 예전 방식으로.
    const [rooms, prefs, blocked] = await Promise.all([chatRoomsFetch(), chatConvPrefsFetch(myUid), chatBlocksFetch(myUid)]);
    let base;
    if (rooms) base = rooms;
    else {
      const all = await chatFetchAll(myUid);
      const latest = new Map(); // otherUid -> 최근 메시지
      const unreadBy = {};      // (18차 보충 UX7) 상대별 안읽은 메시지 수
      for (const m of all) {
        const other = m.from_uid === myUid ? m.to_uid : m.from_uid;
        const pref = prefs[other];
        if (pref && pref.clearedBefore && new Date(m.created_at) <= new Date(pref.clearedBefore)) continue;
        if (!latest.has(other)) latest.set(other, m);
        if (m.to_uid === myUid && !m.read) unreadBy[other] = (unreadBy[other] || 0) + 1;
      }
      base = [...latest.entries()].map(([uid, m]) => ({ uid, m, unread: unreadBy[uid] || 0 }));
    }
    const blockedSet = new Set(blocked);
    const list = base.filter((r) => !blockedSet.has(r.uid)).map((r) => ({ ...r, pinned: !!(prefs[r.uid] && prefs[r.uid].pinned), muted: !!(prefs[r.uid] && prefs[r.uid].muted) }));
    // 안정 정렬(stable sort)이라, 같은 고정 여부 안에서는 chatFetchAll이 이미 준 최근 메시지 순서가 그대로 유지된다.
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    setRows(list);
    if (list.length) { const pm = await usersProfiles(list.map((x) => x.uid)); setProfiles((prev) => ({ ...prev, ...pm })); }
  }, [myUid]);
  useEffect(() => { let cc = false; (async () => { const p = loadRows(); await p; if (cc) return; })(); return () => { cc = true; }; }, [loadRows]);
  // (버그 수정) 목록의 unread 수는 이 모달을 처음 연 시점에 딱 한 번만 계산돼, 대화를 열어 실제로
  // 다 읽고(ChatPanel의 load()가 서버에 읽음 처리) 목록으로 돌아와도 그 값이 그대로 남아 있었다 —
  // 이미 다 읽은 상대에게 계속 빨간 배지가 떠 있던 원인. 대화창을 나갈 때(뒤로가기) 목록을 다시
  // 불러와 실제 읽음 상태를 반영한다.
  const closeChatWith = useCallback(() => { setChatWith(null); loadRows(); }, [loadRows]);
  // (v0.3.4 기능) 대화 행을 꾹 누르거나(모바일) 오른쪽 클릭하면(컴퓨터) 고정/고정 해제·알림 받기/
  // 끄기·삭제 메뉴가 뜬다 — 채팅 메시지 롱프레스와 같은 480ms 임계값, safeAreaDx로 화면 가장자리
  // 잘림을 막는다(이 메뉴는 전체 폭 목록 행에 뜨는 표준 드롭다운이라, 말풍선 옆으로 띄우는
  // sideBubbleAnchor 대신 아래/위로 여는 게 자연스럽다).
  const [ctxFor, setCtxFor] = useState(null); // uid
  const [ctxDx, setCtxDx] = useState(0);
  const [ctxDown, setCtxDown] = useState(true);
  const rowsRef = useRef(null);
  const pressTimerRef = useRef(null);
  const pressFiredRef = useRef(false);
  const CTX_MENU_W = 152;
  const openCtx = (uid, anchorEl) => {
    setCtxFor(uid);
    const bounds = rowsRef.current ? rowsRef.current.getBoundingClientRect() : undefined;
    const rect = anchorEl.getBoundingClientRect();
    const top = bounds ? bounds.top : 0, bottom = bounds ? bounds.bottom : window.innerHeight;
    setCtxDx(safeAreaDx(rect, CTX_MENU_W, "right", 8, bounds));
    setCtxDown(rect.bottom - top < (bottom - top) * 0.7);
  };
  useEffect(() => {
    if (ctxFor == null) return;
    const close = () => setCtxFor(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); };
  }, [ctxFor]);
  const onRowDown = (uid) => (e) => {
    pressFiredRef.current = false;
    const anchorEl = e.currentTarget;
    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => { pressFiredRef.current = true; openCtx(uid, anchorEl); }, 480);
  };
  const onRowUp = () => { clearTimeout(pressTimerRef.current); };
  const onRowContext = (uid) => (e) => { e.preventDefault(); clearTimeout(pressTimerRef.current); openCtx(uid, e.currentTarget); };
  // (버그 수정, 사용자 요청) 채팅창 고정은 동시에 최대 1개만 — 새로 고정하면 그전에 고정돼 있던
  // 다른 대화는 자동으로 고정 해제한다. 로컬 rows뿐 아니라 서버(chatConvSetPref)에도 그 대화의
  // pinned:false를 함께 반영해, 새로고침해도 "고정된 대화가 둘"인 상태로 되돌아오지 않게 한다.
  const togglePin = async (uid, pinned) => {
    setCtxFor(null);
    const next = !pinned;
    const prevPinnedUid = next ? ((rows || []).find((r) => r.pinned && r.uid !== uid) || {}).uid : null;
    setRows((prev) => {
      const list = (prev || []).map((r) => r.uid === uid ? { ...r, pinned: next } : (prevPinnedUid && r.uid === prevPinnedUid ? { ...r, pinned: false } : r));
      list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      return list;
    });
    if (prevPinnedUid) await chatConvSetPref(myUid, prevPinnedUid, { pinned: false });
    await chatConvSetPref(myUid, uid, { pinned: next });
  };
  const toggleMute = async (uid, muted) => {
    setCtxFor(null);
    const next = !muted;
    setRows((prev) => (prev || []).map((r) => r.uid === uid ? { ...r, muted: next } : r));
    await chatConvSetPref(myUid, uid, { muted: next });
  };
  // (v0.3.4 기능) 대화 삭제 — 되돌릴 수 없는 동작이라 곧장 지우지 않고 한 번 더 확인받는다(친구
  // 삭제와 동일한 패턴). "나에게서만" 삭제되고, 상대방도 지운 적이 있다면 그 시점까지는 서버에서
  // 영구적으로 삭제된다(chat_clear_conversation).
  const [confirmClear, setConfirmClear] = useState(null); // { uid, username } | null
  const doClear = async () => {
    if (!confirmClear) return;
    const uid = confirmClear.uid;
    setConfirmClear(null);
    setRows((prev) => (prev || []).filter((r) => r.uid !== uid));
    await chatClearConversation(uid);
  };
  const ctxItemStyle = { display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: T.ivory, textAlign: "left", width: "100%" };
  return (
    <>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,6,3,.6)", zIndex: 80, display: "flex", alignItems: narrow ? "stretch" : "flex-start", justifyContent: "center", padding: narrow ? 0 : "60px 16px" }}>
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }} transition={{ duration: 0.25, ease: MOTION_EASE }} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: narrow ? "100%" : 420, height: narrow ? "100%" : undefined, display: narrow ? "flex" : undefined, flexDirection: narrow ? "column" : undefined, background: T.paper, borderRadius: narrow ? 0 : 16, border: narrow ? "none" : "1px solid #DCCBA8", overflow: "hidden", boxShadow: narrow ? "none" : "0 20px 50px -12px rgba(0,0,0,.6)" }}>
        {/* (19차 UX3) 뒤로가기는 ChatPanel 좌상단 ←로 통일. 래퍼 헤더는 닫기(X)만 우상단에 둔다.
            (v0.3.3 UI) 특정 대화를 선택해 들어가면 이 "채팅"+닫기 헤더는 아예 감춘다 — 그 안의
            ChatPanel이 이미 자기 헤더(←·상대 프로필 사진·아이디)를 갖고 있어, 두 헤더가 겹겹이
            쌓여 보이던 것을 없앤다. 대화 목록으로 돌아오면(← 버튼) 이 헤더가 다시 나타나고, 모달
            전체를 닫으려면(X) 먼저 그 ←로 목록에 돌아와야 한다. */}
        {!chatWith && (
          <div className="flex items-center justify-between" style={{ padding: "14px 16px", borderBottom: "1px solid #E4D5B6", flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{t("채팅")}</span>
            <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 28, height: 28, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
          </div>
        )}
        {chatWith ? (
          <div style={{ flex: narrow ? "1 1 auto" : undefined, minHeight: narrow ? 0 : undefined, display: narrow ? "flex" : undefined, flexDirection: narrow ? "column" : undefined }}>
            <ChatPanel onOpenBoardFen={onOpenBoardFen} onOpenBoardSans={onOpenBoardSans} myUid={myUid} myUsername={me} otherUid={chatWith.uid} otherUsername={chatWith.username} otherPhoto={chatWith.photo} onBack={closeChatWith} onOpenSharedPuzzle={onOpenSharedPuzzle} onOpenSharedReview={onOpenSharedReview} onOpenSharedReviewOnBoard={onOpenSharedReviewOnBoard} onAcceptPvpInvite={onAcceptPvpInvite} onOpenUserProfile={onOpenUserProfile} fillNarrow={narrow} myLegacies={myLegacies} myIsGM={myIsGM} myChesscomGames={myChesscomGames} engine={engine}
              mySolved={mySolved} myLineSolves={myLineSolves} solveCounts={solveCounts} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} />
          </div>
        ) : (
          <div ref={rowsRef} style={{ padding: 12, minHeight: 140, maxHeight: narrow ? undefined : 440, flex: narrow ? "1 1 auto" : undefined, overflowY: "auto" }}>
            {rows == null ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("불러오는 중…")}</div>
              : rows.length === 0 ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("채팅 없음. 친구 목록에서 시작")}</div>
              : rows.map(({ uid, m, unread, pinned, muted }, i) => {
                const pr = profiles[uid] || {}; const pub = pr.pub || {};
                return (
                  <FadeIn key={uid} index={i}>
                  <div style={{ position: "relative" }}>
                  <button
                    onClick={() => { if (pressFiredRef.current) { pressFiredRef.current = false; return; } setChatWith({ uid, username: pub.displayId || pr.username || "", photo: pub.photo || null }); }}
                    onMouseDown={onRowDown(uid)} onMouseUp={onRowUp} onMouseLeave={onRowUp}
                    onTouchStart={onRowDown(uid)} onTouchEnd={onRowUp}
                    onContextMenu={onRowContext(uid)}
                    className="press text-left" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 10, border: "none", background: ctxFor === uid ? "rgba(196,154,80,.14)" : "transparent", cursor: "pointer" }}>
                    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                      {pub.photo ? <img src={pub.photo} alt="" style={{ width: 40, height: 40, borderRadius: 11, objectFit: "cover", border: "1px solid #C9B58C", flexShrink: 0 }} />
                        : <span style={{ width: 40, height: 40, borderRadius: 11, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>{(pub.nickname || pr.username || "?")[0].toUpperCase()}</span>}
                      <OnlineDot lastSeenMs={chatPresence[uid]} overlay size={12} />
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="flex items-center gap-1">
                        {/* (v0.3.4 기능) 고정한 대화는 이름 옆에 핀 아이콘. */}
                        {pinned && <Pin size={10} style={{ color: T.brass, flexShrink: 0 }} fill={T.brass} />}
                        {/* (v0.3.5 기능) 사용자 요청 — 알림을 꺼 둔 상대는 이름 옆에 알림 해제 아이콘(BellOff, 종 + /)을 함께 보여준다. */}
                        {muted && <BellOff size={10} style={{ color: T.inkSoft, flexShrink: 0 }} />}
                        <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pub.nickname || pub.displayId || pr.username}</span>
                      </span>
                      <span style={{ display: "block", fontSize: 11, color: unread > 0 ? T.ink : T.inkSoft, fontWeight: unread > 0 ? 800 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.share_reward ? t("🎉 공유 보상 XP +{0}", m.share_reward.amount) : m.puzzle_no != null ? t("🧩 퍼즐 공유") : m.legacy_slot != null ? t("💎 유산 공유") : m.review_id != null ? t("📊 리뷰 공유") : m.pvp_invite_id != null ? t("⚔️ 실시간 대국 신청") : m.poll ? t("📊 \"여기서 뭐 둘래?\" 투표") : m.cobo ? t("👥 같이 보기 보드 초대") : m.emoji ? t("(이모티콘)") : (m.body || "")}</span>
                    </span>
                    <span style={{ fontSize: 9.5, color: T.inkSoft, flexShrink: 0 }}>{relTime(m.created_at)}</span>
                    {/* (18차 보충 UX7) 상대별 안읽은 메시지 수를 빨간 원+흰 숫자로 표시 — 읽으면 사라진다 */}
                    {unread > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: T.blunder, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{unread > 99 ? "99+" : unread}</span>}
                  </button>
                  {ctxFor === uid && (
                    <div onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} style={{ position: "absolute", right: 0, ...(ctxDown ? { top: "calc(100% + 2px)" } : { bottom: "calc(100% + 2px)" }), transform: ctxDx ? "translateX(" + ctxDx + "px)" : undefined, zIndex: 30, width: CTX_MENU_W, background: T.ebony2, borderRadius: 10, border: "1px solid #000", padding: 4, display: "flex", flexDirection: "column", gap: 1, boxShadow: "0 10px 24px -8px rgba(0,0,0,.6)" }}>
                      <button onClick={() => togglePin(uid, pinned)} className="press" style={ctxItemStyle}>{pinned ? <PinOff size={13} /> : <Pin size={13} />}{pinned ? t("고정 해제") : t("고정")}</button>
                      <button onClick={() => toggleMute(uid, muted)} className="press" style={ctxItemStyle}>{muted ? <Bell size={13} /> : <BellOff size={13} />}{muted ? t("알림 받기") : t("알림 끄기")}</button>
                      <button onClick={() => { setCtxFor(null); setConfirmClear({ uid, username: pub.nickname || pub.displayId || pr.username }); }} className="press" style={{ ...ctxItemStyle, color: "#F4A0A0" }}>{tx("{0}삭제", <Trash2 size={13} />)}</button>
                    </div>
                  )}
                  </div>
                  </FadeIn>
                );
              })}
          </div>
        )}
      </motion.div>
    </motion.div>
    {/* (v0.3.4 기능) 대화 삭제 확인 — 친구 삭제 확인 다이얼로그와 동일한 패턴. */}
    {confirmClear && (
      <div onClick={() => setConfirmClear(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 300, width: "100%", background: "linear-gradient(180deg,#F2E8D5,#E2D2B2)", borderRadius: 14, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 6 }}>{t("대화 삭제")}</div>
          <p style={{ fontSize: 13, color: T.inkSoft, marginBottom: 16 }}>{tx("{0}님과의 대화를 삭제할까요? 내 화면에서만 사라지고 상대 화면에는 남음", confirmClear.username)}</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmClear(null)} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 700, cursor: "pointer" }}>{t("취소")}</button>
            <button onClick={doClear} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: T.blunder, color: "#fff", fontWeight: 800, cursor: "pointer" }}>{t("삭제")}</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
// (기능7, 사용자 요청) PvP 관전 모드 — 친구의 진행 중인 실시간 대국을 참가자가 아닌 다른 로그인
// 유저도 읽기 전용으로 볼 수 있게 한다. supabase-setup.sql의 "pvp games select own or spectate"
// 정책이 status='active'인 pvp_games 행을 참가자 외에게도 읽기 허용해 둔 덕에, 이 컴포넌트는 그냥
// 평범한 realtime 구독으로 그 행을 읽기만 하면 된다. 클럭도 참가자 쪽(PlayPage) 로직과 같은 원리 —
// 서버가 매 수마다 갱신하는 white_ms/black_ms/clock_synced_at만으로 "지금 몇 초 남았는지"를 클라이언트가
// 스스로 계산한다(서버에 폴링할 필요 없이 로컬 200ms 타이머로 표시만 갱신).
function PvpSpectateModal({ gameId, onClose }) {
  const [game, setGame] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [err, setErr] = useState("");

  const applyRow = useCallback((row) => { if (row) setGame(row); }, []);

  useEffect(() => {
    if (gameId == null) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await sbSelect("pvp_games?id=eq." + gameId + "&select=*");
        if (cancelled) return;
        if (rows && rows[0]) applyRow(rows[0]);
        else setErr(t("대국 없음 (이미 끝났거나 취소됐을 수 있음)"));
      } catch { if (!cancelled) setErr(t("대국 정보 로드 실패")); }
    })();
    return () => { cancelled = true; };
  }, [gameId, applyRow]);

  useRealtimeTable("pvp_games", gameId != null ? "id=eq." + gameId : null, async (payload) => {
    let row = payload && payload.new;
    if (!row) { try { const rows = await sbSelect("pvp_games?id=eq." + gameId + "&select=*"); row = rows && rows[0]; } catch { } }
    if (row) applyRow(row);
  }, gameId != null, 4000);

  useEffect(() => {
    if (!game) return;
    const ids = [game.white_uid, game.black_uid].filter(Boolean);
    if (!ids.length) return;
    let cancelled = false;
    usersProfiles(ids).then((m) => { if (!cancelled) setProfiles((prev) => ({ ...prev, ...m })); }).catch(() => {});
    return () => { cancelled = true; };
  }, [game && game.white_uid, game && game.black_uid]);

  const sans = (game && game.sans) || [];
  const board = useMemo(() => boardFromSans(sans), [sans]);
  const whiteTurn = sans.length % 2 === 0;
  const hasServerClock = !!game && game.white_ms != null && game.black_ms != null;

  // 화면 표시용 로컬 카운트다운 — 대국이 active일 때만 매 200ms 다시 계산한다(참가자 쪽 클럭 effect와
  // 동일한 간격). 서버 값(clock_synced_at) 자체는 새 수가 오는 realtime 갱신 때만 바뀐다.
  const [displayClock, setDisplayClock] = useState(null);
  useEffect(() => {
    if (!hasServerClock) { setDisplayClock(null); return; }
    if (game.status !== "active") { setDisplayClock({ w: game.white_ms, b: game.black_ms }); return; }
    const tick = () => {
      const elapsed = Math.max(0, Date.now() - new Date(game.clock_synced_at).getTime());
      setDisplayClock({ w: game.white_ms - (whiteTurn ? elapsed : 0), b: game.black_ms - (whiteTurn ? 0 : elapsed) });
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [hasServerClock, game && game.status, game && game.white_ms, game && game.black_ms, game && game.clock_synced_at, whiteTurn]);

  // (코드 리뷰 수정) 참가자 둘 다 화면을 닫아 아무도 pvp_check_flag를 부르지 않은 채 시간이 다 되면,
  // 서버가 영영 시간 초과를 확정하지 못해 관전자 화면도 status='active'인 채로 0:00에 멈춘다 —
  // 이 함수는 "누가 불러도 결과가 같아 안전"하게 설계돼 있으므로(위 supabase-setup.sql 주석 참고),
  // 관전자 쪽 시계가 바닥나면 관전자 클라이언트가 대신 한 번 확인 요청을 보낸다.
  const flagCheckedRef = useRef(false);
  useEffect(() => { flagCheckedRef.current = false; }, [game && game.id, game && game.status]);
  useEffect(() => {
    if (!displayClock || !game || game.status !== "active" || flagCheckedRef.current) return;
    if (displayClock.w <= 0 || displayClock.b <= 0) {
      flagCheckedRef.current = true;
      sbRpc("pvp_check_flag", { p_game_id: game.id }).catch(() => {});
    }
  }, [displayClock, game && game.id, game && game.status]);

  const whitePub = (profiles[game && game.white_uid] || {}).pub || {};
  const blackPub = (profiles[game && game.black_uid] || {}).pub || {};
  const whiteName = whitePub.nickname || (profiles[game && game.white_uid] || {}).username || "White";
  const blackName = blackPub.nickname || (profiles[game && game.black_uid] || {}).username || "Black";
  const narrow = useNarrow(640);
  const boardSize = narrow ? Math.min(380, (typeof window !== "undefined" ? window.innerWidth : 380) - 32) : 400;

  const resultLabel = game && game.status !== "active" ? ({ white_won: t("백 승"), black_won: t("흑 승"), draw: t("무승부"), aborted: t("중단") }[game.status] || t("종료")) : null;

  const playerRow = (name, pub, ms) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 2px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {pub.photo ? <img src={pub.photo} alt="" style={{ width: 26, height: 26, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />
          : <span style={{ width: 26, height: 26, borderRadius: 7, background: T.brass, color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{(name || "?")[0].toUpperCase()}</span>}
        <span style={{ fontSize: 13, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      </span>
      {ms != null && <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 14, fontWeight: 800, color: T.ink, padding: "3px 8px", borderRadius: 7, background: "#EFE3C8", border: "1px solid #DCCBA8", flexShrink: 0 }}>{fmtClock(Math.max(0, ms))}</span>}
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,6,3,.68)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: T.paper, borderRadius: 16, border: "1px solid #DCCBA8", overflow: "hidden", boxShadow: "0 20px 50px -12px rgba(0,0,0,.6)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #E4D5B6" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800, color: T.ink }}>{tx("{0}관전", <Eye size={17} />)}</span>
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 28, height: 28, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={15} /></button>
        </div>
        <div style={{ padding: 16 }}>
          {err ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{err}</div>
            : !game ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("불러오는 중…")}</div>
            : (
              <>
                {playerRow(blackName, blackPub, displayClock && displayClock.b)}
                <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
                  <Board board={board} flip={false} size={boardSize} showEval={false} showCoords interactive={false} />
                </div>
                {playerRow(whiteName, whitePub, displayClock && displayClock.w)}
                {resultLabel && <div style={{ marginTop: 10, textAlign: "center", fontSize: 12.5, fontWeight: 800, color: T.brass }}>{tx("대국 종료 · {0}", resultLabel)}</div>}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
export function FriendsModal({ me, myUid, onClose, onOpenBoardFen, onOpenBoardSans, onOpenOpening, onOpenGame, onOpenGameAnalyze, onOpenSharedPuzzle, onOpenSharedReview, onOpenSharedReviewOnBoard, onAcceptPvpInvite, onOpenPuzzle, onOpenUserProfile, mySolved, myLineSolves, myLegacies, myIsGM, myChesscomGames, solveCounts, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare, engine }) {
  const meId = myUid || "";
  const [tab, setTab] = useState("friends");
  const [edges, setEdges] = useState([]);
  const [profiles, setProfiles] = useState({}); // uid -> { username, pub }
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null); // 프로필 보기: { uid, username, pub }
  const [pending, setPending] = useState({}); // uid -> true
  const [reqNotice, setReqNotice] = useState(""); // (BUG-043) 친구 요청이 서버에서 거절됐을 때(차단 관계 등) 안내 문구
  const [chatWith, setChatWith] = useState(null); // (17차) 채팅 상대: { uid, username }
  // (버그 수정) 친구 삭제 버튼을 누르면 곧장 삭제되던 것 — 확인 다이얼로그를 띄운 뒤 확정해야 지워지게 한다.
  const [confirmRemove, setConfirmRemove] = useState(null); // 삭제 확인 대상: sel과 같은 { uid, username, pub }
  // (사용자 요청, v0.3.9) 통계 분리 토글 — 카드 우상단(아이디 라벨과 같은 줄)에 두므로 이 모달이
  // statsView를 들고 있다가 헤더 줄에서 그리고, 아래 내용 패널(ProfileStatsPanel)에는 값만 넘긴다.
  // 새 프로필을 열 때마다(viewProfileUid) "oc"로 되돌린다.
  const [statsView, setStatsView] = useState("oc");
  // (신규 기능) MyProfileCard와 동일하게, chess.com 통계 보기를 고르면 카드 상단 신원 표시도
  // chess.com 것으로 바꿔 보여준다.
  const [ccHeaderProf, setCcHeaderProf] = useState(null);
  // (v0.3.3 UI) 채팅·프로필·검색 창(v0.3.2)과 마찬가지로, 모바일에서는 이 친구 창도 카드가 아니라
  // 전체 화면으로 띄운다.
  const narrow = useNarrow(640);

  const load = useCallback(async () => {
    setLoading(true);
    const e = await friendEdges();
    setEdges(e);
    const ids = e.map((x) => (x.from_uid === meId ? x.to_uid : x.from_uid));
    if (ids.length) { const pm = await usersProfiles(ids); setProfiles((prev) => ({ ...prev, ...pm })); }
    setLoading(false);
  }, [meId]);
  useEffect(() => { load(); }, [load]);

  const { friends, incoming, outgoing } = useMemo(() => {
    const f = [], inc = [], out = [];
    edges.forEach((e) => {
      const other = e.from_uid === meId ? e.to_uid : e.from_uid;
      if (e.status === "accepted") f.push(other);
      else if (e.to_uid === meId) inc.push(other);
      else out.push(other);
    });
    return { friends: f, incoming: inc, outgoing: out };
  }, [edges, meId]);
  // (기능7) 친구 중 지금 실시간 대국 중인 사람을 찾아 uid -> game id로 매핑 — 목록 줄에 "관전" 버튼을
  // 띄울지 판단하는 데만 쓴다. status='active' 행은 참가자가 아니어도 읽을 수 있게 RLS가 열려 있다.
  // (코드 리뷰 수정) 위 friends와 별도로 "accepted 친구" 목록을 다시 계산하지 않고, 그대로 재사용한다.
  const [friendActiveGames, setFriendActiveGames] = useState({}); // uid -> gameId
  const [spectateGameId, setSpectateGameId] = useState(null);
  useEffect(() => {
    // (코드 리뷰 수정) 관전 버튼은 '친구' 탭에서만 보이는데, 다른 탭을 보는 동안에도 이 폴링이 계속
    // 돌면 화면에 전혀 쓰이지 않는 쿼리를 15초마다 낭비하게 된다 — 친구 탭을 보고 있을 때만 돈다.
    if (tab !== "friends" || !friends.length) { setFriendActiveGames({}); return; }
    let cancelled = false;
    const orExpr = "(white_uid.in.(" + friends.map(encodeURIComponent).join(",") + "),black_uid.in.(" + friends.map(encodeURIComponent).join(",") + "))";
    const fetchActive = async () => {
      try {
        const rows = await sbSelect("pvp_games?status=eq.active&game_type=eq." + encodeURIComponent(PVP_GAME_TYPE) + "&or=" + orExpr + "&select=id,white_uid,black_uid");
        if (cancelled) return;
        const m = {};
        // (코드 리뷰 수정) 두 자리 다 내 friends에 포함될 수 있는 건 "나 자신도 그 친구 목록에 있는"
        // 경우뿐이라 사실상 없지만, 안전하게 "내가 참가 중인 대국은 애초에 관전 후보에서 뺀다" —
        // 안 그러면 내가 친구 B와 직접 두고 있는 대국이 B의 관전 버튼으로도 떠, 지금 내가 두고 있는
        // 대국을 또 다른 읽기 전용 창으로 여는 이상한 상태가 된다.
        (rows || []).forEach((r) => {
          if (r.white_uid === meId || r.black_uid === meId) return;
          if (friends.includes(r.white_uid)) m[r.white_uid] = r.id;
          if (friends.includes(r.black_uid)) m[r.black_uid] = r.id;
        });
        setFriendActiveGames(m);
      } catch { if (!cancelled) setFriendActiveGames({}); }
    };
    fetchActive();
    // (코드 리뷰 수정) 처음 한 번만 불러오면, 모달을 계속 켜 둔 채로 친구가 그 사이 새 대국을
    // 시작하거나(관전 버튼이 안 뜸) 이미 끝내도(버튼이 죽은 채로 계속 남아 눌러도 "대국을 찾을 수
    // 없어요"만 뜸) 목록이 갱신되지 않는다 — 친구 목록은 이 모달이 열려 있는 동안 자주 들여다볼
    // 만한 화면이라, 15초마다 다시 확인한다(realtime 구독까지는 과함 — 버튼 유무만 맞으면 충분).
    const id = setInterval(fetchActive, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [friends, tab]);

  const relOf = (uid) => { if (friends.includes(uid)) return "friend"; if (outgoing.includes(uid)) return "sent"; if (incoming.includes(uid)) return "incoming"; return "none"; };
  const uname = (uid) => (profiles[uid] && profiles[uid].username) || uid;

  const guard = (uid, fn) => async () => { if (pending[uid]) return; setPending((p) => ({ ...p, [uid]: true })); try { await fn(); await load(); } finally { setPending((p) => { const n = { ...p }; delete n[uid]; return n; }); } };
  // (17차) 친구 요청 발송/수락 시 상대에게 알림을 남긴다.
  const doRequestByName = (username, keyUid) => guard(keyUid || username, async () => {
    setReqNotice("");
    const r = await friendRequest(username);
    if (r && r.status === "blocked") { setReqNotice(t("요청할 수 없는 사용자")); return; }   // 프로필 화면과 같은 문구(누가 차단했는지는 알리지 않음)
    if (!r || !r.ok || !keyUid) return;
    if (r.status === "pending") notifyCreate(keyUid, "friend_request", { fromUsername: me, fromUid: meId });
    else if (r.status === "accepted") { notifyCreate(keyUid, "friend_accepted", { byUsername: me }); await notifyResolveFriendRequest(meId, keyUid, "accepted"); }
  })();
  const doAccept = (uid) => guard(uid, async () => { await friendAccept(uid); notifyCreate(uid, "friend_accepted", { byUsername: me }); await notifyResolveFriendRequest(meId, uid, "accepted"); })();
  const doRemove = (uid) => guard(uid, () => friendRemove(uid))();
  // (버그 수정) 친구 삭제·요청 취소와 같은 friendRemove를 쓰지만, "받은 요청 거절"만은 그 요청을
  // 알렸던 내 알림도 함께 "거절함"으로 정리해야 한다 — 아래 두 곳(요청 탭 목록·프로필 서브뷰)의
  // "거절" 버튼에서만 이 함수를 쓴다.
  const doReject = (uid) => guard(uid, async () => { await friendRemove(uid); await notifyResolveFriendRequest(meId, uid, "rejected"); })();

  const viewProfileUid = (uid) => { const pr = profiles[uid] || {}; setStatsView("oc"); setCcHeaderProf(null); setSel({ uid, username: pr.username || uid, pub: pr.pub || {} }); };
  // (신규 기능) 사용자 요청 — 친구 목록·요청 목록에 표시할 실시간 접속 여부를 한 번에 불러온다.
  const presenceMap = usePresenceMap([...friends, ...incoming, ...outgoing]);
  const selPresence = usePresenceMap(sel ? [sel.uid] : []);
  useEffect(() => {
    let cancelled = false;
    const ccUsername = sel && sel.pub && sel.pub.chesscom;
    if (!ccUsername) { setCcHeaderProf(null); return; }
    fetchChesscomProfile(ccUsername).then((p) => { if (!cancelled) setCcHeaderProf(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [sel && sel.pub && sel.pub.chesscom]);

  // 검색(추가) 탭
  const [q, setQ] = useState(""); const [results, setResults] = useState([]); const [busy, setBusy] = useState(false); const [searched, setSearched] = useState(false);
  const runSearch = async () => { if (!q.trim()) return; setBusy(true); setSearched(true); const r = await userSearch(q.trim()); setResults((r || []).filter((x) => x.id !== meId)); setBusy(false); };
  // (v0.4.6 기능, 사용자 요청) '추가' 탭에서도 계정 센터와 똑같이 내 친구 초대 링크를 보여준다 —
  // 검색으로 아이디를 알아야만 친구를 추가할 수 있던 것과 달리, 링크만 보내면 상대가 곧장 나에게
  // 요청을 보낼 수 있다.
  const [myMid, setMyMid] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!meId) return;
    (async () => {
      try { const rows = await sbSelect("profiles?id=eq." + meId + "&select=mid&limit=1"); if (!cancelled) setMyMid((rows && rows[0] && rows[0].mid) || ""); }
      catch { if (!cancelled) setMyMid(""); }
    })();
    return () => { cancelled = true; };
  }, [meId]);

  const btn = (label, onClick, kind, disabled) => {
    const styles = {
      gold: { background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", border: "none" },
      dark: { background: T.ebony2, color: T.ivory, border: "1px solid #000" },
      ghost: { background: "transparent", color: T.inkSoft, border: "1px solid #C9B58C" },
      danger: { background: "transparent", color: T.blunder, border: "1px solid " + T.blunder },
    }[kind] || {};
    return <button onClick={onClick} disabled={disabled} className="press" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, whiteSpace: "nowrap", ...styles }}>{label}</button>;
  };
  const statusChip = (label, icon) => <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 9px", borderRadius: 8, fontSize: 11, fontWeight: 700, color: T.inkSoft, background: "#EFE3C8", border: "1px solid #DCCBA8" }}>{icon}{label}</span>;

  const tabBtn = (key, label, badge) => (
    <button onClick={() => { setReqNotice(""); setTab(key); }} className="press" style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 800, position: "relative", background: tab === key ? "linear-gradient(180deg,#3A2516,#241509)" : "transparent", color: tab === key ? T.ivoryHi : T.inkSoft }}>
      {label}
      {badge > 0 && <span style={{ position: "absolute", top: 2, right: 8, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, background: T.blunder, color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{badge}</span>}
    </button>
  );

  return (
    <>
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,6,3,.6)", zIndex: 82, display: "flex", alignItems: narrow ? "stretch" : "flex-start", justifyContent: "center", padding: narrow ? 0 : "60px 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: narrow ? "100%" : 440, height: narrow ? "100%" : undefined, display: narrow ? "flex" : undefined, flexDirection: narrow ? "column" : undefined, background: T.paper, borderRadius: narrow ? 0 : 16, border: narrow ? "none" : "1px solid #DCCBA8", overflow: "hidden", boxShadow: narrow ? "none" : "0 20px 50px -12px rgba(0,0,0,.6)" }}>
        {!chatWith && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #E4D5B6", gap: 8, flexShrink: 0 }}>
            {/* (19차 UX3) 프로필 서브뷰 뒤로가기(←)는 좌상단, 닫기(X)는 우상단으로 분리 */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800, color: T.ink, minWidth: 0 }}>
              {sel ? <button onClick={() => { setReqNotice(""); setSel(null); }} aria-label={t("뒤로")} className="press" style={{ width: 28, height: 28, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ArrowLeft size={15} /></button> : <Users size={17} />}
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sel ? t("프로필") : t("친구")}</span>
            </span>
            {/* (버그 수정) 친구 삭제는 목록 줄마다 노출하지 않고, 그 사람 프로필을 클릭해 들어갔을 때만
                우상단(닫기 버튼 옆)에 아이콘으로 노출한다. */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {/* (버그 수정) 눌러 곧장 지워지지 않도록, 이 버튼은 삭제를 확정하지 않고 확인 다이얼로그만 연다. */}
              {sel && relOf(sel.uid) === "friend" && <button onClick={() => setConfirmRemove(sel)} disabled={!!pending[sel.uid]} aria-label={t("친구 삭제")} title={t("친구 삭제")} className="press" style={{ width: 28, height: 28, borderRadius: 8, background: "transparent", color: T.blunder, border: "1px solid " + T.blunder, cursor: pending[sel.uid] ? "default" : "pointer", opacity: pending[sel.uid] ? 0.55 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={14} /></button>}
              <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 28, height: 28, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={15} /></button>
            </span>
          </div>
        )}

        {chatWith ? (
          <div style={{ flex: narrow ? "1 1 auto" : undefined, minHeight: narrow ? 0 : undefined, display: narrow ? "flex" : undefined, flexDirection: narrow ? "column" : undefined }}>
            <ChatPanel onOpenBoardFen={onOpenBoardFen} onOpenBoardSans={onOpenBoardSans} myUid={meId} myUsername={me} otherUid={chatWith.uid} otherUsername={chatWith.username} otherPhoto={chatWith.photo} onBack={() => setChatWith(null)} onOpenSharedPuzzle={onOpenSharedPuzzle} onOpenSharedReview={onOpenSharedReview} onOpenSharedReviewOnBoard={onOpenSharedReviewOnBoard} onAcceptPvpInvite={onAcceptPvpInvite} onOpenUserProfile={onOpenUserProfile} fillNarrow={narrow} myLegacies={myLegacies} myIsGM={myIsGM} myChesscomGames={myChesscomGames} engine={engine}
              mySolved={mySolved} myLineSolves={myLineSolves} solveCounts={solveCounts} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} />
          </div>
        ) : sel ? (() => {
          const p = sel.pub || {}; const rel = relOf(sel.uid); const busyId = !!pending[sel.uid];
          // (v0.2.2 UI#6#1) 채팅 버튼은 아래 actions가 아니라 닉네임/아이디와 같은 줄 우측(헤더)에 둔다.
          const hasActions = rel === "sent" || rel === "incoming" || rel === "none";
          const actions = hasActions ? (
            <>
              {rel === "sent" && statusChip(t("요청 보냄"), <Clock size={12} />)}
              {rel === "incoming" && <>{btn(t("수락"), () => doAccept(sel.uid), "gold", busyId)}{btn(t("거절"), () => doReject(sel.uid), "ghost", busyId)}</>}
              {rel === "none" && btn(t("친구 요청"), () => doRequestByName(sel.username, sel.uid), "gold", busyId)}
              {rel === "none" && reqNotice && <span role="status" style={{ fontSize: 11.5, fontWeight: 700, color: T.blunder }}>{reqNotice}</span>}
            </>
          ) : null;
          return (
            // (버그 수정) 이 서브뷰만 높이 제한 없이 카드가 뷰포트 밖으로 그냥 넘쳐, 스크롤해도 카드 뒤
            // 배경(탭 콘텐츠)이 대신 스크롤됐다 — UserSearchModal의 프로필 서브뷰와 동일하게 자체
            // 최대 높이 + 세로 스크롤을 준다.
            <div style={{ padding: 18, maxHeight: narrow ? undefined : "60vh", flex: narrow ? "1 1 auto" : undefined, minHeight: narrow ? 0 : undefined, overflowY: "auto" }}>
              {/* (사용자 요청, v0.3.9) MyProfileCard와 같은 헤더 구성 — "@아이디" 라벨을 상단에 두고,
                  이름·소개 사이에 따로 있던 @아이디 줄은 없앤다. */}
              <div className="flex items-center justify-between" style={{ marginBottom: 12, flexWrap: "wrap", gap: "8px 10px" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: SITE_FONT, flex: "1 1 150px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{(p.displayId || sel.username)}{roleIcon(sel.username)}</span>
                <div className="flex items-center justify-between gap-2" style={{ flex: "1 1 270px", minWidth: 0 }}>
                  {statsViewToggle(statsView, setStatsView)}
                  {rel === "friend" && <button onClick={() => setChatWith({ uid: sel.uid, username: p.displayId || sel.username, photo: p.photo || null })} disabled={busyId} aria-label={t("채팅")} title={t("채팅")} className="press" style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: busyId ? "default" : "pointer", opacity: busyId ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><MessageCircle size={14} /></button>}
                </div>
              </div>
              {statsView === "cc" && p.chesscom ? (
                <ChesscomHeaderIdentity ccHeaderProf={ccHeaderProf} fallbackUsername={p.chesscom} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                    {p.photo ? <img src={p.photo} alt="" style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover", border: "1px solid #C9B58C", ...(gmPhotoRingStyle(tierFromXp(p.xp || 0).tier.key === "grandmaster") || {}) }} />
                      : <span style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 26 }}>{(p.nickname || sel.username || "?")[0].toUpperCase()}</span>}
                    <OnlineDot lastSeenMs={selPresence[sel.uid]} overlay size={13} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{p.nickname || (p.displayId || sel.username)}</div>
                    {p.bio && <div style={{ fontSize: 12, color: T.ink, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><UgcText text={p.bio} kind="bio" inline render={(shown, tg) => <>{tg}{shown}</>} /></div>}
                    {presenceLabel(selPresence[sel.uid]) && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>OpenChess {presenceLabel(selPresence[sel.uid])}</div>}
                  </div>
                </div>
              )}
              {/* (버그 수정) 채팅/친구 요청·수락·거절 버튼을 카드 맨 아래 대신 티어와 메인 퀘스트
                  진척도 사이(actions prop)에 둔다. */}
              <ProfileStatsPanel pub={p} statsView={statsView} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} onOpenPuzzle={onOpenPuzzle} mySolved={mySolved} myLineSolves={myLineSolves} actions={actions} ownerUid={sel.uid} viewerUid={meId} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} />
            </div>
          );
        })() : (
          <>
            <div style={{ display: "flex", gap: 4, padding: "10px 12px 0", flexShrink: 0 }}>
              {tabBtn("friends", t("친구"))}
              {tabBtn("requests", t("요청"), incoming.length)}
              {tabBtn("add", t("추가"))}
            </div>
            <div style={{ padding: 14, minHeight: 180, maxHeight: narrow ? undefined : 420, flex: narrow ? "1 1 auto" : undefined, overflowY: "auto" }}>
              {!SB_ON ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("친구 기능은 서버 연결이 필요합니다. (현재 오프라인 모드)")}</div>
                : loading ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("불러오는 중…")}</div>
                : tab === "friends" ? (
                  friends.length === 0 ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("친구 없음. ‘추가’에서 아이디로 검색해 요청 발송")}</div>
                    : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><AnimatePresence>{friends.map((u, i) => (
                        // (버그 수정) 목록 줄의 삭제 버튼은 없애고(프로필 클릭 후 우상단에서만 삭제 가능),
                        // 채팅 버튼도 텍스트 대신 아이콘으로 — 헤더의 채팅 버튼과 같은 아이콘으로 통일.
                        <FadeIn key={u} index={i}><FriendRow id={uname(u)} pub={(profiles[u] || {}).pub} lastSeenMs={presenceMap[u]} onClick={() => viewProfileUid(u)} right={<>
                          {/* (기능7, 사용자 요청) 친구가 지금 실시간 대국 중이면 참가하지 않고 구경만 할 수 있는 관전 버튼. */}
                          {friendActiveGames[u] != null && <button onClick={() => setSpectateGameId(friendActiveGames[u])} aria-label={t("관전")} title={t("관전")} className="press" style={{ width: 30, height: 30, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Eye size={14} /></button>}
                          <button onClick={() => setChatWith({ uid: u, username: ((profiles[u] || {}).pub || {}).displayId || uname(u), photo: ((profiles[u] || {}).pub || {}).photo || null })} aria-label={t("채팅")} title={t("채팅")} className="press" style={{ width: 30, height: 30, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><MessageCircle size={14} /></button>
                        </>} /></FadeIn>
                      ))}</AnimatePresence></div>
                ) : tab === "requests" ? (
                  incoming.length === 0 && outgoing.length === 0 ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("받은/보낸 요청 없음")}</div>
                    : <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {incoming.length > 0 && <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, marginBottom: 6, letterSpacing: ".02em" }}>{t("받은 요청")}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><AnimatePresence>{incoming.map((u, i) => (
                            <FadeIn key={u} index={i}><FriendRow id={uname(u)} pub={(profiles[u] || {}).pub} lastSeenMs={presenceMap[u]} onClick={() => viewProfileUid(u)} right={<>{btn(t("수락"), () => doAccept(u), "gold", !!pending[u])}{btn(t("거절"), () => doReject(u), "ghost", !!pending[u])}</>} /></FadeIn>
                          ))}</AnimatePresence></div>
                        </div>}
                        {outgoing.length > 0 && <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, marginBottom: 6, letterSpacing: ".02em" }}>{t("보낸 요청")}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><AnimatePresence>{outgoing.map((u, i) => (
                            <FadeIn key={u} index={i}><FriendRow id={uname(u)} pub={(profiles[u] || {}).pub} lastSeenMs={presenceMap[u]} onClick={() => viewProfileUid(u)} right={btn(t("취소"), () => doRemove(u), "ghost", !!pending[u])} /></FadeIn>
                          ))}</AnimatePresence></div>
                        </div>}
                      </div>
                ) : (
                  <div>
                    {/* (사용자 요청) 검색 박스를 친구 링크 박스보다 위에 표시한다. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} placeholder={t("아이디 또는 #MID로 검색")} autoFocus style={{ flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 13 }} />
                      <button onClick={runSearch} className="press" style={{ padding: "9px 14px", borderRadius: 9, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: "pointer", fontSize: 12 }}>{t("검색")}</button>
                    </div>
                    {!!myMid && <InviteLinkBox mid={myMid} />}
                    {reqNotice && <div role="status" style={{ fontSize: 12, fontWeight: 700, color: T.blunder, padding: "2px 4px 8px" }}>{reqNotice}</div>}
                    {busy ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("검색 중…")}</div>
                      : results.length === 0 ? (searched ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("일치하는 유저 없음")}</div> : null)
                        : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{results.map((r, i) => {
                            const uid = r.id; const rel = relOf(uid); const busyId = !!pending[uid];
                            const right = rel === "friend" ? statusChip(t("친구"), <UserCheck size={12} />)
                              : rel === "sent" ? statusChip(t("요청됨"), <Clock size={12} />)
                                : rel === "incoming" ? btn(t("수락"), () => doAccept(uid), "gold", busyId)
                                  : btn(t("요청"), () => doRequestByName(r.username, uid), "gold", busyId);
                            return <FadeIn key={uid} index={i}><FriendRow id={r.username} pub={r.pub} onClick={() => { setProfiles((prev) => ({ ...prev, [uid]: { username: r.username, pub: r.pub || {} } })); setSel({ uid, username: r.username, pub: r.pub || {} }); }} right={right} /></FadeIn>;
                          })}</div>}
                  </div>
                )}
            </div>
          </>
        )}
      </div>
    </div>
    {/* (버그 수정) 친구 삭제는 되돌릴 수 없는 동작이라, 곧장 지우지 않고 한 번 더 확인받는다
        (로그아웃 확인 다이얼로그와 동일한 패턴) — 친구 모달(zIndex 82) 위에 뜨도록 더 높은 zIndex. */}
    {spectateGameId != null && <PvpSpectateModal gameId={spectateGameId} onClose={() => setSpectateGameId(null)} />}
    {confirmRemove && (
      <div onClick={() => setConfirmRemove(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 300, width: "100%", background: "linear-gradient(180deg,#F2E8D5,#E2D2B2)", borderRadius: 14, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 6 }}>{t("친구 삭제")}</div>
          <p style={{ fontSize: 13, color: T.inkSoft, marginBottom: 16 }}>{tx("{0}님을 친구 목록에서 삭제할까요?", (confirmRemove.pub && confirmRemove.pub.nickname) || confirmRemove.username)}</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmRemove(null)} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 700, cursor: "pointer" }}>{t("취소")}</button>
            <button onClick={() => { doRemove(confirmRemove.uid); setConfirmRemove(null); }} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: T.blunder, color: "#fff", fontWeight: 800, cursor: "pointer" }}>{t("삭제")}</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}