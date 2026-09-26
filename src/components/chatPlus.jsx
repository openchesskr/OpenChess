// (v0.5.7 기능, 사용자 요청 "채팅을 실제 SNS 수준으로") 채팅 강화 화면 조각 — ChatPanel(src/App.jsx)이 가져다 쓴다.
//  1단계(메신저 기본기): 메시지 메뉴(반응·답장·복사·수정·삭제·신고), 반응 칩, 답장 인용, 신고 시트, 대화 검색
//  2단계(체스 특화): 텍스트 속 FEN/수순 미니 보드, "여기서 뭐 둘래?" 수 투표, 같이 보기(실시간 공동 분석) 보드
// 체스 보드는 앱의 Board(스킨·드래그 포함)를 그대로 쓰도록 prop(Board)으로 받는다 — App.jsx를 되부르는 순환 import를 피하려는 것.
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Reply, Copy, Flag, Search, X, Pencil, Trash2, Ban, BarChart3, Users, Cpu, ExternalLink, RotateCcw, Undo2, Plus } from "lucide-react";
import { T } from "../lib/theme.js";
import { parseFenFull, replayFromFen, replaySans, boardFromSans, epTarget, fenLegalDests, buildSan, colorOfRoot, fenOfRoot } from "../lib/chessRules.js";
import { parsePgnSans, sanSequenceValid } from "../lib/pgn.js";
import { CHAT_REACTIONS, REPORT_REASONS, FEN_IN_TEXT, MOVETEXT_IN_TEXT } from "../lib/chatApi.js";

const menuBtn = { display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "7px 9px", borderRadius: 7, background: "transparent", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: T.ivory, textAlign: "left", whiteSpace: "nowrap" };
const stop = (e) => e.stopPropagation();

// ---- 메시지 메뉴 — 위에 반응 줄, 아래에 동작 버튼. 말풍선이 없는 쪽(대화창 가운데 쪽)에 뜬다(위치는 호출부가 잡는다). ----
export const CHAT_MENU_W = 214;
export function ChatMsgMenu({ myReacts, onReact, onReply, onCopy, onEdit, onDelete, onReport, style }) {
  return (
    <div onMouseDown={stop} onTouchStart={stop} role="menu"
      style={{ position: "absolute", zIndex: 30, width: CHAT_MENU_W, padding: 6, borderRadius: 12, background: T.ebony2, border: "1px solid #000", boxShadow: "0 10px 24px -8px rgba(0,0,0,.6)", ...style }}>
      {onReact && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 2px 6px", borderBottom: onReply || onCopy || onEdit || onDelete || onReport ? "1px solid rgba(255,255,255,.08)" : "none", marginBottom: 4 }}>
          {CHAT_REACTIONS.map((e) => {
            const on = myReacts && myReacts.has(e);
            return (
              <button key={e} onClick={() => onReact(e)} aria-label={"반응 " + e} aria-pressed={!!on} className="press"
                style={{ width: 30, height: 30, borderRadius: 999, border: "none", cursor: "pointer", fontSize: 17, lineHeight: 1, background: on ? "rgba(196,154,80,.35)" : "transparent", padding: 0 }}>{e}</button>
            );
          })}
        </div>
      )}
      {onReply && <button onClick={onReply} className="press" style={menuBtn}><Reply size={14} />답장</button>}
      {onCopy && <button onClick={onCopy} className="press" style={menuBtn}><Copy size={14} />복사</button>}
      {onEdit && <button onClick={onEdit} className="press" style={menuBtn}><Pencil size={14} />수정</button>}
      {onDelete && <button onClick={onDelete} className="press" style={{ ...menuBtn, color: "#F4A0A0" }}><Trash2 size={14} />삭제</button>}
      {onReport && <button onClick={onReport} className="press" style={{ ...menuBtn, color: "#F4A0A0" }}><Flag size={14} />신고</button>}
    </div>
  );
}

// ---- 반응 칩 — 이모지별로 묶어 개수 표시, 내가 단 것은 금색 테두리. 누르면 내 반응을 켜고 끈다. ----
export function ReactionChips({ list, myUid, onToggle, align = "flex-start" }) {
  const groups = useMemo(() => {
    const m = new Map();
    (list || []).forEach((r) => { const g = m.get(r.emoji) || { emoji: r.emoji, n: 0, mine: false }; g.n++; if (r.uid === myUid) g.mine = true; m.set(r.emoji, g); });
    return CHAT_REACTIONS.map((e) => m.get(e)).filter(Boolean);
  }, [list, myUid]);
  if (!groups.length) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: align, marginTop: 3 }}>
      <AnimatePresence initial={false}>
        {groups.map((g) => (
          <motion.button key={g.emoji} layout initial={{ opacity: 0, transform: "scale(0.6)" }} animate={{ opacity: 1, transform: "scale(1)" }} exit={{ opacity: 0, transform: "scale(0.6)" }}
            transition={{ duration: 0.18 }} onClick={() => onToggle && onToggle(g.emoji, !g.mine)} className="press" aria-pressed={g.mine}
            style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 7px", height: 22, borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 800, color: T.ink,
              background: g.mine ? "rgba(196,154,80,.22)" : "#fff", border: "1px solid " + (g.mine ? T.brass : "#E4D5B6") }}>
            <span style={{ fontSize: 13, lineHeight: 1 }}>{g.emoji}</span>{g.n > 1 && <span>{g.n}</span>}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

// 답장·검색 결과에 쓰는 한 줄 요약 — 특수 메시지는 종류 이름으로.
export function chatSnippet(m) {
  if (!m) return "삭제된 메시지";
  if (m.body) return m.body.length > 60 ? m.body.slice(0, 60) + "…" : m.body;
  if (m.emoji) return "이모티콘";
  if (m.puzzle_no != null) return "퍼즐 #" + m.puzzle_no;
  if (m.review_id != null) return "리뷰 공유";
  if (m.legacy_slot != null) return "유산 공유";
  if (m.poll) return "수 투표";
  if (m.cobo) return "같이 보기 보드";
  return "메시지";
}

// ---- 말풍선 위 답장 인용 — 누르면 원문으로 이동. ----
export function ReplyQuote({ target, authorName, mine, onJump }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onJump && onJump(); }} onMouseDown={stop} onTouchStart={stop} className="press"
      style={{ display: "block", maxWidth: "min(50vw, 300px)", textAlign: "left", margin: mine ? "0 0 3px auto" : "0 0 3px 0", padding: "4px 9px", borderRadius: 9, cursor: "pointer",
        background: "rgba(90,58,34,.07)", border: "none", borderLeft: "3px solid " + T.brass, color: T.inkSoft, fontSize: 10.5, lineHeight: 1.35 }}>
      <b style={{ color: T.ink, fontSize: 10 }}>{authorName}</b>
      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chatSnippet(target)}</span>
    </button>
  );
}

// ---- 입력창 위 "답장 중" 줄 ----
export function ReplyBar({ target, authorName, onCancel }) {
  return (
    <div className="flex items-center justify-between" style={{ gap: 8, marginBottom: 6, padding: "5px 10px", borderRadius: 8, background: "rgba(196,154,80,.12)", borderLeft: "3px solid " + T.brass }}>
      <span style={{ minWidth: 0, fontSize: 10.5, color: T.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <Reply size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} /><b style={{ color: T.ink }}>{authorName}</b>에게 답장 · {chatSnippet(target)}
      </span>
      <button onClick={onCancel} aria-label="답장 취소" className="press" style={{ background: "none", border: "none", color: T.inkSoft, cursor: "pointer", padding: 0, flexShrink: 0 }}><X size={14} /></button>
    </div>
  );
}

// ---- 가운데 모달 틀(신고·투표 만들기 공통) ----
function Sheet({ title, onClose, children, width = 360 }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} onMouseDown={stop} onTouchStart={stop}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(10,6,3,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <motion.div initial={{ opacity: 0, transform: "translateY(10px) scale(0.97)" }} animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
        onClick={stop} style={{ width: "100%", maxWidth: width, maxHeight: "90vh", overflowY: "auto", background: T.paper, borderRadius: 16, border: "1px solid #DCCBA8", padding: 16, boxShadow: "0 20px 50px -10px rgba(0,0,0,.6)" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{title}</span>
          <button onClick={onClose} aria-label="닫기" className="press" style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#0001", color: T.ink, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
const primaryBtn = (on = true) => ({ width: "100%", padding: "10px 0", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 13, cursor: on ? "pointer" : "default", opacity: on ? 1 : 0.5, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509" });

// ---- 신고 시트 — 사유 + 자세한 내용(선택) + "차단도 하기" ----
export function ReportSheet({ targetName, snippet, onSubmit, onClose, alreadyBlocked }) {
  const [reason, setReason] = useState(null);
  const [detail, setDetail] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(!alreadyBlocked);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true); setMsg("");
    const r = await onSubmit(reason, detail.trim(), alsoBlock);
    setBusy(false);
    if (r && r.ok) onClose();
    else setMsg(r && r.error === "limit" ? "오늘은 신고를 더 할 수 없어요(하루 20건)." : "신고를 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
  };
  return (
    <Sheet title={targetName + "님 신고"} onClose={onClose}>
      {snippet && <div style={{ fontSize: 11.5, color: T.inkSoft, padding: "7px 10px", borderRadius: 8, background: "#fff", border: "1px solid #E4D5B6", marginBottom: 10 }}>“{snippet}”</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {REPORT_REASONS.map((r) => (
          <button key={r.key} onClick={() => setReason(r.key)} className="press" aria-pressed={reason === r.key}
            style={{ textAlign: "left", padding: "9px 11px", borderRadius: 9, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: T.ink, background: reason === r.key ? "rgba(196,154,80,.2)" : "#fff", border: "1px solid " + (reason === r.key ? T.brass : "#E4D5B6") }}>{r.label}</button>
        ))}
      </div>
      <textarea value={detail} onChange={(e) => setDetail(e.target.value.slice(0, 500))} placeholder="자세한 내용(선택)" rows={3}
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", fontSize: 12, color: T.ink, resize: "vertical", fontFamily: "inherit", marginBottom: 8 }} />
      {!alreadyBlocked && (
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />이 사용자 차단하기(서로 메시지를 보낼 수 없어요)
        </label>
      )}
      {msg && <p style={{ fontSize: 11.5, color: T.blunder, fontWeight: 700, margin: "0 0 8px" }}>{msg}</p>}
      <button onClick={submit} disabled={!reason || busy} className="press" style={primaryBtn(!!reason && !busy)}>{busy ? "보내는 중…" : "신고하기"}</button>
      <p style={{ fontSize: 10.5, color: T.inkSoft, margin: "8px 0 0", lineHeight: 1.5 }}>신고한 메시지 내용은 검토를 위해 운영진에게 전달돼요. 상대에게는 알리지 않아요.</p>
    </Sheet>
  );
}

// ---- 대화 검색 줄 + 결과 ----
export function ChatSearchPanel({ onSearch, onPick, onClose, nameOf }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (!term) { setRes(null); return undefined; }
    const my = ++seq.current;
    const t = setTimeout(async () => { setBusy(true); const r = await onSearch(term); if (my === seq.current) { setRes(r); setBusy(false); } }, 280);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const mark = (text) => {
    const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
    if (i < 0) return text;
    return <>{text.slice(0, i)}<mark style={{ background: "rgba(236,203,134,.8)", color: "inherit", borderRadius: 3, padding: "0 1px" }}>{text.slice(i, i + q.trim().length)}</mark>{text.slice(i + q.trim().length)}</>;
  };
  return (
    <div style={{ marginBottom: 8, flexShrink: 0 }}>
      <div className="flex items-center gap-2">
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} color={T.inkSoft} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="대화 내용 검색" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 30px", borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", fontSize: 12.5, color: T.ink }} />
        </div>
        <button onClick={onClose} className="press" style={{ padding: "7px 10px", borderRadius: 9, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>닫기</button>
      </div>
      {q.trim() && (
        <div style={{ marginTop: 6, maxHeight: 180, overflowY: "auto", borderRadius: 10, border: "1px solid #E4D5B6", background: "#fff" }}>
          {busy && !res ? <div style={{ fontSize: 11.5, color: T.inkSoft, padding: 10 }}>찾는 중…</div>
            : res && res.length ? res.map((m) => (
              <button key={m.id} onClick={() => onPick(m)} className="press" style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", border: "none", borderBottom: "1px solid #F1E6D0", background: "transparent", cursor: "pointer" }}>
                <div style={{ fontSize: 10, color: T.inkSoft, fontWeight: 700 }}>{nameOf(m.from_uid)} · {new Date(m.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                <div style={{ fontSize: 12, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mark(m.body || "")}</div>
              </button>
            )) : <div style={{ fontSize: 11.5, color: T.inkSoft, padding: 10 }}>검색 결과가 없어요.</div>}
        </div>
      )}
    </div>
  );
}

// ---- 체스 코드 인식 — 텍스트 안의 FEN 또는 수순(1.e4 e5 …) ----
// 돌려주는 값: { kind: "fen", fen, root } | { kind: "moves", sans } | null
export function chessSnippetOf(text) {
  if (!text || text.length > 2000) return null;
  const f = FEN_IN_TEXT.exec(text);
  if (f) {
    const fen = [f[1], f[2] || "w", f[3] || "-", f[4] || "-", f[5] || "0", f[6] || "1"].join(" ");
    const root = parseFenFull(fen);
    if (root) {
      const flat = root.board.flat().filter(Boolean);
      if (flat.filter((p) => p.t === "K" && p.c === "w").length === 1 && flat.filter((p) => p.t === "K" && p.c === "b").length === 1) return { kind: "fen", fen, root };
    }
  }
  const mv = MOVETEXT_IN_TEXT.exec(text);
  if (mv) {
    const sans = parsePgnSans(mv[1]);
    if (sans.length >= 2 && sanSequenceValid(sans, null)) return { kind: "moves", sans };
  }
  return null;
}

// 포지션 정보 — root(FEN 시작) 또는 표준 시작 위치에서 sans만큼 둔 뒤의 보드·캐슬링 권리·앙파상·둘 차례.
export function chatPosInfo(root, sans) {
  const s = sans || [];
  if (root) { const r = replayFromFen(root, s); return { board: r.board, rights: r.rights, ep: r.ep, color: colorOfRoot(root, s.length) }; }
  return { board: boardFromSans(s), rights: replaySans(s).rights, ep: epTarget(s), color: s.length % 2 === 0 ? "w" : "b" };
}

// ---- 둘 수 있는 보드 — 클릭·드래그로 합법 수만 둔다(승진은 퀸). onMove(san) ----
export function ChatMoveBoard({ Board, root, sans, size = 220, interactive = true, onMove, flip, halo }) {
  const [sel, setSel] = useState(null);
  const info = useMemo(() => chatPosInfo(root, sans), [root, sans]);
  const targets = useMemo(() => (sel ? fenLegalDests(sel[0], sel[1], info.color, info.board, info.rights, info.ep) : []), [sel, info]);
  useEffect(() => { setSel(null); }, [root, (sans || []).join(" ")]); // eslint-disable-line react-hooks/exhaustive-deps
  const own = (sq) => { const p = info.board[sq[0]][sq[1]]; return p && p.c === info.color; };
  const tryMove = (sq) => {
    if (!sel || !targets.some(([r, c]) => r === sq[0] && c === sq[1])) return false;
    const san = buildSan(info.board, sel[0], sel[1], sq[0], sq[1], info.color, info.ep, "Q");
    setSel(null);
    if (san && onMove) onMove(san);
    return true;
  };
  // Board는 기물을 누르면(상대 기물 포함) 드래그 시작(onPieceDrag)으로, 떼면 그 칸 onDrop으로 알린다 — 제자리 놓기는 "선택 유지",
  // 이미 고른 기물의 합법 칸(잡을 상대 기물)을 누르는 건 선택을 바꾸지 않고 떼는 순간 그 수를 둔다.
  const onClick = (sq) => { if (!interactive) return; if (tryMove(sq)) return; setSel(own(sq) ? sq : null); };
  return (
    <Board board={info.board} flip={flip} size={size} showEval={false} showCoords={size >= 240} interactive={interactive}
      legalTargets={interactive ? targets : []} selected={interactive ? sel : null} haloSquares={halo || []}
      onSquareClick={onClick} onPieceDrag={interactive ? (sq) => { if (sel && targets.some(([r, c]) => r === sq[0] && c === sq[1])) return; setSel(own(sq) ? sq : null); } : undefined} onDrop={interactive ? (sq) => { if (sel && sq && sq[0] === sel[0] && sq[1] === sel[1]) return; if (!tryMove(sq)) setSel(null); } : undefined} />
  );
}

// ---- 텍스트 속 체스 코드 미리보기 카드 ----
export function ChessSnippetCard({ Board, snippet, onOpen }) {
  const sans = snippet.kind === "moves" ? snippet.sans : [];
  const root = snippet.kind === "fen" ? snippet.root : null;
  return (
    <div onMouseDown={stop} onTouchStart={stop} style={{ width: 196, marginTop: 4, padding: 6, borderRadius: 12, background: "#fff", border: "1px solid #E4D5B6", boxShadow: "0 3px 10px -5px rgba(0,0,0,.4)" }}>
      <ChatMoveBoard Board={Board} root={root} sans={sans} size={184} interactive={false} flip={root ? root.turn === "b" : false} />
      <div className="flex items-center justify-between" style={{ marginTop: 5, gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: T.inkSoft }}>{snippet.kind === "fen" ? "FEN 포지션 · " + (root.turn === "w" ? "백" : "흑") + " 차례" : Math.ceil(sans.length / 2) + "수 진행"}</span>
        <button onClick={onOpen} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "4px 8px", borderRadius: 7, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontSize: 10.5, fontWeight: 800, cursor: "pointer" }}>
          <ExternalLink size={11} />분석하기
        </button>
      </div>
    </div>
  );
}

// ---- 입력창 옆 "+" 메뉴 ----
export function ChatAttachMenu({ onPoll, onCobo, onClose, anchorStyle }) {
  useEffect(() => {
    const close = () => onClose();
    document.addEventListener("mousedown", close); document.addEventListener("touchstart", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); };
  }, [onClose]);
  return (
    <div onMouseDown={stop} onTouchStart={stop} style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 40, width: 220, padding: 6, borderRadius: 12, background: T.ebony2, border: "1px solid #000", boxShadow: "0 10px 24px -8px rgba(0,0,0,.6)", ...anchorStyle }}>
      <button onClick={onPoll} className="press" style={menuBtn}><BarChart3 size={14} />"여기서 뭐 둘래?" 수 투표</button>
      <button onClick={onCobo} className="press" style={menuBtn}><Users size={14} />같이 보기 보드</button>
    </div>
  );
}
export function AttachButton({ open, onClick }) {
  return (
    <button onClick={onClick} onMouseDown={stop} onTouchStart={stop} aria-label="더 보내기" aria-expanded={open} className="press"
      style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9, background: open ? T.brass : "#fff", color: open ? "#241509" : T.inkSoft, border: "1px solid #C9B58C", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <Plus size={17} style={{ transform: open ? "rotate(45deg)" : "none", transition: "transform .15s" }} />
    </button>
  );
}

// ---- 포지션 고르기 시트(투표·같이 보기 공통) — FEN을 붙여넣거나 시작 위치에서 직접 몇 수 둬서 정한다. ----
export function PositionPickSheet({ Board, title, cta, onSend, onClose }) {
  const [fenText, setFenText] = useState("");
  const [sans, setSans] = useState([]);
  const root = useMemo(() => { const t = fenText.trim(); return t ? parseFenFull(t) : null; }, [fenText]);
  const fenBad = !!fenText.trim() && !root;
  const fen = fenOfRoot(root, sans);
  useEffect(() => { setSans([]); }, [fenText]);
  return (
    <Sheet title={title} onClose={onClose} width={380}>
      <p style={{ fontSize: 11.5, color: T.inkSoft, margin: "0 0 8px", lineHeight: 1.5 }}>보드에서 직접 수를 두거나, FEN을 붙여넣어 포지션을 정하세요.</p>
      <input value={fenText} onChange={(e) => setFenText(e.target.value)} placeholder="FEN 붙여넣기(비우면 시작 위치)"
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: "1px solid " + (fenBad ? T.blunder : "#C9B58C"), background: "#fff", fontSize: 11.5, color: T.ink, marginBottom: 8, fontFamily: "ui-monospace,monospace" }} />
      {fenBad && <p style={{ fontSize: 11, color: T.blunder, fontWeight: 700, margin: "-4px 0 8px" }}>FEN 형식이 올바르지 않아요.</p>}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ChatMoveBoard Board={Board} root={root} sans={sans} size={300} onMove={(san) => setSans((s) => [...s, san])} flip={root ? root.turn === "b" : false} />
      </div>
      <div className="flex items-center justify-between" style={{ margin: "8px 0 12px", gap: 8 }}>
        <span style={{ fontSize: 10.5, color: T.inkSoft, fontWeight: 700 }}>{sans.length ? sans.length + "수 둠" : "그대로"} · {chatPosInfo(root, sans).color === "w" ? "백" : "흑"} 차례</span>
        <div className="flex gap-1">
          <button onClick={() => setSans((s) => s.slice(0, -1))} disabled={!sans.length} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "5px 8px", borderRadius: 7, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 11, fontWeight: 800, cursor: sans.length ? "pointer" : "default", opacity: sans.length ? 1 : 0.5 }}><Undo2 size={12} />무르기</button>
          <button onClick={() => setSans([])} disabled={!sans.length} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "5px 8px", borderRadius: 7, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 11, fontWeight: 800, cursor: sans.length ? "pointer" : "default", opacity: sans.length ? 1 : 0.5 }}><RotateCcw size={12} />처음</button>
        </div>
      </div>
      <button onClick={() => !fenBad && onSend(fen)} disabled={fenBad} className="press" style={primaryBtn(!fenBad)}>{cta}</button>
    </Sheet>
  );
}

// ---- "여기서 뭐 둘래?" 투표 카드 ----
// 내가 투표하기 전엔 결과를 숨기고 보드에서 수를 두면 그 수로 투표한다. 투표 뒤엔 수별 표·누가 골랐는지, "엔진 정답 보기"로
// 앱 엔진이 찾은 최선의 수를 공개한다(맞힌 표에 ✓). 다시 두면 표를 바꿀 수 있다.
export function PollCard({ Board, msg, votes, myUid, nameOf, onVote, engineBest, mine }) {
  const root = useMemo(() => parseFenFull(msg.poll && msg.poll.fen), [msg.poll && msg.poll.fen]);
  const [changing, setChanging] = useState(false);
  const [best, setBest] = useState(null); // null | "loading" | { san, evalTxt } | "error"
  const myVote = (votes || []).find((v) => v.uid === myUid);
  const tallies = useMemo(() => {
    const m = new Map();
    (votes || []).forEach((v) => { const t = m.get(v.san) || { san: v.san, uids: [] }; t.uids.push(v.uid); m.set(v.san, t); });
    return [...m.values()].sort((a, b) => b.uids.length - a.uids.length);
  }, [votes]);
  if (!root) return <div style={{ fontSize: 11.5, color: T.inkSoft, padding: 10, borderRadius: 12, background: "#fff", border: "1px solid #E4D5B6" }}>포지션을 읽을 수 없는 투표예요.</div>;
  const voting = !myVote || changing;
  const total = (votes || []).length;
  const reveal = async () => {
    if (!engineBest) return;
    setBest("loading");
    const r = await engineBest(root);
    setBest(r || "error");
  };
  return (
    <div onMouseDown={stop} onTouchStart={stop} style={{ width: 236, padding: 8, borderRadius: 14, background: "#fff", border: "1px solid #E4D5B6", boxShadow: "0 3px 10px -5px rgba(0,0,0,.4)" }}>
      <div className="flex items-center gap-1" style={{ fontSize: 11.5, fontWeight: 900, color: T.ink, marginBottom: 2 }}><BarChart3 size={13} color={T.brass} />여기서 뭐 둘래?</div>
      <div style={{ fontSize: 10, color: T.inkSoft, fontWeight: 700, marginBottom: 6 }}>{(root.turn === "w" ? "백" : "흑") + " 차례 · " + (voting ? "보드에서 수를 두면 투표돼요" : "투표 " + total + "표")}</div>
      <ChatMoveBoard Board={Board} root={root} sans={[]} size={220} interactive={voting} flip={root.turn === "b"} onMove={(san) => { setChanging(false); onVote(san); }} />
      {!voting && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {tallies.map((t) => {
            const pct = Math.round((t.uids.length / Math.max(1, total)) * 100);
            const isBest = best && typeof best === "object" && best.san === t.san;
            return (
              <div key={t.san} style={{ position: "relative", borderRadius: 7, overflow: "hidden", border: "1px solid " + (isBest ? T.best : "#E4D5B6") }}>
                <motion.div initial={{ transform: "scaleX(0)" }} animate={{ transform: "scaleX(" + pct / 100 + ")" }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.3, 1] }}
                  style={{ position: "absolute", inset: 0, transformOrigin: "left", background: isBest ? "rgba(63,122,58,.18)" : "rgba(196,154,80,.18)" }} />
                <div className="flex items-center justify-between" style={{ position: "relative", padding: "4px 8px", fontSize: 11.5, fontWeight: 800, color: T.ink }}>
                  <span>{t.san}{isBest && " ✓"} <span style={{ fontSize: 10, fontWeight: 700, color: T.inkSoft }}>{t.uids.map(nameOf).join(", ")}</span></span>
                  <span>{pct}%</span>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-1" style={{ marginTop: 2 }}>
            <button onClick={() => setChanging(true)} className="press" style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 10.5, fontWeight: 800, cursor: "pointer" }}>표 바꾸기</button>
            {engineBest && (
              <button onClick={reveal} disabled={best === "loading"} className="press" style={{ flex: 1.4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3, padding: "5px 0", borderRadius: 7, border: "none", background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontSize: 10.5, fontWeight: 800, cursor: "pointer" }}>
                <Cpu size={11} />{best === "loading" ? "계산 중…" : "엔진 정답 보기"}
              </button>
            )}
          </div>
          {best && typeof best === "object" && (
            <motion.div initial={{ opacity: 0, transform: "translateY(4px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }}
              style={{ fontSize: 11.5, fontWeight: 800, color: T.best, textAlign: "center", marginTop: 2 }}>
              엔진 최선의 수: {best.san} <span style={{ color: T.inkSoft, fontWeight: 700 }}>({best.evalTxt})</span>
              {myVote && <span style={{ display: "block", fontSize: 10.5, color: myVote.san === best.san ? T.best : T.inkSoft }}>{myVote.san === best.san ? "정답을 맞혔어요!" : "내 선택: " + myVote.san}</span>}
            </motion.div>
          )}
          {best === "error" && <div style={{ fontSize: 10.5, color: T.inkSoft, textAlign: "center" }}>엔진이 아직 준비되지 않았어요. 잠시 후 다시 눌러 주세요.</div>}
        </div>
      )}
      {mine && voting && myVote == null && total > 0 && <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 4 }}>{total}명이 투표했어요 — 나도 두면 결과가 보여요.</div>}
    </div>
  );
}

// ---- 같이 보기 초대 카드 ----
export function CoboCard({ msg, mine, otherName, onJoin }) {
  return (
    <div onMouseDown={stop} onTouchStart={stop} style={{ width: 220, padding: "10px 12px", borderRadius: 14, background: "linear-gradient(160deg,#3A2516,#241509)", border: "1px solid " + T.brass, color: T.ivoryHi, boxShadow: "0 3px 10px -5px rgba(0,0,0,.4)" }}>
      <div className="flex items-center gap-2" style={{ fontSize: 12.5, fontWeight: 900 }}><Users size={15} color={T.brassHi} />같이 보기 보드</div>
      <div style={{ fontSize: 11, color: "rgba(250,242,226,.75)", margin: "4px 0 9px", lineHeight: 1.45 }}>{mine ? otherName + "님과 한 보드를 같이 봐요 — 누가 두든 서로의 화면에 바로 보여요." : otherName + "님이 같이 보기 보드에 초대했어요."}</div>
      <button onClick={onJoin} className="press" style={{ width: "100%", padding: "7px 0", borderRadius: 9, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{mine ? "보드 열기" : "참여하기"}</button>
    </div>
  );
}

// ---- 같이 보기 화면 — Supabase Realtime broadcast 채널(cobo:<메시지 id>)로 수순을 주고받는다. DB에는 쓰지 않는다. ----
// 규칙: 누가 두든 "지금까지의 전체 수순"을 보내고 받은 쪽은 그대로 덮어쓴다(마지막에 둔 사람이 이긴다 — 두 사람이 동시에
// 두는 드문 경우도 한쪽 수순으로 곧 맞춰진다). 늦게 들어온 사람은 "state-req"를 보내고 먼저 있던 사람이 지금 수순으로 답한다.
export function CoBoardScreen({ Board, sbClient, msg, myUid, myName, otherName, onClose, onOpenAnalysis }) {
  const root = useMemo(() => (msg.cobo && msg.cobo.fen ? parseFenFull(msg.cobo.fen) : null), [msg.cobo && msg.cobo.fen]);
  const [sans, setSans] = useState((msg.cobo && msg.cobo.sans) || []);
  const [lastBy, setLastBy] = useState(null);
  const [peerHere, setPeerHere] = useState(false);
  const chanRef = useRef(null);
  const sansRef = useRef(sans);
  sansRef.current = sans;
  const [boardPx, setBoardPx] = useState(() => Math.max(240, Math.min(520, (typeof window !== "undefined" ? Math.min(window.innerWidth - 48, window.innerHeight - 260) : 320))));
  useEffect(() => {
    const onR = () => setBoardPx(Math.max(240, Math.min(520, Math.min(window.innerWidth - 48, window.innerHeight - 260))));
    window.addEventListener("resize", onR); return () => window.removeEventListener("resize", onR);
  }, []);
  useEffect(() => {
    if (!sbClient) return undefined;
    const ch = sbClient.channel("cobo:" + msg.id, { config: { broadcast: { self: false }, presence: { key: myUid } } });
    ch.on("broadcast", { event: "state" }, ({ payload }) => { if (payload && Array.isArray(payload.sans)) { setSans(payload.sans); setLastBy(payload.by || null); } });
    ch.on("broadcast", { event: "state-req" }, () => { ch.send({ type: "broadcast", event: "state", payload: { sans: sansRef.current, by: null } }); });
    ch.on("presence", { event: "sync" }, () => { const st = ch.presenceState(); setPeerHere(Object.keys(st).some((k) => k !== myUid)); });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") { ch.track({ at: Date.now() }); ch.send({ type: "broadcast", event: "state-req", payload: {} }); }
    });
    chanRef.current = ch;
    return () => { sbClient.removeChannel(ch); chanRef.current = null; };
  }, [sbClient, msg.id, myUid]);
  const push = useCallback((next) => {
    setSans(next); setLastBy(myUid);
    if (chanRef.current) chanRef.current.send({ type: "broadcast", event: "state", payload: { sans: next, by: myUid } });
  }, [myUid]);
  const info = chatPosInfo(root, sans);
  const movesTxt = sans.map((s, i) => { const ply = i + (root && root.turn === "b" ? 1 : 0); return (ply % 2 === 0 ? (Math.floor(ply / 2) + 1) + ". " : (i === 0 ? (Math.floor(ply / 2) + 1) + "... " : "")) + s; }).join(" ");
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={stop} onTouchStart={stop}
      style={{ position: "fixed", inset: 0, zIndex: 390, background: "linear-gradient(180deg,#F7EFDF 0%,#EDE0C6 100%)", display: "flex", flexDirection: "column", alignItems: "center", padding: "calc(env(safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 16px)", overflowY: "auto" }}>
      <div className="flex items-center justify-between" style={{ width: "100%", maxWidth: boardPx + 40, marginBottom: 10 }}>
        <button onClick={onClose} aria-label="닫기" className="press" style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,.55)", border: "1px solid rgba(90,58,34,.18)", color: T.ink, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>같이 보기</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: peerHere ? T.best : T.inkSoft }}>{peerHere ? "● " + otherName + "님도 보고 있어요" : "○ " + otherName + "님을 기다리는 중"}</div>
        </div>
        <span style={{ width: 32 }} />
      </div>
      <ChatMoveBoard Board={Board} root={root} sans={sans} size={boardPx} onMove={(san) => push([...sans, san])} flip={false} />
      <div style={{ width: "100%", maxWidth: boardPx + 40, marginTop: 10 }}>
        <div style={{ fontSize: 11, color: T.inkSoft, fontWeight: 700, marginBottom: 6, minHeight: 16 }}>
          {info.color === "w" ? "백" : "흑"} 차례{lastBy && sans.length ? " · 마지막 수: " + (lastBy === myUid ? (myName || "나") : otherName) : ""}
        </div>
        <div style={{ fontSize: 12, color: T.ink, fontFamily: "ui-monospace,monospace", background: "#fff", border: "1px solid #E4D5B6", borderRadius: 9, padding: "7px 10px", minHeight: 20, marginBottom: 10, wordBreak: "break-word" }}>{movesTxt || "아직 둔 수가 없어요 — 아무나 먼저 두세요."}</div>
        <div className="flex gap-2">
          <button onClick={() => push(sans.slice(0, -1))} disabled={!sans.length} className="press" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "9px 0", borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 12, fontWeight: 800, cursor: sans.length ? "pointer" : "default", opacity: sans.length ? 1 : 0.5 }}><Undo2 size={13} />무르기</button>
          <button onClick={() => push([])} disabled={!sans.length} className="press" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "9px 0", borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 12, fontWeight: 800, cursor: sans.length ? "pointer" : "default", opacity: sans.length ? 1 : 0.5 }}><RotateCcw size={13} />처음부터</button>
          <button onClick={() => onOpenAnalysis(root, sans)} className="press" style={{ flex: 1.3, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "9px 0", borderRadius: 9, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontSize: 12, fontWeight: 800, cursor: "pointer" }}><ExternalLink size={13} />분석 탭에서 열기</button>
        </div>
      </div>
    </motion.div>
  );
}

// 헤더 우측 버튼(검색·신고·차단) — 작은 아이콘 버튼 묶음.
export function ChatHeaderActions({ onSearch, onReport, blocked, onToggleBlock }) {
  const b = { width: 30, height: 30, borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.inkSoft, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  return (
    <div className="flex items-center gap-1" style={{ marginLeft: "auto" }}>
      <button onClick={onSearch} aria-label="대화 검색" title="대화 검색" className="press" style={b}><Search size={14} /></button>
      <button onClick={onReport} aria-label="신고" title="신고" className="press" style={b}><Flag size={14} /></button>
      <button onClick={onToggleBlock} aria-label={blocked ? "차단 해제" : "차단"} title={blocked ? "차단 해제" : "차단"} className="press" style={{ ...b, color: blocked ? T.blunder : T.inkSoft, borderColor: blocked ? T.blunder : "#C9B58C" }}><Ban size={14} /></button>
    </div>
  );
}

// ---- (v0.5.7, 사용자 요청 "명령어 체계 정리") 명령어 자동완성 — "/"를 치면 입력창 위에 뜬다. ↑↓로 고르고 Tab·Enter로 채운다. ----
export function ChatCommandPalette({ sugg, activeIdx, onPick, onHover }) {
  if (!sugg || sugg.mode === "none" || !sugg.items.length) return null;
  if (sugg.mode === "hint") {
    const c = sugg.items[0];
    return (
      <div style={{ marginBottom: 6, padding: "7px 11px", borderRadius: 10, background: "#fff", border: "1px solid #E4D5B6", fontSize: 11.5, color: T.inkSoft }}>
        <b style={{ color: T.ink, fontFamily: "ui-monospace,monospace" }}>{c.usage}</b> — {c.desc}
      </div>
    );
  }
  return (
    <div role="listbox" aria-label="명령어" onMouseDown={(e) => e.preventDefault()}
      style={{ marginBottom: 6, maxHeight: 220, overflowY: "auto", borderRadius: 12, background: "#fff", border: "1px solid #E4D5B6", boxShadow: "0 8px 20px -10px rgba(0,0,0,.35)", padding: 4 }}>
      {sugg.items.map((c, i) => (
        <button key={c.name} role="option" aria-selected={i === activeIdx} onClick={() => onPick(c)} onMouseEnter={() => onHover && onHover(i)} className="press"
          style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 9px", borderRadius: 8, border: "none", cursor: "pointer", background: i === activeIdx ? "rgba(196,154,80,.18)" : "transparent" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: T.ink, fontFamily: "ui-monospace,monospace" }}>{c.usage}</span>
          <span style={{ display: "block", fontSize: 10.5, color: T.inkSoft, marginTop: 1 }}>{c.desc}</span>
        </button>
      ))}
      <div style={{ fontSize: 9.5, color: T.inkSoft, padding: "4px 9px 2px" }}>↑↓ 고르기 · Tab/Enter 채우기 · Esc 닫기</div>
    </div>
  );
}

// ---- /help — 보내지 않고 나에게만 보이는 명령어 카드(무리별로) ----
export function ChatHelpCard({ commands, onPick, onClose }) {
  const groups = [];
  commands.forEach((c) => { let g = groups.find((x) => x.name === c.group); if (!g) { g = { name: c.group, items: [] }; groups.push(g); } g.items.push(c); });
  return (
    <div style={{ position: "relative", marginBottom: 6, padding: "10px 13px", borderRadius: 12, background: "#fff", border: "1px solid #E4D5B6", maxHeight: 260, overflowY: "auto" }}>
      <button onClick={onClose} aria-label="도움말 닫기" className="press" style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", color: T.inkSoft, cursor: "pointer", padding: 2 }}><X size={14} /></button>
      <div style={{ fontSize: 10, fontWeight: 800, color: T.brass, marginBottom: 2 }}>명령어 — 나에게만 보여요</div>
      {groups.map((g) => (
        <div key={g.name} style={{ marginTop: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: T.inkSoft, marginBottom: 2 }}>{g.name}</div>
          {g.items.map((c) => (
            <button key={c.name} onClick={() => onPick(c)} className="press" style={{ display: "block", width: "100%", textAlign: "left", padding: "3px 0", border: "none", background: "none", cursor: "pointer" }}>
              <b style={{ fontSize: 11.5, color: T.ink, fontFamily: "ui-monospace,monospace" }}>{c.usage}</b> <span style={{ fontSize: 11, color: T.inkSoft }}>— {c.desc}</span>
            </button>
          ))}
        </div>
      ))}
      <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 8, lineHeight: 1.5 }}>블라인드 대국 중에는 "2.Nf3", "2...Nc6"처럼 수순 번호를 붙여 수를 보내요.</div>
    </div>
  );
}
