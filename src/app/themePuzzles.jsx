// (v0.7.8, 사용자 요청) 학습 탭 "추가 학습" — 레슨으로 보내는 대신, 가장 최근에 본 레슨들의 테마에 맞는 체스 퍼즐을 그 자리에서 푼다.
//  · 테마: lib/lessonPuzzles.js(레슨 → Lichess 퍼즐 테마 + OpenChess 퍼즐 태그). 최근 본 레슨은 레슨을 열 때 이 기기에 기록된다.
//  · 퍼즐: Lichess 테마 퍼즐(api/lichess.js ?puzzles=1 — 서버가 테마별로 모아 쌓는다) + OpenChess 공개 퍼즐 중 그 테마에 맞는 것
//    (정답을 끝까지 두어 본 메이트 패턴, 오프닝 수순의 레파토리 계열, 퍼즐 테마로 분석).
//  · 레이아웃: 실수 복습과 같게 체스보드가 맨 위 전체 폭, 그 아래에 테마·안내·버튼.
import { useState, useMemo, useEffect, useRef } from "react";
import { Chess } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { Board, Mascot, useBoardSize } from "./common.jsx";
import { Puzzle, Check, Eye, RotateCcw, ChevronRight } from "../components/ocIcons.jsx";
import { LICHESS_API } from "../lib/lichessApi.js";
import { SB_ON, sbSelect } from "../lib/supabaseClient.js";
import { lessonById } from "../lib/lessons/curriculum.js";
import { boardOf, turnOf, legalTargets, playMove, sqToRc, rcToSq } from "../lib/lessons/engine.js";
import { loadRecentLessons, onRecentLessonsChange, recentThemeGroups, matchOcPuzzles, angleLabel, puzzleMoveOk } from "../lib/lessonPuzzles.js";
import { playSfx } from "../lib/prefs.js";
import { t } from "../lib/i18n.js";

const CREAM = "#F1E6D0", LINE = "#D6C29A", INK = "#2A1B0E", SOFT = "#7A6648", SAGE = "#3F7A3A";
export const STUDY_COLOR = T.boardDark;   // (v0.7.8, 사용자 요청) 추가 학습의 상징색 = 사이트 보드의 호두나무 갈색(파란색 대신)

/* ── 불러오기 ── */
let ocRowsPromise = null;   // OpenChess 공개 퍼즐(분석은 화면에서) — 한 번만 받는다
const loadOcRows = () => {
  if (!SB_ON) return Promise.resolve([]);
  if (!ocRowsPromise) ocRowsPromise = sbSelect("puzzles?select=no,data&is_public=eq.true&order=no.desc&limit=300").catch(() => { ocRowsPromise = null; return []; });
  return ocRowsPromise;
};
const liCache = new Map();
async function loadLichess(angles) {
  const key = angles.join(",");
  if (liCache.has(key)) return liCache.get(key);
  const r = await fetch(LICHESS_API + "?puzzles=1&n=6&angles=" + encodeURIComponent(key));
  if (!r.ok) throw new Error("tpz " + r.status);
  const j = await r.json(); const out = (j && j.puzzles) || {};
  liCache.set(key, out); return out;
}

function useRecent() {
  const [ids, setIds] = useState(loadRecentLessons);
  useEffect(() => onRecentLessonsChange(setIds), []);
  return ids;
}

function useThemePuzzles(groups) {
  const [state, setState] = useState({ loading: false, byAngle: {}, error: false });
  const key = groups.map((g) => g.angle + ":" + g.oc.join("+")).join("|");
  useEffect(() => {
    if (!groups.length) { setState({ loading: false, byAngle: {}, error: false }); return undefined; }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    Promise.all([loadLichess(groups.map((g) => g.angle)).catch(() => null), loadOcRows()]).then(([li, rows]) => {
      if (!alive) return;
      const byAngle = {};
      for (const g of groups) {
        const oc = matchOcPuzzles(rows, { oc: g.oc }, 3);
        const lis = ((li && li[g.angle]) || []).map((p) => ({ id: "li" + p.id, lid: p.id, fen: p.fen, sol: p.sol, rating: p.rating, source: "lichess" }));
        byAngle[g.angle] = [...oc, ...lis];
      }
      setState({ loading: false, byAngle, error: !li });
    });
    return () => { alive = false; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

/* ── 퍼즐 하나 풀기 ── */
function PuzzleSolver({ p, onSolved, onNext }) {
  const [fen, setFen] = useState(p.fen), [i, setI] = useState(0), [sel, setSel] = useState(null), [state, setState] = useState("idle"), [wrongAt, setWrongAt] = useState(null), [lastTo, setLastTo] = useState(null);
  const timer = useRef(null);
  useEffect(() => { setFen(p.fen); setI(0); setSel(null); setState("idle"); setWrongAt(null); setLastTo(null); return () => clearTimeout(timer.current); }, [p.id, p.fen]);
  const [size, setRef] = useBoardSize(560, 0);
  const board = useMemo(() => { try { return boardOf(fen); } catch { return null; } }, [fen]);
  const me = useMemo(() => { try { return turnOf(p.fen); } catch { return "w"; } }, [p.fen]);
  const expected = useMemo(() => { try { const c = new Chess(fen); const m = c.move(p.sol[i]); return m ? { from: m.from, to: m.to, promotion: m.promotion } : null; } catch { return null; } }, [fen, p.sol, i]);
  if (!board) return null;
  const canMove = state !== "ok" && state !== "shown" && turnOf(fen) === me;
  const targets = canMove && sel ? legalTargets(fen, rcToSq(sel[0], sel[1])).map(sqToRc) : [];
  const hint = state === "shown" && expected ? [{ from: sqToRc(expected.from), to: sqToRc(expected.to), kind: "tactic", color: "#6EBF4A", width: 0.13 }] : [];
  const attempt = (from, to) => {
    if (!canMove) return;
    const fs = rcToSq(from[0], from[1]), ts = rcToSq(to[0], to[1]);
    const played = playMove(fen, fs, ts, expected && expected.from === fs && expected.to === ts ? expected.promotion : undefined);
    setSel(null);
    if (!played) return;
    if (!puzzleMoveOk(fen, played.san, p.sol, i)) { setState("bad"); setWrongAt(to); setTimeout(() => setWrongAt(null), 700); return; }
    playSfx(played.mv.captured ? "capture" : "move");
    setFen(played.fen); setLastTo(to);
    const ni = i + 1;
    if (ni >= p.sol.length || played.chess.isCheckmate()) { setI(ni); setState("ok"); onSolved(p.id); return; }
    setState("good"); setI(ni);
    timer.current = setTimeout(() => {   // 상대 응수
      const c = new Chess(played.fen); const r = c.move(p.sol[ni]);
      if (!r) { setState("ok"); onSolved(p.id); return; }
      playSfx(r.captured ? "capture" : "move");
      setFen(c.fen()); setLastTo(sqToRc(r.to)); setI(ni + 1);
      if (ni + 1 >= p.sol.length) { setState("ok"); onSolved(p.id); }
    }, 420);
  };
  const onSquareClick = (rc) => {
    if (!canMove) return;
    const pc = board[rc[0]][rc[1]];
    if (sel && targets.some(([r, c]) => r === rc[0] && c === rc[1])) { attempt(sel, rc); return; }
    setSel(pc && pc.c === me ? rc : null);
  };
  const msg = state === "ok" ? t("정답. 퍼즐을 풀었습니다.")
    : state === "shown" ? t("정답은 {0}입니다.", p.sol[i] || "")
    : state === "bad" ? t("그 수가 아닙니다. 다시 찾아보세요.")
    : state === "good" ? t("좋습니다. 계속 두세요.")
    : (me === "w" ? t("백 차례. 가장 좋은 수를 찾으세요.") : t("흑 차례. 가장 좋은 수를 찾으세요."));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div ref={setRef} style={{ width: "100%", minWidth: 0, display: "flex", justifyContent: "center" }}>
        <Board board={board} flip={me === "b"} size={size} showEval={false} interactive={canMove}
          selected={sel} legalTargets={targets} onSquareClick={onSquareClick}
          onPieceDrag={(rc) => { if (canMove) { const pc = board[rc[0]][rc[1]]; if (pc && pc.c === me) setSel(rc); } }}
          onDrop={(rc) => { if (sel) attempt(sel, rc); }} onMove={(from, to) => attempt(from, to)}
          haloSquares={lastTo ? [lastTo] : []} arrows={hint} wrongAt={wrongAt} />
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Mascot name={me === "w" ? "milku" : "kokoa"} emotion={state === "ok" ? "great" : state === "bad" ? "surprise" : "think"} size={44} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={state + ":" + i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} aria-live="polite"
            style={{ margin: 0, flex: 1, fontSize: 13.5, fontWeight: 700, lineHeight: 1.55, color: state === "ok" ? SAGE : state === "bad" ? T.blunder : INK }}>{msg}</motion.p>
        </AnimatePresence>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {state !== "ok" && state !== "shown" && <button type="button" onClick={() => setState("shown")} className="press" style={pill(false)}><Eye size={14} />{t("정답 보기")}</button>}
        {(state === "ok" || state === "shown" || state === "bad") && <button type="button" onClick={() => { clearTimeout(timer.current); setFen(p.fen); setI(0); setState("idle"); setLastTo(null); }} className="press" style={pill(false)}><RotateCcw size={14} />{t("다시 풀기")}</button>}
        <button type="button" onClick={onNext} className="press" style={pill(true)}>{t("다음 퍼즐")}<ChevronRight size={14} /></button>
        <span style={{ marginLeft: "auto", fontSize: 11, color: SOFT, fontWeight: 700 }}>
          {p.source === "lichess" ? "Lichess #" + p.lid : "OpenChess #" + p.no}{p.rating ? " · " + p.rating : ""}
        </span>
      </div>
    </div>
  );
}

const pill = (on) => ({ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 13px", borderRadius: 10, border: on ? "none" : "1px solid " + LINE, background: on ? T.ebony2 : "rgba(255,255,255,.55)", color: on ? T.brassHi : INK, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: SITE_FONT });

export function ThemePuzzles() {
  const recent = useRecent();
  const groups = useMemo(() => recentThemeGroups(recent, lessonById, 3), [recent]);
  const { loading, byAngle } = useThemePuzzles(groups);
  const [gi, setGi] = useState(0), [pi, setPi] = useState(0), [solved, setSolved] = useState(() => new Set());
  useEffect(() => { setGi(0); setPi(0); }, [groups.map((g) => g.angle).join()]);   // eslint-disable-line react-hooks/exhaustive-deps
  const g = groups[Math.min(gi, groups.length - 1)] || null;
  const list = (g && byAngle[g.angle]) || [];
  const p = list.length ? list[pi % list.length] : null;
  const lesson = g ? lessonById(g.lessonId) : null;
  return (
    <div style={{ borderRadius: 16, border: "1px solid " + LINE, background: CREAM, boxShadow: "0 3px 0 #B59A6E", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", background: "rgba(255,255,255,.35)", borderBottom: "1px solid " + LINE }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: STUDY_COLOR + "24", border: "1px solid " + STUDY_COLOR + "66", flexShrink: 0 }}><Puzzle size={19} color={STUDY_COLOR} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".24em", color: STUDY_COLOR }}>THEME PUZZLES</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: INK, lineHeight: 1.15 }}>{t("추가 학습")}</div>
        </div>
        {list.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#8A6C2F", background: "rgba(90,58,34,.10)", border: "1px solid " + LINE, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{list.filter((x) => solved.has(x.id)).length}/{list.length}</span>}
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {!groups.length ? (
          <div style={{ textAlign: "center", padding: "8px 4px" }}>
            <div style={{ display: "flex", justifyContent: "center" }}><Mascot name="kokoa" emotion="think" size={64} /></div>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: INK, fontWeight: 700, lineHeight: 1.55 }}>{t("레슨을 보면 그 레슨의 테마에 맞는 퍼즐이 여기에 나타납니다.")}</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {groups.map((x, k) => { const on = x === g; const l = lessonById(x.lessonId); return (
                <button key={x.angle} type="button" onClick={() => { setGi(k); setPi(0); }} className="press"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, border: "1px solid " + (on ? STUDY_COLOR : LINE), background: on ? STUDY_COLOR : "rgba(255,255,255,.55)", color: on ? "#FBF3E3" : INK, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: SITE_FONT, maxWidth: "100%" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{angleLabel(x.angle)}</span>
                  {l && l.title() !== angleLabel(x.angle) && <span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{l.title()}</span>}
                </button>
              ); })}
            </div>
            {lesson && <div style={{ fontSize: 11.5, color: SOFT, lineHeight: 1.5 }}>{t("최근에 본 레슨 '{0}'의 테마로 고른 퍼즐", lesson.title())}</div>}
            {p ? <PuzzleSolver key={p.id} p={p} onSolved={(id) => setSolved((s) => (s.has(id) ? s : new Set([...s, id])))} onNext={() => setPi((x) => x + 1)} />
              : <p style={{ margin: 0, fontSize: 13, color: SOFT }}>{loading ? t("퍼즐을 불러오는 중") : t("이 테마의 퍼즐을 아직 불러오지 못했습니다. 잠시 후 다시 열어 보세요.")}</p>}
            {list.length > 1 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid " + LINE }}>
                {list.map((x, k) => <button key={x.id} type="button" aria-label={t("{0}번 문제", k + 1)} onClick={() => setPi(k)} className="press"
                  style={{ width: 20, height: 20, borderRadius: 6, border: k === pi % list.length ? "2px solid " + INK : "1px solid " + LINE, background: solved.has(x.id) ? "#A9C589" : "rgba(255,255,255,.6)", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{solved.has(x.id) && <Check size={11} color={SAGE} />}</button>)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
