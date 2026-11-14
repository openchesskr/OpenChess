// (v0.7.6, 사용자 요청) 성장 분석 영역 — 학습 탭에 있던 성장 분석(GrowthPanel)과 최근 대국 열을 분석 탭으로 옮겼다.
//  · 데스크톱: 분석 탭 아래쪽에 두 칼럼(왼쪽 성장 분석 · 오른쪽 최근 대국, 각각 안쪽 스크롤). 화면에 들어온 뒤부터 자동 리뷰(엔진)를 돌린다.
//  · 모바일: 분석 탭을 옆으로 넘기는 페이지로 — 1페이지 분석, 2페이지 성장 분석, 3페이지 최근 대국(SwipePager). 2페이지 이후를 한 번 본 뒤부터 자동 리뷰.
//  학습 탭은 레슨과 맞춤 학습(복습·추천 레슨, practice.jsx)으로 바뀌었다. useRecentSources는 두 탭이 같이 쓴다.
import { useState, useEffect, useMemo, useRef } from "react";
import { useTabMemory } from "../lib/tabMemory.js";
import { T } from "../lib/theme.js";
import { useNarrow } from "./common.jsx";
import { GrowthPanel } from "./growth.jsx";
import { SB_ON } from "../lib/supabaseClient.js";
import { RecentGameBoxes, GameFilterPills, profileGameRowToGame, fetchProfileGameRows } from "./gameHistory.jsx";
import { StatsViewToggle } from "../components/statsViewToggle.jsx";
import { computeRatingChanges } from "../lib/chesscom.js";
import { LoadingRows } from "../components/motionKit.jsx";
import { pickRecentGames } from "../lib/recentGames.js";
import { t } from "../lib/i18n.js";
import { SwipePager } from "../components/swipePager.jsx";
import { OffscreenPause } from "../components/offscreenPause.jsx";
import { FacetDiamond } from "../components/facetIcons.jsx";

export function useRecentSources({ user, uid, chesscom, ccName }) {
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
export function GrowthGamesColumn({ view, setView, user, ccName, src, onOpenGame, onOpenGameAnalyze, loginCard }) {
  const [timeFilter, setTimeFilter] = useTabMemory("growth.timeFilter", "all"), [colorFilter, setColorFilter] = useTabMemory("growth.colorFilter", "all");   // (v0.7.5) 탭을 오가도 유지
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

function LoginCard({ openAuth }) {
  return (
    <div style={{ borderRadius: 14, border: "1px solid #3E2F21", background: "#2A1F16", padding: "20px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#F1E6D0" }}>{t("로그인하면 내 프로필과 최근 대국을 볼 수 있음")}</div>
      <div className="flex items-center justify-center" style={{ gap: 8, marginTop: 14 }}>
        <button onClick={() => openAuth && openAuth("login")} className="press" style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid " + T.brass, background: "transparent", color: T.brassHi, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{t("로그인")}</button>
        <button onClick={() => openAuth && openAuth("signup")} className="press" style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: T.brass, color: "#241509", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{t("회원가입")}</button>
      </div>
    </div>
  );
}

// 화면에 한 번이라도 들어오면 true(그 뒤로는 계속 true) — 데스크톱에서 성장 분석 자동 리뷰를 시작하는 신호
function useSeenOnce(ref) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setSeen(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "120px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);   // eslint-disable-line react-hooks/exhaustive-deps
  return seen;
}

/* (v0.7.7) 데스크톱 분석 탭: 보드 분석 영역과 성장 분석 영역을 나누는 금색 선.
   선은 가운데로 갈수록 진해지는 금빛 머리카락 선 두 갈래(바깥쪽은 투명하게 사라짐)이고, 가운데에 파셋 마름모 보석과 작은 보석 둘을 둔다(아이콘 규칙: 면 분할·왼쪽 위 광원). */
function GoldDivider() {
  const line = (dir) => ({ flex: 1, height: 1, background: "linear-gradient(" + dir + ", rgba(196,154,80,0), rgba(196,154,80,.55) 70%, #ECCB86)", boxShadow: "0 0 6px rgba(236,203,134,.18)" });
  return (
    <div role="separator" aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 auto", maxWidth: 980, padding: "0 24px" }}>
      <span style={line("90deg")} />
      <svg width="64" height="16" viewBox="0 0 64 16" style={{ flexShrink: 0, display: "block" }}>
        <FacetDiamond cx={10} cy={8} r={3} gem={false} />
        <FacetDiamond cx={32} cy={8} r={7} />
        <FacetDiamond cx={54} cy={8} r={3} gem={false} />
      </svg>
      <span style={line("270deg")} />
    </div>
  );
}

/* 분석 탭 전체 — analysisNode(기존 분석 화면)에 성장 분석·최근 대국을 붙인다. focusActive(집중 분석 중)면 성장 분석은 숨긴다(모바일은 1페이지만).
   props: user, uid, openAuth, chesscom, ccName, onOpenGame, onOpenGameAnalyze, growthUid, growthGames, me, onOpenTitle, engine, reviewSpeed, quickReview */
export function AnalysisWithGrowth({ analysisNode, focusActive, ...p }) {
  const mobile = useNarrow(720);
  const src = useRecentSources({ user: p.user, uid: p.uid, chesscom: p.chesscom, ccName: p.ccName });
  const [view, setView] = useTabMemory("growth.view", "oc");
  const [pageIdx, setPageIdx] = useState(0);
  const [mobileSeen, setMobileSeen] = useState(false);
  useEffect(() => { if (pageIdx > 0) setMobileSeen(true); }, [pageIdx]);
  const deskRef = useRef(null);
  const deskSeen = useSeenOnce(deskRef);
  const active = mobile ? mobileSeen : deskSeen;
  const growthNode = <GrowthPanel uid={p.growthUid || null} games={p.growthGames} me={p.me} onOpenTitle={p.onOpenTitle} recent={src.recent} gamesLoading={src.loading} engine={p.engine} reviewSpeed={p.reviewSpeed} quick={p.quickReview} onOpenGameAnalyze={p.onOpenGameAnalyze} onOpenGame={p.onOpenGame} active={active} />;
  const gamesNode = <GrowthGamesColumn view={view} setView={setView} user={p.user} ccName={p.ccName} src={src} onOpenGame={p.onOpenGame} onOpenGameAnalyze={p.onOpenGameAnalyze} loginCard={<LoginCard openAuth={p.openAuth} />} />;
  if (mobile) {
    const pages = [{ key: "analysis", node: analysisNode }];
    if (!focusActive) pages.push({ key: "growth", node: growthNode }, { key: "games", node: gamesNode });
    return <SwipePager pages={pages} onIndexChange={setPageIdx} />;
  }
  const H = "calc(100dvh - 160px)";
  return (
    <>
      {analysisNode}
      {!focusActive && (
        <section ref={deskRef} aria-label={t("성장 분석")} className="analysis-growth" style={{ marginTop: 44 }}>
          {/* (v0.7.7, 사용자 요청) 보드 분석과 성장 분석 사이의 금색 구분선 — 가운데 마름모 보석에서 양쪽으로 가늘게 사라지는 선 */}
          <GoldDivider />
          {/* (v0.7.7 렉 수정) 스크롤로 화면 밖에 있을 때는 장식 애니메이션·반복 타이머를 멈춘다 */}
          <OffscreenPause style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20, height: H, minHeight: 520, marginTop: 36 }}>
            <div className="learn-dash-scroll" style={{ minHeight: 0, minWidth: 0, overflowY: "auto", paddingRight: 4 }}>{growthNode}</div>
            <div className="learn-dash-scroll" style={{ minHeight: 0, minWidth: 0, overflowY: "auto", paddingRight: 4 }}>{gamesNode}</div>
          </OffscreenPause>
        </section>
      )}
    </>
  );
}
