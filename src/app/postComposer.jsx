// (v0.7.7, 사용자 요청) "+ 새 게시물" — 인스타그램 게시물 작성 화면처럼 전체 화면 하나에서 퍼즐·유산·대국을 골라 올린다.
//  · 퍼즐: 기존 퍼즐 마법사(puzzle.jsx createNode)를 그대로 넣는다(children).
//  · 유산: 퍼즐 마법사처럼 PGN·FEN 코드(또는 chess.com 대국)로 → 엔진이 채점 → 최선·유일·탁월 수 중 하나를 골라 → 재생 길이·진영을 정하고 게시.
//  · 대국: PGN·FEN 코드(또는 chess.com 대국)로 → 대국자·결과·진영을 정하고 게시(처음부터 끝까지 넘겨 보는 재생기).
//  · FEN만 넣으면 그 포지션부터 보드에서 직접 수를 이어 둔다(MoveEntryBoard).
//  유산·대국은 공개 프로필의 게시물 묶음(pub.legacies, lib/legacyPosts.js addPost)에 쌓여 피드·좋아요·리포스트·프로필 소셜 섹션을 그대로 함께 쓴다.
//  입력 해석은 lib/postInput.js(순수 함수), 연결 기준은 scripts/check-post-composer.mjs가 지킨다.
import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { T } from "../lib/theme.js";
import { t, tx } from "../lib/i18n.js";
import { X, Puzzle as PuzzleIcon, Swords, Gem, Undo2, Check, Plus, Flame as FlameIcon } from "../components/ocIcons.jsx";
import { postBadge } from "../components/badges.jsx";
import { QCOLOR } from "../lib/moveKinds.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { LegacyFrame } from "../components/legacyFrame.jsx";
import { AnimatedMove, Board, REVIEW_DEPTH, REVIEW_MOVETIME_MS, analyzeGame, containsBannedWord, useNarrow } from "./common.jsx";
import { AccountChessStats } from "./profile.jsx";
import { parsePostInput, decorateFrom } from "../lib/postInput.js";
import { GAME_RESULTS, LEGACY_MAX_PLIES } from "../lib/legacyEntry.js";
import { sansToPgnText } from "../lib/pgn.js";
import { startBoard, sanSrc, applySan, plyIsWhite, fenLegalDests, buildSan, epTargetFromMoveInfo, updateCastleRights, moveNumber } from "../lib/chessRules.js";

export const POST_TYPES = ["puzzle", "legacy", "game"];
const LEGACY_PICK_KINDS = ["brilliant", "only", "best"];
const card = { background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 13, marginBottom: 10 };
const stepTitle = { fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 8 };
const darkBtn = { padding: "7px 14px", borderRadius: 9, background: T.ebony2, color: T.brassHi, fontWeight: 800, fontSize: 12, border: "1px solid #000", cursor: "pointer" };
const pill = (on) => ({ padding: "6px 11px", borderRadius: 999, border: "1px solid " + (on ? "#A8842F" : "#C9B58C"), background: on ? "linear-gradient(180deg,#ECCB86,#C49A50)" : "#fff", color: on ? "#2A1B08" : T.ink, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: SITE_FONT });
const inputBox = { width: "100%", boxSizing: "border-box", fontSize: 12.5, padding: 10, borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontFamily: SITE_FONT };

function useWidth() {
  const ref = useRef(null); const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* 시작 포지션(root)부터 지금까지의 보드·권리·앙파상 칸 */
function replayState(root, sans) {
  let board = root ? root.board : startBoard();
  let rights = root ? root.rights : { K: true, Q: true, k: true, q: true }, ep = root ? root.ep : null;
  for (let i = 0; i < sans.length; i++) {
    const color = plyIsWhite(i, root ? root.turn : "w") ? "w" : "b";
    const info = sanSrc(board, sans[i], color);
    rights = updateCastleRights(rights, info, color); ep = epTargetFromMoveInfo(info);
    board = applySan(board, sans[i], color);
  }
  return { board, rights, ep };
}

/* FEN만 넣었을 때 — 보드에서 직접 이어 둘 수를 받는다(눌러서 고르고 도착 칸을 누르거나 끌어 놓기). 승진은 퀸. */
function MoveEntryBoard({ root, sans, onChange }) {
  const [ref, w] = useWidth();
  const [sel, setSel] = useState(null);
  const st = useMemo(() => replayState(root, sans), [root, sans]);
  const color = plyIsWhite(sans.length, root ? root.turn : "w") ? "w" : "b";
  const dests = (sq) => (sq ? fenLegalDests(sq[0], sq[1], color, st.board, st.rights, st.ep) : []);
  const play = (from, to) => {
    if (!dests(from).some(([r, c]) => r === to[0] && c === to[1])) return false;
    const p = st.board[from[0]][from[1]];
    const promo = p && p.t === "P" && (to[0] === 0 || to[0] === 7) ? "Q" : undefined;
    const san = buildSan(st.board, from[0], from[1], to[0], to[1], color, st.ep, promo);
    if (!san || sans.length >= LEGACY_MAX_PLIES) return false;
    onChange(decorateFrom(root, [...sans, san])); setSel(null); return true;
  };
  const onSquareClick = (sq) => {
    const p = st.board[sq[0]][sq[1]];
    if (sel && play(sel, sq)) return;
    setSel(p && p.c === color ? sq : null);
  };
  return (
    <div>
      <div ref={ref} style={{ width: "100%", maxWidth: 360, margin: "0 auto" }}>
        {w > 0 && <Board board={st.board} flip={(root ? root.turn : "w") === "b"} size={w} selected={sel} legalTargets={dests(sel)} onSquareClick={onSquareClick}
          onPieceDrag={(sq) => { const p = st.board[sq[0]][sq[1]]; if (p && p.c === color) setSel(sq); }} onDrop={(sq) => { if (sel) play(sel, sq); }} onMove={(from, to) => play(from, to)} showEval={false} showCoords interactive />}
      </div>
      <div className="flex items-center" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: T.ink, fontFamily: SITE_FONT, wordBreak: "break-word" }}>{sans.length ? sansToPgnText(sans, root ? root.turn : "w") : t("보드에서 이어 둘 수를 두세요")}</span>
        <button type="button" onClick={() => { onChange(sans.slice(0, -1)); setSel(null); }} disabled={!sans.length} className="press" style={{ ...darkBtn, opacity: sans.length ? 1 : 0.4, display: "inline-flex", alignItems: "center", gap: 5 }}><Undo2 size={13} />{t("한 수 무르기")}</button>
      </div>
    </div>
  );
}

/* 1단계 — PGN·FEN 코드 입력(퍼즐 마법사 1단계와 같은 모양). parsed: parsePostInput 결과(ok) */
function CodeInputStep({ title, value, setValue, onParsed, chesscom, chesscomUsername }) {
  const [err, setErr] = useState("");
  const [gid, setGid] = useState(null);
  const ccReady = !!(chesscom && chesscom.status === "ready" && chesscom.games && chesscom.games.length);
  const submit = (raw) => {
    const r = parsePostInput(raw);
    if (!r.ok) { setErr(r.reason === "empty" ? t("PGN 또는 FEN 입력 필요") : r.reason === "illegal" ? t("{0}번째 수를 둘 수 없음", r.at + 1) : t("잘못된 기보 형식")); onParsed(null); return; }
    setErr(""); onParsed(r);
  };
  return (
    <div style={card}>
      <div style={stepTitle}>{title}</div>
      <textarea value={value} onChange={(e) => { setValue(e.target.value); setErr(""); onParsed(null); setGid(null); }} rows={3}
        placeholder={t("예: 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...\n또는 FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")} style={{ ...inputBox, resize: "vertical" }} />
      {err && <div role="alert" style={{ fontSize: 11.5, color: T.blunder, marginTop: 6 }}>{err}</div>}
      <div className="flex justify-end" style={{ marginTop: 8 }}>
        <button type="button" onClick={() => submit(value)} className="press" style={darkBtn}>{t("확인")}</button>
      </div>
      {ccReady && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E4D5B6" }}>
          <AccountChessStats chesscom={chesscom} username={chesscomUsername} selectedGameId={gid} onSelectGame={(g, id) => {
            if (gid != null && id === gid) { setGid(null); setValue(""); onParsed(null); return; }
            const txt = sansToPgnText(g.moves, "w"); setGid(id); setValue(txt); submit(txt);
          }} />
        </div>
      )}
    </div>
  );
}

/* 재생 미리보기 — 피드 카드와 같은 남색 바탕 + 금색 액자 */
function PostPreview({ entry, kind }) {
  const [ref, w] = useWidth();
  const before = useMemo(() => entry.sans.slice(0, entry.moveIndex), [entry]);
  return (
    <div style={{ background: "linear-gradient(160deg,#20324D 0%,#14213A 55%,#0C1424 100%)", padding: 12, borderRadius: 12, maxWidth: 340, margin: "0 auto" }}>
      <div style={{ position: "relative", padding: 12 }}>
        <LegacyFrame />
        <div ref={ref} style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 6, overflow: "hidden" }}>
          {w > 0 && <AnimatedMove sans={before} san={entry.sans[entry.moveIndex]} size={w} loopMs={2400} flip={entry.side === "b"} badge={kind === "game" ? null : kind} fenRoot={entry.root || null} />}
        </div>
      </div>
    </div>
  );
}

const publishFail = (r) => (r.reason === "dup" ? t("이미 같은 게시물이 있음") : r.reason === "full" ? t("게시물은 최대 200개까지") : r.reason === "size" ? t("게시물 저장 공간이 가득 참") : t("게시할 수 없는 게시물"));

/* 유산 — 채점 → 최선·유일·탁월 수 고르기 → 게시 */
function LegacyPane({ engine, onPublish, onDone, chesscom, chesscomUsername }) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(null);
  const [extra, setExtra] = useState([]);   // FEN만 넣었을 때 보드에서 이어 둔 수
  const [res, setRes] = useState(null), [prog, setProg] = useState(0), [busy, setBusy] = useState(false), [aErr, setAErr] = useState("");
  const [pick, setPick] = useState(null), [playCount, setPlayCount] = useState(3), [beforeCount, setBeforeCount] = useState(2), [side, setSide] = useState(null);
  const [msg, setMsg] = useState(null);
  const root = parsed ? parsed.root : null;
  const sans = parsed ? (parsed.sans.length ? parsed.sans : extra) : [];
  const needBoard = !!(parsed && !parsed.sans.length);
  const sansKey = sans.join(" ");
  useEffect(() => { setRes(null); setPick(null); setAErr(""); setMsg(null); }, [sansKey, parsed]);
  const ready = !!(engine && engine.status === "ready");
  const runAnalyze = () => {
    if (!sans.length || !ready) return;
    let off = false; setBusy(true); setProg(0); setAErr(""); setRes(null);
    analyzeGame(sans, engine, REVIEW_DEPTH, (p) => { if (!off) setProg(p); }, REVIEW_MOVETIME_MS, undefined, root)
      .then((r) => { if (!off) setRes(r); }).catch(() => { if (!off) setAErr(t("기보 채점 실패. 잠시 후 다시 시도")); }).finally(() => { if (!off) setBusy(false); });
    return () => { off = true; };
  };
  // PGN·FEN+수순은 확인되는 즉시 채점(퍼즐 마법사와 같은 흐름). 보드에서 두는 수순은 "채점" 버튼으로.
  useEffect(() => { if (parsed && parsed.sans.length && ready) return runAnalyze(); return undefined; }, [parsed, ready]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cands = res ? res.moves.filter((m) => LEGACY_PICK_KINDS.includes(m.kind)) : [];
  const turn = root ? root.turn : "w";
  const mover = pick != null ? (plyIsWhite(pick.ply, turn) ? "w" : "b") : "w";
  const maxPlay = pick != null ? sans.length - pick.ply : 1;
  const entry = pick != null ? {
    sans, moveIndex: pick.ply, playCount: Math.max(1, Math.min(playCount, maxPlay)), beforeCount: Math.min(beforeCount, pick.ply),
    kinds: res.moves.length === sans.length ? res.moves.map((m) => m.kind) : null, side: side || mover, savedAt: Date.now(), kind: pick.kind, root,
  } : null;
  const publish = () => {
    if (!entry) return;
    const { root: r0, ...rest } = entry;
    const r = onPublish(entry.kind, { ...rest, ...(r0 ? { fen: r0.raw } : null) });
    if (r && r.ok) { setMsg({ ok: true, text: t("유산 게시 완료") }); setTimeout(onDone, 700); } else setMsg({ ok: false, text: publishFail(r || {}) });
  };
  return (
    <>
      <CodeInputStep title={t("1. PGN 또는 FEN 코드 입력")} value={raw} setValue={setRaw} onParsed={(p) => { setParsed(p); setExtra([]); setSide(null); }} chesscom={chesscom} chesscomUsername={chesscomUsername} />
      {needBoard && (
        <div style={card}>
          <div style={stepTitle}>{t("FEN 포지션에서 이어 둘 수")}</div>
          <MoveEntryBoard root={root} sans={extra} onChange={setExtra} />
          <div className="flex justify-end" style={{ marginTop: 8 }}>
            <button type="button" onClick={runAnalyze} disabled={!extra.length || !ready || busy} className="press" style={{ ...darkBtn, opacity: !extra.length || !ready || busy ? 0.45 : 1 }}>{t("채점하기")}</button>
          </div>
        </div>
      )}
      {parsed && sans.length > 0 && (
        <div style={card}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <div style={{ ...stepTitle, marginBottom: 0 }}>{t("2. 유산으로 남길 수 선택")}</div>
            {(busy || res) && <div style={{ fontSize: 11, fontWeight: 800, color: T.brass, fontFamily: SITE_FONT }}>{tx("{0}% 분석됨", Math.round((res ? 1 : prog) * 100))}</div>}
          </div>
          {!ready && !res && <div style={{ fontSize: 11.5, color: T.inkSoft }}>{t("엔진 준비 중...")}</div>}
          {busy && !res && <div style={{ fontSize: 11.5, color: T.inkSoft }}>{t("기보를 채점하는 중...")}</div>}
          {aErr && <div style={{ fontSize: 11.5, color: T.blunder }}>{aErr}</div>}
          {res && !cands.length && <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.6 }}>{t("이 기보에는 최선·유일·탁월한 수가 없음")}</div>}
          {res && cands.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {cands.map((m) => { const on = pick && pick.ply === m.ply; const c = QCOLOR[m.kind]; return (
                <button key={m.ply} type="button" onClick={() => { setPick(m); setSide(null); }} aria-pressed={!!on} className="press"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, border: "1.5px solid " + (on ? c : "#DCCBA8"), background: on ? c + "22" : "#fff", color: T.ink, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: SITE_FONT }}>
                  {postBadge(m.kind, 15)}{moveNumber(m.ply, turn) + m.san}
                </button>
              ); })}
            </div>
          )}
        </div>
      )}
      {entry && (
        <div style={card}>
          <div style={stepTitle}>{t("3. 재생 설정과 미리보기")}</div>
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <Row label={t("앞 수")}>{[0, 1, 2, 3].filter((n) => n <= pick.ply).map((n) => <button key={n} type="button" onClick={() => setBeforeCount(n)} className="press" style={pill(entry.beforeCount === n)}>{n}</button>)}</Row>
            <Row label={t("뒤 수")}>{[1, 2, 3, 4, 5].filter((n) => n <= maxPlay).map((n) => <button key={n} type="button" onClick={() => setPlayCount(n)} className="press" style={pill(entry.playCount === n)}>{n}</button>)}</Row>
            <Row label={t("보드 방향")}>{[["w", t("백 쪽에서")], ["b", t("흑 쪽에서")]].map(([k, lb]) => <button key={k} type="button" onClick={() => setSide(k)} className="press" style={pill(entry.side === k)}>{lb}</button>)}</Row>
          </div>
          <PostPreview entry={entry} kind={entry.kind} />
          <PublishBar msg={msg} onPublish={publish} label={t("유산 게시")} />
        </div>
      )}
    </>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
      <span style={{ width: 64, flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: T.inkSoft }}>{label}</span>
      <div className="flex flex-wrap" style={{ gap: 5 }}>{children}</div>
    </div>
  );
}
function PublishBar({ msg, onPublish, label, disabled }) {
  return (
    <div style={{ marginTop: 12 }}>
      {msg && <div role="status" style={{ fontSize: 12, fontWeight: 800, color: msg.ok ? T.best : T.blunder, marginBottom: 8, textAlign: "center" }}>{msg.text}</div>}
      <button type="button" onClick={onPublish} disabled={disabled || (msg && msg.ok)} className="press" style={{ width: "100%", padding: "12px 0", borderRadius: 11, border: "none", background: "linear-gradient(180deg," + T.brassHi + "," + T.brass + ")", color: "#241509", fontWeight: 900, fontSize: 14, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Check size={15} />{label}</button>
    </div>
  );
}

/* 대국 — 대국자·결과·진영 → 게시 */
function GamePane({ onPublish, onDone, chesscom, chesscomUsername }) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(null);
  const [extra, setExtra] = useState([]);
  const [white, setWhite] = useState(""), [black, setBlack] = useState(""), [result, setResult] = useState("*"), [side, setSide] = useState("w");
  const [msg, setMsg] = useState(null);
  const root = parsed ? parsed.root : null;
  const sans = parsed ? (parsed.sans.length ? parsed.sans : extra) : [];
  const onParsed = (p) => {
    setParsed(p); setExtra([]); setMsg(null);
    if (p) { setWhite(p.meta.white || ""); setBlack(p.meta.black || ""); setResult(p.meta.result || "*"); }
  };
  const banned = containsBannedWord(white) || containsBannedWord(black);
  const entry = sans.length ? { sans, moveIndex: sans.length - 1, playCount: 1, beforeCount: sans.length - 1, kinds: null, side, savedAt: Date.now(), kind: "game", meta: { white: white.trim(), black: black.trim(), result }, root } : null;
  const publish = () => {
    if (!entry || banned) return;
    const { root: r0, ...rest } = entry;
    const r = onPublish("game", { ...rest, ...(r0 ? { fen: r0.raw } : null) });
    if (r && r.ok) { setMsg({ ok: true, text: t("대국 게시 완료") }); setTimeout(onDone, 700); } else setMsg({ ok: false, text: publishFail(r || {}) });
  };
  return (
    <>
      <CodeInputStep title={t("1. PGN 또는 FEN 코드 입력")} value={raw} setValue={setRaw} onParsed={onParsed} chesscom={chesscom} chesscomUsername={chesscomUsername} />
      {parsed && !parsed.sans.length && (
        <div style={card}>
          <div style={stepTitle}>{t("FEN 포지션에서 이어 둘 수")}</div>
          <MoveEntryBoard root={root} sans={extra} onChange={setExtra} />
        </div>
      )}
      {entry && (
        <div style={card}>
          <div style={stepTitle}>{t("2. 대국 정보와 미리보기")}</div>
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <Row label={t("백")}><input value={white} maxLength={40} onChange={(e) => setWhite(e.target.value)} placeholder={t("백 대국자")} style={{ ...inputBox, width: 200, padding: "7px 9px" }} /></Row>
            <Row label={t("흑")}><input value={black} maxLength={40} onChange={(e) => setBlack(e.target.value)} placeholder={t("흑 대국자")} style={{ ...inputBox, width: 200, padding: "7px 9px" }} /></Row>
            <Row label={t("결과")}>{GAME_RESULTS.map((r) => <button key={r} type="button" onClick={() => setResult(r)} className="press" style={pill(result === r)}>{r === "*" ? t("미정") : r}</button>)}</Row>
            <Row label={t("보드 방향")}>{[["w", t("백 쪽에서")], ["b", t("흑 쪽에서")]].map(([k, lb]) => <button key={k} type="button" onClick={() => setSide(k)} className="press" style={pill(side === k)}>{lb}</button>)}</Row>
          </div>
          {banned && <div role="alert" style={{ fontSize: 11.5, color: T.blunder, marginBottom: 8 }}>{t("사용할 수 없는 단어가 포함됨")}</div>}
          <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 8, textAlign: "center" }}>{tx("{0}수 · 마지막 수 미리보기", Math.ceil(sans.length / 2))}</div>
          <PostPreview entry={entry} kind="game" />
          <PublishBar msg={msg} onPublish={publish} label={t("대국 게시")} disabled={banned} />
        </div>
      )}
    </>
  );
}

/* 전체 화면 작성기. type/setType: 지금 고른 종류, children: 퍼즐 마법사. onPublish(kind, entry) → addPost 결과 */
export function PostComposer({ type, setType, onClose, engine, onPublish, chesscom, chesscomUsername, children }) {
  const narrow = useNarrow(640);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = prev; };
  }, [onClose]);
  const tabs = [
    ["puzzle", t("퍼즐"), <PuzzleIcon key="i" size={16} />],
    ["legacy", t("유산"), <Gem key="i" size={16} />],
    ["game", t("대국"), <Swords key="i" size={16} />],
  ];
  const node = (
    <motion.div role="dialog" aria-modal="true" aria-label={t("새 게시물")} className="oc-composer" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 0.9, 0.32, 1] }}
      style={{ position: "fixed", inset: 0, zIndex: 260, display: "flex", flexDirection: "column", background: "radial-gradient(120% 80% at 50% 0%, #2E1B10 0%, #1B1009 60%)", color: T.ivory, fontFamily: SITE_FONT }}>
      <header style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "calc(10px + env(safe-area-inset-top, 0px)) 16px 10px", borderBottom: "1px solid rgba(196,154,80,.35)" }}>
        <button type="button" onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(196,154,80,.45)", background: "rgba(255,255,255,.04)", color: T.brassHi, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}><X size={17} /></button>
        <h2 style={{ margin: 0, flex: 1, fontSize: 16, fontWeight: 900, color: T.ivoryHi }}>{t("새 게시물")}</h2>
      </header>
      <div role="tablist" aria-label={t("게시물 종류")} style={{ flexShrink: 0, display: "flex", justifyContent: "center", gap: narrow ? 4 : 10, padding: "8px 16px 0", borderBottom: "1px solid rgba(196,154,80,.2)" }}>
        {tabs.map(([k, lb, ic]) => { const on = type === k; return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setType(k)} className="press"
            style={{ flex: narrow ? 1 : "0 0 120px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 42, border: "none", borderBottom: "2px solid " + (on ? T.brassHi : "transparent"), background: "transparent", color: on ? T.brassHi : "rgba(235,221,196,.6)", fontSize: 13.5, fontWeight: 900, cursor: "pointer", fontFamily: SITE_FONT }}>{ic}{lb}</button>
        ); })}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "14px 16px calc(28px + env(safe-area-inset-bottom, 0px))" }}>
          {type === "puzzle" ? children
            : type === "legacy" ? <LegacyPane engine={engine} onPublish={onPublish} onDone={onClose} chesscom={chesscom} chesscomUsername={chesscomUsername} />
            : <GamePane onPublish={onPublish} onDone={onClose} chesscom={chesscom} chesscomUsername={chesscomUsername} />}
        </div>
      </div>
    </motion.div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : null;
}

/* "+ 새 게시물" 버튼 — 소셜 탭 머리줄 오른쪽. 로그인하지 않으면 누를 수 없다. */
export function NewPostButton({ onClick, disabled }) {
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} title={disabled ? t("로그인 후 이용 가능") : undefined} className="press"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 13px", borderRadius: 999, border: "1px solid " + (disabled ? "rgba(255,255,255,.15)" : "#A8842F"), background: disabled ? "rgba(255,255,255,.05)" : "linear-gradient(180deg," + T.brassHi + "," + T.brass + ")", color: disabled ? "rgba(235,221,196,.4)" : "#241509", fontSize: 12.5, fontWeight: 900, cursor: disabled ? "default" : "pointer", fontFamily: SITE_FONT, flexShrink: 0 }}>
      <Plus size={13} />{t("새 게시물")}
    </button>
  );
}

/* 연속 출석 — 불꽃 아이콘 + 연속 일수(숫자만). 기록이 없으면 0. */
export function StreakCount({ count }) {
  const n = Math.max(0, count | 0), lit = n > 0;
  return (
    <span className="flex items-center" title={tx("{0}일 연속", n)} aria-label={tx("{0}일 연속", n)} style={{ gap: 5, flexShrink: 0 }}>
      <span style={{ display: "inline-flex", color: lit ? "#E8874A" : "rgba(235,221,196,.35)" }}><FlameIcon size={20} /></span>
      <span style={{ fontSize: 16, fontWeight: 900, color: lit ? T.ivoryHi : "rgba(235,221,196,.5)", fontFamily: SITE_FONT, lineHeight: 1 }}>{n}</span>
    </span>
  );
}
