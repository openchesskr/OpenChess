// (v0.7.4, 사용자 요청) 유산 게시물 피드 — 인스타그램 게시물처럼 보고(열기)·좋아요·저장(남의 게시물 보관)·채팅으로 보내기·삭제를 한다.
// 최선·유일·탁월 3칸 슬롯 대신 최대 200개 게시물(lib/legacyPosts.js). 금색 기하학적 외곽선 액자(LegacyFrame)로 장식한다.
// 내 저장함·삭제·보내기는 LegacyActionsCtx(App이 제공)로 받는다 — 프로필·성장 분석·친구 창 어디서든 같은 피드를 쓴다.
import React, { useState, useEffect, useMemo, useRef, useContext, createContext } from "react";
import { AnimatePresence } from "framer-motion";
import { Heart, Send, Bookmark, Trash2, Play, Link2, Check, X } from "lucide-react";
import { SB_ON, sbSelect } from "../lib/supabaseClient.js";
import { LegacyPlayer } from "../components/legacyPlayer.jsx";
import { SITE_URL } from "../lib/siteConfig.js";
import { normalizeLegacyEntry } from "../lib/legacyEntry.js";
import { T } from "../lib/theme.js";
import { t, fmtDateOnly } from "../lib/i18n.js";
import { QCOLOR } from "../lib/moveKinds.js";
import { badgeIcon } from "../components/badges.jsx";
import { LEGACY_TYPES, LegacyMiniBoard, legacyMoveLabel, LEGACY_FONT } from "./common.jsx";
import { LegacyRevealScreen, legacyLikeCounts, legacyLikedSlots, legacyLikeToggle } from "./profile.jsx";
import { LegacyShareSheet } from "./social.jsx";
import { listPosts, isSaved, normalizeSaved, kindOfPost, legacyPath } from "../lib/legacyPosts.js";
import { LegacyFrame, LEGACY_GOLD, LEGACY_GOLD_HI } from "../components/legacyFrame.jsx";

/* App이 내려 주는 동작: { saved: 저장함 목록, toggleSave({owner, ownerName, id, entry}), removeMine(id) } — 없으면 해당 버튼을 숨긴다. */
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
/* 링크 복사 — 클립보드 API가 막힌 환경에서는 임시 입력창으로 대신한다. */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fallthrough */ }
  try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); document.body.removeChild(ta); return !!ok; } catch { return false; }
}
function CopyLinkButton({ mid, id }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return undefined; const x = setTimeout(() => setDone(false), 1800); return () => clearTimeout(x); }, [done]);
  if (!mid) return null;
  return <button onClick={async () => { if (await copyText(SITE_URL + legacyPath(mid, id))) setDone(true); }} aria-label={t("링크 복사")} className="press" style={actBtn(done)}>{done ? <Check size={14} /> : <Link2 size={14} />}{done ? t("링크 복사됨") : t("링크")}</button>;
}

function PostCard({ id, entry, kind, ownerName, likeCount, liked, onLike, onOpen, onSend, onSave, saved, onDelete, armed, subtitle, ownerMid }) {
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
        {ownerMid && <CopyLinkButton mid={ownerMid} id={id} />}
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
  const { counts, liked: likedSet, toggle: likeToggle } = useLegacyLikes(ownerUid, viewerUid);
  const ownerMid = useOwnerMid(ownerUid);
  useEffect(() => { if (!arm) return undefined; const id = setTimeout(() => setArm(null), 3000); return () => clearTimeout(id); }, [arm]);
  const like = likeToggle;
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
            <PostCard key={p.id} id={p.id} entry={p.entry} kind={p.kind || "best"} ownerName={ownerName} likeCount={counts[p.id]} liked={likedSet.has(p.id)} onLike={like ? () => like(p.id) : null} ownerMid={ownerMid}
              onOpen={() => setOpen({ kind: p.kind || "best", entry: p.entry })}
              onSend={viewerUid ? () => setSending(p.id) : null}
              onSave={canSave ? () => ctx.toggleSave({ owner: ownerUid, ownerName, id: p.id, entry: p.entry }) : null} saved={canSave && isSaved(ctx.saved, ownerUid, p.id)}
              onDelete={isOwn && ctx && ctx.removeMine ? () => { if (arm === p.id) { ctx.removeMine(p.id); setArm(null); } else setArm(p.id); } : null} armed={arm === p.id} />
          ))}
        </div>
      )}
      {list.length > shown && <button className="press" onClick={() => setShown((n) => n + PAGE)} style={{ ...pillBtn(false), width: "100%", marginTop: 12, padding: "8px 11px" }}>{t("더 보기")} <span style={{ opacity: 0.65 }}>{list.length - shown}</span></button>}
      <AnimatePresence>
        {open && <LegacyRevealScreen typeInfo={LEGACY_TYPES.find((x) => x.key === open.kind) || LEGACY_TYPES[0]} entry={open.entry} onClose={() => setOpen(null)} />}
      </AnimatePresence>
      {sendPost && <LegacyShareSheet slotKey={sendPost.id} typeInfo={LEGACY_TYPES.find((x) => x.key === sendPost.kind) || LEGACY_TYPES[0]} entry={sendPost.entry} myUid={viewerUid} ownerUid={ownerUid} onClose={() => setSending(null)} onShared={() => {}} />}
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
                {viewerUid && <button onClick={() => setSending(true)} aria-label={t("유산 공유")} className="press" style={actBtn(false)}><Send size={14} />{t("보내기")}</button>}
                <CopyLinkButton mid={mid} id={id} />
                {canSave && <button onClick={() => ctx.toggleSave({ owner: st.owner, ownerName: st.name, id, entry: st.entry })} aria-pressed={isSaved(ctx.saved, st.owner, id)} className="press" style={actBtn(isSaved(ctx.saved, st.owner, id))}><Bookmark size={14} fill={isSaved(ctx.saved, st.owner, id) ? GOLD_HI : "none"} />{isSaved(ctx.saved, st.owner, id) ? t("저장됨") : t("저장")}</button>}
              </div>
              {!viewerUid && <p style={{ textAlign: "center", color: "#B9AC8C", fontSize: 12, marginTop: 14 }}>{t("로그인하면 좋아요·저장·보내기를 할 수 있음")}</p>}
            </>
          )}
      </div>
      {sending && st.kind && <LegacyShareSheet slotKey={id} typeInfo={info || LEGACY_TYPES[0]} entry={st.entry} myUid={viewerUid} ownerUid={st.owner} zIndex={350} onClose={() => setSending(false)} onShared={() => {}} />}
    </div>
  );
}
