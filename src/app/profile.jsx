// (v0.6.0, App.jsx 분할) 'profile' 화면과 그 화면만 쓰는 조각
// 동작 변경 없이 App.jsx에서 그대로 옮겼다(REFACTOR_NOTES.md Phase 3 참고).
import { SB_ON, sbSelect, sbRpc } from "../lib/supabaseClient.js";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { T, MOTION_EASE, TIER_BG_IMAGE, TIER_DECAGON_PATH } from "../lib/theme.js";
import { Swords, Trophy, Lock, ChevronDown, Search, Target, X, ChevronRight, Check } from "lucide-react";
import { SITE_FONT, SEQ_FONT } from "../components/engineLines.jsx";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { computeRatingChanges, countryFlag } from "../lib/chesscom.js";
import { drawKindLabel, moveNumber, boardFromSans, sanSrc, stripSuffix } from "../lib/chessRules.js";
import { BestMoveJumpButton, ListPager } from "../components/uiPrimitives.jsx";
import { QCOLOR } from "../lib/moveKinds.js";
import { badgeIcon } from "../components/badges.jsx";
import { PieceGlyph, TierPieceGlyph } from "../components/pieces.jsx";
import { tierFromXp, TIER_STATIONS, TIER_COLORS, tierGlowHex } from "../lib/tierSystem.js";
import { createPortal } from "react-dom";
import { ChesscomLogo, ClickInfoBadge, LEGACY_BLOCK_BTN_STYLE, LEGACY_FONT, LEGACY_TILE_FLEX, LEGACY_TYPES, LegacyBlockDecor, LegacyStoneTile, MINIGAME_PLACEMENT, MaterialIcon, PuzzleCard, REVIEW_RESULT_CACHE_VERSION, SolvedPuzzlesBlock, TIME_CLASS_LABEL, TierStatPill, fetchChesscomProfile, isPlacedStat, tcCatLabel, fetchMinigameStats, fmtFull, legacyBaseKey, legacyMoveLabel, minigameBestFromServer, minigameBestLabel, minigameRecordText, puzzleFetch, puzzleNo, reviewGameKey, snapNode, useBoardSize, useChessCom, useNarrow } from "./common.jsx";
import { PLAY_SPECIAL_GAMES } from "./play.jsx";
import { GameFilterPills, GameRecordSummary, OpenChessGameHistory, RatingHistoryChart, RecentGamesList } from "./gameHistory.jsx";
import { CHESS_RATING_CATS, TC_KEY_CAT } from "../lib/chessRating.js";

import { fmtDate, fmtDateOnly, t, tx } from "../lib/i18n.js";
// (신규 기능, 사용자 요청) 약점 리포트 — 이미 리뷰해 본 대국들(reviewUnlocked)의 크라우드소싱
// 분석 결과를 한 번에 모아 온다. reviewedAnalysisFetch처럼 한 판씩 묻지 않고 cc_id 여러 개를
// in.() 한 번으로 묻는다 — 프로필을 열 때마다 리뷰한 대국 수만큼 왕복이 생기는 걸 피하기 위함.
// expectedLen/depth 검증까지는 하지 않는다(리포트는 집계 통계라 어느 정도 정확도면 충분하고, 검증을
// 걸면 엔진 설정이 바뀔 때마다 리포트가 통째로 비어 보일 수 있다 — reviewedAnalysisFetch의 그 엄격한
// 재현성 검증은 "이 리뷰 화면에 지금 보여줄 값"에는 꼭 필요하지만 이 용도에는 과하다).
async function reviewedAnalysesBatch(ccIds) {
  if (!SB_ON || !ccIds.length) return {};
  try {
    const rows = await sbSelect("reviewed_games?cc_id=in.(" + ccIds.join(",") + ")&select=cc_id,analysis");
    const map = {};
    for (const r of rows || []) {
      const a = r.analysis;
      if (a && a.v === REVIEW_RESULT_CACHE_VERSION && a.result && a.result.moves) map[r.cc_id] = a.result;
    }
    return map;
  } catch { return {}; }
}
// 리뷰된 대국들의 그레이딩 결과(analysesByCcId)를 오프닝별로 모아, "이 오프닝에서 게임당 평균 몇 번
// 블런더가 나는가"를 계산한다 — 상대가 둔 수가 아니라 항상 "내가 둔 수"만 집계한다(game.color로
// 어느 쪽이 나인지 판정). 표본이 너무 적은(2판 미만) 오프닝은 순위에서 제외해 우연한 한 판짜리
// 블런더로 "이 오프닝이 약점"이라고 과대 해석하지 않게 한다.
function weaknessReportFromAnalyses(games, analysesByCcId) {
  // (버그 수정, 코드 리뷰 지적) 오프닝 이름을 그대로 일반 객체의 키로 쓰면, 혹시라도 그 이름이
  // "__proto__" 같은 프로토타입 체인 특수 키와 겹칠 때 Object.prototype을 오염시킬 수 있다 —
  // 실전에서 오프닝 이름이 그렇게 나올 일은 거의 없지만(사용자 입력이 아니라 chess.com ECO
  // 이름이므로), 굳이 그 위험을 안고 갈 이유가 없어 Map으로 바꾼다.
  const byOpening = new Map();
  const kindTotals = {};
  let gamesUsed = 0;
  for (const g of games) {
    const result = analysesByCcId[g.id];
    if (!result) continue;
    gamesUsed++;
    const myWhite = g.color === "w";
    const name = g.opening || t("기타");
    let ob = byOpening.get(name);
    if (!ob) { ob = { name, n: 0, blunders: 0, mistakes: 0 }; byOpening.set(name, ob); }
    ob.n++;
    for (const m of result.moves) {
      if (m.white !== myWhite || !m.kind) continue;
      kindTotals[m.kind] = (kindTotals[m.kind] || 0) + 1;
      if (m.kind === "blunder") ob.blunders++;
      else if (m.kind === "mistake") ob.mistakes++;
    }
  }
  const openings = [...byOpening.values()]
    .filter((o) => o.n >= 2)
    .map((o) => ({ ...o, blunderRate: o.blunders / o.n }))
    .sort((a, b) => b.blunderRate - a.blunderRate || b.n - a.n);
  return { openings, kindTotals, gamesUsed };
}
// (v0.6.2, 사용자 요청) /user 페이지 성취도 — XP·퍼즐·레슨·일반 대국(타임 컨트롤별)·미니게임 기록을 한 곳에 모은다.
// 위에서부터 ① 핵심 수치 4칸(XP·퍼즐 레이팅·푼 퍼즐·레슨) ② 미니게임 ③ 일반 대국(타임 컨트롤별 레이팅 4칸 + 최근 대국 기록).
// 전적은 한 번만 읽어(minigame_stats) 일반 대국과 미니게임이 함께 쓴다. 기록이 없는 칸도 자리는 그대로 두고 흐리게 보여 줘 화면 구성이 사람마다 같다.
const ACH_CARD = { border: "1px solid #DCCBA8", borderRadius: 14, background: "rgba(255,255,255,.45)", padding: "12px 12px 12px" };
function AchSection({ title, icon, right, children }) {
  return (
    <div style={{ ...ACH_CARD, marginBottom: 10 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span className="flex items-center gap-1" style={{ fontSize: 12, fontWeight: 800, color: T.ink }}>{icon}{title}</span>
        {right && <span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>{right}</span>}
      </div>
      {children}
    </div>
  );
}
// 값 하나를 크게, 위에 이름·아래에 보조 설명 — 핵심 수치·타임 컨트롤 칸이 같은 틀을 쓴다.
function AchCell({ label, value, sub, dim, chip }) {
  return (
    <div style={{ minWidth: 0, padding: "9px 8px 8px", borderRadius: 10, background: "rgba(255,255,255,.55)", border: "1px solid rgba(150,112,58,.2)", textAlign: "center", opacity: dim ? 0.55 : 1 }}>
      <div className="flex items-center justify-center" style={{ gap: 4, fontSize: 10.5, fontWeight: 800, color: "rgba(90,58,34,.7)", marginBottom: 3 }}>{label}{chip}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color: T.ink, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(90,58,34,.58)", marginTop: 3, minHeight: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub || ""}</div>
    </div>
  );
}
function AchievementDashboard({ pub, uid, mq, onOpenGame, onOpenGameAnalyze }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!uid) { setStats({}); return undefined; }
    let cancelled = false;
    fetchMinigameStats(uid).then((r) => { if (!cancelled) setStats(r || {}); }).catch(() => { if (!cancelled) setStats({}); });
    return () => { cancelled = true; };
  }, [uid]);
  const st = stats || {};
  // 열 수는 /user 페이지의 데스크톱 배치(880px 이상, 통계 열 약 540px)일 때만 넓게 — 좁은 화면(콘텐츠 최대 448px)은 2열·미니게임은 1열.
  const wide = !useNarrow(880);
  const cols4 = wide ? "repeat(4, 1fr)" : "repeat(2, 1fr)";
  const info = tierFromXp(pub.xp || 0);
  const solved = Array.isArray(pub.solvedNos) ? pub.solvedNos.length : 0;
  const mqPct = mq && mq.totalChapters ? Math.round((100 * mq.claimed) / mq.totalChapters) : 0;
  const chessRows = CHESS_RATING_CATS.map((c) => ({ c, r: st["chess_" + c] }));
  const totalGames = Object.values(st).reduce((a, r) => a + (r && r.games ? r.games : 0), 0);   // 일반 대국 + 미니게임 (예전 단일 'chess' 행 포함)
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: cols4, gap: 8, marginBottom: 10 }}>
        <AchCell label="XP" value={fmtFull(pub.xp || 0)} sub={info.tier.label + (info.division ? " " + info.division : "")} />
        <AchCell label={t("퍼즐 레이팅")} value={pub.puzzleRating != null ? fmtFull(pub.puzzleRating) : "-"} sub={t("푼 퍼즐 {0}개", fmtFull(solved))} dim={pub.puzzleRating == null} />
        <AchCell label={t("레슨")} value={mq && mq.totalChapters > 0 ? mq.claimed + "/" + mq.totalChapters : "-"} sub={mq && mq.totalChapters > 0 ? t("{0}% 완료", mqPct) : null} dim={!(mq && mq.totalChapters > 0)} />
        <AchCell label={t("총 대국")} value={t("{0}판", fmtFull(totalGames))} sub={stats ? null : "…"} dim={!totalGames} />
      </div>
      <AchSection title={t("미니게임")} icon={<Trophy size={13} color={T.brass} />}>
        <div style={{ display: "grid", gridTemplateColumns: wide ? "repeat(2, 1fr)" : "1fr", gap: 8 }}>
          {PLAY_SPECIAL_GAMES.map((g) => {
            const r = st[g.gameType];
            const GIcon = g.Icon || Lock;
            const has = !!(r && (r.games > 0 || r.best_score != null));
            const placed = isPlacedStat(r);
            const best = r ? minigameBestFromServer(g.gameType, r.best_score, r.best_detail) : null;
            return (
              <div key={g.key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,.55)", border: "1px solid rgba(150,112,58,.2)", opacity: has ? 1 : 0.55, minWidth: 0 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg," + g.accent + ",#241509)" }}><GIcon size={14} color="#fff" /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                  <span style={{ display: "block", fontSize: 10, color: T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {has ? minigameRecordText(r) + (best != null ? " · " + minigameBestLabel(g.gameType, best) : "") : t("기록 없음")}
                  </span>
                </span>
                <span style={{ flexShrink: 0, textAlign: "right" }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 900, color: placed ? T.ink : T.inkSoft, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" }}>{placed ? r.rating : "-"}</span>
                  <span style={{ display: "block", fontSize: 9.5, color: T.inkSoft }}>{placed ? t("레이팅") : r && r.games ? t("배치 중") : ""}</span>
                </span>
              </div>
            );
          })}
        </div>
      </AchSection>
      <AchSection title={t("일반 대국")} icon={<Swords size={13} color={T.brass} />} right={t("타임 컨트롤별 레이팅")}>
        <div style={{ display: "grid", gridTemplateColumns: cols4, gap: 8 }}>
          {chessRows.map(({ c, r }) => {
            const placed = isPlacedStat(r);
            return <AchCell key={c} label={tcCatLabel(TC_KEY_CAT[c])} value={placed ? r.rating : "-"} dim={!r || !r.games}
              sub={!r || !r.games ? t("기록 없음") : placed ? minigameRecordText(r) : t("배치 {0}/{1}", Math.min(r.rated_games, MINIGAME_PLACEMENT), MINIGAME_PLACEMENT)} />;
          })}
        </div>
        {/* (v0.6.2, 사용자 요청) 일반 대국 최근 기록 — chess.com 대국 통계와 같은 UI(필터·전적·레이팅 그래프·최근 대국). 실시간·봇 대국 모두. */}
        <OpenChessGameHistory uid={uid} username={pub.nickname || pub.displayId || ""} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />
      </AchSection>
    </div>
  );
}
// (사용자 요청) blendHex(항상 50:50)과 달리 임의의 비율(t, 0~1)로 두 색을 섞는다 — 티어 여정 지도의
// 닫기 버튼이 스크롤 위치에 따라 인접한 두 티어 색 사이를 서서히(그라데이션을 따라) 오갈 때 쓴다.
function hexLerp(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const mix = (shift) => Math.round((((pa >> shift) & 255) * (1 - t)) + (((pb >> shift) & 255) * t));
  return "#" + [16, 8, 0].map((s) => Math.max(0, Math.min(255, mix(s))).toString(16).padStart(2, "0")).join("");
}
function hexAlpha(hex, a) {
  const p = parseInt(hex.slice(1), 16);
  return "rgba(" + ((p >> 16) & 255) + "," + ((p >> 8) & 255) + "," + (p & 255) + "," + a + ")";
}
// (사용자 요청) 유산 블록 좋아요 — puzzle_like_toggle과 완전히 같은 토글 패턴이지만, 유산은 전역
// 번호가 없어 (등록한 유저 ownerUid, 슬롯 키)로 식별한다. ownerUid의 유산 좋아요 수 전체와, 지금
// 보는 사람(uid)이 그중 어느 슬롯을 좋아요했는지를 각각 한 번의 조회로 가져온다.
async function legacyLikeCounts(ownerUid) {
  if (!SB_ON || !ownerUid) return {};
  try {
    const rows = await sbSelect("legacy_like_counts?owner_uid=eq." + encodeURIComponent(ownerUid) + "&select=slot_key,likes");
    const m = {}; (rows || []).forEach((x) => { m[x.slot_key] = x.likes; }); return m;
  } catch { return {}; }
}
async function legacyLikedSlots(ownerUid, uid) {
  if (!SB_ON || !ownerUid || !uid) return new Set();
  try {
    const rows = await sbSelect("legacy_likes?owner_uid=eq." + encodeURIComponent(ownerUid) + "&uid=eq." + encodeURIComponent(uid) + "&select=slot_key");
    return new Set((rows || []).map((x) => x.slot_key));
  } catch { return new Set(); }
}
async function legacyLikeToggle(ownerUid, slotKey, uid) {
  // (보안 수정) 서버(legacy_like_toggle RPC)가 auth.uid()로 행위자를 직접 판별하므로 p_uid는 더 이상
  // 보내지 않는다 — uid 인자는 "로그인 여부"만 클라이언트에서 미리 확인하는 용도로 남겨 둔다.
  if (!SB_ON || !ownerUid || !uid) return null;
  try { const r = await sbRpc("legacy_like_toggle", { p_owner_uid: ownerUid, p_slot_key: slotKey }); const row = Array.isArray(r) ? r[0] : r; return row ? { liked: !!row.liked, likes: row.likes || 0 } : null; }
  catch { return null; }
}
// (버그 수정) 줄바꿈(들여쓰기)만으로는 상위-하위 오프닝의 관계가 잘 안 보인다는 피드백 — 하위
// 오프닝 묶음을 왼쪽 세로선(트리 가지)으로 잇고, 각 행에서 그 세로선까지 짧은 가로선(elbow)을 그어
// 파일 탐색기 같은 계통도 느낌을 준다. 각 노드의 수치는 자신 + 모든 하위 갈래의 합산(rollup)이라,
// 상위 행이 곧 그 아래 중첩된 하위 행들의 총합으로 보인다.
// (버그 수정) 이름이 길면 한 줄 말줄임에 잘려 전혀 안 보이던 문제 — 이름을 통계 줄과 분리해 자기
// 줄에서 감싸 보여준다. (버그 수정) 예전엔 여기서도 최대 2줄까지만 보여주고 그 이상은 말줄임(…)
// 처리했는데, 모바일처럼 화면이 좁고 깊이 중첩된(들여쓰기가 누적된) 오프닝일수록 2줄로도 모자라
// 이름이 중간에 잘려 보였다(title 속성은 모바일 터치 환경에서 아예 작동하지 않아 전체 이름을
// 확인할 방법도 없었다). 줄 수 제한을 없애 이름이 몇 줄이 되든 항상 끝까지 그대로 보이게 한다.
// (버그 수정) 이름(영문 오프닝 이름은 길고 공백이 많음)과 통계를 한 줄에 양 끝 정렬(space-between)로
// 욱여넣었더니, 중첩이 깊어질수록(들여쓰기 누적) 이름 칸에 남는 폭이 몇 십 px까지 줄어들어 단어
// 하나하나가 줄바꿈되며 통계 배지와 겹쳐 보이는 문제가 있었다 — 깊이가 얼마든 항상 안전하도록
// 이름과 통계를 아예 다른 줄로 분리한다(한 줄에 붙여 보여주는 대신, 통계는 이름 바로 아래).
// (버그 수정) 오프닝별 승률 트리가 항상 전부 펼쳐진 채로만 보여서, 깊이 중첩된 하위 갈래가 많은
// 계정은 목록이 한없이 길어졌다 — 나무위키의 문서 내 하위 항목처럼 각 갈래를 독립적으로 접었다 폈다
// 할 수 있게 한다. 최상위 갈래는 기본으로 펼쳐 두고(전체 감을 바로 보여줌), 그 아래 하위 갈래부터는
// 기본으로 접어 둬(가장 흔히 길어지는 지점) 목록이 처음부터 너무 길어지지 않게 한다.
function OpeningWinrateRow({ node, depth, onOpenOpening }) {
  const isRoot = depth === 0;
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(isRoot);
  const nameStyle = { display: "block", wordBreak: "break-word", lineHeight: 1.3, fontSize: isRoot ? 12.5 : 11.5 };
  return (
    <div style={{ position: "relative" }}>
      {!isRoot && <span aria-hidden style={{ position: "absolute", left: -9, top: 12, width: 9, height: 1.5, background: "#D9C7A0" }} />}
      <div className="flex items-start" style={{ gap: 4, padding: isRoot ? "7px 0 6px" : "5px 0", borderTop: isRoot ? "1px solid #E4D5B6" : "none" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {onOpenOpening
            ? <button onClick={() => onOpenOpening(node.navName || node.name)} title={node.name} className="press" style={{ ...nameStyle, width: "100%", color: T.cocoa || "#5A3A22", fontWeight: isRoot ? 700 : 600, background: "none", border: "none", textAlign: "left", cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(120,80,40,.35)", padding: 0 }}>{node.name}</button>
            : <span title={node.name} style={{ ...nameStyle, color: T.ink, fontWeight: isRoot ? 700 : 600 }}>{node.name}</span>}
          <span style={{ display: "block", marginTop: 2, fontSize: isRoot ? 12.5 : 11.5, fontFamily: SITE_FONT, color: T.inkSoft }}><b style={{ color: node.wr >= 55 ? T.best : node.wr >= 45 ? T.brass : T.blunder }}>{node.wr}%</b> · {node.w}/{node.d}/{node.l} · {tx("{0}판", node.n)}</span>
        </div>
        {/* 이름 버튼(누르면 도감으로 이동)과 별개의 클릭 영역 — 접기/펼치기가 이동 동작을 가리지 않는다. */}
        {hasChildren && (
          <button onClick={() => setOpen((v) => !v)} aria-label={open ? t("하위 갈래 접기") : t("하위 갈래 펼치기")} className="press" style={{ flexShrink: 0, width: 22, height: 22, marginTop: 1, borderRadius: 6, background: "rgba(0,0,0,.05)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronDown size={13} style={{ color: T.inkSoft, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
          </button>
        )}
      </div>
      {hasChildren && open && (
        <div style={{ marginLeft: 12, borderLeft: "1.5px solid #D9C7A0", paddingLeft: 8 }}>
          {node.children.map((c) => <OpeningWinrateRow key={c.name} node={c} depth={depth + 1} onOpenOpening={onOpenOpening} />)}
        </div>
      )}
    </div>
  );
}
// (v0.2.6 버그 수정) "가장 많이 둔 오프닝"이 오프닝 이름 대신 각 수 인덱스별 최다 수(SAN)를 보여줘,
// 실제로 어떤 오프닝을 즐겨 두는지 한눈에 알기 어려웠다 — 대국마다 이미 계산돼 있는 오프닝 이름
// (g.opening)의 빈도를 세어, 실제로 가장 많이 나온 오프닝 이름들을 2.2초 간격으로 번갈아 보여준다.
// color로 백/흑 어느 쪽 대국을 집계할지 고른다(games는 이미 시간 규정 필터가 적용된 목록).
// (v0.2.6 UI) 예전 버전(TopWhiteMovesAnimated)에 있던 "백 n수" 식 배지를 되살려, 지금 몇 번째
// 수까지 뒀을 때 도달하는 오프닝을 보여주는 중인지 작은 박스로 표시한다(흑 쪽은 기존 "흑 오프닝
// 레파토리" 텍스트 라벨을 이 배지로 완전히 대체). 오프닝 이름 글자 크기를 줄여 긴 이름도 잘리지
// 않게 했다.
// (v0.2.6 버그 수정) "n수" 배지를 처음엔 "상위 몇 번째로 많이 둔 오프닝인가"(빈도 순위)로 계산해,
// 그 순위를 그대로 "n수"(n번째 수)라고 잘못 표시했다 — 실제 그 수 깊이와 전혀 안 맞아, 예를 들어
// 백의 3번째 수(Bc4)까지 둬야 나오는 Italian Game이 "백 1수"로 표시되는 식의 오류가 났다. "n수"는
// 문자 그대로 백/흑이 정확히 그 번째 자기 수를 뒀을 때 도달하는 포지션이어야 한다 — 백의 n번째
// 수는 ply 2n-1(백1수=ply1, 백2수=ply3 ...), 흑의 n번째 수는 ply 2n에 해당하는 지점까지 실제
// 대국 수순을 잘라(g.moves.slice(0, ply)) 그 정확한 포지션의 스냅샷 오프닝 이름(snapNode)을 다시
// 찾고, 그 깊이(n=1~6)마다 가장 많이 나온 이름을 집계한다 — 다른 곳(가장 많이 둔 오프닝 트리 등)과
// 동일하게 g.moves를 접미사(+/#) 그대로 스냅샷 트리 키에 맞춰 쓴다(parsePgnSans가 이미 그렇게 보존).
function computeTopOpenings(games, color) {
  const use = games.filter((g) => g.color === color && g.moves && g.moves.length);
  const out = [];
  for (let n = 1; n <= 6; n++) {
    const ply = color === "w" ? 2 * n - 1 : 2 * n;
    const counts = {};
    for (const g of use) {
      if (g.moves.length < ply) continue;
      const nd = snapNode(g.moves.slice(0, ply));
      const name = nd && nd.opening ? nd.opening.name : null;
      if (!name) continue;
      counts[name] = (counts[name] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length) out.push({ n, name: sorted[0][0], count: sorted[0][1] });
  }
  return out;
}
// (버그 수정) "n수" 배지가 백/흑 박스마다 자기 목록 길이대로 따로 도는 타이머로 순환해, 두 박스가
// 화면에 동시에 서로 다른 n(예: "백 1수"·"흑 5수")을 보여주는 경우가 있었다 — 사용자는 두 박스가
// 항상 "같은 n"을 함께 보여주길 원한다. 백/흑 모두에 오프닝이 있는 n만 모아 공유 목록으로 만들고,
// 단일 타이머로 그 목록만 순환해 두 박스가 항상 같은 n에서 함께 움직이도록 했다.
function OpeningBox({ label, color, cur, dotsLen, dotsIdx }) {
  if (!cur) return null;
  const nBadge = t("{0} {1}수", (color === "w" ? t("백") : t("흑")), cur.n);
  // (v0.2.6 UI) "백 n수"/"흑 n수" 배지를 라벨과 같은 줄에 붙이지 않고 오프닝 이름 바로 위 자기
  // 줄에 두며, 배지 배경을 금색 그라데이션으로 통일했다(백/흑 공통).
  const badgeStyle = { display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", fontSize: 10, fontWeight: 800, color: "#241509", fontFamily: SITE_FONT };
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 800, color: T.brass, marginBottom: 4 }}>{label}</div>}
      <div style={{ marginBottom: 4 }}><span style={badgeStyle}>{nBadge}</span></div>
      {/* (v0.2.6 버그 수정) 오프닝 이름은 길이가 제각각이라(예: "Italian Game" vs "Sicilian Defense:
          Najdorf Variation, English Attack"), 번갈아 나올 때마다 짧은 이름은 1줄로 접히고 긴
          이름은 2줄로 늘어나며 카드 폭·높이가 들썩였다 — 폭은 항상 부모 너비 그대로(고정), 높이는
          1줄짜리 이름이 나와도 항상 2줄 분량을 미리 확보해 둬 어느 이름이 나오든 레이아웃이 흔들리지
          않는다. 글자 크기를 16→13으로 줄여 긴 이름이 2줄 안에서 잘리지 않고 온전히 들어가게 했다. */}
      <div style={{ position: "relative", minHeight: 38, overflow: "hidden", width: "100%" }}>
        <AnimatePresence mode="wait">
          <motion.div key={cur.n} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35, ease: MOTION_EASE }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: T.ink, fontFamily: SEQ_FONT, lineHeight: 1.3 }}>{cur.name}</span>
            <span style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: SITE_FONT, flexShrink: 0, whiteSpace: "nowrap" }}>{tx("{0}회", fmtFull(cur.count))}</span>
          </motion.div>
        </AnimatePresence>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
        {Array.from({ length: dotsLen }).map((_, i) => <span key={i} style={{ width: i === dotsIdx ? 14 : 6, height: 4, borderRadius: 999, background: i === dotsIdx ? T.brass : "#DCCBA8", transition: "all .3s ease" }} />)}
      </div>
    </div>
  );
}
function TopOpeningsPair({ games, label }) {
  const topW = useMemo(() => computeTopOpenings(games, "w"), [games]);
  const topB = useMemo(() => computeTopOpenings(games, "b"), [games]);
  const sharedNs = useMemo(() => {
    const bSet = new Set(topB.map((o) => o.n));
    const both = topW.filter((o) => bSet.has(o.n)).map((o) => o.n);
    if (both.length) return both;
    // 백/흑 둘 다에 있는 n이 하나도 없는 극히 드문 경우엔, 그래도 뭔가는 보여주도록 백 목록을 그대로 쓴다.
    return topW.length ? topW.map((o) => o.n) : topB.map((o) => o.n);
  }, [topW, topB]);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [sharedNs.length]);
  useEffect(() => {
    if (sharedNs.length <= 1) return;
    const iv = setInterval(() => setIdx((i) => (i + 1) % sharedNs.length), 2200);
    return () => clearInterval(iv);
  }, [sharedNs.length]);
  if (!sharedNs.length) return null;
  const curIdx = Math.min(idx, sharedNs.length - 1);
  const n = sharedNs[curIdx];
  const curW = topW.find((o) => o.n === n);
  const curB = topB.find((o) => o.n === n);
  return (
    <>
      <OpeningBox label={label} color="w" cur={curW} dotsLen={sharedNs.length} dotsIdx={curIdx} />
      <OpeningBox color="b" cur={curB} dotsLen={sharedNs.length} dotsIdx={curIdx} />
    </>
  );
}
// (사용자 요청) onSelectGame — 유산(Legacy) 관리 화면이 이 컴포넌트를 그대로 재사용하면서, "최근 대국"
// 각 줄의 검색·리뷰 버튼 자리에 그 대신 "선택" 버튼 하나만 두기 위한 선택적 콜백. 넘기지 않으면(기존
// 프로필·유저 검색 등) 지금까지와 완전히 동일하게 동작한다.
export function AccountChessStats({ chesscom, username, onOpenOpening, onOpenGame, onOpenGameAnalyze, reviewUnlocked, onSelectGame, selectedGameId, compact }) {
  const [prof, setProf] = useState(null);
  useEffect(() => {
    let cc = false;
    if (!username) { setProf(null); return; }
    fetchChesscomProfile(username).then((p) => { if (!cc) setProf(p); }).catch(() => {});
    return () => { cc = true; };
  }, [username]);
  const ready = chesscom && chesscom.status === "ready";
  // (v0.2.2 UI#6#5) chess.com 통계를 전체/래피드/블리츠/불릿으로 나눠 본다. 통계 집계에서 일일 대국과
  // 체스960(변형)은 제외한다 — 표준 대국의 시간 규정별 실력만 반영한다.
  const [timeFilter, setTimeFilter] = useState("all");
  // (v0.2.6 기능) 타임 컨트롤에 더해 흑/백으로도 나눠 볼 수 있도록 색 필터를 추가.
  const [colorFilter, setColorFilter] = useState("all");
  // (v0.3.1 기능 → v0.3.5 리뷰 티켓 제거) 한 번이라도 리뷰를 열어 본 대국만 따로 모아 보는 체크박스 —
  // reviewUnlocked(리뷰를 열 때마다 쌓이는 "열어본 대국" 기록, 더는 소비되는 재화가 아니라 순수 기록용)가
  // 넘어오지 않는 화면(예: 다른 사람 프로필)에서는 체크박스 자체를 숨긴다(내 리뷰 기록이 아니므로).
  const [onlyReviewed, setOnlyReviewed] = useState(false);
  const games = useMemo(() => {
    const base = (ready ? chesscom.games : []).filter((g) => g.timeClass !== "daily" && (g.rules || "chess") === "chess");
    let out = timeFilter === "all" ? base : base.filter((g) => g.timeClass === timeFilter);
    if (colorFilter !== "all") out = out.filter((g) => g.color === colorFilter);
    if (onlyReviewed && reviewUnlocked) out = out.filter((g) => reviewUnlocked.has(reviewGameKey(g)));
    return out;
  }, [ready, chesscom && chesscom.games, timeFilter, colorFilter, onlyReviewed, reviewUnlocked]);
  // (신규 기능, 사용자 요청) 약점 리포트 — 위 games(시간 규정·색 필터 적용됨)와 달리, 리포트는
  // "지금 보고 있는 필터"가 아니라 항상 전체 그림을 보여주는 게 목적이라 그 필터들과 무관하게
  // 리뷰해 본 전체 대국(reviewUnlocked) 중 최근 60판만 쓴다 — 60판 제한은 reviewedAnalysesBatch의
  // in.() 쿼리 URL 길이·응답 크기를 억제하기 위함(그 이상은 흔치 않고, "최근 경향"이라는 취지에도
  // 더 맞는다).
  const reviewedGames = useMemo(() => {
    if (!ready || !reviewUnlocked) return [];
    return chesscom.games
      .filter((g) => (g.rules || "chess") === "chess" && g.timeClass !== "daily" && g.id && reviewUnlocked.has(reviewGameKey(g)))
      .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
      .slice(0, 60);
  }, [ready, chesscom && chesscom.games, reviewUnlocked]);
  const [weaknessAnalyses, setWeaknessAnalyses] = useState({});
  const [weaknessLoading, setWeaknessLoading] = useState(false);
  useEffect(() => {
    if (!reviewedGames.length) { setWeaknessAnalyses({}); return; }
    let cancelled = false;
    setWeaknessLoading(true);
    reviewedAnalysesBatch(reviewedGames.map((g) => g.id))
      .then((m) => { if (!cancelled) setWeaknessAnalyses(m); })
      .finally(() => { if (!cancelled) setWeaknessLoading(false); });
    return () => { cancelled = true; };
  }, [reviewedGames]);
  const weaknessReport = useMemo(() => weaknessReportFromAnalyses(reviewedGames, weaknessAnalyses), [reviewedGames, weaknessAnalyses]);
  // (v0.2.6 버그 수정) 레이팅은 어느 색으로 뒀든 하나로 합산 적용되므로, 흑/백 필터와는 무관하게
  // 항상 같은 값이어야 한다 — 레이팅 그래프에는 색 필터를 뺀(시간 규정만 적용된) 목록을 따로 넘긴다.
  const gamesForRating = useMemo(() => {
    const base = (ready ? chesscom.games : []).filter((g) => g.timeClass !== "daily" && (g.rules || "chess") === "chess");
    return timeFilter === "all" ? base : base.filter((g) => g.timeClass === timeFilter);
  }, [ready, chesscom && chesscom.games, timeFilter]);
  const overall = useMemo(() => {
    if (!games.length) return null;
    let w = 0, d = 0, l = 0;
    for (const g of games) { if (g.result === "win") w++; else if (g.result === "loss") l++; else d++; }
    const total = w + d + l;
    return { total, w, d, l, winRate: total ? Math.round(100 * w / total) : 0 };
  }, [games]);
  // (v0.3.9 버그 수정) 사용자 신고 — "리뷰한 대국만" 체크박스를 켜면 승리한 대국의 레이팅 변동이
  // 음수로 뜬다. computeRatingChanges는 "바로 직전 대국 대비" 증감이라 반드시 시간순으로 빈틈없는
  // 목록에서 계산해야 하는데, 여기선 그 필터로 이미 듬성듬성 걸러진 games를 그대로 넘기고 있었다 —
  // 리뷰 안 한 대국들이 사이사이 빠지면 "직전 대국"이 실제로는 몇 판 전의, 전혀 다른 레이팅을 가진
  // 대국이 돼 버려 승리해도 그사이 다른 대국에서 레이팅이 더 많이 깎였으면 음수로 보였다. 색 필터도
  // 같은 이유로 위험해 gamesForRating을 이미 따로 두고 있었으므로(바로 위 주석 참고), 여기도 그
  // 빈틈없는 목록을 그대로 재사용한다 — games는 gamesForRating의 부분집합이라 이후 games를 순회하며
  // ratingChanges.get(g)로 조회할 때도 같은 게임 객체 참조로 그대로 찾아진다.
  const ratingChanges = useMemo(() => (ready ? computeRatingChanges(gamesForRating) : new Map()), [ready, gamesForRating]);
  // (버그 수정) 예전엔 대국 하나를 "가장 깊이 매칭된 오프닝 이름" 딱 하나에만 집계했다 — 정석에서
  // 일찍 이탈하는 대다수 대국이 얕은 상위 갈래(King's Pawn Game 등)로 몰려 표본이 커지고, 정석을
  // 끝까지 따라간 소수 대국만 깊은 하위 갈래(Marshall Attack 등)에 잡혀 표본이 1~2판으로 작아진다.
  // 그 결과 하위 갈래의 승률이 0%/100%로 요동쳐 보였다. 승률 숫자 자체는 왜곡이 아니라 실제 결과이므로
  // 그대로 두되(1판 1승이면 100%가 맞다), 대국이 실제로 지나온 순서(얕은 이름→깊은 이름)에서 부모-자식
  // 관계를 추론해 하위 오프닝을 상위 오프닝 아래 중첩해서 보여준다 — "이 100%는 상위 오프닝 전체
  // 표본 중 1판짜리 하위 갈래"라는 맥락이 함께 보이도록.
  const { openingStats, openingTree } = useMemo(() => {
    if (!games.length) return { openingStats: [], openingTree: [] };
    const leaf = {};       // 이름별 "가장 깊이 매칭된" 대국만 집계(가장 많이 둔 오프닝에서 그대로 사용)
    const parentOf = {};   // 이름 -> 그 이름 바로 앞에 나온(더 얕은) 이름
    for (const g of games) {
      const chain = []; let last = null;
      const lim = Math.min(g.moves.length, 16);
      for (let i = 1; i <= lim; i++) {
        const nd = snapNode(g.moves.slice(0, i));
        if (nd && nd.opening && nd.opening.name !== last) { chain.push(nd.opening.name); last = nd.opening.name; }
      }
      if (!chain.length) continue;
      for (let i = 1; i < chain.length; i++) { if (!parentOf[chain[i]]) parentOf[chain[i]] = chain[i - 1]; }
      const name = chain[chain.length - 1];
      if (!leaf[name]) leaf[name] = { name, n: 0, w: 0, d: 0, l: 0 };
      leaf[name].n++; leaf[name][g.result === "win" ? "w" : g.result === "loss" ? "l" : "d"]++;
    }
    const openingStats = Object.values(leaf).map((o) => ({ ...o, wr: o.n ? Math.round(100 * o.w / o.n) : 0 }));
    const childrenOf = {};
    for (const child in parentOf) { const p = parentOf[child]; (childrenOf[p] || (childrenOf[p] = [])).push(child); }
    const allNames = new Set([...Object.keys(leaf), ...Object.keys(parentOf), ...Object.values(parentOf)]);
    const memo = {};
    // 노드의 표시 통계 = 자신의 대국 + 모든 하위 갈래 대국의 합 — 상위 오프닝 행이 곧 그 아래
    // 중첩된 하위 오프닝들의 총합이 되도록(승률 보정이 아니라 단순 합산).
    const rollup = (name) => {
      if (memo[name]) return memo[name];
      const own = leaf[name] || { n: 0, w: 0, d: 0, l: 0 };
      let n = own.n, w = own.w, d = own.d, l = own.l;
      for (const c of (childrenOf[name] || [])) { const cr = rollup(c); n += cr.n; w += cr.w; d += cr.d; l += cr.l; }
      return (memo[name] = { name, n, w, d, l, wr: n ? Math.round(100 * w / n) : 0, own });
    };
    // (버그 수정) 대국이 우리 오프닝 트리가 아는 갈래보다 더 깊이(예: 세부 변형)까지 가서 매칭이
    // 끊기면, 그 대국은 자식 노드가 아니라 이 노드 자신의 own 집계에만 남는다 — 예전엔 그 own 몫이
    // 자식들의 합과 구분 없이 부모 행 숫자에만 섞여 들어가, "부모 3판인데 자식 줄들은 2판만 있다"처럼
    // 마치 대국 하나가 통째로 빠진 것처럼 보였다. own 대국이 있고 자식도 있는 노드는 own 몫을
    // "OO(그 외 변형)"라는 별도 자식 줄로 보여줘 어디에도 숫자가 안 보이지 않게 한다.
    const buildNode = (name) => {
      const r = rollup(name);
      const kids = (childrenOf[name] || []).map(buildNode);
      if (r.own.n > 0 && kids.length > 0) {
        const o = r.own;
        // navName: 세부 갈래 이름이 없어 클릭해도 이동할 곳이 없으므로, 부모(name) 자신으로 이동시킨다.
        kids.push({ name: name + " (Side Line)", navName: name, n: o.n, w: o.w, d: o.d, l: o.l, wr: o.n ? Math.round(100 * o.w / o.n) : 0, own: o, children: [] });
      }
      return { ...r, children: kids.sort((a, b) => b.n - a.n) };
    };
    const openingTree = [...allNames].filter((nm) => !parentOf[nm]).map(buildNode).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
    return { openingStats, openingTree };
  }, [games]);
  const mostUsed = useMemo(() => [...openingStats].sort((a, b) => b.n - a.n), [openingStats]);
  // (버그 보충) "최근 대국"이 최신 5판만 보여주고 더 예전 대국은 볼 방법이 없었다 — 전부 가져와
  // 두고 5판씩 페이지를 넘겨 보게 한다(내 대국 목록·집중분석의 ListPager와 동일한 방식).

  if (chesscom && chesscom.status === "loading") return <p style={{ fontSize: 12, color: T.inkSoft, marginTop: 10 }}>{t("기보를 불러오는 중…")}</p>;
  if (chesscom && chesscom.status === "error") return <p style={{ fontSize: 12, color: T.blunder, marginTop: 10 }}>{t("기보 로드 실패. 계정 확인 필요")}</p>;
  if (!ready) return null;

  // (사용자 요청) 유산(Legacy) 관리 화면에서 재사용할 때(onSelectGame이 있을 때)는 프로필 헤더·전적·
  // 레이팅 그래프·오프닝 통계 없이 "최근 대국" 목록 UI만 잘라서 보여준다 — 대국을 고르는 용도이지
  // chess.com 통계 전체를 보여주는 화면이 아니므로.
  const recentOnly = !!onSelectGame;
  return (
    <div style={{ marginTop: 12 }}>
      {/* 프로필 — (사용자 요청) compact(카드 상단에 이미 chess.com 아바타·아이디를 보여주는 화면)일
          때는 이 사진+아이디 줄이 중복이라 통째로 생략한다. 국적·시간 규정별 레이팅은 그 상단
          헤더로 옮겨졌다(MyProfileCard/ProfileStatsPanel의 chess.com 헤더 블록 참고). */}
      {!recentOnly && !compact && (
      <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
        {prof && prof.avatar ? <img src={prof.avatar} alt="" style={{ width: 48, height: 48, borderRadius: 12, border: "1px solid #C9B58C" }} />
          : <span style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22 }}>{username[0].toUpperCase()}</span>}
        {/* (UI) 사용자 요청 — 레이팅 텍스트를 아이디 아래 한 줄이 아니라, 아이디와 같은 줄의 우측에
            표시하고(각 시간 규정은 줄바꿈), "래피드 : 1200"처럼 공백+콜론 표기로, 사이트 기본
            폰트인 IBM Plex Sans KR로 통일한다. */}
        <div className="flex items-center justify-between" style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div className="flex items-center gap-2">
              {/* (사용자 요청) 닉네임 왼쪽의 chess.com 아이콘 표시를 없앤다. */}
              <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{(prof && prof.username) || username}</span>
              {prof && prof.country && <span style={{ fontSize: 12.5, fontWeight: 700, padding: "2px 8px", borderRadius: 7, background: "rgba(0,0,0,.06)", border: "1px solid #DCCBA8", color: T.ink, whiteSpace: "nowrap" }}>{countryFlag(prof.country)} {prof.country}</span>}
            </div>
          </div>
          <div style={{ fontSize: 11, color: T.inkSoft, fontFamily: SITE_FONT, textAlign: "right", flexShrink: 0 }}>
            {prof ? (
              <>
                <div>{tx("래피드 : {0}", prof.rapid ?? "—")}</div>
                <div>{tx("블리츠 : {0}", prof.blitz ?? "—")}</div>
                <div>{tx("불릿 : {0}", prof.bullet ?? "—")}</div>
              </>
            ) : t("레이팅 불러오는 중…")}
          </div>
        </div>
      </div>
      )}
      {/* (v0.2.2 UI#6#5) 시간 규정 필터 — 전체/래피드/블리츠/불릿. 일일·체스960은 집계에서 제외.
          (v0.2.6 기능) 타임 컨트롤 선택 박스를 조금 줄이고, 같은 줄 우측에 흑/백 색 필터를 추가했다. */}
      <div className="flex items-center" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <GameFilterPills options={[["all", t("전체")], ["rapid", t("래피드")], ["blitz", t("블리츠")], ["bullet", t("불릿")]]} value={timeFilter} onChange={setTimeFilter} />
        <GameFilterPills options={[["all", t("전체")], ["w", t("백")], ["b", t("흑")]]} value={colorFilter} onChange={setColorFilter} />
        {/* (v0.3.1 기능) 리뷰(분석)해 본 대국만 모아 보기 */}
        {reviewUnlocked && (
          <label className="flex items-center press" style={{ gap: 5, cursor: "pointer", padding: "5px 9px", borderRadius: 9, background: onlyReviewed ? T.ebony2 : "rgba(0,0,0,.06)" }}>
            <input type="checkbox" checked={onlyReviewed} onChange={(e) => setOnlyReviewed(e.target.checked)} style={{ margin: 0, accentColor: T.brass }} />
            <span style={{ fontSize: 10.5, fontWeight: 800, color: onlyReviewed ? T.brassHi : T.inkSoft }}>{t("리뷰한 대국만")}</span>
          </label>
        )}
      </div>
      {/* 전적 */}
      {!recentOnly && !overall && <p style={{ fontSize: 12, color: T.inkSoft, marginBottom: 12 }}>{onlyReviewed ? t("조건에 맞는 리뷰 대국 없음") : t("이 시간 규정의 대국 없음")}</p>}
      {!recentOnly && overall && <GameRecordSummary overall={overall} />}
      {recentOnly && !overall && <p style={{ fontSize: 12, color: T.inkSoft, marginBottom: 12 }}>{onlyReviewed ? t("조건에 맞는 리뷰 대국 없음") : t("이 시간 규정의 대국 없음")}</p>}
      {/* (v0.2.6 기능) "전체 기간 전적"과 "최근 대국" 사이에 기간별 레이팅 변동 그래프를 표시. */}
      {!recentOnly && <RatingHistoryChart games={gamesForRating} timeFilter={timeFilter} stillFetching={!!(chesscom && chesscom.stillFetching)} />}
      {/* (프로필) 전적 아래 가장 최근에 플레이한 대국 몇 판 — 보기로 분석 보드에 불러온다.
          (디자인) 레이팅 증감·타임컨트롤·정확도 표기를 집중분석의 "내 최근 대국" 목록과 통일. */}
      <RecentGamesList games={games} ratingChanges={ratingChanges} username={username} resetKey={username + "|" + timeFilter}
        onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} onSelectGame={onSelectGame} selectedGameId={selectedGameId} />
      {!recentOnly && (
        <>
          {/* (v0.2.2 UX#3, v0.2.6 개편) 가장 많이 둔 오프닝 — 이제 오프닝 이름 빈도로 집계해 번갈아
              애니메이션한다. 바로 아래에 흑 오프닝 레파토리도 같은 방식으로 보여준다. */}
          <TopOpeningsPair games={games} label={t("가장 많이 둔 오프닝")} />
          {/* 오프닝별 승률 — 하위(더 구체적인) 오프닝을 상위 오프닝 아래 중첩해서, 상위 오프닝 행이
              그 아래 하위 갈래들의 합산임을 보여준다. */}
          {openingTree.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.ink, marginBottom: 2 }}>{t("오프닝별 승률")}</div>
              <div>
                {openingTree.map((node) => <OpeningWinrateRow key={node.name} node={node} depth={0} onOpenOpening={onOpenOpening} />)}
              </div>
            </div>
          )}
          {/* (신규 기능, 사용자 요청) 약점 리포트 — 리뷰해 본 대국들의 그레이딩 결과를 오프닝별로
              모아, 게임당 평균 블런더가 가장 많이 나는 오프닝 상위 3개를 짚어준다. 표본(리뷰한 대국)
              자체가 없으면 안내만, 있는데 2판 이상인 오프닝이 하나도 없으면(표본 부족) 조용히
              숨긴다 — 어설픈 "1판=100% 약점" 판정을 보여주지 않기 위해서다(weaknessReportFromAnalyses
              참고). */}
          {reviewedGames.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="flex items-center gap-1" style={{ fontSize: 12, fontWeight: 800, color: T.ink, marginBottom: 6 }}>{tx("{0} 약점 리포트", <Target size={13} />)}</div>
              {weaknessLoading ? <p style={{ fontSize: 11.5, color: T.inkSoft }}>{t("리뷰 기록을 모으는 중…")}</p>
                : weaknessReport.openings.length === 0
                ? <p style={{ fontSize: 11.5, color: T.inkSoft }}>{t("같은 오프닝을 2판 이상 리뷰해야 경향 확인 가능")}</p>
                : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {weaknessReport.openings.slice(0, 3).map((o) => (
                      <button key={o.name} onClick={() => onOpenOpening && onOpenOpening(o.name)} className="press" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 10px", borderRadius: 9, border: "1px solid #E4D5B6", background: "#FBF5E8", textAlign: "left", cursor: onOpenOpening ? "pointer" : "default" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: o.blunderRate > 0 ? T.blunder : T.inkSoft, flexShrink: 0 }}>{tx("게임당 블런더 {0}회 ({1}판)", o.blunderRate.toFixed(1), o.n)}</span>
                      </button>
                    ))}
                    {(weaknessReport.kindTotals.blunder || weaknessReport.kindTotals.mistake) > 0 && (
                      <p style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 2 }}>{tx("최근 리뷰한 {0}판 기준: 블런더 {1}회 · 실수 {2}회", weaknessReport.gamesUsed, weaknessReport.kindTotals.blunder || 0, weaknessReport.kindTotals.mistake || 0)}</p>
                    )}
                  </div>
                )}
            </div>
          )}
          {mostUsed.length === 0 && <p style={{ fontSize: 12, color: T.inkSoft }}>{t("수록된 오프닝과 일치하는 대국 없음")}</p>}
        </>
      )}
    </div>
  );
}
// (v0.2.6 UI) 백/흑을 세로로 이어붙인 목록 대신, 사용자가 그린 스케치대로 "백"·"흑" 두 박스를
// 나란히 두는 레이아웃으로 바꿨다 — 왼쪽 박스엔 자주 두는 첫 수(백) 하나를 크게, 오른쪽 박스엔
// 백의 각 첫 수(e4/d4/c4/Nf3, 프로필 편집기에서 입력받는 순서 그대로)에 대한 흑의 응수를
// "1.e4 e5" 형태로 묶어 보여준다.
// (v0.2.6 UI) 흑 박스가 한 줄에 하나씩 총 4줄로 세로로 길게 늘어져 있던 것을, 한 줄에 두 항목씩
// 2x2 그리드로 배치해 2줄로 줄이고 박스 폭도 함께 줄였다.
const FIRST_MOVE_BLACK_ORDER = ["e4", "d4", "c4", "Nf3"];
function FirstMovesDisplay({ firstMoves }) {
  const fm = firstMoves || {};
  const blackMap = fm.black || {};
  const blackEntries = FIRST_MOVE_BLACK_ORDER.filter((w) => blackMap[w]).map((w) => [w, blackMap[w]]);
  if (!fm.white && !blackEntries.length) return null;
  const boxStyle = { borderRadius: 10, background: "rgba(0,0,0,.05)", border: "1px solid #DCCBA8", overflow: "hidden" };
  const headStyle = { fontSize: 10.5, fontWeight: 700, color: T.inkSoft, marginBottom: 4, textAlign: "center" };
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: T.ink, marginBottom: 6 }}>{t("자주 두는 첫 수")}</div>
      {/* (버그 수정) 두 박스 폭이 90px/200px로 고정돼 있어, 유산 타일처럼 카드 폭에 비례해(%) 커지는
          다른 요소와 달리 컴퓨터(넓은 화면)에서는 카드 안에 작은 섬처럼 떠 보였다 — 카드 폭에 비례한
          flex 비율(백 1 : 흑 2)로 바꿔, 모바일이든 컴퓨터든 카드가 넓어지는 만큼 이 블록도 함께
          커져 다른 요소와 비율이 항상 맞도록 했다. */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        {fm.white && (
          <div style={{ flex: blackEntries.length ? "1 1 0" : "1 1 auto", minWidth: 0, maxWidth: blackEntries.length ? 170 : "none", display: "flex", flexDirection: "column" }}>
            <div style={headStyle}>{t("백")}</div>
            <div style={{ ...boxStyle, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 6px" }}>
              <span style={{ fontSize: 19, fontWeight: 800, color: T.ink, fontFamily: SEQ_FONT, whiteSpace: "nowrap" }}>1.{fm.white}</span>
            </div>
          </div>
        )}
        {blackEntries.length > 0 && (
          <div style={{ flex: "2 1 0", minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={headStyle}>{t("흑")}</div>
            <div style={{ ...boxStyle, display: "grid", gridTemplateColumns: "1fr 1fr" }}>
              {blackEntries.map(([w, b], i) => (
                <div key={w} style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0, padding: "6px 8px", borderTop: i >= 2 ? "1px solid #DCCBA8" : "none", borderLeft: i % 2 === 1 ? "1px solid #DCCBA8" : "none" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, fontFamily: SEQ_FONT, flexShrink: 0 }}>1.{w}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, fontFamily: SEQ_FONT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// (v0.1.0) 공개 프로필에 실린 "푼 퍼즐" 번호(no) 목록을 실제 카드로 보여주기 위해, 전역 공유
// puzzles 테이블에서 그 번호들의 데이터를 지연 조회한다 — 퍼즐 데이터 자체는 이미 누구나 볼 수
// 있게 공개돼 있으므로(전역 크라우드소싱), 번호만 알면 그 자리에서 그대로 카드를 그릴 수 있다.
// (버그 수정, 사용자 요청) "더 보기"를 눌러야만 나머지를 가져오던 지연 로딩(미리보기 3개→전체)을
// 없애고, 처음부터 solvedNos 전체를 한 번에 가져온다 — SolvedPuzzlesBlock이 더는 "더 보기" 모달을
// 갖지 않고 가로 스크롤 한 줄로 전부 보여주므로, 그 줄 자체가 이미 전체 목록이어야 한다.
// (버그 수정) 목록에 어떤 퍼즐이 뜨는지는 이 프로필 주인의 solvedNos로 정하는 게 맞지만, 카드 자체의
// 해결 표시(초록 배경·별 개수)는 PuzzleCard가 앱 어디서나 그렇듯 "지금 보는 사람"의 진행 상태를
// 뜻해야 한다 — 항상 isSolved=true로 고정해 두면, 프로필 주인은 풀었어도 나는 아직 안 풀었거나
// 일부 라인만 푼 퍼즐까지 전부 다 푼 것처럼(별 3개) 보였다. mySolved/myLineSolves(보는 사람 자신의
// 진행 상태)를 받아 각 카드에 반영한다 — "이 사람이 이런 퍼즐들을 풀었다"는 목록 자체는 그대로 두고,
// 그중 내가 실제로 얼마나 풀었는지만 카드 표시에 반영되는 것.
// (버그 수정, 사용자 요청) 이 "푼 퍼즐" 카드가 퍼즐 탭의 PuzzleCard와 달리 좋아요·리포스트·공유
// 버튼이 전혀 없었다 — PuzzleCard는 그 핸들러들을 prop으로 받았을 때만 버튼을 그리는데, 여기서는
// 애초에 넘기지 않고 있었다(onToggleLike만 예외적으로 일부 호출부에서 넘김). 퍼즐 탭과 완전히 같은
// prop 묶음(좋아요·리포스트·공유 상태·핸들러)을 그대로 받아 카드에 넘긴다.
function PublicSolvedPuzzles({ solvedNos, onOpenPuzzle, mySolved, myLineSolves, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare }) {
  const [byNo, setByNo] = useState({});
  useEffect(() => {
    const missing = solvedNos.filter((no) => !(no in byNo));
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      const fetched = await Promise.all(missing.map((no) => puzzleFetch(no)));
      if (cancelled) return;
      setByNo((prev) => { const n = { ...prev }; missing.forEach((no, i) => { n[no] = fetched[i] || null; }); return n; });
    })();
    return () => { cancelled = true; };
  }, [solvedNos]);
  const puzzles = solvedNos.map((no) => byNo[no]).filter(Boolean);
  const loading = solvedNos.some((no) => !(no in byNo));
  const renderCard = (p, onClick) => <PuzzleCard key={p.id} p={p} onClick={onClick}
    isSolved={mySolved ? mySolved.has(p.id) : false} solvedTags={myLineSolves ? myLineSolves[p.id] : null}
    isLiked={likedPuzzles ? likedPuzzles.has(p.id) : false} likeCount={(likeCounts && likeCounts[puzzleNo(p.id)]) || 0} onToggleLike={onToggleLike}
    isReposted={repostedPuzzles ? repostedPuzzles.has(p.id) : false} repostCount={(repostCounts && repostCounts[puzzleNo(p.id)]) || 0} onToggleRepost={onToggleRepost}
    shareCount={(shareCounts && shareCounts[puzzleNo(p.id)]) || 0} onShare={onShare} />;
  return <SolvedPuzzlesBlock puzzles={puzzles} total={solvedNos.length} loading={loading} renderCard={renderCard} onOpenPuzzle={onOpenPuzzle} />;
}
// (사용자 요청) 빈 유산 칸도 채워진 칸과 같은 금색·갈색 블록 디자인을 그대로 쓰고, 가운데에 "+"만
// 다르게 보여준다 — 추가 전후로 블록 크기·재질이 달라 보이지 않게 한다.
function LegacyEmptySlot({ typeInfo, onClick, bonus }) {
  return (
    <div style={{ position: "relative", flex: LEGACY_TILE_FLEX, minWidth: 0 }}>
      <button onClick={onClick} className="press" title={typeInfo.label + (bonus ? t(" 추가(그랜드마스터 보너스 칸)") : t(" 추가"))} style={LEGACY_BLOCK_BTN_STYLE}>
        <LegacyBlockDecor />
        <span aria-hidden="true" style={{ position: "relative", fontSize: 26, fontWeight: 300, lineHeight: 1, color: T.brassHi, opacity: 0.85 }}>+</span>
      </button>
    </div>
  );
}
// 빛으로 만든 체스보드 — 나무 질감의 실제 Board 대신, 반투명 격자선 + 발광하는 기물로 "허공에 뜬
// 빛의 보드"를 표현한다. (사용자 요청) 전체 빛깔을 사이트 전반의 금색·갈색(브래스) 톤으로 맞춰,
// 보드 아래 놓인 유산 블록(LegacyProjectorBlock)에서 빛이 뿜어져 올라오는 것처럼 보이게 한다.
// halo는 방금 둔 수의 도착 칸([r,c])에 그 수의 등급 색으로 발광 하이라이트를 씌우고, haloKind가
// 있으면 실제 체스보드(Board, 3656줄 부근)와 똑같은 위치·크기·흰 테두리로 수 체계 아이콘을 띄운다.
// 밝은/어두운 칸은 색이 아니라 (r+c) 홀짝에 따른 배경 불투명도 차이(=빛의 밝기 차이)로 구분한다.
// (사용자 요청) flip — 사용자가 지정한 진영(entry.side)이 항상 아래에 오도록, 실제 Board 컴포넌트와
// 같은 방식(행·열 모두 뒤집기)으로 반전한다.
// (사용자 요청) heroActive — 유산으로 지정한 수가 두어지는 바로 그 순간(부모의 boardHeroActive)만
// true인 값. animation-name을 "none"에서 실제 키프레임으로 바꾸는 것만으로 브라우저가 그 순간에
// 애니메이션을 새로 시작하므로, 그 이전/이후 수에는 전혀 흔들림이 남지 않는다(별도 key remount 불필요).
function LegacyLightBoard({ board, size = 320, halo, haloKind, flip, heroActive }) {
  const cell = Math.max(1, Math.floor(size / 8));
  const rows = flip ? [...board].reverse().map((r) => [...r].reverse()) : board;
  // (사용자 요청) 보드가 처음 나타날 때, 아래(영사기 블록이 있는 하단 중앙)에서 나온 빛이 격자를
  // 한 칸씩 그리듯 빠르게 퍼져나가는 연출 — LegacyLightBoard 인스턴스는 수가 진행돼도 다시 마운트
  // 되지 않으므로(appliedCount는 board prop만 바꾼다) motion의 initial→animate는 이 최초 등장에만 재생된다.
  const originR = 7, originC = 3.5;
  const haloDisplay = halo ? (flip ? [7 - halo[0], 7 - halo[1]] : halo) : null;
  return (
    <div style={{ position: "relative", width: cell * 8, height: cell * 8, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(8,1fr)", filter: "drop-shadow(0 0 26px rgba(196,154,80,.28))" }}>
      {rows.map((row, r) => row.map((p, c) => {
        const [br, bc] = flip ? [7 - r, 7 - c] : [r, c];
        const isHalo = halo && halo[0] === br && halo[1] === bc;
        const isLight = (r + c) % 2 === 0;
        const dist = Math.hypot(r - originR, c - originC);
        // (사용자 요청) 영사기가 쏘는 빛처럼, 칸마다 밝기가 조금씩 다르게·계속(무한 반복) 미세하게
        // 흔들리도록 한다 — 모든 칸이 똑같이 맞춰 숨쉬면 인위적으로 보이므로, r/c로부터 결정적으로
        // (매 렌더 동일하게) 뽑아낸 의사난수로 칸마다 주기·시작 지연을 어긋나게 한다.
        const flickerDur = 2.4 + ((r * 7 + c * 3) % 5) * 0.35;
        const flickerDelay = ((r * 5 + c * 11) % 9) * 0.17;
        return (
          <motion.div key={r + "_" + c} initial={{ opacity: 0, scale: 0.15 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: dist * 0.045, duration: 0.22, ease: "easeOut" }}
            style={{ position: "relative", boxSizing: "border-box", border: "1px solid rgba(196,154,80,.22)",
            background: isLight ? "rgba(236,203,134,.16)" : "rgba(61,38,22,.42)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animationName: "legacyBoardFlicker", animationDuration: flickerDur + "s", animationDelay: flickerDelay + "s", animationTimingFunction: "ease-in-out", animationIterationCount: "infinite" }}>
            {/* (사용자 요청) 기물 칸을 감싸던 등급색 테두리(링)를 없앴다 — 우상단 수 체계 배지만 남긴다. */}
            {isHalo && haloKind && (
              // (사용자 요청) 실제 체스보드가 칸 우상단에 띄우는 수 체계 배지와 동일한 위치·크기·스타일(3656줄).
              <div aria-hidden="true" style={{ position: "absolute", top: -cell * 0.18, right: -cell * 0.18, width: cell * 0.44, height: cell * 0.44, borderRadius: "50%", background: QCOLOR[haloKind], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, border: "2px solid #fff", boxShadow: "0 2px 5px rgba(0,0,0,.55)", zIndex: 6 }}>
                {badgeIcon(haloKind, cell * 0.38)}
              </div>
            )}
            {p && (
              // (사용자 요청) 유산 수를 둔 순간엔 더 크게 흔들리는(legacyPieceShake) 전용 키프레임을 쓴다.
              <span style={{ display: "inline-flex", animationName: heroActive ? "legacyPieceShake" : "none", animationDuration: "0.55s", animationTimingFunction: "ease-out", animationFillMode: "backwards",
                animationDelay: (haloDisplay ? Math.hypot(r - haloDisplay[0], c - haloDisplay[1]) : 0) * 0.03 + "s" }}>
                <PieceGlyph type={p.t} color={p.c} size={cell * 0.72} pieceSkin="classic" style={{
                  filter: "drop-shadow(0 0 3px " + (p.c === "w" ? "#FFF6DE" : "#E9C98A") + ") drop-shadow(0 0 10px " + (p.c === "w" ? T.brassHi : "#8A6A2F") + "cc)" }} />
              </span>
            )}
          </motion.div>
        );
      }))}
    </div>
  );
}
// 유산 재생 화면 하단의 "영사기" 블록 — 프로필의 유산 타일과 같은 재질(어보니+브래스)로 만든 작은
// 사각 블록. 스스로 은은하게 금빛으로 발광해(box-shadow), 위에 뜬 빛의 체스보드가 이 블록에서
// 뿜어져 나오는 빛으로 만들어진 것처럼 보이도록 하는 광원 역할을 한다.
// (사용자 요청) "다시 보기" 버튼을 없애는 대신, 이 블록 자체를 눌러 언제든 처음부터 다시 재생한다.
function LegacyProjectorBlock({ entry, size = 76, onClick }) {
  return (
    <button onClick={onClick} title={t("다시 재생")} className="press" style={{ width: size, height: size, borderRadius: size * 0.18, position: "relative", overflow: "hidden", flexShrink: 0,
      background: "linear-gradient(155deg, " + T.ebony3 + " 0%, " + T.ebony2 + " 55%, " + T.ebony + " 100%)",
      border: "1.5px solid " + T.brass, cursor: onClick ? "pointer" : "default",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.08), 0 0 26px 6px rgba(196,154,80,.5), 0 6px 14px -6px rgba(0,0,0,.7)",
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(125deg, rgba(236,203,134,.2) 0%, rgba(236,203,134,0) 45%)" }} />
      <span style={{ position: "relative", fontFamily: LEGACY_FONT, fontWeight: 900, fontSize: size * 0.15, lineHeight: 1.1, color: T.brassHi, textAlign: "center", padding: "0 4px" }}>
        {legacyMoveLabel(entry)}
      </span>
    </button>
  );
}
// (v0.3.4 기능) 유산 수가 위에서 떨어져 부딪히는 충격으로, 주변에 있던 이전 수 텍스트가 튕겨나가듯
// 흩어지는 연출 — framer-motion의 스프링(질량-감쇠 진동) 물리 엔진으로 두 단계를 순서대로 재생한다:
// (1) 충격을 맞고 짧게 눌렸다 튀어오르는 반동(뻣뻣하고 감쇠가 약한 스프링 — 눈에 보이는 바운스가
// 남는다), (2) 그 반동을 타고 옆으로 흩어지며 사라지는 궤적(부드럽고 감쇠가 강한 스프링). delay는
// 유산 수(충격 지점)로부터 각 토큰이 떨어진 거리에 비례해 줘, 충격파가 인접한 곳부터 먼 곳으로
// 순서대로 퍼져나가는 것처럼 보이게 한다(예전엔 배열 인덱스 순서를 그대로 썼는데, 유산 수와 가장
// 가까운 마지막 토큰이 오히려 가장 늦게 반응해 파동이 거꾸로 퍼지는 것처럼 보였다).
function LegacyShatterToken({ active, delay, dir, children }) {
  const controls = useAnimationControls();
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, delay));
      if (cancelled) return;
      // 1단계 — 충격에 눌렸다 튀어오르는 반동.
      await controls.start({ y: 8, rotate: dir * 5, transition: { type: "spring", stiffness: 900, damping: 11, mass: 0.5 } });
      if (cancelled) return;
      // 2단계 — 그 반동을 타고 옆으로 흩어지며 사라진다(위치는 스프링, 불투명도는 별도 tween으로).
      controls.start({
        y: 30 + dir * 6, x: dir * 26, rotate: dir * (16 + Math.abs(dir) * 4), opacity: 0,
        transition: { default: { type: "spring", stiffness: 110, damping: 14, mass: 0.9 }, opacity: { duration: 0.35, ease: "easeIn" } },
      });
    })();
    return () => { cancelled = true; };
  }, [active, delay, dir]);
  return (
    <motion.span animate={controls} style={{ display: "inline-block", marginRight: 6, color: T.ivoryHi, textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>
      {children}
    </motion.span>
  );
}
// 유산 확대 연출 — 클릭하면 먼저 암석판이 확대되며 룬 문자가 빛나고(charge, ~0.9s), 이어서(사용자
// 요청) 실제로 수를 두지 않고 PGN 텍스트만 화면에 한 수씩 빠르게 타이핑되며 나타나고(typing, 한
// 수당 45ms), 다 나타나면 빛의 체스보드가 등장해(board) 지정된 수부터 원래 속도(1.15초/수)로
// playCount만큼 자동 재생한다. board 단계에서는 보드 아래 유산 블록(LegacyProjectorBlock)을 놓고,
// 그 블록에서 보드로 금빛 광선이 뻗어 올라가는 영사기 연출을 함께 보여준다.
export function LegacyRevealScreen({ typeInfo, entry, onClose }) {
  const { sans, moveIndex, playCount, kinds, side } = entry;
  // (사용자 요청) 사용자가 지정한 진영이 항상 아래에 오도록 보드를 뒤집는다(구버전 항목은 side가
  // 없어 기본 백 기준으로 표시).
  const flip = side === "b";
  const [phase, setPhase] = useState("charge"); // "charge" | "typing" | "board"
  // (사용자 요청) 지정한 수보다 beforeCount수만큼 앞당겨 시작해, 그 수까지 이어지는 흐름을 먼저
  // 보여준다(구버전 항목은 beforeCount가 없어 0 = 기존처럼 지정한 수부터 시작).
  const startCount = Math.max(0, moveIndex - (entry.beforeCount || 0));
  const endCount = Math.min(sans.length, moveIndex + Math.max(1, playCount));
  const [appliedCount, setAppliedCount] = useState(startCount);
  const pgnTokens = useMemo(() => sans.map((s, i) => moveNumber(i) + s), [sans]);
  const [typedCount, setTypedCount] = useState(0);
  const typingRef = useRef(null);
  useEffect(() => { const t = setTimeout(() => setPhase("typing"), 950); return () => clearTimeout(t); }, []);
  // (사용자 요청) 기보 타이핑 연출을 3단계로 짰다 — "before"(유산 수 이전 토큰이 한 수씩 타이핑됨)
  // → "heroSolo"(유산 수가 먼저 화면 정중앙에 크게 등장하고, 그 충격으로 주변(이전) 토큰들이
  // 와르르 무너져 내리며 사라짐 — 등장과 붕괴가 인과관계로 보이도록 붕괴 시작에 짧은 지연을 둔다)
  // → "after"(유산 수가 원래 자리인 왼쪽 위로 옮겨가고, 그 옆부터 나머지 토큰이 한 수씩 타이핑됨).
  // "heroSolo"↔"after" 두 단계의 유산 수 스팬은 같은 layoutId="legacyHeroToken"을 공유해,
  // framer-motion이 정중앙 큰 글자에서 본문 흐름 속 제자리로 자동으로 매끄럽게 이동·축소(FLIP)해 준다.
  const [typingStage, setTypingStage] = useState("before"); // "before" | "heroSolo" | "after"
  const [afterTypedCount, setAfterTypedCount] = useState(0);
  const beforeTokens = useMemo(() => pgnTokens.slice(0, moveIndex), [pgnTokens, moveIndex]);
  const afterTokensArr = useMemo(() => pgnTokens.slice(moveIndex + 1), [pgnTokens, moveIndex]);
  const heroTok = pgnTokens[moveIndex];
  // (사용자 요청) 유산 수 직전 토큰까지 다 타이핑된 뒤 곧바로 유산 수가 떨어지면 등장이 너무
  // 순식간이라 극적으로 느껴지지 않는다 — 잠깐(1초) 숨을 고른 뒤에야 떨어지도록 짧은 정적을 준다.
  const HERO_ENTRANCE_DELAY_MS = 1000;
  useEffect(() => {
    if (phase !== "typing" || typingStage !== "before") return;
    if (typedCount >= moveIndex) {
      const t = setTimeout(() => setTypingStage("heroSolo"), HERO_ENTRANCE_DELAY_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTypedCount((n) => Math.min(moveIndex, n + 1)), 80);
    return () => clearTimeout(t);
  }, [phase, typingStage, typedCount, moveIndex]);
  // (사용자 요청) 유산 수의 기보가 "확실하게" 등장한 뒤에야 주변 수가 무너지기 시작해야 한다 —
  // 예전엔 유산 수의 낙하 스프링이 대략 언제 바닥을 찍는지 시간을 추측해(WAVE_BASE_MS) 그 시점에
  // 무조건 무너뜨리기 시작했는데, 기기 성능·리렌더 지연에 따라 실제 낙하 애니메이션이 아직 안
  // 끝났는데도 무너짐이 먼저 시작될 수 있었다(추측이라 확실하지 않음). 대신 유산 수 motion.span의
  // onAnimationComplete(framer-motion이 스프링이 실제로 정착했을 때 호출)로 heroLanded를 켜고,
  // LegacyShatterToken의 active를 이 값에 직접 연결해 "정말로 다 등장한 뒤"에만 무너짐이 시작되도록
  // 확실하게 순서를 보장한다.
  const [heroLanded, setHeroLanded] = useState(false);
  // (v0.3.4 기능) 파동이 유산 수(충격 지점)로부터 퍼져나가는 속도 — 거리(토큰 개수 차이) 1당
  // WAVE_STEP_MS만큼 늦게 반응한다. WAVE_BASE_MS는 이제 착지 시점을 추측할 필요가 없어(heroLanded가
  // 이미 착지를 보장) 착지 직후 아주 짧은 호흡만 준다.
  const WAVE_BASE_MS = 80, WAVE_STEP_MS = 45;
  // (사용자 요청 반영) 무너짐 시작이 착지 완료 확인 이후로 미뤄진 만큼(예전의 낙관적 추측 260ms보다
  // 늦게 시작), 가장 먼 토큰까지 다 흩어질 시간을 더 넉넉히 준다.
  const HERO_SOLO_MS = 2000;
  useEffect(() => {
    if (typingStage !== "heroSolo") return;
    const t = setTimeout(() => setTypingStage("after"), HERO_SOLO_MS);
    return () => clearTimeout(t);
  }, [typingStage]);
  // (버그 수정) 유산 수가 정중앙에서 왼쪽 위 제자리로 옮겨가는 layoutId FLIP 전환(아래 motion.span의
  // transition, 0.6초)이 채 끝나기도 전에 다음 토큰이 곧장 타이핑되기 시작하면, 아직 이동 중인
  // 유산 수 위에 다음 토큰이 겹쳐 보이는 문제가 있었다(실제로 Playwright 스크린샷으로 재현·확인) —
  // 첫 "이후" 토큰만은 유산 수가 완전히 자리 잡을 시간(HERO_LAND_MS, FLIP 시간보다 살짝 여유를 둠)
  // 만큼 기다렸다가 나타나도록 해, 유산 수가 제자리에 멈춘 뒤에야 그 옆에서부터 타이핑이 이어진다.
  const HERO_LAND_MS = 650;
  useEffect(() => {
    if (phase !== "typing" || typingStage !== "after") return;
    const afterLen = afterTokensArr.length;
    if (afterTypedCount >= afterLen) {
      // (사용자 요청) 유산으로 지정한 수가 대국의 마지막 수라 방금 막 나타난 참이면, 다음 화면으로도 조금 늦게 넘어간다.
      const heroWasLast = afterLen === 0;
      const t = setTimeout(() => setPhase("board"), heroWasLast ? 1200 : 320);
      return () => clearTimeout(t);
    }
    const delay = afterTypedCount === 0 ? HERO_LAND_MS : 80;
    const t = setTimeout(() => setAfterTypedCount((n) => Math.min(afterLen, n + 1)), delay);
    return () => clearTimeout(t);
  }, [phase, typingStage, afterTypedCount, afterTokensArr.length]);
  // (버그 수정) 유산 수가 정중앙→왼쪽 위 제자리로 옮겨가는 layoutId FLIP 전환이 시작되는 바로 그
  // 타이밍(typingStage가 "after"로 바뀌는 순간)에 이 효과도 함께 실행돼, typingRef의 scrollTop을
  // 강제로 바꾸면 framer-motion이 측정해 둔 "도착 위치"가 그 직후 스크롤로 다시 밀려나 정렬이
  // 어긋나 보였다(유산 수가 이어지는 타이핑에서 위치가 안 맞던 원인). 실제로 넘칠 때만(overflow가
  // 있을 때만) 스크롤하고, 그마저도 현재 프레임의 레이아웃이 커밋된 뒤(requestAnimationFrame)에만
  // 실행해 FLIP의 레이아웃 측정과 같은 틱에서 겹치지 않게 했다.
  useEffect(() => {
    const el = typingRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [typedCount, afterTypedCount, typingStage]);
  // (사용자 요청) 유산 수가 정중앙에 등장해 있는 동안(그 충격으로 주변 수가 무너지는 순간 포함)
  // 화면이 어두워진다.
  const heroActive = typingStage === "heroSolo";
  // (사용자 요청) 유산 수 차례가 되면 곧장 그 수를 두지 않고, 먼저 확대(HERO_PRE_MS만큼 대기)한
  // 뒤에야 그 수가 놓이도록 한다 — 아래 boardHeroActive/heroWindowOpen과 짝을 이룬다.
  const HERO_PRE_MS = 900;
  useEffect(() => {
    if (phase !== "board" || appliedCount >= endCount) return;
    const isPreHero = appliedCount === moveIndex;
    // (사용자 요청) 다음 수로 넘어가는 간격을 살짝 늘림(1150ms → 1450ms). 유산 수 직전만 먼저
    // 확대할 시간을 주기 위해 더 짧게(HERO_PRE_MS) 둔다.
    const t = setTimeout(() => setAppliedCount((n) => Math.min(endCount, n + 1)), isPreHero ? HERO_PRE_MS : 1450);
    return () => clearTimeout(t);
  }, [phase, appliedCount, endCount, moveIndex]);
  const board = useMemo(() => boardFromSans(sans.slice(0, appliedCount)), [sans, appliedCount]);
  const prevBoard = useMemo(() => boardFromSans(sans.slice(0, Math.max(0, appliedCount - 1))), [sans, appliedCount]);
  const lastSan = appliedCount > 0 ? sans[appliedCount - 1] : null;
  const lastMover = appliedCount > 0 && (appliedCount - 1) % 2 === 0 ? "w" : "b";
  const haloInfo = lastSan ? sanSrc(prevBoard, stripSuffix(lastSan), lastMover) : null;
  // (버그 수정) entry.kinds는 구버전 유산(이 필드가 생기기 전에 저장됨)이거나, 분석 결과에서 그
  // ply를 못 찾으면 "pending"으로 채워져 있을 수 있어, 이 경우 그대로면 아이콘이 영영 안 뜬다.
  // 다만 유산을 저장할 때 "지정한 수(moveIndex)는 반드시 그 유산 등급(typeInfo.kind)으로 채점된
  // 수"라는 게 이미 검증돼 있으므로, kinds가 없거나 못 믿을 때도 지정한 수 차례에는 그 등급으로
  // 확실하게 표시할 수 있다(그 외의 수는 실제로 몰라 아이콘을 생략한다).
  // (사용자 요청) 이번 재생에서 나올 모든 수의 등급 아이콘 자리를 처음부터 고정해 둔다 — 아직 두지
  // 않은 수도 자리를 미리 차지해, 수가 진행될 때 아이콘이 하나씩 늘어나며 레이아웃이 밀리지 않는다.
  const kindAt = (i) => {
    const k = kinds && kinds[i];
    if (k && k !== "pending") return k;
    return i === moveIndex ? typeInfo.kind : null;
  };
  const haloKind = appliedCount > 0 ? kindAt(appliedCount - 1) : null;
  const allSlots = useMemo(() => Array.from({ length: Math.max(0, endCount - startCount) }, (_, idx) => startCount + idx), [startCount, endCount]);
  const color = QCOLOR[typeInfo.kind];
  // (사용자 요청) 체스보드에서도 유산으로 지정한 수가 두어지는 순간, 타이핑 단계와 같은 느낌으로
  // 확대·어둡게·기물 흔들림 연출을 준다. heroActive(boardHeroActive) prop 값 자체가 CSS
  // animation-name을 "none"↔실제 키프레임으로 바꿔주므로(별도 key remount 없이도 브라우저가
  // 값이 바뀌는 시점에 애니메이션을 다시 재생한다) 이 순간에만, 그리고 정확히 한 번만 흔들리고
  // 그 이후 수들에는 전혀 적용되지 않는다.
  // (버그 수정) appliedCount-1===moveIndex "그 순간"만 켜는 파생값을 그대로 썼더니, 유산 수가
  // 재생 구간의 마지막 수라 그 뒤로 appliedCount가 더 이상 바뀌지 않는 경우 이 값이 영원히
  // true로 남아 체스보드가 확대된 채 원래 크기로 돌아오지 않았다 — 스스로 만료되는 타이머를 가진
  // 상태값으로 바꿔, 뒤이은 수가 있든 없든 HERO_TOTAL_MS 뒤에는 항상 꺼지도록 한다. 또한 "먼저
  // 확대한 뒤 그 수가 두어지도록" 하기 위해, 그 수가 실제로 놓이기 직전(appliedCount===moveIndex)
  // 부터 이미 확대 창을 열어 둔다(놓인 직후appliedCount===moveIndex+1까지 계속 이어짐).
  const HERO_TOTAL_MS = 2300;
  const heroWindowOpen = phase === "board" && (appliedCount === moveIndex || appliedCount === moveIndex + 1);
  const [boardHeroActive, setBoardHeroActive] = useState(false);
  useEffect(() => {
    if (!heroWindowOpen) { setBoardHeroActive(false); return; }
    setBoardHeroActive(true);
    const t = setTimeout(() => setBoardHeroActive(false), HERO_TOTAL_MS);
    return () => clearTimeout(t);
  }, [heroWindowOpen]);
  // (사용자 요청) 재생 화면의 체스보드를 더 크게(최대 360→440).
  const [lightBoardSize, boardWrapRef] = useBoardSize(440);
  const blockSize = Math.max(60, Math.round(lightBoardSize * 0.22));
  const beamHeight = Math.max(36, Math.round(lightBoardSize * 0.16));
  const beamNarrow = Math.min(46, (blockSize / Math.max(1, lightBoardSize)) * 50);
  // (사용자 요청) 유산 수를 둘 때 체스보드가 뷰포트를 벗어나지 않는 선에서 최대로 확대되고, 그 동안
  // 보드 자신을 뷰포트 정중앙으로 옮겼다가 끝나면 원래 자리로 되돌아온다 — boardHeroActive가 켜지는
  // 순간 boardWrapRef의 현재 화면 좌표를 재서, 뷰포트 중심까지 필요한 이동량(dx,dy)과 뷰포트 안에
  // 들어오는 한도 안에서의 최대 배율을 계산해 둔다(꺼지면 0,0,1로 그대로 복귀).
  const [heroBoardXform, setHeroBoardXform] = useState({ x: 0, y: 0, scale: 1 });
  useEffect(() => {
    if (!boardHeroActive) { setHeroBoardXform({ x: 0, y: 0, scale: 1 }); return; }
    const el = boardWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const dx = window.innerWidth / 2 - cx, dy = window.innerHeight / 2 - cy;
    const maxScale = Math.max(1, Math.min((window.innerWidth * 0.94) / lightBoardSize, (window.innerHeight * 0.8) / lightBoardSize));
    setHeroBoardXform({ x: dx, y: dy, scale: maxScale });
  }, [boardHeroActive, lightBoardSize]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
      style={{ position: "fixed", inset: 0, zIndex: 210, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 20, boxSizing: "border-box" }}>
      {/* 배경 별 입자(순수 CSS 장식) */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, opacity: 0.55, backgroundImage: "radial-gradient(1.5px 1.5px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 65%, #fff, transparent), radial-gradient(1.5px 1.5px at 85% 20%, #fff, transparent), radial-gradient(1px 1px at 40% 80%, #fff, transparent), radial-gradient(1.5px 1.5px at 55% 45%, #fff, transparent), radial-gradient(1px 1px at 12% 68%, #fff, transparent), radial-gradient(1.5px 1.5px at 92% 55%, #fff, transparent)" }} />
      <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 16, right: 16, zIndex: 5, width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.2)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={17} /></button>
      {phase === "charge" ? (
        <motion.div initial={{ scale: 1, opacity: 0 }} animate={{ scale: [1, 1.14, 1.08], opacity: 1 }} transition={{ duration: 0.9, ease: "easeOut" }}
          style={{ width: 150, height: 150, borderRadius: 20, position: "relative", overflow: "hidden",
            background: "linear-gradient(155deg, " + T.ebony3 + " 0%, " + T.ebony2 + " 55%, " + T.ebony + " 100%)",
            border: "1.5px solid " + T.brass, boxShadow: "0 0 60px 4px " + color + "55, inset 0 1px 0 rgba(255,255,255,.08)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(125deg, rgba(236,203,134,.16) 0%, rgba(236,203,134,0) 40%)" }} />
          <motion.span animate={{ opacity: [0.5, 1, 0.6, 1], textShadow: ["0 0 6px " + color, "0 0 26px " + color, "0 0 10px " + color, "0 0 26px " + color] }} transition={{ duration: 0.9, times: [0, 0.4, 0.7, 1] }}
            style={{ position: "relative", fontFamily: LEGACY_FONT, fontWeight: 900, fontSize: 20, color, textAlign: "center", padding: "0 10px" }}>
            {legacyMoveLabel(entry)}
          </motion.span>
        </motion.div>
      ) : phase === "typing" ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45, ease: "easeInOut" }}
          style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          {/* (사용자 요청) 갈색 카드 배경·"대국 훑어보기" 문구를 없애고, 기보 텍스트만 배경 위에 떠 보이게 한다. */}
          {/* (사용자 요청) 유산으로 지정한 수 앞의 토큰이 무너져 내리는 동안·유산 수가 정중앙에 떠
              있는 동안에는 주변이 어두워진다. */}
          <motion.div aria-hidden="true" animate={{ opacity: heroActive ? 1 : 0 }} transition={{ duration: 0.45 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", pointerEvents: "none" }} />
          {/* (v0.3.4 UI) 유산 수가 등장할 차례가 되면, 위에서 떨어지듯 화면 정중앙에 크게 낙하해
              부딪히고(스프링 물리로 튀어오르는 반동까지 남는다) — 그 충격이 앞의 수들에 옆으로
              퍼져나가는 파동처럼 전해져(LegacyShatterToken, 유산 수와 가까운 순서대로 반동 후
              흩어짐), 다 흩어지면 유산 수가 원래 자리(왼쪽 위)로 옮겨간 뒤 그 옆에서부터 나머지
              수들이 이어서 타이핑된다. */}
          <div ref={typingRef} style={{ width: "100%", maxHeight: 220, overflow: "hidden", padding: "16px 18px", display: "flex", flexWrap: "wrap", alignItems: "flex-start", fontFamily: LEGACY_FONT, fontSize: 15, lineHeight: 1.8, wordBreak: "break-word" }}>
            {typingStage === "before" && beforeTokens.slice(0, typedCount).map((tok, i) => (
              <span key={i} style={{ display: "inline-block", marginRight: 6, color: T.ivoryHi, textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>{tok}</span>
            ))}
            {typingStage === "heroSolo" && beforeTokens.slice(0, typedCount).map((tok, i) => (
              // 유산 수(충격 지점)에 가장 가까운 마지막 토큰(i = moveIndex-1)의 거리가 0 — 멀어질수록
              // delay가 커져, 충격파가 가까운 곳부터 먼 곳으로 순서대로 퍼져나가는 것처럼 보인다.
              // (사용자 요청) active를 heroLanded에 연결해, 유산 수가 실제로 다 착지한 뒤에만 시작한다.
              <LegacyShatterToken key={i} active={heroLanded} delay={WAVE_BASE_MS + (moveIndex - 1 - i) * WAVE_STEP_MS} dir={i % 2 === 0 ? -1 : 1}>{tok}</LegacyShatterToken>
            ))}
            {typingStage === "after" && (
              // (사용자 요청) 정중앙 solo 등장(아래)과 같은 layoutId를 공유 — framer-motion이 두
              // 인스턴스 사이를 자동으로 매끄럽게 이동·축소시켜 "정중앙 → 왼쪽 위 제자리"로 보인다.
              // (v0.3.4 UI) 낙하 물리와 결을 맞춰, 이 자리 잡기(FLIP)도 easeInOut 대신 스프링으로.
              <motion.span layoutId="legacyHeroToken" transition={{ type: "spring", stiffness: 300, damping: 26 }}
                style={{ display: "inline-block", marginRight: 8, fontWeight: 900, fontSize: 19, color, textShadow: "0 0 16px " + color + ", 0 2px 10px rgba(0,0,0,.6)" }}>
                {heroTok}
              </motion.span>
            )}
            {typingStage === "after" && afterTokensArr.slice(0, afterTypedCount).map((tok, idx) => (
              <span key={idx} style={{ display: "inline-block", marginRight: 6, color: T.ivoryHi, textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>{tok}</span>
            ))}
            {typingStage === "after" && <motion.span aria-hidden="true" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }} style={{ color: T.brassHi, marginLeft: 2 }}>▍</motion.span>}
          </div>
          {typingStage === "heroSolo" && (
            <motion.div style={{ position: "fixed", inset: 0, zIndex: 6, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              {/* (v0.3.4 UI → v0.3.5 버그 수정) 위에서 떨어져 정중앙에 부딪히듯 등장 — 스프링(질량-감쇠
                  진동) 물리로 계산돼 자리를 잡는다(easeOut 트윈이 아니라 진짜 스프링). damping이 13으로
                  너무 낮아(감쇠비 ≈0.33) 착지 후에도 여러 차례 위아래로 튀는 진동이 한동안 눈에 띄게
                  이어지는 문제가 있었다 — damping을 22로 올려(감쇠비 ≈0.56) 착지 직후 한 번만 또렷하게
                  튀어오르고 곧바로 정착하도록 다듬었다(완전히 감쇠비 1로 만들면 반동 자체가 없어져
                  "부딪히는" 느낌이 사라지므로, 반동은 남기되 반복 진동만 없앤다).
                  (사용자 요청) onAnimationComplete로 이 스프링이 실제로 정착한 순간을 확실히 알아내
                  heroLanded를 켠다 — 주변 수 무너짐(LegacyShatterToken)은 이 값이 켜진 뒤에만 시작된다. */}
              <motion.span layoutId="legacyHeroToken" initial={{ opacity: 0, y: -220, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 22, mass: 1 }}
                onAnimationComplete={() => setHeroLanded(true)}
                style={{ fontFamily: LEGACY_FONT, fontWeight: 900, fontSize: 34, color, textShadow: "0 0 26px " + color + ", 0 2px 14px rgba(0,0,0,.7)" }}>
                {heroTok}
              </motion.span>
            </motion.div>
          )}
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
          {/* (사용자 요청) 유산으로 지정한 수가 체스보드에 두어지는 순간에도 주변이 어두워진다. */}
          <motion.div aria-hidden="true" animate={{ opacity: boardHeroActive ? 1 : 0 }} transition={{ duration: 0.4 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", pointerEvents: "none" }} />
          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* (사용자 요청) 재생 화면 체스보드를 더 크게 키우고(useBoardSize(440)), "탁월한 유산" 같은
                유산 등급 라벨은 없앤다. */}
            <motion.div ref={boardWrapRef} animate={{ x: heroBoardXform.x, y: heroBoardXform.y, scale: heroBoardXform.scale }} transition={{ duration: 0.5, ease: "easeInOut" }}
              style={{ width: "100%", maxWidth: 440, display: "flex", justifyContent: "center", position: "relative", zIndex: 2 }}>
              <LegacyLightBoard board={board} size={lightBoardSize} halo={haloInfo ? haloInfo.to : null} haloKind={haloKind} flip={flip} heroActive={boardHeroActive} />
            </motion.div>
            {/* (버그 수정) 체스보드가 boardHeroActive 동안 최대 배율로 확대되면(위 motion.div가
                z-index:2로 자기 레이아웃 박스보다 훨씬 크게 그려짐) 바로 아래 있는 이 블록(아이콘
                트레일·광선·영사기)이 확대된 보드 밑에 깔려 겹쳐 보이고, 금테 두른 유산 수 아이콘도
                그 사이에 파묻혀 좌표가 뒤틀린 것처럼 보였다 — 확대가 켜져 있는 동안은 이 블록 전체를
                투명하게 감춰(pointer-events도 함께 꺼서 숨은 상태에서 클릭되지 않게) 겹침 자체를
                없앤다. 확대가 끝나면(그 사이 유산 수 아이콘도 이미 appliedCount가 넘어가 채워진
                뒤이므로) 다시 페이드인되며 정상적으로 보인다. */}
            <motion.div animate={{ opacity: boardHeroActive ? 0 : 1 }} transition={{ duration: 0.35 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", pointerEvents: boardHeroActive ? "none" : "auto" }}>
              {/* (사용자 요청) 아이콘 자리를 처음부터(재생 시작 전부터) 전부 고정해 둔다 — 매 수마다
                  새 아이콘이 추가되며 레이아웃이 밀리지 않도록, startCount~endCount 범위의 슬롯을 전부
                  미리 그려 두고 아직 두지 않은 수는 자리만 차지한 채 안 보이게(visibility:hidden) 한다.
                  한 줄 flex-wrap(justifyContent:center)이라 다음 줄로 넘어가도 정렬이 흐트러지지 않는다.
                  유산으로 지정한 수의 자리만 금색 테두리로 구분한다. */}
              <div style={{ minHeight: 34, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, margin: "6px 0 2px", width: "100%", maxWidth: lightBoardSize }}>
                {allSlots.map((i) => {
                  const revealed = i < appliedCount;
                  const k = kindAt(i);
                  const isHero = i === moveIndex;
                  // (버그 수정) 금색 테두리가 있는 칸(hero)과 없는 칸의 실제 렌더 크기가 서로 달라(테두리
                  // 두께만큼) flex 정렬이 흔들리던 문제 — 모든 칸에 항상 같은 두께의 테두리를 두되
                  // (기본은 투명), box-sizing:border-box로 테두리가 안쪽에 그려지게 해 바깥 크기(34×34)를
                  // 항상 동일하게 고정한다.
                  // (버그 수정) 그런데도 금테가 아이콘 중심과 안 맞고 위로 치우쳐 보인다는 신고가
                  // 있어 Playwright로 실제 DOM 좌표를 재본 결과, 아이콘을 감싸던 안쪽 <span>이 일반
                  // inline 요소라 줄바꿈 기준선(baseline) 아래로 "보이지 않는 여백"이 비대칭으로 붙어
                  // (이미지 하단 descender 여백), 부모의 justify/align-items:center가 그 여백까지
                  // 포함해 중앙 정렬하면서 정작 눈에 보이는 아이콘만 위로 몇 px 치우쳐 보였다(실측:
                  // 세로 2px 어긋남, 가로는 정확히 일치) — 이 안쪽 span도 inline-flex로 바꿔 그 보이지
                  // 않는 기준선 여백 자체를 없앴다.
                  return (
                    <span key={i} style={{ width: 34, height: 34, boxSizing: "border-box", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%",
                      visibility: revealed && k ? "visible" : "hidden",
                      border: "2px solid " + ((isHero && revealed) ? T.brassHi : "transparent"),
                      boxShadow: (isHero && revealed) ? "0 0 12px 2px rgba(236,203,134,.85), 0 0 4px " + (k ? QCOLOR[k] : "transparent") : "none",
                      background: (isHero && revealed) ? "rgba(236,203,134,.12)" : "transparent" }}>
                      {revealed && k && <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0 0 6px " + QCOLOR[k] + ")" }}>{badgeIcon(k, 26)}</span>}
                    </span>
                  );
                })}
              </div>
              {/* (사용자 요청) 영사기 연출 — 아래 유산 블록에서 보드 밑면까지 뻗는 사다리꼴 금빛 광선(순수 CSS). */}
              <motion.div aria-hidden="true" animate={{ opacity: [0.75, 1, 0.85, 1] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                style={{ width: lightBoardSize, height: beamHeight,
                  clipPath: "polygon(0% 0%, 100% 0%, " + (50 + beamNarrow) + "% 100%, " + (50 - beamNarrow) + "% 100%)",
                  background: "linear-gradient(180deg, rgba(196,154,80,.04) 0%, rgba(196,154,80,.3) 55%, rgba(236,203,134,.75) 100%)",
                  filter: "blur(1.5px)", marginTop: -4, marginBottom: -4, pointerEvents: "none" }} />
              {/* (사용자 요청) "다시 보기" 버튼 대신, 유산 블록을 클릭할 때마다 처음부터 다시 재생된다. */}
              <LegacyProjectorBlock entry={entry} size={blockSize} onClick={() => setAppliedCount(startCount)} />
            </motion.div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
// 유산 칸 — 프로필의 "푼 퍼즐" 바로 위에 표시. onManageLegacy가 있으면(=내 프로필) 빈 칸에 추가
// 버튼·채워진 칸에 편집 버튼이 뜨고, 없으면(=남의 프로필) 채워진 칸만 읽기 전용으로 보여준다
// (유산이 하나도 없으면 섹션 자체를 감춘다).
// (사용자 요청) 그랜드마스터 티어(isGM)면 종류(최선/유일/탁월)마다 칸을 하나씩 더(총 6칸) 쓸 수
// 있다 — 기존 슬롯 키(best/only/brilliant)는 그대로 두고, 추가 슬롯은 "2"를 붙인 별도 키
// (best2/only2/brilliant2)로 완전히 독립 저장해 기존 데이터 마이그레이션이 필요 없게 했다.
// (사용자 요청) 유산 타일을 종류(최선/유일/탁월)별로 세로 한 열에 묶어 보여준다 — 세 종류가
// 나란히 열로 놓이고, 그랜드마스터 보너스 칸이 있으면 그 종류의 열 안에서 아래로 쌓인다.
// LegacyStoneRow(카드 인라인)와 LegacyAllModal(더보기 전체 보기) 둘 다 이 렌더러를 공유한다.
function LegacyGrid({ slots, legacies, onManageLegacy, onOpen, showDate, onShare, likeCounts, likedSlots, onToggleLike }) {
  return (
    <div className="flex" style={{ gap: 8 }}>
      {LEGACY_TYPES.map((t) => {
        const colSlots = slots.filter((s) => s.typeInfo.key === t.key);
        if (!colSlots.length) return null;
        // (사용자 요청) 남의 프로필(onManageLegacy 없음)에서는 빈 칸을 아예 그리지 않는데, 그래도
        // 이 칼럼 래퍼 자체는 flex-basis(LEGACY_TILE_FLEX)를 차지해 "원래 자리"에 빈 여백으로
        // 남아 있었다 — 채워진 칸이 하나도 없는 칼럼은 래퍼째로 건너뛰어, 남은 칼럼들이 왼쪽부터
        // 채워지고 오른쪽에 여백이 생기게 한다.
        if (!onManageLegacy && !colSlots.some((s) => legacies && legacies[s.slotKey])) return null;
        return (
          <div key={t.key} style={{ display: "flex", flexDirection: "column", gap: 8, flex: LEGACY_TILE_FLEX, minWidth: 0 }}>
            {colSlots.map(({ slotKey, typeInfo }) => {
              const bonus = slotKey.endsWith("2");
              const entry = legacies && legacies[slotKey];
              // (버그 방지) LegacyStoneTile/LegacyEmptySlot 자신의 루트에 flex:LEGACY_TILE_FLEX가
              // 박혀 있어(가로 3칸 행 기준) 세로 열(flexDirection:column) 안에 그대로 두면 main axis가
              // 세로로 바뀌어 오작동한다 — flex가 아닌 일반 블록 래퍼로 한 겹 감싸 무력화한다.
              if (entry) return (
                <div key={slotKey}>
                  <LegacyStoneTile typeInfo={typeInfo} entry={entry} onOpen={() => onOpen(slotKey)} onEdit={onManageLegacy ? () => onManageLegacy(slotKey) : null} onShare={onShare ? () => onShare(slotKey) : null}
                    likeCount={likeCounts ? likeCounts[slotKey] : 0} isLiked={likedSlots ? likedSlots.has(slotKey) : false} onToggleLike={onToggleLike ? () => onToggleLike(slotKey) : null} />
                  {showDate && entry.savedAt && <div style={{ fontSize: 9.5, color: T.inkSoft, textAlign: "center", marginTop: 3 }}>{fmtDateOnly(entry.savedAt, { year: "numeric", month: "2-digit", day: "2-digit" })}</div>}
                </div>
              );
              return onManageLegacy ? <div key={slotKey}><LegacyEmptySlot typeInfo={typeInfo} bonus={bonus} onClick={() => onManageLegacy(slotKey)} /></div> : null;
            })}
          </div>
        );
      })}
    </div>
  );
}
// (사용자 요청) "더보기" — 프로필 카드 인라인 행과 별개로, 그 사용자가 등록해 둔 유산을 종류별로
// 언제 등록했는지(savedAt)와 함께 더 크게 볼 수 있는 전체 화면. (사용자 요청) 지워진 유산까지 다시
// 볼 수 있는 이력(history) — 새로 저장하거나 삭제해서 그 칸에서 밀려난 옛 유산들을 "지난 유산"
// 섹션에 최신순으로 나열한다(클릭하면 그대로 재생해 볼 수 있다. 편집·복원은 지원하지 않는다).
function LegacyAllModal({ slots, legacies, history, onManageLegacy, onClose, onShare, likeCounts, likedSlots, onToggleLike }) {
  const [openTarget, setOpenTarget] = useState(null); // { typeInfo, entry } | null
  const histItems = useMemo(() => (history || []).map((h, idx) => ({ ...h, idx, typeInfo: LEGACY_TYPES.find((t) => t.key === legacyBaseKey(h.slotKey)) })).filter((h) => h.typeInfo).reverse(), [history]);
  // (v0.3.4 UI) 채팅·프로필·검색·친구 창(v0.3.2~v0.3.3)과 같은 모바일 전체 화면 패턴을 유산 관련
  // 모달에도 맞춘다 — 이 창만 빠져 있었다.
  const narrow = useNarrow(640);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,6,3,.6)", zIndex: 200, display: "flex", alignItems: narrow ? "stretch" : "flex-start", justifyContent: "center", padding: narrow ? 0 : "40px 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: narrow ? "100%" : 420, height: narrow ? "100%" : undefined, maxHeight: narrow ? "100%" : "min(720px, 85vh)", display: "flex", flexDirection: "column", background: T.paper, borderRadius: narrow ? 0 : 16, border: narrow ? "none" : "1px solid #DCCBA8", boxShadow: narrow ? "none" : "0 20px 50px -12px rgba(0,0,0,.6)", overflow: "hidden" }}>
        <div className="flex items-center justify-between" style={{ padding: "14px 16px", borderBottom: "1px solid #E4D5B6", flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{t("유산 전체 보기")}</span>
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 28, height: 28, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
        </div>
        <div style={{ padding: 18, flex: "1 1 auto", overflowY: "auto" }}>
          <LegacyGrid slots={slots} legacies={legacies} onManageLegacy={onManageLegacy} onOpen={(slotKey) => { const s = slots.find((x) => x.slotKey === slotKey); const e = legacies && legacies[slotKey]; if (s && e) setOpenTarget({ typeInfo: s.typeInfo, entry: e }); }} showDate onShare={onShare} likeCounts={likeCounts} likedSlots={likedSlots} onToggleLike={onToggleLike} />
          {histItems.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed #C9B58C" }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{t("지난 유산")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {histItems.map((h) => (
                  <button key={h.idx} onClick={() => setOpenTarget({ typeInfo: h.typeInfo, entry: h.entry })} className="press" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, border: "1px solid #E4D5B6", background: "#FBF5E8", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, background: QCOLOR[h.typeInfo.kind], color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{badgeIcon(h.typeInfo.kind, 16)}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: T.ink, fontFamily: SITE_FONT }}>{legacyMoveLabel(h.entry)}</div>
                      <div style={{ fontSize: 10, color: T.inkSoft }}>{h.typeInfo.label}{h.replacedAt ? t(" · {0} 교체/삭제됨", fmtDateOnly(h.replacedAt, { year: "numeric", month: "2-digit", day: "2-digit" })) : ""}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <AnimatePresence>
        {openTarget && <LegacyRevealScreen typeInfo={openTarget.typeInfo} entry={openTarget.entry} onClose={() => setOpenTarget(null)} />}
      </AnimatePresence>
    </div>
  );
}
// (사용자 요청) 유산 블록 좋아요 — 프로필 주인(ownerUid)의 유산 슬롯별 좋아요 수와, 지금 보는 사람
// (viewerUid)이 좋아요했는지를 이 행이 직접 조회·토글해서 아래 LegacyGrid/LegacyAllModal에 물려준다.
// 퍼즐 좋아요(likedPuzzles/likeCounts/onToggleLike)와 달리 App 최상단 state가 아니라 이 행 스코프의
// 로컬 state로 두는 이유 — 프로필 주인이 바뀔 때마다(다른 유저 프로필을 열 때마다) 새로 조회해야
// 하는 값이라, 전역에 계속 들고 있을 이유가 없다.
function LegacyStoneRow({ legacies, history, onManageLegacy, isGM, onShareLegacy, ownerUid, viewerUid }) {
  const [openKey, setOpenKey] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [likeCounts, setLikeCounts] = useState({});
  const [likedSlots, setLikedSlots] = useState(new Set());
  const likeInFlightRef = useRef(new Set());
  useEffect(() => {
    let cc = false;
    setLikeCounts({}); setLikedSlots(new Set());
    if (!ownerUid) return;
    (async () => {
      const [counts, liked] = await Promise.all([legacyLikeCounts(ownerUid), legacyLikedSlots(ownerUid, viewerUid)]);
      if (!cc) { setLikeCounts(counts); setLikedSlots(liked); }
    })();
    return () => { cc = true; };
  }, [ownerUid, viewerUid]);
  const onToggleLike = viewerUid ? (slotKey) => {
    if (likeInFlightRef.current.has(slotKey)) return;
    likeInFlightRef.current.add(slotKey);
    const wasLiked = likedSlots.has(slotKey);
    setLikedSlots((s) => { const n = new Set(s); if (wasLiked) n.delete(slotKey); else n.add(slotKey); return n; });
    setLikeCounts((m) => ({ ...m, [slotKey]: Math.max(0, (m[slotKey] || 0) + (wasLiked ? -1 : 1)) }));
    legacyLikeToggle(ownerUid, slotKey, viewerUid).then((r) => {
      if (!r) {
        setLikedSlots((s) => { const n = new Set(s); if (wasLiked) n.add(slotKey); else n.delete(slotKey); return n; });
        setLikeCounts((m) => ({ ...m, [slotKey]: Math.max(0, (m[slotKey] || 0) + (wasLiked ? 1 : -1)) }));
        return;
      }
      setLikeCounts((m) => ({ ...m, [slotKey]: r.likes }));
      setLikedSlots((s) => { if (s.has(slotKey) === r.liked) return s; const n = new Set(s); if (r.liked) n.add(slotKey); else n.delete(slotKey); return n; });
    }).finally(() => { likeInFlightRef.current.delete(slotKey); });
  } : null;
  const slots = useMemo(() => {
    const out = [];
    for (const t of LEGACY_TYPES) { out.push({ slotKey: t.key, typeInfo: t }); if (isGM) out.push({ slotKey: t.key + "2", typeInfo: t }); }
    return out;
  }, [isGM]);
  const any = slots.some((s) => legacies && legacies[s.slotKey]) || !!onManageLegacy;
  if (!any) return null;
  const openSlot = openKey ? slots.find((s) => s.slotKey === openKey) : null;
  const openEntry = openSlot && legacies ? legacies[openSlot.slotKey] : null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: T.ink }}>{t("유산")}</span>
        {/* (사용자 요청) "유산" 텍스트와 같은 줄에 더보기 버튼 — 눌러 등록된 모든 유산을 등록 시점과 함께 크게 본다. */}
        <button onClick={() => setShowAll(true)} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 1, background: "none", border: "none", cursor: "pointer", color: T.brass, fontSize: 11, fontWeight: 800 }}>{tx("더보기 {0}", <ChevronRight size={12} />)}</button>
      </div>
      <LegacyGrid slots={slots} legacies={legacies} onManageLegacy={onManageLegacy} onOpen={setOpenKey} onShare={onShareLegacy} likeCounts={likeCounts} likedSlots={likedSlots} onToggleLike={onToggleLike} />
      <AnimatePresence>
        {openSlot && openEntry && <LegacyRevealScreen typeInfo={openSlot.typeInfo} entry={openEntry} onClose={() => setOpenKey(null)} />}
      </AnimatePresence>
      {showAll && <LegacyAllModal slots={slots} legacies={legacies} history={history} onManageLegacy={onManageLegacy} onClose={() => setShowAll(false)} onShare={onShareLegacy} likeCounts={likeCounts} likedSlots={likedSlots} onToggleLike={onToggleLike} />}
    </div>
  );
}
// (17차→v0.1.0) 프로필 정보 확장 — 티어/XP, 해결한 퍼즐 수, chess.com 전적까지 한 곳에서 보여주는
// 공용 컴포넌트. UserSearchModal/FriendsModal 양쪽에서 같은 형태로 재사용한다. (v0.1.0) 설정 탭
// "내 프로필"에서만 보이던 메인 퀘스트 진척도·푼 퍼즐 목록도 pub에 실려 있으면(publishProfile이
// solvedNos/mainQuestSummary를 채워 넣음) 같은 자리에 표시해, 다른 유저의 프로필에서도 볼 수 있다.
// (버그 수정) 친구 프로필 창의 채팅·친구 요청/수락/거절 버튼을 카드 맨 아래 대신 티어와 메인
// 퀘스트 진척도 사이에 두기 위해, 그 자리에 끼워 넣을 내용을 actions prop으로 받는다 — 이 컴포넌트를
// 쓰는 다른 곳(내 프로필·유저 검색)은 actions를 안 넘기면 예전과 완전히 동일하다.
// (사용자 요청) 티어 십각형 + 퍼즐 레이팅 배지 한 줄 — PublicProfileStats 안에 있던 것을 별도
// 컴포넌트로 뽑아, /user 데스크톱 레이아웃에서는 왼쪽 열(유저 정보 아래)에 직접 렌더링하고
// PublicProfileStats 쪽은 hideTierRow로 그 자리를 비워 중복 표시를 막는다.
export function TierRatingRow({ pub }) {
  // (사용자 요청) 이 카드가 지금 "누구의" 프로필을 보여주고 있든 항상 그 pub.xp를 기준으로 열려야
  // 하고, 내 XP(전역 상태)로 열려서는 안 된다.
  const [tierMapOpen, setTierMapOpen] = useState(false);
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 8, flexWrap: "wrap" }}>
      {tierMapOpen && <TierJourneyMap totalXp={pub.xp || 0} onClose={() => setTierMapOpen(false)} />}
      <TierStatPill totalXp={pub.xp || 0} size={52} onClick={() => setTierMapOpen(true)} />
      {pub.puzzleRating != null && (
        <ClickInfoBadge text={t("퍼즐 레이팅 : {0}", fmtFull(pub.puzzleRating))}>
          <span title={t("퍼즐 레이팅: 라인을 풀면 상승, 틀린 수를 두면 하락")} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, background: "rgba(0,0,0,.05)", border: "1px solid #DCCBA8", color: T.ink, fontSize: 11.5, fontWeight: 800 }}>
            <MaterialIcon name="extension" size={12} /> {fmtFull(pub.puzzleRating)}
          </span>
        </ClickInfoBadge>
      )}
    </div>
  );
}
export function PublicProfileStats({ pub, onOpenOpening, onOpenGame, onOpenGameAnalyze, onOpenPuzzle, hideChesscom, hideTierRow, mySolved, myLineSolves, actions, onManageLegacy, onShareLegacy, ownerUid, viewerUid, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare }) {
  const chesscom = useChessCom(pub.chesscom);
  const mq = pub.mainQuestSummary;
  return (
    <div style={{ marginBottom: 12 }}>
      {!hideTierRow && <TierRatingRow pub={pub} />}
      {actions && <div style={{ display: "flex", gap: 8, margin: "10px 0 14px" }}>{actions}</div>}
      <FirstMovesDisplay firstMoves={pub.firstMoves} />
      {/* (v0.6.2, 사용자 요청) XP·퍼즐·레슨·일반 대국·미니게임 기록을 한 카드 묶음으로 */}
      <AchievementDashboard pub={pub} uid={ownerUid} mq={mq} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />
      {/* (사용자 요청) 유산 — "푼 퍼즐" 바로 위에 표시. 그랜드마스터 티어면 종류별로 칸을 하나씩 더 쓸 수 있다. */}
      <LegacyStoneRow legacies={pub.legacies} history={pub.legacyHistory} onManageLegacy={onManageLegacy} isGM={tierFromXp(pub.xp || 0).tier.key === "grandmaster"} onShareLegacy={onShareLegacy} ownerUid={ownerUid} viewerUid={viewerUid} />
      {Array.isArray(pub.solvedNos) && pub.solvedNos.length > 0 && <PublicSolvedPuzzles solvedNos={pub.solvedNos} onOpenPuzzle={onOpenPuzzle} mySolved={mySolved} myLineSolves={myLineSolves} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} />}
      {!hideChesscom && pub.chesscom && <AccountChessStats chesscom={chesscom} username={pub.chesscom} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />}
    </div>
  );
}
// (사용자 요청, v0.3.9) 친구·검색 창 경로로 보는 남(또는 나 자신)의 프로필 상세에도, 이번 세션에
// MyProfileCard에 추가한 OpenChess/chess.com 통계 분리를 그대로 적용한다 — 읽기 전용(편집·유산 관리
// 버튼 없음) 판이라 MyProfileCard와 별개의 작은 컴포넌트로 둔다. (사용자 요청, v0.3.9 후속) 토글
// 버튼 자체는 이제 카드 우상단(아이디 라벨과 같은 줄)에 두므로, 이 컴포넌트는 더는 토글을 직접
// 그리지 않고 statsView를 부모(UserSearchModal·FriendsModal)로부터 값만 받아 그 값에 맞는 통계만
// 보여준다 — 토글 버튼은 부모가 헤더 줄에서 statsViewToggle 헬퍼로 그린다.
export function ProfileStatsPanel({ pub, statsView, onOpenOpening, onOpenGame, onOpenGameAnalyze, onOpenPuzzle, hideTierRow, mySolved, myLineSolves, actions, ownerUid, viewerUid, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare }) {
  const chesscom = useChessCom(pub.chesscom);
  return (
    <div style={{ marginBottom: 12 }}>
      {actions && <div style={{ display: "flex", gap: 8, marginBottom: 14, justifyContent: "center" }}>{actions}</div>}
      {statsView === "oc" ? (
        <PublicProfileStats pub={pub} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} onOpenPuzzle={onOpenPuzzle} hideChesscom hideTierRow={hideTierRow} mySolved={mySolved} myLineSolves={myLineSolves} ownerUid={ownerUid} viewerUid={viewerUid} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} />
      ) : pub.chesscom ? (
        <AccountChessStats chesscom={chesscom} username={pub.chesscom} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} compact />
      ) : (
        <div style={{ textAlign: "center", padding: "22px 10px" }}>
          <ChesscomLogo height={28} />
          <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "10px 0 0", lineHeight: 1.6 }}>{t("chess.com 계정 미연동")}</p>
        </div>
      )}
    </div>
  );
}
// (v0.0.6 개편) 티어 여정 경로 본체 — TIER_STATIONS(티어×구간을 전부 펼친 목록, 31개)를 하나하나
// 같은 크기의 원으로 세로 지그재그로 늘어놓는다. 지나온 구간은 완료 표시, 지금 구간은 펄스로
// 강조, 아직 안 온 구간은 잠금으로 가린다. 노드 사이 연결선은 OpeningSchematic·PuzzleSchematic이
// 이미 쓰는 "절대 배치 노드 + 아래 SVG 커넥터" 기법을 그대로 따른다(이소메트릭 렌더링을 새로
// 만들지 않는다).
// (버그 수정) 여정 지도의 연결선·정거장 등장 애니메이션은 once:false라 스크롤로 지나갈 때마다
// 다시 재생돼야 하는데, whileInView는 IntersectionObserver 콜백을 그대로 애니메이션 상태에
// 반영한다 — 가느다란 대각선처럼 바운딩 박스가 얇은 도형은 노출 비율이 스크롤 몇 픽셀 차이에도
// 크게 출렁이므로, 스크롤이 딱 60% 노출 경계에 걸친 좌표에서 멈추면 관성 스크롤의 미세한 떨림만
// 으로도 보임/안 보임이 반복 전환되며 애니메이션이 무한히 깜빡였다("특정 좌표에 멈추면 애니메이션이
// 이상하게 재생되는" 신고 원인). onViewportEnter/Leave 콜백 자체는 whileInView와 똑같이 받되, 그
// 값을 짧게(130ms) 흔들리지 않고 유지될 때만 실제 상태에 반영해 — 순간적인 떨림은 걸러내고, 실제로
// 스크롤해서 들어오고 나가는 정상적인 경우에는 지금처럼 매번 그대로 반복 재생된다.
function useSettledInView(delay = 130) {
  const [settled, setSettled] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const commit = (val) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSettled(val), delay);
  };
  return { settled, onViewportEnter: () => commit(true), onViewportLeave: () => commit(false) };
}
// 여정 지도 연결선 하나 — pathLength/opacity를 whileInView 대신 위 훅으로 디바운스된 animate로 몬다.
function TierPathLine({ x1, y1, x2, y2, lineStyle, glow, transition, amount = 0.6 }) {
  const { settled, onViewportEnter, onViewportLeave } = useSettledInView();
  const hidden = { pathLength: 0, opacity: 0 };
  const shown = { pathLength: 1, opacity: 1 };
  return (
    <motion.line x1={x1} y1={y1} x2={x2} y2={y2} {...lineStyle}
      initial={hidden}
      animate={settled ? shown : hidden}
      viewport={{ once: false, amount }}
      onViewportEnter={onViewportEnter}
      onViewportLeave={onViewportLeave}
      transition={transition}
      style={glow} />
  );
}
// 여정 지도 정거장 등장(등장 시 살짝 튀어오르며 회전이 풀리는 연출) — 위와 동일한 디바운스 적용.
function TierStationReveal({ tilt, children }) {
  const { settled, onViewportEnter, onViewportLeave } = useSettledInView();
  const hidden = { opacity: 0, scale: 0.45, rotate: tilt };
  const shown = { opacity: 1, scale: 1, rotate: 0 };
  return (
    <motion.div
      initial={hidden}
      animate={settled ? shown : hidden}
      viewport={{ once: false, amount: 0.6 }}
      onViewportEnter={onViewportEnter}
      onViewportLeave={onViewportLeave}
      transition={{ duration: 0.55, ease: [0.22, 0.9, 0.32, 1] }}
      style={{ position: "absolute", inset: 0 }}>
      {children}
    </motion.div>
  );
}
function TierJourneyPath({ totalXp, scrollContainerRef, onColorChange }) {
  const info = useMemo(() => tierFromXp(totalXp), [totalXp]);
  // (사용자 요청) 여정 지도 전체를 조금씩 더 크게 — 정거장 원·간격·기물 이미지를 전부 비례해서 키운다.
  const STATION_H = 116, STATION_GAP = 62;
  // (v0.1.4 기능) "그랜드마스터는 마지막 단계라는 걸 보여주기 위해 선을 더 길게, 중앙 직선으로
  // 이어지게" — 그랜드마스터 직전 간격만 크게 벌리고(GM_EXTRA_GAP), 맨 위(그랜드마스터 자신) 위로도
  // 여백(GM_TOP_PAD)을 더 둬 오로라 배경 밴드가 위로 넉넉히 확장될 공간을 만든다.
  const GM_EXTRA_GAP = 230, GM_TOP_PAD = 180;
  // (버그 수정) 높은 티어가 위쪽에 오도록 뒤집으면서, 대부분(낮은 티어) 유저는 지금 위치가 맨 아래로
  // 밀려나 열 때마다 스크롤을 내려야 했다 — 마운트되자마자 지금 구간이 화면 가운데 오도록 자동으로 스크롤한다.
  const currentRef = useRef(null);
  useEffect(() => { if (currentRef.current) currentRef.current.scrollIntoView({ block: "center" }); }, []);
  // 시각적 세로 위치를 뒤집으면서(진행 순서 i는 그대로), 그랜드마스터 직전 구간의 간격만 예외적으로
  // 크게 준다 — 나머지 정거장 사이 간격은 기존과 동일.
  const lastIdx = TIER_STATIONS.length - 1;
  const stationTops = useMemo(() => {
    const tops = new Array(TIER_STATIONS.length);
    tops[lastIdx] = GM_TOP_PAD;
    for (let i = lastIdx - 1; i >= 0; i--) {
      const gap = i === lastIdx - 1 ? STATION_GAP + GM_EXTRA_GAP : STATION_GAP;
      tops[i] = tops[i + 1] + STATION_H + gap;
    }
    return tops;
  }, [lastIdx]);
  const topOf = (i) => stationTops[i];
  // 지금 내가 서 있는 자리를 TIER_STATIONS 안에서 찾는다 — 그 인덱스보다 앞(작음)이면 이미 지난
  // 구간, 뒤(큼)면 아직 안 온 구간이다. 그랜드마스터는 구간이 없어(division:null) info.division도
  // maxed일 때 null로 맞춰 둔 값과 그대로 비교된다.
  const currentIdx = useMemo(() => TIER_STATIONS.findIndex((s) => s.tierIdx === info.tierIndex && s.division === (info.maxed ? null : info.division)), [info]);
  const totalHeight = stationTops[0] + STATION_H;
  // (v0.1.3 기능) TIER_STATIONS는 티어별로 이미 뭉쳐서(아이언 5~1, 브론즈 5~1…) 순서대로 나열돼
  // 있으므로, 같은 tier.key가 연속되는 구간을 하나의 "밴드"로 묶어 그 구간의 세로 픽셀 범위를 구한다
  // — 이 범위에 그 티어 전용 배경 이미지를 깔면, 스크롤해서 그 티어 구간을 지날 때만 자연스럽게
  // 그 배경이 보인다.
  // (v0.1.4 버그 수정) "티어 배경이 끊어져 보인다" — 예전엔 밴드마다 자기 영역 안에서만 위아래
  // 70px을 검은색으로 페이드시켰다. 밴드끼리 서로 안 겹치니 경계에서는 두 배경이 섞이는 대신
  // 양쪽 다 같은 어두운 배경으로 각자 사라졌다가 다시 나타나는 것처럼 보여, 이어지는 배경이 아니라
  // 뚝뚝 끊어진 조각들처럼 읽혔다. 이제 각 밴드를 이웃 티어 영역까지 BG_FADE만큼 겹쳐 그리고, 그
  // 겹친 구간에서 양쪽이 함께 반투명해지도록(한쪽은 옅어지고 다른 쪽은 짙어지며) 해 실제로 두
  // 배경이 서로 섞여 이어지도록 한다(맨 처음 아이언의 아래쪽·맨 끝 그랜드마스터의 위쪽은 겹칠
  // 이웃이 없으므로 확장하지 않는다).
  const BG_FADE = 130;
  const tierBands = useMemo(() => {
    const bands = [];
    let i = 0;
    while (i < TIER_STATIONS.length) {
      const key = TIER_STATIONS[i].tier.key;
      let j = i;
      while (j < TIER_STATIONS.length && TIER_STATIONS[j].tier.key === key) j++;
      const startIdx = i, endIdx = j - 1;
      const isFirst = i === 0, isLast = j === TIER_STATIONS.length;
      let top = Math.min(topOf(startIdx), topOf(endIdx));
      let bottom = Math.max(topOf(startIdx), topOf(endIdx)) + STATION_H;
      top = isLast ? 0 : top - BG_FADE;       // 그랜드마스터는 컨테이너 맨 위까지 그대로 채운다
      if (!isFirst) bottom += BG_FADE;         // 아이언 아래쪽은 겹칠 이웃이 없어 확장하지 않는다
      bands.push({ key, top, height: bottom - top });
      i = j;
    }
    return bands;
  }, []);
  // (사용자 요청) 닫기 버튼 색이 지금 화면에 보이는 티어 배경에 따라 하늘색→보라색처럼 바로 바뀌지
  // 않고, y좌표 스크롤을 따라 인접한 두 티어 색 사이를 서서히 섞으며 바뀌도록 한다. 각 티어 밴드의
  // 세로 중앙 지점을 "색상 정지점"으로 삼아(색 자체는 TIER_COLORS — 실제 티어 이미지에서 뽑아낸
  // 대표색, 그랜드마스터만 프로필 테두리에 쓰는 홀로그램 그러데이션의 첫 색을 그대로 씀), 지금
  // 스크롤 위치가 그 두 지점 사이 어디쯤인지 비율로 계산해 hexLerp로 선형 보간한다.
  const colorStops = useMemo(() => (
    tierBands.map((b) => ({
      y: b.top + b.height / 2,
      hex: b.key === "grandmaster" ? TIER_COLORS.grandmaster.stops[0] : tierGlowHex(b.key),
    })).sort((a, c) => a.y - c.y)
  ), [tierBands]);
  useEffect(() => {
    const el = scrollContainerRef && scrollContainerRef.current;
    if (!el || !colorStops.length || !onColorChange) return;
    // 닫기 버튼이 뷰포트 상단 근처(top:18)에 고정돼 있으므로, "지금 버튼 자리에 어떤 배경이
    // 보이는지"를 스크롤 위치 + 이 오프셋으로 근사한다.
    const REF_OFFSET = 80;
    const compute = () => {
      const y = el.scrollTop + REF_OFFSET;
      let hex = colorStops[0].hex;
      if (y <= colorStops[0].y) hex = colorStops[0].hex;
      else if (y >= colorStops[colorStops.length - 1].y) hex = colorStops[colorStops.length - 1].hex;
      else {
        for (let i = 0; i < colorStops.length - 1; i++) {
          const a = colorStops[i], b = colorStops[i + 1];
          if (y >= a.y && y <= b.y) { hex = hexLerp(a.hex, b.hex, (y - a.y) / (b.y - a.y)); break; }
        }
      }
      onColorChange(hex);
    };
    compute();
    el.addEventListener("scroll", compute, { passive: true });
    return () => el.removeEventListener("scroll", compute);
  }, [colorStops, scrollContainerRef, onColorChange]);
  return (
    // (기능) 노드·연결선이 전부 같은 "left:22%/78% + translateX(-50%)" 좌표계를 공유해, 컨테이너
    // 폭이 얼마든(반응형) 원 중심과 SVG 선 끝점이 항상 정확히 겹친다.
    <div style={{ position: "relative", paddingBottom: 20, height: totalHeight }}>
      {/* (v0.1.3 기능) 티어별 배경 — 각 밴드 높이에 꽉 채우고(object-fit:cover), 원본 색감 그대로
          쓰되(보정 없음) 천천히 확대·이동하는 카메라 무브(켄 번즈)를 반복 재생해 정지 이미지도
          계속 살아있는 느낌을 준다. 위아래 가장자리는 mask로 옅게 흐려 다음 티어 배경과 부드럽게
          이어지고, 어두운 그러데이션을 한 겹 덮어 그 위 흰 정거장 도형이 항상 잘 읽히게 한다. */}
      {tierBands.map((b) => (
        <div key={b.key} style={{ position: "absolute", left: 0, top: b.top, width: "100%", height: b.height, overflow: "hidden", zIndex: 0, WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black " + BG_FADE + "px, black calc(100% - " + BG_FADE + "px), transparent 100%)", maskImage: "linear-gradient(to bottom, transparent 0, black " + BG_FADE + "px, black calc(100% - " + BG_FADE + "px), transparent 100%)" }}>
          <motion.img
            src={TIER_BG_IMAGE[b.key]} alt=""
            animate={{ scale: [1, 1.14, 1], x: ["0%", "-3%", "0%"], y: ["0%", "-2%", "0%"] }}
            transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(15,9,5,.6), rgba(15,9,5,.72))" }} />
        </div>
      ))}
      <svg width="100%" height={totalHeight} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
        {TIER_STATIONS.slice(0, -1).map((_, i) => {
          const x1 = i % 2 ? "78%" : "22%";
          const y1 = topOf(i) + STATION_H / 2, y2 = topOf(i + 1) + STATION_H / 2;
          const lit = i < currentIdx;
          const lineStyle = { stroke: lit ? "#F5C542" : "rgba(255,255,255,.18)", strokeWidth: lit ? 3.5 : 3, strokeDasharray: lit ? undefined : "3 7", strokeLinecap: "round" };
          const glow = lit ? { filter: "drop-shadow(0 0 3px rgba(245,197,66,.7))" } : undefined;
          // (v0.1.4 기능) 그랜드마스터로 이어지는 마지막 구간은 "여기가 끝"이라는 인상을 주기 위해
          // 지그재그 대각선 대신, 중앙으로 꺾여 들어가 그대로 수직으로 길게 뻗는 꺾은선(엘보)으로
          // 그린다 — 직전 정거장 위치(22%/78%)에서 수평으로 중앙까지 이동한 뒤, 그 중앙 직선을 타고
          // 위로 길게 올라가 그랜드마스터 정거장 정중앙에 닿는다.
          if (i === lastIdx - 1) {
            const elbowY = y1 - (y1 - y2) * 0.28;
            return (
              <React.Fragment key={i}>
                <TierPathLine x1={x1} y1={y1} x2="50%" y2={elbowY} lineStyle={lineStyle} glow={glow} transition={{ duration: 0.5, ease: "easeOut" }} />
                <TierPathLine x1="50%" y1={elbowY} x2="50%" y2={y2} lineStyle={lineStyle} glow={glow} transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }} />
              </React.Fragment>
            );
          }
          const x2 = (i + 1) % 2 ? "78%" : "22%";
          // (버그 수정) 이미 지나온 구간은 점선이 아니라 뚜렷한 노란색 실선으로 — 스크롤해서 이
          // 구간이 화면에 들어올 때마다(once:false) 선이 그어지는 애니메이션이 반복 재생된다.
          // 가느다란 대각선은 바운딩 박스가 얇아 노출 비율이 스크롤 몇 픽셀 차이에도 크게 출렁여,
          // 스크롤이 딱 60% 노출 경계에 걸친 좌표에서 멈추면 그 떨림만으로 무한히 깜빡이던 문제가
          // 있었다 — TierPathLine이 그 신호를 130ms 디바운스해서 걸러낸다(위 useSettledInView 참고).
          return <TierPathLine key={i} x1={x1} y1={y1} x2={x2} y2={y2} lineStyle={lineStyle} glow={glow} transition={{ duration: 0.7, ease: "easeOut" }} />;
        })}
      </svg>
      {TIER_STATIONS.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "locked";
        // (v0.1.4 기능) 그랜드마스터는 마지막 단계라는 것을 강조하기 위해 지그재그 대신 중앙(50%)에
        // 배치 — 위 연결선 엘보도 이 중앙 지점을 향해 그려진다.
        const cx = i === lastIdx ? "50%" : (i % 2 ? "78%" : "22%");
        const top = topOf(i);
        // (v0.1.1) 로고 뒤에 배경을 둬 어두운 톤의 티어도 잘 보이게 하고, "현재 구간"만 그 티어
        // 색으로 은은하게 빛나는 글로우를 준다.
        // (v0.1.1 버그 수정) 잠긴 구간을 표시할 때 배경 전체의 불투명도를 낮췄더니, 배경 뒤로
        // 지나가는 점선 연결선이 옅게 비쳐 보였다(반투명 배경을 통과해 뒤의 선이 섞여 보임) — 배경은
        // 항상 완전히 불투명하게 유지해 선을 확실히 가리고, "아직 안 왔다"는 표시는 기물 이미지
        // 쪽만 옅게 낮춘다(TierPieceGlyph의 muted).
        // (v0.1.3 UI) TierLogoDisc와 동일하게 원 대신 십각형으로, 배경은 브라스 골드 대신 흰색으로.
        // box-shadow의 원형 글로우 대신, 실제 도형(SVG 폴리곤) 알파를 따라가는 drop-shadow 필터로
        // "현재 구간" 링 글로우를 낸다.
        const tc = TIER_COLORS[s.tier.key];
        const ringColor = tc.stops ? tc.stops[1] : tc.hi;
        // (버그 수정) 잠금 아이콘은 없애고, 이미지는 항상 원래 색 그대로 보여준다(muted 제거) —
        // "아직 안 온 구간"이라는 표시는 이제 점선 연결선·현재 위치 표시만으로 충분하다.
        return (
          <React.Fragment key={s.tier.key + "-" + (s.division ?? "gm")}>
            {/* (v0.1.4 버그 수정) "모바일에서 여정 지도가 왜곡된다"는 신고 원인 — framer-motion은
                scale/rotate처럼 transform 계열 모션 값을 다루는 순간 그 엘리먼트의 transform CSS를
                통째로 자기가 계산한 값으로 덮어써, style로 준 정적인 translateX(-50%) 중앙 정렬이
                애니메이션이 끝나자마자 조용히 사라졌다 — 78% 자리 정거장이 중앙 정렬 없이 그대로
                오른쪽으로 반 칸(48px)어치 더 밀려나, 화면이 좁은 모바일에서 오른쪽 끝이 뷰포트
                밖으로 잘려나갔다. 정적 중앙 정렬(translateX(-50%))은 애니메이션이 없는 바깥 div가
                전담하고, scale/rotate 애니메이션은 그 안쪽(inset:0)의 별도 motion.div로 분리한다. */}
            <div style={{ position: "absolute", left: cx, top, width: STATION_H, height: STATION_H, transform: "translateX(-50%)" }}>
              {/* (버그 수정) 정거장 등장 애니메이션도 연결선과 같은 이유로 깜빡였다 — TierStationReveal이
                  onViewportEnter/Leave 신호를 130ms 디바운스해서 걸러내므로, once:false로 스크롤마다
                  반복 재생되는 연출은 그대로 유지하면서 스크롤이 노출 경계에 멈췄을 때의 떨림만 없앤다. */}
              <TierStationReveal tilt={i % 2 ? 10 : -10}>
              <motion.div
                ref={state === "current" ? currentRef : undefined}
                animate={state === "current" ? { scale: [1, 1.06, 1] } : {}}
                transition={state === "current" ? { repeat: Infinity, duration: 2 } : {}}
                style={{ position: "absolute", inset: 0 }}>
                <div style={{
                  position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  filter: "drop-shadow(0 2px 6px rgba(0,0,0,.4))" + (state === "current" ? " drop-shadow(0 0 8px " + ringColor + ")" : ""),
                }}>
                  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
                    <path d={TIER_DECAGON_PATH} fill="#FFFFFF" stroke="#D8CFB8" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                  {/* (v0.1.1) "아이언 V" 같은 이름+구간 텍스트 라벨을 없애고, 구간 전용 이미지(로마 숫자가
                      이미지 안에 이미 그려져 있음) 하나로 그 자리를 대신한다. 도형 정중앙에 오도록 배치한다. */}
                  <div style={{ position: "relative", zIndex: 1 }}>
                    <TierPieceGlyph tierKey={s.tier.key} division={s.division} size={112} />
                  </div>
                </div>
                {/* (버그 수정) "이미 지나온 티어" 초록 체크 배지가 정적이라 눈에 잘 안 띄었다 —
                    은은하게 커졌다 작아지는 펄스를 반복해 완료됐다는 느낌을 계속 상기시킨다. */}
                {state === "done" && (
                  <motion.span
                    animate={{ scale: [1, 1.18, 1], boxShadow: ["0 0 0 0 rgba(63,122,58,.55)", "0 0 0 5px rgba(63,122,58,0)", "0 0 0 0 rgba(63,122,58,0)"] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                    style={{ position: "absolute", right: -2, bottom: -2, width: 26, height: 26, borderRadius: "50%", background: T.best, border: "2px solid " + T.ebony, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check size={14} color="#fff" />
                  </motion.span>
                )}
              </motion.div>
              </TierStationReveal>
            </div>
            {state === "current" && (
              <div style={{ position: "absolute", left: cx, top: top + STATION_H + 5, width: 140, transform: "translateX(-50%)", textAlign: "center" }}>
                <div style={{ fontSize: 12, color: T.ivory, opacity: .8 }}>{info.xpInDivision}/{info.xpForNextDivision} XP</div>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
// (v0.0.6 개편) 티어 배지를 누르면 열리는 전체 화면 여정 지도 모달 — 위 TierJourneyPath를
// "집중분석"(App.jsx 상단부) 전체화면 오버레이와 같은 몰입형 레이아웃(어두운 방사형 그러데이션
// 배경)으로 감싼다.
export function TierJourneyMap({ totalXp, onClose }) {
  const scrollRef = useRef(null);
  // (사용자 요청) 닫기 버튼 색이 지금 스크롤로 보고 있는 티어 배경에 반응한다 — 처음 계산되기 전
  // (마운트 직후 1프레임)에는 기존 금색 테두리로 시작해, 계산되는 즉시 그 색으로 자연스럽게 바뀐다.
  const [btnColor, setBtnColor] = useState(null);
  const bc = btnColor || T.brass;
  // (버그 수정, 사용자 제보) /user 페이지 왼쪽 열처럼 framer-motion의 motion.div(항상 인라인
  // transform을 갖는다) 안에서 이 화면을 열면, position:fixed가 뷰포트가 아니라 그 transform을
  // 가진 조상을 기준으로 계산돼 — 여정 화면이 전체 화면을 덮지 못하고 그 조상 박스 안에만 갇혀,
  // 그 조상 바깥의 /user 페이지 요소(헤더 등)가 오히려 위에 보이는 것처럼 나타났다. document.body로
  // 포털을 띄우면 어떤 조상의 transform과도 무관하게 항상 실제 뷰포트 기준 최상단에 그려진다.
  // (버그 수정, 사용자 재제보) portal은 DOM 트리 위치는 body 최상위로 옮기지만 zIndex 자체는 그대로
  // 옮겨 오지 않는다 — 예전 zIndex(83)는 /user 페이지(UserProfilePage, zIndex 300)보다 한참 낮아서,
  // /user 페이지 안에서 티어 아이콘을 눌러 이 화면을 열어도 실제로는 열리긴 하지만 /user 페이지의
  // 불투명한 배경 "뒤"에 그려져 화면엔 아무 변화가 없는 것처럼 보였다("표시되지 않는다"). 이 화면은
  // 앱에서 가장 위에 뜨는 전체화면 오버레이로 의도된 것이므로, 지금까지 쓰인 어떤 모달·페이지
  // zIndex(최대 500)보다도 확실히 높은 값으로 올려 어디서 열든 항상 맨 위에 그려지게 한다.
  return createPortal((
    <div ref={scrollRef} style={{ position: "fixed", inset: 0, zIndex: 950, background: "radial-gradient(130% 120% at 50% -10%, #34230F 0%, #150C06 65%)", overflowY: "auto" }}>
      {/* (v0.2.3 버그 수정) 닫기 버튼이 스크롤되는 콘텐츠 안에 있어, 아래로 스크롤해 특정 티어를 보고
          있을 때는 맨 위로 다시 올라와야만 닫을 수 있었다 — 뷰포트 우상단에 고정해 어느 스크롤
          위치에서도 항상 누를 수 있게 한다.
          (사용자 요청) 하늘색→보라색처럼 뚝 끊기지 않고 스크롤을 따라 서서히 바뀌는 색(bc, y좌표
          기준 인접 티어 색 사이 보간값)으로 테두리·은은한 배경·글로우를 물들인다. */}
      <button onClick={onClose} className="press" style={{ position: "fixed", top: 18, right: 16, zIndex: 951, width: 38, height: 38, borderRadius: 11, border: "2px solid " + bc, background: hexAlpha(bc, .22), color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 0 16px " + hexAlpha(bc, .5), transition: "background .2s linear, border-color .2s linear, box-shadow .2s linear" }}>
        <X size={18} />
      </button>
      <div style={{ maxWidth: "min(94vw, 760px)", margin: "0 auto", padding: "18px 16px 60px" }}>
        <TierJourneyPath totalXp={totalXp} scrollContainerRef={scrollRef} onColorChange={setBtnColor} />
      </div>
    </div>
  ), document.body);
}