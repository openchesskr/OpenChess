// (v0.7.4, 사용자 요청) 유산 게시물 피드 — 인스타그램 게시물처럼 보고(열기)·좋아요·저장(남의 게시물 보관)·채팅으로 보내기·삭제를 한다.
// 최선·유일·탁월 3칸 슬롯 대신 최대 200개 게시물(lib/legacyPosts.js). 금색 기하학적 외곽선 액자(LegacyFrame)로 장식한다.
// 내 저장함·삭제·보내기는 LegacyActionsCtx(App이 제공)로 받는다 — 프로필·성장 분석·친구 창 어디서든 같은 피드를 쓴다.
import React, { useState, useEffect, useMemo, useRef, useContext, createContext } from "react";
import { AnimatePresence } from "framer-motion";
import { Heart, Send, Bookmark, Trash2, Play } from "lucide-react";
import { T } from "../lib/theme.js";
import { t, fmtDateOnly } from "../lib/i18n.js";
import { QCOLOR } from "../lib/moveKinds.js";
import { badgeIcon } from "../components/badges.jsx";
import { LEGACY_TYPES, LegacyMiniBoard, legacyMoveLabel, LEGACY_FONT } from "./common.jsx";
import { LegacyRevealScreen, legacyLikeCounts, legacyLikedSlots, legacyLikeToggle } from "./profile.jsx";
import { LegacyShareSheet } from "./social.jsx";
import { listPosts, isSaved, normalizeSaved } from "../lib/legacyPosts.js";

/* App이 내려 주는 동작: { saved: 저장함 목록, toggleSave({owner, ownerName, id, entry}), removeMine(id) } — 없으면 해당 버튼을 숨긴다. */
export const LegacyActionsCtx = createContext(null);
const GOLD = "#D4AF5F", GOLD_HI = "#ECCB86";

/* 금색 기하학 외곽선 액자 — 모서리를 깎은 이중선, 모서리 마름모, 변 가운데 마름모. 칸 크기에 맞춰 늘어나도 선 굵기는 그대로(non-scaling-stroke). */
export function LegacyFrame() {
  const c = 7;   // 모서리 깎기
  const outer = `M${c} 1 H${100 - c} L${99} ${c} V${100 - c} L${100 - c} 99 H${c} L1 ${100 - c} V${c} Z`;
  const k = 4;   // 안쪽선 간격
  const inner = `M${c + k} ${k} H${100 - c - k} L${100 - k} ${c + k} V${100 - c - k} L${100 - c - k} ${100 - k} H${c + k} L${k} ${100 - c - k} V${c + k} Z`;
  const dia = (x, y, r) => `M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y} Z`;
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
      <path d={outer} fill="none" stroke={GOLD} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <path d={inner} fill="none" stroke={GOLD} strokeWidth="0.8" opacity=".65" vectorEffect="non-scaling-stroke" />
      {[[c, 1], [100 - c, 1], [c, 99], [100 - c, 99], [1, c], [1, 100 - c], [99, c], [99, 100 - c]].map(([x, y], i) => <path key={i} d={dia(x, y, 1.3)} fill={GOLD_HI} />)}
      {[[50, 1], [50, 99]].map(([x, y], i) => <path key={"m" + i} d={dia(x, y, 2.2)} fill={GOLD_HI} stroke="#14213A" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

const actBtn = (on, danger) => ({ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 9px", borderRadius: 999, border: "1px solid " + (danger ? "rgba(255,138,122,.5)" : "rgba(212,175,95,.35)"), background: on ? "rgba(212,175,95,.18)" : "rgba(255,255,255,.04)", color: danger ? "#FF8A7A" : on ? GOLD_HI : "#D9CBA8", cursor: "pointer", fontSize: 12, fontWeight: 800, lineHeight: 1 });

function PostCard({ id, entry, kind, ownerName, likeCount, liked, onLike, onOpen, onSend, onSave, saved, onDelete, armed, subtitle }) {
  const info = LEGACY_TYPES.find((x) => x.key === kind);
  const color = QCOLOR[kind] || GOLD;
  return (
    <article style={{ position: "relative", borderRadius: 14, background: "linear-gradient(160deg,#20324D 0%,#14213A 55%,#0C1424 100%)", padding: "12px 12px 10px", boxShadow: "0 8px 18px -10px rgba(0,0,0,.7)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 9px" }}>
        <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.35)", border: "1px solid " + GOLD }}>{badgeIcon(kind, 20)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: LEGACY_FONT, fontWeight: 900, fontSize: 14, color: "#F3E7C9", lineHeight: 1.15, textShadow: "0 1px 0 rgba(0,0,0,.8)" }}>{legacyMoveLabel(entry)}</div>
          <div style={{ fontSize: 10.5, color: "#B9AC8C", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[info ? info.label : null, subtitle || ownerName, entry.savedAt ? fmtDateOnly(entry.savedAt, { year: "numeric", month: "2-digit", day: "2-digit" }) : null].filter(Boolean).join(" · ")}</div>
        </div>
        <button onClick={onOpen} className="press" aria-label={t("{0} (눌러서 재생)", info ? info.label : "")} style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: "rgba(12,20,36,.82)", border: "1px solid " + GOLD, color: GOLD_HI, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Play size={13} fill={GOLD_HI} /></button>
      </header>
      <button onClick={onOpen} className="press" aria-label={t("{0} (눌러서 재생)", info ? info.label : "")} style={{ position: "relative", display: "block", width: "100%", padding: 14, border: "none", background: "transparent", cursor: "pointer" }}>
        <LegacyFrame />
        <span style={{ display: "block", position: "relative" }}><LegacyMiniBoard entry={entry} color={color} /></span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 2px 0", flexWrap: "wrap" }}>
        {onLike ? <button onClick={onLike} aria-pressed={!!liked} aria-label={t("유산 좋아요")} className="press" style={actBtn(liked)}><Heart size={14} fill={liked ? GOLD_HI : "none"} />{likeCount || 0}</button>
          : <span style={{ ...actBtn(false), cursor: "default" }}><Heart size={14} />{likeCount || 0}</span>}
        {onSend && <button onClick={onSend} aria-label={t("유산 공유")} className="press" style={actBtn(false)}><Send size={14} />{t("보내기")}</button>}
        {onSave && <button onClick={onSave} aria-pressed={!!saved} aria-label={saved ? t("저장 해제") : t("저장")} className="press" style={{ ...actBtn(saved), marginLeft: onSend ? "auto" : 0 }}><Bookmark size={14} fill={saved ? GOLD_HI : "none"} />{saved ? t("저장됨") : t("저장")}</button>}
        {onDelete && <button onClick={onDelete} aria-label={t("삭제")} className="press" style={{ ...actBtn(false, true), marginLeft: onSend || onSave ? "auto" : 0 }}><Trash2 size={14} />{armed ? t("한 번 더 누르면 삭제") : t("삭제")}</button>}
      </div>
    </article>
  );
}

const PAGE = 4;
/* legacies: 공개 프로필의 { 아이디: 항목 }(검증 전 원본). isOwn이면 보내기·삭제·저장함 탭을 쓴다. */
export default function LegacyFeed({ legacies, ownerUid, ownerName, viewerUid, isOwn, flush }) {
  const ctx = useContext(LegacyActionsCtx);
  const posts = useMemo(() => listPosts(legacies), [legacies]);
  const savedList = useMemo(() => normalizeSaved(ctx && ctx.saved), [ctx]);
  const [tab, setTab] = useState("posts"), [shown, setShown] = useState(PAGE), [open, setOpen] = useState(null), [sending, setSending] = useState(null), [arm, setArm] = useState(null);
  const [counts, setCounts] = useState({}), [likedSet, setLikedSet] = useState(new Set());
  const inflight = useRef(new Set());
  useEffect(() => {
    let off = false; setCounts({}); setLikedSet(new Set());
    if (!ownerUid) return undefined;
    (async () => { const [c, l] = await Promise.all([legacyLikeCounts(ownerUid), legacyLikedSlots(ownerUid, viewerUid)]); if (!off) { setCounts(c); setLikedSet(l); } })();
    return () => { off = true; };
  }, [ownerUid, viewerUid]);
  useEffect(() => { if (!arm) return undefined; const id = setTimeout(() => setArm(null), 3000); return () => clearTimeout(id); }, [arm]);
  const like = viewerUid && ownerUid ? (id) => {
    if (inflight.current.has(id)) return; inflight.current.add(id);
    const was = likedSet.has(id);
    setLikedSet((s) => { const n = new Set(s); if (was) n.delete(id); else n.add(id); return n; });
    setCounts((m) => ({ ...m, [id]: Math.max(0, (m[id] || 0) + (was ? -1 : 1)) }));
    legacyLikeToggle(ownerUid, id, viewerUid).then((r) => {
      if (!r) { setLikedSet((s) => { const n = new Set(s); if (was) n.add(id); else n.delete(id); return n; }); setCounts((m) => ({ ...m, [id]: Math.max(0, (m[id] || 0) + (was ? 1 : -1)) })); return; }
      setCounts((m) => ({ ...m, [id]: r.likes })); setLikedSet((s) => { if (s.has(id) === r.liked) return s; const n = new Set(s); if (r.liked) n.add(id); else n.delete(id); return n; });
    }).finally(() => inflight.current.delete(id));
  } : null;
  const canSave = !!(ctx && ctx.toggleSave && viewerUid && !isOwn);
  if (!posts.length && !isOwn) return null;
  const showSavedTab = isOwn && !!(ctx && ctx.toggleSave);
  const list = tab === "saved" ? savedList : posts;
  const pillBtn = (on) => ({ padding: "5px 12px", borderRadius: 999, border: "1px solid " + (on ? "#A8842F" : "#DCCBA8"), background: on ? "linear-gradient(180deg,#ECCB86,#C49A50)" : "rgba(255,255,255,.45)", color: on ? "#2A1B08" : T.ink, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" });
  const sendPost = sending ? posts.find((p) => p.id === sending) : null;
  return (
    <div style={{ padding: flush ? 0 : "0 16px 14px" }}>
      {showSavedTab && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button className="press" onClick={() => { setTab("posts"); setShown(PAGE); }} aria-pressed={tab === "posts"} style={pillBtn(tab === "posts")}>{t("게시물")} {posts.length}</button>
          <button className="press" onClick={() => { setTab("saved"); setShown(PAGE); }} aria-pressed={tab === "saved"} style={pillBtn(tab === "saved")}>{t("저장함")} {savedList.length}</button>
        </div>
      )}
      {!list.length ? (
        <p style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.6, margin: 0 }}>{tab === "saved" ? t("다른 사람의 유산 게시물에서 저장을 누르면 여기에 모임") : t("내 대국을 리뷰하다가 최선·유일·탁월 수에서 유산으로 남기기를 누르면 게시물로 쌓임")}</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {list.slice(0, shown).map((p) => tab === "saved" ? (
            <PostCard key={p.owner + "|" + p.id} id={p.id} entry={p.entry} kind={p.entry.kind || (LEGACY_TYPES.find((x) => x.key === (p.id.endsWith("2") ? p.id.slice(0, -1) : p.id)) || {}).key || "best"} subtitle={p.ownerName}
              onOpen={() => setOpen({ kind: p.entry.kind || "best", entry: p.entry })} onSave={() => ctx.toggleSave({ owner: p.owner, ownerName: p.ownerName, id: p.id, entry: p.entry })} saved />
          ) : (
            <PostCard key={p.id} id={p.id} entry={p.entry} kind={p.kind || "best"} ownerName={ownerName} likeCount={counts[p.id]} liked={likedSet.has(p.id)} onLike={like ? () => like(p.id) : null}
              onOpen={() => setOpen({ kind: p.kind || "best", entry: p.entry })}
              onSend={isOwn && viewerUid ? () => setSending(p.id) : null}
              onSave={canSave ? () => ctx.toggleSave({ owner: ownerUid, ownerName, id: p.id, entry: p.entry }) : null} saved={canSave && isSaved(ctx.saved, ownerUid, p.id)}
              onDelete={isOwn && ctx && ctx.removeMine ? () => { if (arm === p.id) { ctx.removeMine(p.id); setArm(null); } else setArm(p.id); } : null} armed={arm === p.id} />
          ))}
        </div>
      )}
      {list.length > shown && <button className="press" onClick={() => setShown((n) => n + PAGE)} style={{ ...pillBtn(false), width: "100%", marginTop: 12, padding: "8px 11px" }}>{t("더 보기")} <span style={{ opacity: 0.65 }}>{list.length - shown}</span></button>}
      <AnimatePresence>
        {open && <LegacyRevealScreen typeInfo={LEGACY_TYPES.find((x) => x.key === open.kind) || LEGACY_TYPES[0]} entry={open.entry} onClose={() => setOpen(null)} />}
      </AnimatePresence>
      {sendPost && <LegacyShareSheet slotKey={sendPost.id} typeInfo={LEGACY_TYPES.find((x) => x.key === sendPost.kind) || LEGACY_TYPES[0]} entry={sendPost.entry} myUid={viewerUid} onClose={() => setSending(null)} onShared={() => {}} />}
    </div>
  );
}
