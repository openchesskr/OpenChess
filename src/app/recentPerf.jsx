// (v0.6.7) 프로필 "최근 N판 퍼포먼스 레이팅", 전적 박스(GameRecordSummary) 하단에 들어가는 줄.
// 분석이 저장된 대국만 쓴다: chess.com 대국은 reviewed_games.analysis, OpenChess 대국(실시간·봇)은 game_analyses(리뷰할 때 서버에 올라간다, 프로필 주인이 올린 분석만 읽는다). 분석이 없는 대국은 건너뛴다.
// 한 판의 값은 오차가 ±1000점 안팎이라 보여주지 않고, 분석된 최근 N판의 수를 합쳐서 계산한다(src/lib/recentPerformance.js).
import React, { useEffect, useMemo, useState } from "react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { SB_ON, sbSelect } from "../lib/supabaseClient.js";
import { REVIEW_RESULT_CACHE_VERSION, fmtFull } from "./common.jsx";
import { RECENT_PERF_N, RECENT_PERF_MIN_GAMES, recentPerformance } from "../lib/recentPerformance.js";
import { t, tx } from "../lib/i18n.js";

const CHUNK = 10, MAX_CANDIDATES = 40;   // 최신 대국부터 10판씩 분석을 물어 N판이 찰 때까지, 분석 JSON이 커서 한 번에 많이 가져오지 않는다
const memo = new Map();                   // "cc:<id>" | "oc:<kind>-<id>" → 분석된 수 목록 | null(분석 없음). 필터를 바꿔도 다시 묻지 않는다(세션 동안만)

const okAnalysis = (a) => a && a.v === REVIEW_RESULT_CACHE_VERSION && a.result && Array.isArray(a.result.moves) ? a.result.moves : null;

async function fetchChunk(source, chunk, ownerUid) {
  const need = chunk.filter((g) => !memo.has(keyOf(source, g, ownerUid)));
  if (need.length && SB_ON) {
    try {
      if (source === "cc") {
        const rows = await sbSelect("reviewed_games?cc_id=in.(" + need.map((g) => g.id).join(",") + ")&select=cc_id,analysis");
        const by = new Map((rows || []).map((r) => [String(r.cc_id), okAnalysis(r.analysis)]));
        for (const g of need) memo.set(keyOf(source, g, ownerUid), by.get(String(g.id)) || null);
      } else {
        const by = new Map();
        for (const kind of ["pvp", "bot"]) {
          const ids = need.filter((g) => String(g.id).startsWith(kind + "-")).map((g) => String(g.id).slice(kind.length + 1)).filter((x) => /^\d+$/.test(x));
          if (!ids.length) continue;
          const rows = await sbSelect("game_analyses?kind=eq." + kind + "&uid=eq." + encodeURIComponent(ownerUid) + "&game_id=in.(" + ids.join(",") + ")&select=game_id,analysis");
          for (const r of rows || []) by.set(kind + "-" + r.game_id, okAnalysis(r.analysis));
        }
        for (const g of need) memo.set(keyOf(source, g, ownerUid), by.get(String(g.id)) || null);
      }
    } catch { return null; }   // 조회 실패는 기억하지 않는다(다음에 다시 시도)
  }
  return chunk.map((g) => ({ game: g, moves: memo.get(keyOf(source, g, ownerUid)) || null }));
}
const keyOf = (source, g, ownerUid) => source + ":" + (ownerUid || "") + ":" + g.id;

// games: 지금 화면의 대국 목록(필터 적용됨). source: "cc"(chess.com) | "oc"(OpenChess). 반환: { status: "loading" | "done", items: 최신순 [{ game, moves }] (분석 있는 대국만, 최대 N판) }
function useAnalyzedRecent(games, source, ownerUid) {
  const cand = useMemo(() => [...(games || [])].filter((g) => g && g.id != null && Array.isArray(g.moves) && g.moves.length >= 8).sort((a, b) => (b.endTime || 0) - (a.endTime || 0)).slice(0, MAX_CANDIDATES), [games]);
  const sig = source + "|" + (ownerUid || "") + "|" + cand.map((g) => g.id).join(",");
  const [state, setState] = useState({ sig: "", status: "loading", items: [] });
  useEffect(() => {
    let cancelled = false;
    setState((s) => (s.sig === sig ? s : { sig, status: "loading", items: [] }));
    (async () => {
      const items = [];
      for (let i = 0; i < cand.length && items.length < RECENT_PERF_N; i += CHUNK) {
        const got = await fetchChunk(source, cand.slice(i, i + CHUNK), ownerUid);
        if (cancelled) return;
        if (!got) break;
        for (const x of got) if (x.moves && x.moves.length === x.game.moves.length) items.push(x);   // 기보와 수 개수가 다른 분석은 버린다
      }
      if (!cancelled) setState({ sig, status: "done", items: items.slice(0, RECENT_PERF_N) });
    })();
    return () => { cancelled = true; };
  }, [sig]);
  return state.sig === sig ? state : { sig, status: "loading", items: [] };
}

export function RecentPerformanceRow({ games, source, ownerUid }) {
  const { status, items } = useAnalyzedRecent(games, source, ownerUid);
  const perf = useMemo(() => (status === "done" ? recentPerformance(items) : null), [status, items]);
  const label = tx("최근 {0}판 퍼포먼스 레이팅", RECENT_PERF_N);
  return (
    <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(0,0,0,.1)" }}>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{label}</span>
        <span style={{ fontSize: 17, fontWeight: 900, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums", color: perf ? T.ink : T.inkSoft }}>{perf ? fmtFull(perf.rating) : "-"}</span>
      </div>
      <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 3, lineHeight: 1.5 }}>
        {status === "loading" ? t("분석 기록을 불러오는 중…")
          : perf ? <>{tx("분석된 최근 {0}판 기준", perf.games)}{perf.provisional ? " · " + t("보정 전 임시 수치") : ""}</>
          : tx("리뷰한 대국이 {0}판 이상 쌓이면 표시 (현재 {1}판)", RECENT_PERF_MIN_GAMES, items.length)}
      </div>
    </div>
  );
}
