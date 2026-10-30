// (v0.7.1 기능, 사용자 요청) 채팅 "+" 메뉴의 퀴즈·오프닝 룰렛 — 작성 시트와 대화방 카드.
//  · 퀴즈: 보낸 사람이 PGN·FEN으로 포지션을 정하면 엔진이 정답(최선의 수)과 오답을 골라 오지선다 카드를 만든다. 받는 사람은 한 번만 답할 수 있고, 답한 뒤 선택지마다 평가치(백 기준)가 공개된다.
//  · 오프닝 룰렛: 보낸 사람이 정한 수(ply)까지의 오프닝을 도감에서 같은 길이의 후보 중 무작위로 뽑는다. 카드가 처음 보일 때 슬롯 릴이 돌다가 당첨 오프닝에 멈춘다.
// 계산(선택지 고르기·입력 해석·룰렛 뽑기·payload 검증)은 src/lib/chatQuiz.js·openingRoulette.js — scripts/check-chat-quiz-roulette.mjs가 검사한다.
import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Dices, Check, X, Cpu, ExternalLink, RotateCcw } from "lucide-react";
import { T } from "../lib/theme.js";
import { parseFenFull } from "../lib/chessRules.js";
import { sansToPgnText } from "../lib/pgn.js";
import { t, tx } from "../lib/i18n.js";
import { parseQuizInput, buildQuizOptions, normalizeQuiz, quizEvalText, scoreForMover } from "../lib/chatQuiz.js";
import { rouletteCounts, makeRoulette, normalizeRoulette, ROULETTE_MIN_PLY, ROULETTE_MAX_PLY } from "../lib/openingRoulette.js";
import { Sheet, ChatMoveBoard, primaryBtn, stop } from "./chatPlus.jsx";

const CARD = { padding: 8, borderRadius: 14, background: "#fff", border: "1px solid #E4D5B6", boxShadow: "0 3px 10px -5px rgba(0,0,0,.4)" };
const sideName = (turn) => (turn === "w" ? t("백") : t("흑"));
// 백 기준 평가 → 둘 차례 기준 점수(비교용). 퀴즈 결과를 "좋은 수 → 나쁜 수" 순으로 늘어놓는 데 쓴다.
const moverScore = (ev, turn) => { const sg = turn === "w" ? 1 : -1; return scoreForMover(ev.mate != null ? { mate: ev.mate * sg } : { cp: ev.cp * sg }); };
// 백이 얼마나 유리한지를 0~100으로(막대 길이용). 메이트는 끝까지.
const whiteShare = (ev) => (ev.mate != null ? (ev.mate > 0 ? 100 : 0) : 50 + 50 * Math.tanh((ev.cp || 0) / 300));

function EvalChip({ ev }) {
  const white = ev.mate != null ? ev.mate > 0 : (ev.cp || 0) >= 0;
  return (
    <span style={{ minWidth: 46, textAlign: "center", padding: "2px 6px", borderRadius: 6, fontSize: 10.5, fontWeight: 900, fontFamily: "ui-monospace,monospace", letterSpacing: "-.02em",
      background: white ? "#FFFDF6" : "#2A1A0E", color: white ? "#3B2A1A" : "#F4EBD6", border: "1px solid " + (white ? "#D9C9A3" : "#000") }}>{quizEvalText(ev)}</span>
  );
}
// 선택지 한 줄 — 가운데 막대는 백 기준 유불리(흰색이 길수록 백 유리).
function QuizOptionRow({ opt, best, picked, index }) {
  const isBest = opt.san === best;
  const wrong = picked === opt.san && !isBest;
  const tone = isBest ? T.best : wrong ? T.blunder : "#C9B58C";
  return (
    <motion.div initial={{ opacity: 0, transform: "translateX(-8px)" }} animate={{ opacity: 1, transform: "translateX(0px)" }} transition={{ duration: 0.28, delay: 0.06 * index, ease: [0.2, 0.8, 0.3, 1] }}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, padding: "5px 7px", borderRadius: 9, background: isBest ? "rgba(63,122,58,.12)" : wrong ? "rgba(200,69,59,.1)" : "#FBF6EA", border: "1.5px solid " + tone }}>
      <span style={{ width: 16, height: 16, flexShrink: 0, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: isBest ? T.best : wrong ? T.blunder : "transparent", color: "#fff", border: isBest || wrong ? "none" : "1px dashed #C9B58C" }}>
        {isBest ? <Check size={11} strokeWidth={3.4} /> : wrong ? <X size={11} strokeWidth={3.4} /> : null}
      </span>
      <span style={{ width: 44, flexShrink: 0, fontSize: 12.5, fontWeight: 900, color: T.ink, fontFamily: "ui-monospace,monospace" }}>{opt.san}</span>
      <span aria-hidden="true" style={{ flex: 1, height: 6, borderRadius: 3, background: "#2A1A0E", overflow: "hidden", border: "1px solid rgba(0,0,0,.35)" }}>
        <motion.span initial={{ transform: "scaleX(0)" }} animate={{ transform: "scaleX(" + whiteShare(opt) / 100 + ")" }} transition={{ duration: 0.6, delay: 0.1 + 0.06 * index, ease: [0.2, 0.8, 0.3, 1] }}
          style={{ display: "block", height: "100%", transformOrigin: "left", background: "linear-gradient(90deg,#FFFDF6,#EAD9B0)" }} />
      </span>
      <EvalChip ev={opt} />
    </motion.div>
  );
}

// ======================================================================== 퀴즈 카드 ========================================================================
// 받는 사람: 답하기 전엔 선택지만 보이고, 한 번 답하면 정오와 선택지별 평가치가 공개된다. 보낸 사람: 처음부터 정답·평가치를 보고, 상대의 답을 확인한다.
export function QuizCard({ Board, msg, answers, myUid, mine, nameOf, onAnswer }) {
  const q = useMemo(() => normalizeQuiz(msg.quiz), [msg.quiz]);
  const root = useMemo(() => (q ? parseFenFull(q.fen) : null), [q]);
  const [pending, setPending] = useState(false);
  const myAnswer = (answers || []).find((a) => a.uid === myUid);
  const theirAnswer = (answers || []).find((a) => a.uid !== myUid);
  if (!q || !root) return <div style={{ ...CARD, fontSize: 11.5, color: T.inkSoft }}>{t("읽을 수 없는 퀴즈")}</div>;
  const answering = !mine && !myAnswer;
  const picked = mine ? (theirAnswer && theirAnswer.san) : (myAnswer && myAnswer.san);
  const ordered = [...q.opts].sort((a, b) => moverScore(b, root.turn) - moverScore(a, root.turn));
  const correct = picked != null && picked === q.best;
  const answer = async (san) => { if (pending) return; setPending(true); try { await onAnswer(san); } finally { setPending(false); } };
  return (
    <div onMouseDown={stop} onTouchStart={stop} style={{ width: 236, ...CARD, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", background: "linear-gradient(135deg,#3D2616,#1B1009)" }}>
        <span style={{ width: 24, height: 24, borderRadius: 8, background: "linear-gradient(150deg," + T.brilliant + "," + T.brilliant + "99)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Brain size={14} strokeWidth={2.2} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#FFF6DE", lineHeight: 1.2 }}>{t("최선의 수 퀴즈")}</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(255,246,222,.7)" }}>{tx("{0} 차례", sideName(root.turn))}</div>
        </div>
      </div>
      <div style={{ padding: 8 }}>
        <ChatMoveBoard Board={Board} root={root} sans={[]} size={220} interactive={false} flip={root.turn === "b"} />
        {answering ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, margin: "0 0 5px 2px" }}>{t("이 포지션의 최선의 수는?")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 5 }}>
              {q.opts.map((o, i) => (
                <motion.button key={o.san} onClick={() => answer(o.san)} disabled={pending} className="press" whileTap={{ scale: 0.96 }}
                  initial={{ opacity: 0, transform: "translateY(6px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} transition={{ duration: 0.25, delay: 0.04 * i }}
                  style={{ gridColumn: q.opts.length % 2 === 1 && i === q.opts.length - 1 ? "1 / -1" : undefined, padding: "9px 0", borderRadius: 10, border: "1.5px solid #C9B58C", background: "linear-gradient(180deg,#FFFDF6,#F3E8CF)", color: T.ink, fontSize: 14, fontWeight: 900, fontFamily: "ui-monospace,monospace", cursor: pending ? "default" : "pointer", boxShadow: "0 2px 0 #D9C9A3" }}>{o.san}</motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {picked != null ? (
              <motion.div initial={{ opacity: 0, transform: "scale(0.9)" }} animate={{ opacity: 1, transform: "scale(1)" }} transition={{ type: "spring", stiffness: 420, damping: 22 }}
                style={{ textAlign: "center", fontSize: 13, fontWeight: 900, color: correct ? T.best : T.blunder, marginBottom: 6 }}>
                {mine ? <>{tx("{0}님이 고른 수: {1}", nameOf(theirAnswer.uid), picked)}{correct ? " ✓" : " ✗"}</> : correct ? t("정답!") : tx("오답. 정답은 {0}", q.best)}
              </motion.div>
            ) : (
              <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: T.inkSoft, marginBottom: 6 }}>{t("아직 답하지 않음")}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ordered.map((o, i) => <QuizOptionRow key={o.san} opt={o} best={q.best} picked={picked} index={i} />)}
            </div>
            <div style={{ fontSize: 9.5, color: T.inkSoft, fontWeight: 700, marginTop: 5, textAlign: "right" }}>{t("평가치는 백 기준")}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ======================================================================== 퀴즈 작성 시트 ========================================================================
const QUIZ_ERR = { fen: () => t("FEN 형식이 올바르지 않음"), pgn: () => t("PGN에서 수를 읽을 수 없음"), illegal: () => t("둘 수 없는 수가 포함됨"), over: () => t("이미 끝난 포지션은 퀴즈로 낼 수 없음") };
// analyze(root) → [{ san, cp?, mate? }](둘 차례 기준 점수, 좋은 수 순) 또는 null(엔진 준비 전·실패)
export function QuizComposeSheet({ Board, analyze, onSend, onClose }) {
  const [text, setText] = useState("");
  const [stage, setStage] = useState("input"); // input | busy | ready
  const [lines, setLines] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [err, setErr] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseQuizInput(text) : null), [text]);
  useEffect(() => { setStage("input"); setLines(null); setQuiz(null); setErr(""); }, [text]);
  const make = async () => {
    if (!parsed || !parsed.ok || stage === "busy") return;
    setErr(""); setStage("busy");
    const got = analyze ? await analyze(parsed.root) : null;
    if (!got || !got.length) { setStage("input"); setErr(t("엔진 준비 중. 잠시 후 다시 시도")); return; }
    const r = buildQuizOptions(got, parsed.turn);
    if (!r.ok) { setStage("input"); setErr(t("둘 수 있는 수가 적어 퀴즈를 만들 수 없음")); return; }
    setLines(got); setQuiz(r); setStage("ready");
  };
  const reroll = () => { if (!lines || !parsed) return; const r = buildQuizOptions(lines, parsed.turn); if (r.ok) setQuiz(r); };
  const ordered = quiz ? [...quiz.options].sort((a, b) => moverScore(b, parsed.turn) - moverScore(a, parsed.turn)) : [];
  return (
    <Sheet title={t("퀴즈 만들기")} onClose={onClose} width={380}>
      <p style={{ fontSize: 11.5, color: T.inkSoft, margin: "0 0 8px", lineHeight: 1.5 }}>{t("PGN이나 FEN으로 포지션을 정하면 엔진이 최선의 수와 오답 선택지를 골라 줌")}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={t("PGN 또는 FEN 붙여넣기")} spellCheck={false}
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: "1px solid " + (parsed && !parsed.ok ? T.blunder : "#C9B58C"), background: "#fff", fontSize: 11.5, color: T.ink, marginBottom: 6, fontFamily: "ui-monospace,monospace", resize: "vertical", lineHeight: 1.5 }} />
      {parsed && !parsed.ok && <p style={{ fontSize: 11, color: T.blunder, fontWeight: 700, margin: "0 0 8px" }}>{(QUIZ_ERR[parsed.error] || QUIZ_ERR.pgn)()}</p>}
      {parsed && parsed.ok && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <ChatMoveBoard Board={Board} root={parsed.root} sans={[]} size={stage === "ready" ? 190 : 240} interactive={false} flip={parsed.turn === "b"} />
          <span style={{ fontSize: 10.5, color: T.inkSoft, fontWeight: 700 }}>{parsed.sans.length ? t("{0}수 둠", parsed.sans.length) + ", " : ""}{tx("{0} 차례", sideName(parsed.turn))}</span>
        </div>
      )}
      {stage === "ready" && quiz && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: T.ink, marginBottom: 5 }}>{t("선택지(평가치는 백 기준)")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {ordered.map((o, i) => <QuizOptionRow key={o.san} opt={o} best={quiz.best} picked={null} index={i} />)}
          </div>
          {quiz.ambiguous && <p style={{ fontSize: 10.5, color: T.blunder, fontWeight: 700, margin: "6px 0 0", lineHeight: 1.45 }}>{t("정답과 평가가 비슷한 수가 있어 정답이 모호할 수 있음")}</p>}
        </div>
      )}
      {err && <p style={{ fontSize: 11, color: T.blunder, fontWeight: 700, margin: "0 0 8px" }}>{err}</p>}
      {stage === "ready" && quiz ? (
        <div className="flex gap-2">
          <button onClick={reroll} className="press" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0", borderRadius: 10, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}><RotateCcw size={13} />{t("선택지 다시 고르기")}</button>
          <button onClick={() => onSend({ fen: parsed.fen, opts: quiz.options, best: quiz.best })} className="press" style={{ ...primaryBtn(true), flex: 1.3, width: "auto" }}>{t("퀴즈 보내기")}</button>
        </div>
      ) : (
        <button onClick={make} disabled={!parsed || !parsed.ok || stage === "busy"} className="press" style={{ ...primaryBtn(!!(parsed && parsed.ok) && stage !== "busy"), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Cpu size={14} />{stage === "busy" ? t("엔진이 분석하는 중…") : t("분석해서 선택지 만들기")}
        </button>
      )}
    </Sheet>
  );
}

// ======================================================================== 오프닝 룰렛 작성 시트 ========================================================================
export function RouletteComposeSheet({ tree, onSend, onClose }) {
  const counts = useMemo(() => rouletteCounts(tree), [tree]);
  const [ply, setPly] = useState(4);
  const [err, setErr] = useState("");
  const n = counts[ply] || 0;
  const send = () => { const r = makeRoulette(tree, ply); if (!r) { setErr(t("이 길이의 오프닝이 도감에 없음")); return; } onSend(r); };
  const step = (d) => { setErr(""); setPly((p) => Math.max(ROULETTE_MIN_PLY, Math.min(ROULETTE_MAX_PLY, p + d))); };
  const btn = { width: 40, height: 40, borderRadius: 12, border: "1.5px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1 };
  return (
    <Sheet title={t("오프닝 룰렛")} onClose={onClose} width={340}>
      <p style={{ fontSize: 11.5, color: T.inkSoft, margin: "0 0 12px", lineHeight: 1.5 }}>{t("정한 수까지의 오프닝을 도감에서 무작위로 뽑음")}</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 6 }}>
        <button onClick={() => step(-1)} disabled={ply <= ROULETTE_MIN_PLY} className="press" aria-label="-1" style={{ ...btn, opacity: ply <= ROULETTE_MIN_PLY ? 0.4 : 1 }}>−</button>
        <div style={{ minWidth: 96, textAlign: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: T.ink, lineHeight: 1, fontFamily: "ui-monospace,monospace" }}>{ply}</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, marginTop: 3 }}>{t("{0}수까지", ply)}</div>
        </div>
        <button onClick={() => step(1)} disabled={ply >= ROULETTE_MAX_PLY} className="press" aria-label="+1" style={{ ...btn, opacity: ply >= ROULETTE_MAX_PLY ? 0.4 : 1 }}>+</button>
      </div>
      <input type="range" min={ROULETTE_MIN_PLY} max={ROULETTE_MAX_PLY} value={ply} onChange={(e) => { setErr(""); setPly(Number(e.target.value)); }} aria-label={t("{0}수까지", ply)} style={{ width: "100%", accentColor: T.brass, margin: "4px 0 6px" }} />
      <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: n ? T.inkSoft : T.blunder, marginBottom: 12 }}>{n ? t("도감의 이 길이 오프닝 {0}개 중에서 뽑음", n) : t("이 길이의 오프닝이 도감에 없음")}</div>
      {err && <p style={{ fontSize: 11, color: T.blunder, fontWeight: 700, margin: "0 0 8px" }}>{err}</p>}
      <button onClick={send} disabled={!n} className="press" style={{ ...primaryBtn(!!n), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Dices size={15} />{t("룰렛 보내기")}</button>
    </Sheet>
  );
}

// ======================================================================== 오프닝 룰렛 카드 ========================================================================
const SEEN_KEY = "occ_roulette_seen_v1";
const SPIN_MAX_AGE_MS = 24 * 3600e3;   // 하루 넘은 옛 대화는 처음 열어도 돌리지 않는다(과거 기록이 한꺼번에 돌아가지 않게)
const readSeen = () => { try { return JSON.parse(window.localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; } };
const markSeen = (id) => { try { const a = readSeen(); if (!a.includes(id)) { a.push(id); window.localStorage.setItem(SEEN_KEY, JSON.stringify(a.slice(-300))); } } catch { } };
const ITEM_H = 38, ROWS = 3, SPIN_S = 3.8;
const ROULETTE_CSS = "@keyframes ocBulb{0%,100%{opacity:.25}50%{opacity:1}}";

function RouletteReel({ reel, spinKey, spinning, onDone }) {
  const N = reel.length;
  const strip = ["", ...reel, ""];             // 위아래 한 줄씩 비워 두면 마지막 이름이 가운데 줄에 멈춘다
  const endY = -(N - 1) * ITEM_H;
  return (
    <div style={{ position: "relative", height: ITEM_H * ROWS, overflow: "hidden", borderRadius: 12, background: "linear-gradient(180deg,#100804,#2A1A0E 50%,#100804)", border: "2px solid " + T.brass, boxShadow: "inset 0 0 14px rgba(0,0,0,.85), 0 4px 12px -6px rgba(0,0,0,.6)" }}>
      <motion.div key={spinKey} initial={spinning ? { transform: "translateY(0px)", filter: "blur(0px)" } : false}
        animate={{ transform: "translateY(" + endY + "px)", filter: spinning ? ["blur(0px)", "blur(2.6px)", "blur(2.6px)", "blur(0px)"] : "blur(0px)" }}
        transition={spinning ? { transform: { duration: SPIN_S, ease: [0.42, 0.1, 0.35, 1] }, filter: { duration: SPIN_S, times: [0, 0.12, 0.58, 1], ease: "linear" } } : { duration: 0 }}
        onAnimationComplete={() => { if (spinning) onDone(); }} style={{ willChange: "transform" }}>
        {strip.map((nm, i) => (
          <div key={i} style={{ height: ITEM_H, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 14px", boxSizing: "border-box", textAlign: "center", fontSize: 12.5, fontWeight: 800, lineHeight: 1.2, color: "#FFF6DE", opacity: 0.92 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{nm}</span>
          </div>
        ))}
      </motion.div>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg,rgba(16,8,4,.92) 0%,rgba(16,8,4,0) 34%,rgba(16,8,4,0) 66%,rgba(16,8,4,.92) 100%)" }} />
      <div aria-hidden="true" style={{ position: "absolute", left: 6, right: 6, top: ITEM_H, height: ITEM_H, pointerEvents: "none", borderRadius: 9, border: "1.5px solid " + T.brassHi, boxShadow: "0 0 12px rgba(236,203,134,.45), inset 0 0 10px rgba(236,203,134,.18)" }} />
      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: ITEM_H + ITEM_H / 2 - 5, width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "7px solid " + T.brassHi }} />
      <span aria-hidden="true" style={{ position: "absolute", right: 0, top: ITEM_H + ITEM_H / 2 - 5, width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderRight: "7px solid " + T.brassHi }} />
    </div>
  );
}

export function RouletteCard({ msg, onOpen }) {
  const r = useMemo(() => normalizeRoulette(msg.roulette), [msg.roulette]);
  const [spinKey, setSpinKey] = useState(0);
  const [spinning, setSpinning] = useState(() => !!r && !readSeen().includes(msg.id) && Date.now() - new Date(msg.created_at).getTime() < SPIN_MAX_AGE_MS);
  const [done, setDone] = useState(!spinning);
  const startedRef = useRef(false);
  useEffect(() => { if (spinning && !startedRef.current) { startedRef.current = true; markSeen(msg.id); } }, [spinning, msg.id]);
  if (!r) return <div style={{ ...CARD, fontSize: 11.5, color: T.inkSoft }}>{t("읽을 수 없는 룰렛")}</div>;
  const replay = () => { setDone(false); setSpinning(true); setSpinKey((k) => k + 1); };
  return (
    <div onMouseDown={stop} onTouchStart={stop} style={{ width: 236, padding: 10, borderRadius: 14, background: "linear-gradient(160deg,#3D2616,#1B1009)", border: "1.5px solid " + T.brass, boxShadow: "0 6px 16px -8px rgba(0,0,0,.6)", color: T.ivoryHi }}>
      <style>{ROULETTE_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 8, background: "linear-gradient(150deg," + T.brassHi + "," + T.brass + ")", color: "#241509", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Dices size={14} strokeWidth={2.2} /></span>
        <div style={{ fontSize: 12, fontWeight: 900, lineHeight: 1.2 }}>{t("오프닝 룰렛")}</div>
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: "rgba(255,246,222,.75)" }}>{t("{0}수까지", r.ply)}</span>
      </div>
      <div style={{ position: "relative", marginBottom: 8 }}>
        <div aria-hidden="true" style={{ position: "absolute", left: 14, right: 14, top: -4, display: "flex", justifyContent: "space-between", pointerEvents: "none", zIndex: 2 }}>
          {Array.from({ length: 9 }).map((_, i) => <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: T.brassHi, animation: spinning && !done ? "ocBulb .5s ease-in-out " + (i % 2 ? "0s" : ".25s") + " infinite" : "none", opacity: done ? 0.85 : 0.35, boxShadow: done ? "0 0 6px " + T.brassHi : "none" }} />)}
        </div>
        <RouletteReel reel={r.reel} spinKey={spinKey} spinning={spinning} onDone={() => { setSpinning(false); setDone(true); }} />
      </div>
      <AnimatePresence initial={false}>
        {done && (
          <motion.div key="res" initial={{ opacity: 0, transform: "translateY(8px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} transition={{ duration: 0.35, ease: [0.2, 0.8, 0.3, 1] }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: T.brassHi, lineHeight: 1.25, textAlign: "center", marginBottom: 3 }}>{r.name}</div>
            <div style={{ textAlign: "center", marginBottom: 7 }}>
              {r.eco && <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 999, background: "rgba(236,203,134,.15)", border: "1px solid rgba(236,203,134,.45)", fontSize: 10.5, fontWeight: 900, color: T.brassHi, fontFamily: "ui-monospace,monospace" }}>{r.eco}</span>}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,246,222,.82)", lineHeight: 1.5, textAlign: "center", marginBottom: 8, fontFamily: "ui-monospace,monospace", wordBreak: "break-word" }}>{sansToPgnText(r.sans, "w")}</div>
            <div className="flex gap-2">
              <button onClick={replay} className="press" aria-label={t("다시 돌려보기")} title={t("다시 돌려보기")} style={{ width: 34, flexShrink: 0, padding: "6px 0", borderRadius: 8, border: "1px solid rgba(236,203,134,.5)", background: "transparent", color: T.brassHi, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><RotateCcw size={13} /></button>
              <button onClick={() => onOpen && onOpen(r.sans)} className="press" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", borderRadius: 8, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{tx("{0}분석하기", <ExternalLink size={12} />)}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
