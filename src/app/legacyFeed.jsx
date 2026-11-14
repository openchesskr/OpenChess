// (v0.7.4, 사용자 요청) 유산 게시물 피드 — 인스타그램 게시물처럼 보고(열기)·좋아요·저장(남의 게시물 보관)·채팅으로 보내기·삭제를 한다.
// 최선·유일·탁월 3칸 슬롯 대신 최대 200개 게시물(lib/legacyPosts.js). 금색 기하학적 외곽선 액자(LegacyFrame)로 장식한다.
// 내 리포스트함·삭제·공유는 LegacyActionsCtx(App이 제공)로 받는다 — 프로필·성장 분석·친구 창 어디서든 같은 피드를 쓴다.
import React, { useState, useEffect, useMemo, useRef, useContext, createContext, useLayoutEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Heart, Send, Repeat2, Trash2, X } from "../components/ocIcons.jsx";   // (v0.7.5) OpenChess 파셋 아이콘(예전 lucide 대체)
import { SB_ON, sbSelect, sbRpc } from "../lib/supabaseClient.js";
import { LegacyPlayer } from "../components/legacyPlayer.jsx";
import { SITE_URL } from "../lib/siteConfig.js";
import { normalizeLegacyEntry } from "../lib/legacyEntry.js";
import { T } from "../lib/theme.js";
import { t, tx, fmtDateOnly } from "../lib/i18n.js";
import { QCOLOR } from "../lib/moveKinds.js";
import { badgeIcon } from "../components/badges.jsx";
import { LEGACY_TYPES, AnimatedMove, FadeIn, legacyMoveLabel, LEGACY_FONT } from "./common.jsx";
import { SITE_FONT } from "../components/engineLines.jsx";
import { LegacyRevealScreen, legacyLikeCounts, legacyLikedSlots, legacyLikeToggle } from "./profile.jsx";
import { LegacyShareSheet } from "./social.jsx";
import { listPosts, isSaved, normalizeSaved, kindOfPost, legacyPath } from "../lib/legacyPosts.js";
import { LegacyFrame, LEGACY_GOLD, LEGACY_GOLD_HI } from "../components/legacyFrame.jsx";

/* App이 내려 주는 동작: { saved: 리포스트한 남의 게시물 목록, toggleSave({owner, ownerName, id, entry}), removeMine(id) } — 없으면 해당 버튼을 숨긴다. */
export const LegacyActionsCtx = createContext(null);
const GOLD = LEGACY_GOLD, GOLD_HI = LEGACY_GOLD_HI;

const actBtn = (on, danger) => ({ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 9px", borderRadius: 999, border: "1px solid " + (danger ? "rgba(255,138,122,.5)" : "rgba(212,175,95,.35)"), background: on ? "rgba(212,175,95,.18)" : "rgba(255,255,255,.04)", color: danger ? "#FF8A7A" : on ? GOLD_HI : "#D9CBA8", cursor: "pointer", fontSize: 12, fontWeight: 800, lineHeight: 1 });

/* 주인(ownerUid)의 게시물별 좋아요 수·내가 누른 것·토글(로그인했을 때만). 피드와 링크 페이지가 같이 쓴다. */
function useLegacyLikes(ownerUid, viewerUid) {
  const [counts, setCounts] = useState({}), [liked, setLiked] = useState(new Set());
  const inflight = useRef(new Set());
  useEffect(() => {
    let off = false; setCounts({}); setLiked(new Set());
    if (!ownerUid) return undefined;
    (async () => { const [c, l] = await Promise.all([legacyLikeCounts(ownerUid), legacyLikedSlots(ownerUid, viewerUid)]); if (!off) { setCounts(c); setLiked(l); } })();
    return () => { off = true; };
  }, [ownerUid, viewerUid]);
  const toggle = viewerUid && ownerUid ? (id) => {
    if (inflight.current.has(id)) return; inflight.current.add(id);
    const was = liked.has(id);
    setLiked((s) => { const n = new Set(s); if (was) n.delete(id); else n.add(id); return n; });
    setCounts((m) => ({ ...m, [id]: Math.max(0, (m[id] || 0) + (was ? -1 : 1)) }));
    legacyLikeToggle(ownerUid, id, viewerUid).then((r) => {
      if (!r) { setLiked((s) => { const n = new Set(s); if (was) n.add(id); else n.delete(id); return n; }); setCounts((m) => ({ ...m, [id]: Math.max(0, (m[id] || 0) + (was ? 1 : -1)) })); return; }
      setCounts((m) => ({ ...m, [id]: r.likes })); setLiked((s) => { if (s.has(id) === r.liked) return s; const n = new Set(s); if (r.liked) n.add(id); else n.delete(id); return n; });
    }).finally(() => inflight.current.delete(id));
  } : null;
  return { counts, liked, toggle };
}
/* 주인의 MID(공유 링크에 쓰는 고유 번호) — 공개 프로필 조회와 같은 profiles 테이블. */
function useOwnerMid(ownerUid) {
  const [mid, setMid] = useState("");
  useEffect(() => {
    if (!ownerUid || !SB_ON) { setMid(""); return undefined; }
    let off = false;
    sbSelect("profiles?id=eq." + encodeURIComponent(ownerUid) + "&select=mid&limit=1").then((rows) => { if (!off) setMid((rows && rows[0] && rows[0].mid) || ""); }).catch(() => {});
    return () => { off = true; };
  }, [ownerUid]);
  return mid;
}
const CARD_W = 230;   // 퍼즐 블록(SolvedPuzzlesBlock)과 같은 카드 폭
const plainBtn = { display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 };
/* 유산 카드 — 파란 바탕 + 금색 기하학 외곽선 액자. 배치는 퍼즐 카드(PuzzleCard)와 같다: 정사각 미리보기(AnimatedMove — 퍼즐과 같은 보드·기물 비율) ·
   보드 아래에 생성자명/날짜(따로) · 좋아요/리포스트와 공유 버튼. 퍼즐 블록처럼 한 줄 가로 스크롤(230px)로 놓인다. */
function PostCard({ entry, kind, creator, likeCount, liked, onLike, onOpen, onShare, onRepost, reposted, repostCount, onDelete, armed }) {
  const info = LEGACY_TYPES.find((x) => x.key === kind);
  const wrapRef = useRef(null); const [boardW, setBoardW] = useState(190);
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return undefined;
    const measure = () => { if (el.clientWidth) setBoardW(el.clientWidth); };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();
  }, []);
  const before = useMemo(() => entry.sans.slice(0, entry.moveIndex), [entry]);
  const san = entry.sans[entry.moveIndex];
  const date = entry.savedAt ? fmtDateOnly(entry.savedAt, { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
  const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
  const mute = "#B9AC8C";
  return (
    <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} aria-label={t("{0} (눌러서 재생)", info ? info.label : "")} className="press text-left"
      style={{ borderRadius: 14, padding: "12px 12px 12px", background: "linear-gradient(160deg,#20324D 0%,#14213A 55%,#0C1424 100%)", boxShadow: "0 8px 18px -10px rgba(0,0,0,.7), 0 3px 0 #070B14", border: "1px solid rgba(212,175,95,.35)", cursor: "pointer", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", width: "100%", boxSizing: "border-box" }}>
      {onDelete && <button onClick={stop(onDelete)} aria-label={t("삭제")} title={armed ? t("한 번 더 누르면 삭제") : t("삭제")} className="press" style={{ position: "absolute", top: 8, right: 8, zIndex: 10, height: 22, minWidth: 22, padding: armed ? "0 7px" : 0, borderRadius: 7, background: armed ? "#C8453B" : "rgba(0,0,0,.45)", color: armed ? "#fff" : "#FF8A7A", border: armed ? "none" : "1px solid rgba(255,138,122,.4)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 10, fontWeight: 800 }}><Trash2 size={12} />{armed ? t("삭제") : null}</button>}
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: onDelete ? "0 28px 8px 2px" : "0 2px 8px" }}>
        <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.35)", border: "1px solid " + GOLD }}>{badgeIcon(kind, 19)}</span>
        <span style={{ fontFamily: LEGACY_FONT, fontWeight: 900, fontSize: 14, color: "#F3E7C9", textShadow: "0 1px 0 rgba(0,0,0,.8)", whiteSpace: "nowrap" }}>{legacyMoveLabel(entry)}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{info ? info.label : ""}</span>
      </div>
      {/* 금색 기하학 액자 안의 미리보기 */}
      <div style={{ position: "relative", padding: 12, marginBottom: 8 }}>
        <LegacyFrame />
        <div ref={wrapRef} style={{ width: "100%", aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, overflow: "hidden" }}>
          <AnimatedMove sans={before} san={san} size={boardW} loopMs={2400} flip={entry.side === "b"} badge={kind} />
        </div>
      </div>
      {/* 생성자명과 날짜 — 따로, 보드 아래 */}
      <div className="flex items-center justify-between" style={{ flexShrink: 0, gap: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#F3E7C9", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{creator || ""}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: mute, fontFamily: SITE_FONT, flexShrink: 0 }}>{date}</span>
      </div>
      {/* 좋아요·리포스트 / 공유 — 퍼즐 카드와 같은 배치 */}
      <div className="flex items-center justify-between" style={{ marginTop: "auto", paddingTop: 9, gap: 10, flexShrink: 0 }}>
        <div className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
          {likeCount !== undefined && (onLike
            ? <button onClick={stop(onLike)} aria-label={t("좋아요")} aria-pressed={!!liked} className="press" style={plainBtn}><Heart size={16} color={liked ? "#E5645F" : mute} fill={liked ? "#E5645F" : "none"} /><span style={{ fontSize: 11.5, fontWeight: 800, color: liked ? "#E5645F" : mute }}>{likeCount || 0}</span></button>
            : <span style={{ ...plainBtn, cursor: "default" }}><Heart size={16} color={mute} /><span style={{ fontSize: 11.5, fontWeight: 800, color: mute }}>{likeCount || 0}</span></span>)}
          {onRepost ? <button onClick={stop(onRepost)} aria-label={t("리포스트")} title={t("리포스트")} aria-pressed={!!reposted} className="press" style={plainBtn}><Repeat2 size={17} color={reposted ? "#3FD0BF" : mute} /><span style={{ fontSize: 11.5, fontWeight: 800, color: reposted ? "#3FD0BF" : mute }}>{repostCount || 0}</span></button>
            : repostCount !== undefined && <span style={{ ...plainBtn, cursor: "default" }}><Repeat2 size={17} color={mute} /><span style={{ fontSize: 11.5, fontWeight: 800, color: mute }}>{repostCount || 0}</span></span>}
        </div>
        {onShare && <button onClick={stop(onShare)} aria-label={t("공유하기")} title={t("공유하기")} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 13px", borderRadius: 8, border: "1px solid " + T.brass, background: T.ebony2, color: T.brass, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>{tx("{0}공유", <Send size={13} color={T.brass} />)}</button>}
      </div>
    </div>
  );
}

/* 리포스트 수 — 게시물별로 몇 명이 리포스트했는지(서버 legacy_repost_counts). 키는 "주인uid|게시물아이디". 여러 주인의 것을 한 번에 읽는다. */
async function legacyRepostCounts(ownerUids) {
  const ids = [...new Set((ownerUids || []).filter(Boolean))].slice(0, 50);
  if (!SB_ON || !ids.length) return {};
  try {
    const rows = await sbSelect("legacy_repost_counts?owner_uid=in.(" + ids.map(encodeURIComponent).join(",") + ")&select=owner_uid,slot_key,reposts");
    const m = {}; (rows || []).forEach((x) => { m[x.owner_uid + "|" + x.slot_key] = x.reposts; }); return m;
  } catch { return {}; }
}
async function legacyRepostToggle(ownerUid, slotKey) {
  if (!SB_ON || !ownerUid || !slotKey) return null;
  try { const r = await sbRpc("legacy_repost_toggle", { p_owner_uid: ownerUid, p_slot_key: slotKey }); const row = Array.isArray(r) ? r[0] : r; return row ? { reposted: !!row.reposted, reposts: row.reposts || 0 } : null; }
  catch { return null; }
}
function useRepostCounts(ownerUids) {
  const key = [...new Set((ownerUids || []).filter(Boolean))].sort().join(",");
  const [counts, setCounts] = useState({});
  useEffect(() => {
    let off = false;
    legacyRepostCounts(key ? key.split(",") : []).then((m) => { if (!off) setCounts(m); });
    return () => { off = true; };
  }, [key]);
  return [counts, setCounts];
}
/* 리포스트 토글 — 내 리포스트함(로컬 목록)을 바꾸고 서버 집계도 맞춘다. 서버와 어긋나 있었으면 한 번 더 눌러 맞춘다. */
export async function doRepost(ctx, { owner, ownerName, id, entry }, was, setCounts) {
  ctx.toggleSave({ owner, ownerName, id, entry });
  let r = await legacyRepostToggle(owner, id);
  if (r && r.reposted === was) r = await legacyRepostToggle(owner, id);
  if (r) setCounts((m) => ({ ...m, [owner + "|" + id]: r.reposts }));
}
/* 공유 시트 — 주인의 MID를 읽어 공유 링크(openchess.kr/legacy/<MID>-<아이디>)를 함께 보여 준다. */
function ShareWithLink({ item, viewerUid, zIndex, onClose }) {
  const mid = useOwnerMid(item.owner);
  return <LegacyShareSheet slotKey={item.id} typeInfo={LEGACY_TYPES.find((x) => x.key === item.kind) || LEGACY_TYPES[0]} entry={item.entry} myUid={viewerUid} ownerUid={item.owner} zIndex={zIndex} link={mid ? SITE_URL + legacyPath(mid, item.id) : null} onClose={onClose} onShared={() => {}} />;
}
const PAGE = 12;   // 한 줄 가로 스크롤에서 한 번에 그리는 카드 수 — 카드마다 보드 애니메이션이 있어 처음에는 일부만 그리고 끝의 "더 보기"로 늘린다.
const kindFromId = (id) => (LEGACY_TYPES.find((x) => x.key === (id.endsWith("2") ? id.slice(0, -1) : id)) || {}).key || "best";
/* legacies: 공개 프로필의 { 아이디: 항목 }(검증 전 원본). isOwn이면 삭제와 리포스트 탭을 쓴다. 퍼즐 블록(SolvedPuzzlesBlock)처럼 한 줄 가로 스크롤. */
export default function LegacyFeed({ legacies, ownerUid, ownerName, viewerUid, isOwn, flush }) {
  const ctx = useContext(LegacyActionsCtx);
  const posts = useMemo(() => listPosts(legacies), [legacies]);
  const reposts = useMemo(() => normalizeSaved(ctx && ctx.saved), [ctx]);
  const [tab, setTab] = useState("posts"), [shown, setShown] = useState(PAGE), [open, setOpen] = useState(null), [sending, setSending] = useState(null), [arm, setArm] = useState(null);
  const { counts, liked: likedSet, toggle: like } = useLegacyLikes(ownerUid, viewerUid);
  const [rpCounts, setRpCounts] = useRepostCounts([ownerUid, ...reposts.map((r) => r.owner)]);
  useEffect(() => { if (!arm) return undefined; const id = setTimeout(() => setArm(null), 3000); return () => clearTimeout(id); }, [arm]);
  const canRepost = !!(ctx && ctx.toggleSave && viewerUid && !isOwn);
  if (!posts.length && !isOwn) return null;
  const showTabs = isOwn && !!(ctx && ctx.toggleSave);
  const list = tab === "reposts" ? reposts : posts;
  const pillBtn = (on) => ({ padding: "5px 12px", borderRadius: 999, border: "1px solid " + (on ? "#A8842F" : "#DCCBA8"), background: on ? "linear-gradient(180deg,#ECCB86,#C49A50)" : "rgba(255,255,255,.45)", color: on ? "#2A1B08" : T.ink, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" });
  const cardBox = { width: CARD_W, minWidth: CARD_W, flexShrink: 0, display: "flex" };
  return (
    <div style={{ padding: flush ? 0 : "0 16px 14px" }}>
      {showTabs && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button className="press" onClick={() => { setTab("posts"); setShown(PAGE); }} aria-pressed={tab === "posts"} style={pillBtn(tab === "posts")}>{t("게시물")} {posts.length}</button>
          <button className="press" onClick={() => { setTab("reposts"); setShown(PAGE); }} aria-pressed={tab === "reposts"} style={pillBtn(tab === "reposts")}>{t("리포스트")} {reposts.length}</button>
        </div>
      )}
      {!list.length ? (
        <p style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.6, margin: 0 }}>{tab === "reposts" ? t("다른 사람의 유산 게시물을 리포스트하면 여기에 모임") : t("내 대국을 리뷰하다가 최선·유일·탁월 수에서 유산으로 남기기를 누르면 게시물로 쌓임")}</p>
      ) : (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
          {list.slice(0, shown).map((p, i) => tab === "reposts" ? (
            <FadeIn key={p.owner + "|" + p.id} index={i} lift style={cardBox}>
              <PostCard entry={p.entry} kind={p.entry.kind || kindFromId(p.id)} creator={p.ownerName}
                onOpen={() => setOpen({ kind: p.entry.kind || kindFromId(p.id), entry: p.entry })} onRepost={() => doRepost(ctx, p, true, setRpCounts)} repostCount={rpCounts[p.owner + "|" + p.id] || 0} reposted
                onShare={viewerUid ? () => setSending({ id: p.id, owner: p.owner, entry: p.entry, kind: p.entry.kind || kindFromId(p.id) }) : null} />
            </FadeIn>
          ) : (
            <FadeIn key={p.id} index={i} lift style={cardBox}>
              <PostCard entry={p.entry} kind={p.kind || "best"} creator={ownerName} likeCount={counts[p.id] || 0} liked={likedSet.has(p.id)} onLike={like ? () => like(p.id) : null}
                onOpen={() => setOpen({ kind: p.kind || "best", entry: p.entry })}
                onShare={viewerUid ? () => setSending({ id: p.id, owner: ownerUid, entry: p.entry, kind: p.kind || "best" }) : null}
                onRepost={canRepost ? () => doRepost(ctx, { owner: ownerUid, ownerName, id: p.id, entry: p.entry }, isSaved(ctx.saved, ownerUid, p.id), setRpCounts) : null} reposted={canRepost && isSaved(ctx.saved, ownerUid, p.id)} repostCount={rpCounts[ownerUid + "|" + p.id] || 0}
                onDelete={isOwn && ctx && ctx.removeMine ? () => { if (arm === p.id) { ctx.removeMine(p.id); setArm(null); } else setArm(p.id); } : null} armed={arm === p.id} />
            </FadeIn>
          ))}
          {list.length > shown && (
            <div style={{ width: 120, minWidth: 120, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <button className="press" onClick={() => setShown((n) => n + PAGE)} style={{ ...pillBtn(false), padding: "8px 14px" }}>{t("더 보기")} <span style={{ opacity: 0.65 }}>{list.length - shown}</span></button>
            </div>
          )}
        </div>
      )}
      <AnimatePresence>
        {open && <LegacyRevealScreen typeInfo={LEGACY_TYPES.find((x) => x.key === open.kind) || LEGACY_TYPES[0]} entry={open.entry} onClose={() => setOpen(null)} />}
      </AnimatePresence>
      {sending && <ShareWithLink item={sending} viewerUid={viewerUid} onClose={() => setSending(null)} />}
    </div>
  );
}

/* 공유 링크(openchess.kr/legacy/<MID>-<아이디>)로 여는 게시물 페이지 — 로그인 없이도 볼 수 있다. 좋아요·저장·보내기는 로그인했을 때만. */
export function LegacyPostPage({ mid, id, viewerUid, onClose, onOpenProfile }) {
  const ctx = useContext(LegacyActionsCtx);
  const [st, setSt] = useState({ loading: true });
  useEffect(() => {
    let off = false; setSt({ loading: true });
    (async () => {
      if (!SB_ON) { setSt({ missing: true }); return; }
      try {
        const rows = await sbSelect("profiles?mid=eq." + encodeURIComponent(mid) + "&select=id,username,pub,mid&limit=1");
        const row = rows && rows[0]; const pub = (row && row.pub) || {};
        const entry = normalizeLegacyEntry(pub.legacies && pub.legacies[id]);   // 남이 쓴 값이라 검증 후에만
        const kind = entry ? kindOfPost(id, entry) : null;
        if (!off) setSt(row && entry && kind ? { owner: row.id, name: pub.nickname || pub.displayId || row.username || "", entry, kind } : { missing: true });
      } catch { if (!off) setSt({ missing: true }); }
    })();
    return () => { off = true; };
  }, [mid, id]);
  const { counts, liked, toggle } = useLegacyLikes(st.owner, viewerUid);
  const [rpCounts, setRpCounts] = useRepostCounts([st.owner]);
  const [sending, setSending] = useState(false);
  const isOwn = !!(viewerUid && st.owner && viewerUid === st.owner);
  const canSave = !!(ctx && ctx.toggleSave && viewerUid && !isOwn);
  const info = st.kind ? LEGACY_TYPES.find((x) => x.key === st.kind) : null;
  useEffect(() => { const h = (e) => { if (e.key === "Escape" && !sending) onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose, sending]);
  return (
    <div role="dialog" aria-modal="true" aria-label={t("유산")} style={{ position: "fixed", inset: 0, zIndex: 300, overflowY: "auto", background: "radial-gradient(120% 90% at 50% 15%, #34230F 0%, #0A0603 72%)", padding: "14px 12px 40px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 2px 10px" }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 900, color: T.ivoryHi, letterSpacing: ".02em" }}>OpenChess</span>
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(212,175,95,.4)", background: "rgba(255,255,255,.05)", color: GOLD_HI, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}><X size={16} /></button>
        </div>
        {st.loading ? <p style={{ color: "#B9AC8C", fontSize: 13, textAlign: "center", padding: "60px 0" }}>{t("불러오는 중…")}</p>
          : st.missing ? <p style={{ color: "#D9CBA8", fontSize: 13.5, textAlign: "center", padding: "60px 0", lineHeight: 1.7 }}>{t("삭제되었거나 존재하지 않는 유산임")}</p>
          : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px 4px" }}>
                <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", border: "1px solid " + GOLD }}>{badgeIcon(st.kind, 22)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: "#F3E7C9" }}>{info ? info.label : ""}</div>
                  <button onClick={() => onOpenProfile && onOpenProfile(mid)} className="press" style={{ border: "none", background: "none", padding: 0, cursor: onOpenProfile ? "pointer" : "default", color: "#B9AC8C", fontSize: 11.5, textAlign: "left" }}>{st.name}{st.entry.savedAt ? " · " + fmtDateOnly(st.entry.savedAt, { year: "numeric", month: "2-digit", day: "2-digit" }) : ""}</button>
                </div>
              </div>
              <LegacyPlayer kind={st.kind} entry={st.entry} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 14 }}>
                {toggle ? <button onClick={() => toggle(id)} aria-pressed={liked.has(id)} aria-label={t("유산 좋아요")} className="press" style={actBtn(liked.has(id))}><Heart size={14} fill={liked.has(id) ? GOLD_HI : "none"} />{counts[id] || 0}</button>
                  : <span style={{ ...actBtn(false), cursor: "default" }}><Heart size={14} />{counts[id] || 0}</span>}
                <button onClick={() => setSending(true)} aria-label={t("공유하기")} className="press" style={actBtn(false)}><Send size={14} />{t("공유하기")}</button>
                {/* 링크 복사·친구에게 보내기는 공유 시트에 있다 */}
                {canSave ? <button onClick={() => doRepost(ctx, { owner: st.owner, ownerName: st.name, id, entry: st.entry }, isSaved(ctx.saved, st.owner, id), setRpCounts)} aria-pressed={isSaved(ctx.saved, st.owner, id)} aria-label={t("리포스트")} className="press" style={actBtn(isSaved(ctx.saved, st.owner, id))}><Repeat2 size={14} />{rpCounts[st.owner + "|" + id] || 0}</button>
                  : st.owner && <span style={{ ...actBtn(false), cursor: "default" }}><Repeat2 size={14} />{rpCounts[st.owner + "|" + id] || 0}</span>}
              </div>
              {!viewerUid && <p style={{ textAlign: "center", color: "#B9AC8C", fontSize: 12, marginTop: 14 }}>{t("로그인하면 좋아요·리포스트·친구에게 보내기를 할 수 있음")}</p>}
            </>
          )}
      </div>
      {sending && st.kind && <ShareWithLink item={{ id, owner: st.owner, entry: st.entry, kind: st.kind }} viewerUid={viewerUid} zIndex={350} onClose={() => setSending(false)} />}
    </div>
  );
}
