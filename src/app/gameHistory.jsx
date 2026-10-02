import React, { useState, useEffect, useMemo } from "react";
import { Search } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { drawKindLabel } from "../lib/chessRules.js";
import { chessTcCategory } from "../lib/chessRating.js";
import { SB_ON, sbSelect } from "../lib/supabaseClient.js";
import { BestMoveJumpButton, ListPager } from "../components/uiPrimitives.jsx";
import { TIME_CLASS_LABEL, fmtFull, openingNameOf, usersProfiles } from "./common.jsx";
import { t, tx } from "../lib/i18n.js";

// (v0.6.2) chess.com 대국 통계(AccountChessStats)의 필터·전적·"최근 대국" UI를 공용으로 뺀 것 — chess.com 통계와 OpenChess 일반 대국 기록이 같은 컴포넌트를 쓴다.
// 대국 객체 형태는 chess.com 쪽과 같다: { moves, color: "w"|"b", result: "win"|"loss"|"draw", timeClass, endTime(초), rating, white/black: { username, rating }, opening, id }.

// 알약 모양 필터 버튼 묶음 — options: [[값, 라벨], ...]
export function GameFilterPills({ options, value, onChange }) {
  return (
    <div className="inline-flex" style={{ borderRadius: 9, background: "rgba(0,0,0,.06)", padding: 3, gap: 2 }}>
      {options.map(([k, lab]) => (
        <button key={k} onClick={() => onChange(k)} className="press" style={{ padding: "5px 9px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 10.5, fontWeight: 800, background: value === k ? T.ebony2 : "transparent", color: value === k ? T.brassHi : T.inkSoft }}>{lab}</button>
      ))}
    </div>
  );
}

// 대국 목록의 승·무·패 합계 — { total, w, d, l, winRate } | null
export function summarizeGames(games) {
  if (!games || !games.length) return null;
  let w = 0, d = 0, l = 0;
  for (const g of games) { if (g.result === "win") w++; else if (g.result === "loss") l++; else d++; }
  const total = w + d + l;
  return { total, w, d, l, winRate: total ? Math.round(100 * w / total) : 0 };
}

// "전체 기간 전적" 박스 — 승·무·패 글자와 비율 막대
export function GameRecordSummary({ overall }) {
  return (
    <div style={{ background: "rgba(0,0,0,.04)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("전체 기간 전적")}</span>
        <span style={{ fontSize: 12, fontFamily: SITE_FONT, color: T.inkSoft }}>{tx("{0}판", fmtFull(overall.total))}</span>
      </div>
      <div style={{ fontSize: 13, fontFamily: SITE_FONT, color: T.ink }}>
        <span style={{ color: T.best, fontWeight: 800 }}>{tx("{0}승", overall.w)}</span> {tx("{0}무 {1} · 승률 {2}", overall.d, <span style={{ color: T.blunder, fontWeight: 800 }}>{tx("{0}패", overall.l)}</span>, <b>{overall.winRate}%</b>)}
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginTop: 8, border: "1px solid rgba(0,0,0,.2)" }}>
        <div style={{ width: (100 * overall.w / overall.total) + "%", background: T.best }} />
        <div style={{ width: (100 * overall.d / overall.total) + "%", background: "#9C8A6A" }} />
        <div style={{ width: (100 * overall.l / overall.total) + "%", background: T.blunder }} />
      </div>
    </div>
  );
}

// "최근 대국" — 5판씩 페이지로 넘겨 본다. ratingChanges: Map<대국 객체, 레이팅 증감>. onSelectGame이 있으면 보기·분석 버튼 대신 "선택" 버튼(유산 관리 화면용).
const RECENT_GAMES_PAGE_SIZE = 5;
export function RecentGamesList({ games, ratingChanges, username, resetKey, onOpenGame, onOpenGameAnalyze, onSelectGame, selectedGameId }) {
  const [recentPage, setRecentPage] = useState(0);
  useEffect(() => { setRecentPage(0); }, [resetKey]);
  const allGames = useMemo(() => [...games].sort((a, b) => (b.endTime || 0) - (a.endTime || 0)), [games]);
  if (!allGames.length) return null;
  const pageCount = Math.max(1, Math.ceil(allGames.length / RECENT_GAMES_PAGE_SIZE));
  const page = Math.min(recentPage, pageCount - 1);
  const recent = allGames.slice(page * RECENT_GAMES_PAGE_SIZE, page * RECENT_GAMES_PAGE_SIZE + RECENT_GAMES_PAGE_SIZE);
  const fmtD = (ts) => { if (!ts) return ""; const d = new Date(ts * 1000); return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0"); };
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}><span style={{ fontSize: 12, fontWeight: 800, color: T.brass }}>{t("최근 대국")}</span><span style={{ fontSize: 10.5, color: T.inkSoft }}>{tx("{0}판", allGames.length)}</span></div>
      {recent.map((g, i) => {
        const won = g.result === "win", lost = g.result === "loss";
        const rc = ratingChanges ? ratingChanges.get(g) : null;
        // 상대 닉네임·대국 당시 레이팅 — 내 진영(g.color)의 반대쪽
        const oppSide = g.color === "w" ? g.black : g.white;
        return (
          <div key={g.id != null ? g.id : i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #E4D5B6" }}>
            {/* 분석 탭 수 블록처럼 행 좌측에 진영 색 막대 */}
            <span title={g.color === "w" ? t("백") : t("흑")} style={{ width: 5, alignSelf: "stretch", minHeight: 30, flexShrink: 0, borderRadius: 3, background: g.color === "w" ? "linear-gradient(180deg,#FFFDF7,#E7DABB)" : "linear-gradient(180deg,#4A3826,#241509)", border: "1px solid " + (g.color === "w" ? "#D8C9A8" : "#000") }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, color: T.ink }}><b style={{ color: won ? T.best : lost ? T.blunder : T.inkSoft }}>{won ? t("승리") : lost ? t("패배") : t("무승부")}</b>
                {!won && !lost && <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color: T.inkSoft }}>({drawKindLabel(g.moves)})</span>}
                {rc != null && <span style={{ fontWeight: 800, fontFamily: SITE_FONT, color: rc > 0 ? T.best : rc < 0 ? T.blunder : T.inkSoft }}>({rc > 0 ? "+" + rc : rc})</span>}
                {g.timeClass && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>{TIME_CLASS_LABEL[g.timeClass] || g.timeClass}{g.endTime ? " (" + fmtD(g.endTime) + ")" : ""}</span>}
              </div>
              {oppSide && oppSide.username && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>vs <b style={{ color: T.ink }}>{oppSide.username}</b>{oppSide.rating != null && <span style={{ fontFamily: SITE_FONT }}>({oppSide.rating})</span>}</div>}
              {g.opening && <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 2 }}>{g.opening}</div>}
            </div>
            {onSelectGame ? (() => {
              const gid = g.id != null ? g.id : g.endTime; const isSel = selectedGameId != null && gid === selectedGameId;
              return <button onClick={() => onSelectGame(g, gid)} className="press" style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 8, background: isSel ? "linear-gradient(180deg,#3E7CC4,#2C5A94)" : "linear-gradient(180deg," + T.brass + ",#A8842F)", color: isSel ? "#fff" : "#241509", border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 800 }}>{isSel ? t("선택됨") : t("선택")}</button>;
            })() : (
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <button onClick={() => onOpenGame && onOpenGame(g.moves)} aria-label={t("대국 보기")} title={t("대국 보기")} className="press" style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Search size={13} /></button>
                {onOpenGameAnalyze && <BestMoveJumpButton onClick={() => onOpenGameAnalyze({ sans: g.moves, color: g.color, result: g.result, rating: g.rating, timeClass: g.timeClass, opening: g.opening, endTime: g.endTime, username, white: g.white, black: g.black, id: g.id })} />}
              </div>
            )}
          </div>
        );
      })}
      <ListPager page={page} setPage={setRecentPage} pageCount={pageCount} />
    </div>
  );
}

// ---- OpenChess 일반 대국(실시간 pvp_games) 기록 ----
// 끝난 일반 대국 행(pvp_games) → chess.com 대국 객체. 봇과 둔 대국은 서버에 남지 않아 여기 없다(실시간·친구 대국만).
// 레이팅 증감·상대 레이팅은 서버 트리거가 채운 rating_delta(레이팅 대국만)에서 읽는다.
export function pvpRowToGame(row, myUid, names, myName) {
  const mine = row.white_uid === myUid ? "w" : "b";
  const oppUid = mine === "w" ? row.black_uid : row.white_uid;
  const status = row.status;
  const result = status === "draw" ? "draw" : (status === "white_won") === (mine === "w") ? "win" : "loss";
  const d = row.rating_delta || null;
  const side = (c) => (d && d[c] ? d[c] : null);
  const mk = (c, uid) => ({ username: uid === myUid ? (myName || null) : ((names[uid] && (names[uid].pub && names[uid].pub.nickname || names[uid].username)) || "?"), rating: side(c) ? side(c).before : null });
  const sans = Array.isArray(row.sans) ? row.sans : [];
  const mySide = side(mine);
  return {
    id: "pvp-" + row.id, moves: sans, color: mine, result,
    timeClass: chessTcCategory(row.time_control), endTime: Math.floor(new Date(row.updated_at || row.created_at).getTime() / 1000),
    rating: mySide ? mySide.after : null, rated: !!row.rated,
    white: mk("w", row.white_uid), black: mk("b", row.black_uid),
    opening: sans.length ? openingNameOf(sans) : null,
    _delta: mySide ? mySide.after - mySide.before : null,
  };
}

// 내 일반 대국 기록 — chess.com 대국 통계와 같은 구성(시간 규정·색 필터 → 전체 기간 전적 → 최근 대국). tick이 바뀌면 다시 읽는다.
export function OpenChessGameHistory({ myUid, username, onOpenGame, onOpenGameAnalyze, tick }) {
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [timeFilter, setTimeFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  useEffect(() => {
    if (!SB_ON || !myUid) { setRows([]); return undefined; }
    let cancelled = false;
    sbSelect("pvp_games?game_type=eq.chess&status=in.(white_won,black_won,draw)&or=(white_uid.eq." + myUid + ",black_uid.eq." + myUid + ")&order=updated_at.desc&limit=100&select=id,white_uid,black_uid,sans,status,time_control,rated,rating_delta,created_at,updated_at")
      .then(async (r) => {
        const list = (r || []).filter((x) => Array.isArray(x.sans) && x.sans.length > 0);
        const uids = list.map((x) => (x.white_uid === myUid ? x.black_uid : x.white_uid)).filter(Boolean);
        const n = await usersProfiles(uids);
        if (!cancelled) { setNames(n); setRows(list); }
      })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [myUid, tick]);
  const all = useMemo(() => (rows || []).map((r) => pvpRowToGame(r, myUid, names, username)), [rows, myUid, names, username]);
  const games = useMemo(() => all.filter((g) => (timeFilter === "all" || g.timeClass === timeFilter) && (colorFilter === "all" || g.color === colorFilter)), [all, timeFilter, colorFilter]);
  const ratingChanges = useMemo(() => { const m = new Map(); games.forEach((g) => { if (g._delta != null) m.set(g, g._delta); }); return m; }, [games]);
  const overall = useMemo(() => summarizeGames(games), [games]);
  if (!myUid || rows == null || !all.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="flex items-center" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <GameFilterPills options={[["all", t("전체")], ["bullet", t("불릿")], ["blitz", t("블리츠")], ["rapid", t("래피드")], ["standard", t("스탠다드")]]} value={timeFilter} onChange={setTimeFilter} />
        <GameFilterPills options={[["all", t("전체")], ["w", t("백")], ["b", t("흑")]]} value={colorFilter} onChange={setColorFilter} />
      </div>
      {overall ? <GameRecordSummary overall={overall} /> : <p style={{ fontSize: 12, color: T.inkSoft, marginBottom: 12 }}>{t("이 시간 규정의 대국 없음")}</p>}
      <RecentGamesList games={games} ratingChanges={ratingChanges} username={username} resetKey={timeFilter + "|" + colorFilter}
        onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />
    </div>
  );
}
