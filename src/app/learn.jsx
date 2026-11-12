// (v0.6.0, App.jsx 분할 · v0.7.3 quest.jsx → learn.jsx) 'learn'(학습 탭) 화면과 그 화면만 쓰는 조각
// 동작 변경 없이 App.jsx에서 그대로 옮겼다(REFACTOR_NOTES.md Phase 3 참고).
import { useTabMemory } from "../lib/tabMemory.js";
import { useState, useEffect, useMemo } from "react";
import { T } from "../lib/theme.js";
import { FadeIn, useNarrow } from "./common.jsx";

import { GrowthPanel } from "./growth.jsx";
import { SB_ON } from "../lib/supabaseClient.js";
import { RecentGameBoxes, GameFilterPills, profileGameRowToGame, fetchProfileGameRows } from "./gameHistory.jsx";
import { StatsViewToggle } from "../components/statsViewToggle.jsx";
import { computeRatingChanges } from "../lib/chesscom.js";
import { LoadingRows } from "../components/motionKit.jsx";
import { pickRecentGames } from "../lib/recentGames.js";
import { t } from "../lib/i18n.js";
import { SwipePager } from "../components/swipePager.jsx";
// (v0.7.5, 사용자 요청) 레슨은 도감 탭의 새 레슨 시스템(src/lib/lessons/·src/components/lessons/)으로 옮겼다 — 예전 레슨 지도·학습 화면·편집기(CMS)는 지웠다.
// (v0.7.3, 사용자 요청) 학습 탭 상단 — 왼쪽: /user 프로필 페이지 그대로(대국 목록만 뺀 나머지 전부, 세로 한 열) · 오른쪽: 최근 대국을 큰 박스로 모아서.
// 좁은 화면에서는 프로필 → 대국 순서로 세로로 쌓는다. 그 페이지가 내 MID로 서버 프로필을 읽으므로 MID를 먼저 찾는다. 로그인하지 않았으면 로그인 안내만 보여 준다.
// (v0.7.4) 대국 출처(OpenChess 기록·chess.com)를 한곳에서 불러와, 최근 대국 열과 성장 분석(최근 5판 자동 리뷰)이 함께 쓴다.
function useRecentSources({ user, uid, chesscom, ccName }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!SB_ON || !uid) { setRows([]); return undefined; }
    let off = false; setRows(null);
    fetchProfileGameRows(uid).then((r) => { if (!off) setRows(Array.isArray(r) ? r.filter((x) => Array.isArray(x.sans) && x.sans.length > 0) : []); }).catch(() => { if (!off) setRows([]); });
    return () => { off = true; };
  }, [uid]);
  const ocGames = useMemo(() => (rows || []).map((r) => profileGameRowToGame(r, user)), [rows, user]);
  const ccReady = !!(chesscom && chesscom.status === "ready");
  const ccGames = useMemo(() => (ccReady ? chesscom.games : []).filter((g) => g.timeClass !== "daily" && (g.rules || "chess") === "chess"), [ccReady, chesscom && chesscom.games]);
  const loading = rows == null || !!(chesscom && chesscom.status === "loading");
  const recent = useMemo(() => pickRecentGames([...ocGames.map((g) => ({ game: g, owner: user })), ...(ccName ? ccGames.map((g) => ({ game: g, owner: ccName })) : [])]), [ocGames, ccGames, user, ccName]);
  return { ocGames, ccGames, ccReady, ocLoading: rows == null, ccLoading: !!(chesscom && chesscom.status === "loading"), loading, recent };
}
function LearnGamesColumn({ view, setView, user, ccName, src, onOpenGame, onOpenGameAnalyze, loginCard }) {
  const [timeFilter, setTimeFilter] = useTabMemory("learn.timeFilter", "all"), [colorFilter, setColorFilter] = useTabMemory("learn.colorFilter", "all");   // (v0.7.5) 탭을 오가도 유지
  useEffect(() => { setTimeFilter("all"); setColorFilter("all"); }, [view]);
  const { ocGames, ccGames, ccReady } = src;
  const base = view === "oc" ? ocGames : ccGames;
  const games = useMemo(() => base.filter((g) => (timeFilter === "all" || g.timeClass === timeFilter) && (colorFilter === "all" || g.color === colorFilter)), [base, timeFilter, colorFilter]);
  const ratingChanges = useMemo(() => {
    if (view === "oc") { const m = new Map(); games.forEach((g) => { if (g._delta != null) m.set(g, g._delta); }); return m; }
    return ccReady ? computeRatingChanges(ccGames.filter((g) => timeFilter === "all" || g.timeClass === timeFilter)) : new Map();
  }, [view, games, ccGames, ccReady, timeFilter]);
  const loading = view === "oc" ? src.ocLoading : src.ccLoading;
  return (
    <div style={{ minWidth: 0 }}>
      {/* (v0.7.3) 프로필 페이지의 OpenChess / chess.com 토글이 없어져 이 열 맨 위로 옮겼다.
          (v0.7.4, 사용자 요청) "대국 출처" 글자를 없애고, 플랫폼 토글과 시간 규정 토글을 같은 높이(32px)로 한 줄에 둔다. 좁은 화면에서는 줄바꿈 대신 가로로 밀어 본다. */}
      {/* (v0.7.4, 사용자 요청) 플랫폼 토글은 한 줄 위로 올리고, 아래 줄에 시간 규정 · 흑/백 필터를 같은 디자인(같은 높이)으로 나란히 둔다. 좁은 화면에서는 줄바꿈 대신 가로로 밀어 본다. */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ display: "inline-flex", background: "#EADBBB", borderRadius: 11 }}><StatsViewToggle value={view} onChange={setView} scale={1} /></span>
      </div>
      <div className="learn-games-toggles" style={{ display: "flex", alignItems: "center", flexWrap: "nowrap", gap: 8, marginBottom: 12, overflowX: "auto", scrollbarWidth: "none" }}>
        <GameFilterPills height={32} options={[["all", t("전체")], ["bullet", t("불릿")], ["blitz", t("블리츠")], ["rapid", t("래피드")], ["standard", t("스탠다드")]]} value={timeFilter} onChange={setTimeFilter} />
        <GameFilterPills height={32} options={[["all", t("전체")], ["w", t("백")], ["b", t("흑")]]} value={colorFilter} onChange={setColorFilter} />
      </div>
      {view === "oc" && !user ? loginCard : loading ? <LoadingRows lines={4} height={22} gap={12} label={t("불러오는 중…")} />
        : view === "cc" && !ccName ? <p style={{ fontSize: 13, color: "#C9B58C" }}>{t("설정 탭에서 chess.com 계정을 연동하면 최근 대국이 표시됨")}</p>
        : games.length ? <RecentGameBoxes games={games} ratingChanges={ratingChanges} username={view === "oc" ? user : ccName} resetKey={view + "|" + timeFilter + "|" + colorFilter} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />
        : <p style={{ fontSize: 13, color: "#C9B58C" }}>{t("표시할 대국 없음")}</p>}
    </div>
  );
}
// (v0.7.3, 사용자 요청) 모바일에서는 프로필·일일 퀘스트·최근 대국을 가로로 넘기는 3개의 페이지로 보여 준다. 눈에 잘 띄도록: ① 위에 붙는(sticky) 탭 줄(아이콘+이름, 지금 페이지는 금색으로 채워지고
// 밑줄이 미끄러져 이동) ② 다음 페이지가 오른쪽에 살짝 보이게(peek) 페이지 폭을 줄임 ③ "옆으로 밀어서 이동" 안내 화살표(처음 한 번 넘기면 사라지고 이 기기에 기억) ④ n/N 표시.
// (v0.7.3, 사용자 요청) 학습 탭 상단 — 데스크톱: 왼쪽 /user 프로필(대국 목록만 뺀 나머지 전부) · 오른쪽 맨 위 일일 퀘스트 박스, 그 아래 최근 대국 큰 박스. 태블릿: 세로로 쌓기.
// 모바일: 프로필·일일 퀘스트·최근 대국 3페이지(SwipePager). 프로필은 내 MID로 서버에서 읽으므로 MID를 먼저 찾는다. 로그인하지 않았으면 프로필 자리에 로그인 안내.
function LearnProfileHome({ user, openAuth, ccName, src, onOpenGame, onOpenGameAnalyze, growthNode }) {
  const wideLayout = !useNarrow(1000);
  const mobile = useNarrow(720);
  const [view, setView] = useTabMemory("learn.view", "oc");
  const loginCard = (
    <div style={{ borderRadius: 14, border: "1px solid #3E2F21", background: "#2A1F16", padding: "20px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#F1E6D0" }}>{t("로그인하면 내 프로필과 최근 대국을 볼 수 있음")}</div>
      <div className="flex items-center justify-center" style={{ gap: 8, marginTop: 14 }}>
        <button onClick={() => openAuth && openAuth("login")} className="press" style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid " + T.brass, background: "transparent", color: T.brassHi, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{t("로그인")}</button>
        <button onClick={() => openAuth && openAuth("signup")} className="press" style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: T.brass, color: "#241509", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{t("회원가입")}</button>
      </div>
    </div>
  );
  const gamesNode = <LearnGamesColumn view={view} setView={setView} user={user} ccName={ccName} src={src} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} loginCard={loginCard} />;
  if (mobile) {
    // (v0.7.4, 사용자 요청) 일일 퀘스트는 플레이 탭으로 옮겨 갔다 — 성장 분석·최근 대국 2페이지.
    const pages = [{ key: "growth", node: growthNode }, { key: "games", node: gamesNode }].filter((pg) => pg.node);
    return <SwipePager pages={pages} />;
  }
  if (!wideLayout) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>{growthNode}{gamesNode}</div>;
  }
  // (v0.7.4, 사용자 요청) 데스크톱: 화면 높이를 기준으로 한 2열 대시보드 — 왼쪽은 프로필(성장 분석), 오른쪽은 최근 대국만(각각 안쪽 스크롤). 높이 = 화면 − 머리글·제목·하단 탭 여백.
  // 일일 퀘스트는 플레이 탭으로 옮겼다.
  const H = "calc(100dvh - 236px)";
  return (
    <div className="learn-dash" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20, height: H, minHeight: 520 }}>
      <div className="learn-dash-scroll" style={{ minHeight: 0, minWidth: 0, overflowY: "auto", paddingRight: 4 }}>{growthNode}</div>
      <div className="learn-dash-scroll" style={{ minHeight: 0, minWidth: 0, overflowY: "auto", paddingRight: 4 }}>{gamesNode}</div>
    </div>
  );
}
export function LearnTab({ growthUid, growthGames,
  user, uid, openAuth, chesscom, ccName, onOpenGame, onOpenGameAnalyze, me, onOpenTitle, engine, reviewSpeed, quickReview }) {
  const src = useRecentSources({ user, uid, chesscom, ccName });
  // (v0.7.3, 사용자 요청) 예전 프로필 자리에 성장 분석(실수 통계·약점 지도·복습 카드·오프닝 실수·마스터 스타일)을 그대로 펼쳐 보여 준다.
  // (v0.7.4, 사용자 요청) 성장 분석은 직접 리뷰하지 않아도 최근 대국 5판을 엔진이 백그라운드에서 자동 리뷰해 분석한다(항상 최신).
  const growthNode = <GrowthPanel uid={growthUid || null} games={growthGames} me={me} onOpenTitle={onOpenTitle} recent={src.recent} gamesLoading={src.loading} engine={engine} reviewSpeed={reviewSpeed} quick={quickReview} onOpenGameAnalyze={onOpenGameAnalyze} onOpenGame={onOpenGame} />;
  return (
    <div>
      <FadeIn index={0} layout={false}>
        <LearnProfileHome user={user} openAuth={openAuth} ccName={ccName} src={src} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} growthNode={growthNode} />
      </FadeIn>
    </div>
  );
}
