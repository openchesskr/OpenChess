// (v0.6.0, App.jsx 분할) 'profile' 화면과 그 화면만 쓰는 조각
// 동작 변경 없이 App.jsx에서 그대로 옮겼다(REFACTOR_NOTES.md Phase 3 참고).
import { normalizeLegacies, normalizeLegacyHistory } from "../lib/legacyEntry.js";
import { fixForcedOnlyMoves } from "../lib/moveQuality.js";   // (v0.7.5) 강제 수를 유일한 수로 매긴 예전 저장 결과 바로잡기
import { SB_ON, sbSelect, sbRpc } from "../lib/supabaseClient.js";
import React, { useState, useEffect, useMemo, useRef, useContext } from "react";
import { T, MOTION_EASE, TIER_BG_IMAGE, TIER_DECAGON_PATH } from "../lib/theme.js";
import { Swords, Trophy, Lock, ChevronDown, Search, Target, X, ChevronRight, Check } from "../components/ocIcons.jsx";   // (v0.7.5) OpenChess 파셋 아이콘(예전 lucide 대체)
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
import { VisualPrefsContext, MoveClassFx, MOVE_FX, MOVE_FX_MS, moveFxKindOn, ChesscomLogo, ClickInfoBadge, LEGACY_BLOCK_BTN_STYLE, LEGACY_FONT, LEGACY_TILE_FLEX, LEGACY_TYPES, LegacyBlockDecor, LegacyStoneTile, MINIGAME_PLACEMENT, MaterialIcon, PuzzleCard, REVIEW_RESULT_CACHE_VERSION, SolvedPuzzlesBlock, TIME_CLASS_LABEL, TierStatPill, fetchChesscomProfile, isPlacedStat, tcCatLabel, fetchMinigameStats, fmtFull, legacyBaseKey, legacyMoveLabel, minigameBestFromServer, minigameBestLabel, minigameRecordText, puzzleFetch, puzzleNo, reviewGameKey, snapNode, useBoardSize, useChessCom, useNarrow } from "./common.jsx";
import { PLAY_SPECIAL_GAMES } from "./play.jsx";
import TierJourney from "../components/tierJourney.jsx";
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
      if (a && a.v === REVIEW_RESULT_CACHE_VERSION && a.result && a.result.moves) map[r.cc_id] = fixForcedOnlyMoves(a.result);
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
function AchievementDashboard({ hideRecentGames, pub, uid, mq, onOpenGame, onOpenGameAnalyze }) {
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
                    {has ? minigameRecordText(r) + (best != null ? ", " + minigameBestLabel(g.gameType, best) : "") : t("기록 없음")}
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
        <OpenChessGameHistory uid={uid} username={pub.nickname || pub.displayId || ""} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} hideRecent={hideRecentGames} />
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
export async function legacyLikeCounts(ownerUid) {
  if (!SB_ON || !ownerUid) return {};
  try {
    const rows = await sbSelect("legacy_like_counts?owner_uid=eq." + encodeURIComponent(ownerUid) + "&select=slot_key,likes");
    const m = {}; (rows || []).forEach((x) => { m[x.slot_key] = x.likes; }); return m;
  } catch { return {}; }
}
export async function legacyLikedSlots(ownerUid, uid) {
  if (!SB_ON || !ownerUid || !uid) return new Set();
  try {
    const rows = await sbSelect("legacy_likes?owner_uid=eq." + encodeURIComponent(ownerUid) + "&uid=eq." + encodeURIComponent(uid) + "&select=slot_key");
    return new Set((rows || []).map((x) => x.slot_key));
  } catch { return new Set(); }
}
export async function legacyLikeToggle(ownerUid, slotKey, uid) {
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
          <span style={{ display: "block", marginTop: 2, fontSize: isRoot ? 12.5 : 11.5, fontFamily: SITE_FONT, color: T.inkSoft }}><b style={{ color: node.wr >= 55 ? T.best : node.wr >= 45 ? T.brass : T.blunder }}>{node.wr}%</b>, {node.w}/{node.d}/{node.l}, {tx("{0}판", node.n)}</span>
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
export function AccountChessStats({ hideRecent, chesscom, username, onOpenOpening, onOpenGame, onOpenGameAnalyze, reviewUnlocked, onSelectGame, selectedGameId, compact }) {
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
                <div>{tx("래피드 : {0}", prof.rapid ?? "-")}</div>
                <div>{tx("블리츠 : {0}", prof.blitz ?? "-")}</div>
                <div>{tx("불릿 : {0}", prof.bullet ?? "-")}</div>
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
      {!hideRecent && <RecentGamesList games={games} ratingChanges={ratingChanges} username={username} resetKey={username + "|" + timeFilter}
        onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} onSelectGame={onSelectGame} selectedGameId={selectedGameId} />}
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
                      <p style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 2 }}>{tx("최근 리뷰한 {0}판 기준: 블런더 {1}회, 실수 {2}회", weaknessReport.gamesUsed, weaknessReport.kindTotals.blunder || 0, weaknessReport.kindTotals.mistake || 0)}</p>
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
      <button onClick={onClick} className="press" title={typeInfo.label} style={LEGACY_BLOCK_BTN_STYLE}>
        <LegacyBlockDecor />
        <span aria-hidden="true" style={{ position: "relative", fontSize: 26, fontWeight: 300, lineHeight: 1, color: T.brassHi, opacity: 0.85 }}>+</span>
      </button>
    </div>
  );
}
// (v0.7.4, 사용자 요청) 유산 재생 화면은 처음부터 다시 짠 새 재생기(components/legacyPlayer.jsx) — 예전 빛의 보드·영사기·기물별 잡기 연출은 없어졌다. 기존 호출부를 위해 같은 이름으로 다시 내보낸다.
export { LegacyRevealScreen } from "../components/legacyPlayer.jsx";
// (v0.7.4, 사용자 요청) 유산 — 최선·유일·탁월 3칸 슬롯 대신 인스타그램 게시물 같은 피드(legacyFeed.jsx, 최대 200개).
// 피드는 profile.jsx·social.jsx를 다시 가져오므로 순환 참조를 피하려고 늦게(lazy) 불러온다.
const LegacyFeedLazy = React.lazy(() => import("./legacyFeed.jsx"));
function LegacyStoneRow({ legacies, ownerUid, viewerUid, ownerName, isOwn }) {
  const any = isOwn || (legacies && typeof legacies === "object" && Object.keys(legacies).length > 0);
  if (!any) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{t("유산")}</div>
      <React.Suspense fallback={null}><LegacyFeedLazy legacies={legacies} ownerUid={ownerUid} ownerName={ownerName} viewerUid={viewerUid} isOwn={isOwn} flush /></React.Suspense>
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
export function PublicProfileStats({ showLegacy, hideRecentGames, pub, onOpenOpening, onOpenGame, onOpenGameAnalyze, onOpenPuzzle, hideChesscom, hideTierRow, mySolved, myLineSolves, actions, onManageLegacy, onShareLegacy, ownerUid, viewerUid, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare }) {
  const chesscom = useChessCom(pub.chesscom);
  const mq = pub.mainQuestSummary;
  return (
    <div style={{ marginBottom: 12 }}>
      {!hideTierRow && <TierRatingRow pub={pub} />}
      {actions && <div style={{ display: "flex", gap: 8, margin: "10px 0 14px" }}>{actions}</div>}
      <FirstMovesDisplay firstMoves={pub.firstMoves} />
      {/* (v0.6.2, 사용자 요청) XP·퍼즐·레슨·일반 대국·미니게임 기록을 한 카드 묶음으로 */}
      <AchievementDashboard hideRecentGames={hideRecentGames} pub={pub} uid={ownerUid} mq={mq} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />
      {/* (v0.7.4, 사용자 요청) 유산은 /user 페이지(ProfileStatsPanel이 showLegacy를 켬)에서만 보인다 — 성장 분석·내 프로필 창 등 다른 곳에는 없다. */}
      {showLegacy && <LegacyStoneRow legacies={pub.legacies} ownerUid={ownerUid} viewerUid={viewerUid} ownerName={pub.nickname || pub.displayId || ""} isOwn={!!onManageLegacy || (!!ownerUid && ownerUid === viewerUid)} />}
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
export function ProfileStatsPanel({ hideRecentGames, pub, statsView, onOpenOpening, onOpenGame, onOpenGameAnalyze, onOpenPuzzle, hideTierRow, mySolved, myLineSolves, actions, ownerUid, viewerUid, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare }) {
  const chesscom = useChessCom(pub.chesscom);
  return (
    <div style={{ marginBottom: 12 }}>
      {actions && <div style={{ display: "flex", gap: 8, marginBottom: 14, justifyContent: "center" }}>{actions}</div>}
      {statsView === "oc" ? (
        <PublicProfileStats showLegacy hideRecentGames={hideRecentGames} pub={pub} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} onOpenPuzzle={onOpenPuzzle} hideChesscom hideTierRow={hideTierRow} mySolved={mySolved} myLineSolves={myLineSolves} ownerUid={ownerUid} viewerUid={viewerUid} likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} />
      ) : pub.chesscom ? (
        <AccountChessStats chesscom={chesscom} username={pub.chesscom} onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} hideRecent={hideRecentGames} compact />
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
// (v0.0.6 개편) 티어 배지를 누르면 열리는 전체 화면 여정 지도 모달 — 위 TierJourneyPath를
// "집중분석"(App.jsx 상단부) 전체화면 오버레이와 같은 몰입형 레이아웃(어두운 방사형 그러데이션
// 배경)으로 감싼다.
export function TierJourneyMap({ totalXp, onClose }) {
  const scrollRef = useRef(null);
  // (v0.7.4, 사용자 요청) 티어 여정 개편 — 티어 한 장씩의 챕터 연대기(components/tierJourney.jsx). 어떤 조상의 transform과도 무관하게 항상 맨 위에 그려지도록 body로 포털하고,
  // 앱의 모든 모달·페이지(최대 500)보다 높은 zIndex(950)를 쓴다(/user 페이지 안에서 열어도 가려지지 않게).
  // (v0.7.5) 레슨 경로와 같은 구조로 바뀌어 스크롤·Esc 닫기는 TierJourney 안에서 처리한다(경로가 자체 스크롤 영역을 가진다).
  return createPortal((
    <div ref={scrollRef} role="dialog" aria-modal="true" aria-label={t("티어 여정")} style={{ position: "fixed", inset: 0, zIndex: 950, background: "#0B0704", overflow: "hidden" }}>
      <TierJourney totalXp={totalXp} onClose={onClose} scrollRef={scrollRef} />
    </div>
  ), document.body);
}