// (v0.7.6, 사용자 요청) 소셜 탭(예전 퍼즐 탭) 피드 — 인스타그램 피드처럼 한 줄로 세로로 내려가는 게시물 카드.
//  · 게시물 두 종류: 퍼즐(정렬·필터가 적용된 퍼즐 피드 그대로) + 유산(모든 사용자의 공개 유산, 서버 social_legacy_feed RPC, 최신순).
//  · 섞는 규칙(mixFeed, lib/socialMix.js): 퍼즐 2개마다 유산 1개. 종류 토글(전체·퍼즐·유산)로 하나만 볼 수도 있다.
//  · 게시물 구성: 머리(프로필 원 + 이름 + 부제 + 종류 표시) → 정사각 미리보기 보드(가장자리까지) → 동작 줄(좋아요·리포스트·공유 / 오른쪽 풀기·재생) → 좋아요 수·캡션·날짜.
//  · 화면 아래에 닿으면 10개씩 더 그린다(IntersectionObserver). 유산은 다 그리면 서버에서 다음 묶음(p_before)을 읽는다.
import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { Heart, Repeat2, Send, Play, Puzzle as PuzzleIcon } from "../components/ocIcons.jsx";
import { badgeIcon } from "../components/badges.jsx";
import { AnimatedMove, Board, LineStars, GamePhaseBadge, puzzleNo, livePuzzleName, sortedThemesOf, themeAccentColor, themeAccentBg, solveCountText, puzzleTreeOf, treeLinesOf, starsOf, solvedLineTagsOf, firstNamedOpening, LEGACY_TYPES, legacyMoveLabel, LEGACY_FONT, FadeIn } from "./common.jsx";
import { parseFenFull } from "../lib/chessRules.js";
import { SB_ON, sbRpc, sbSelect } from "../lib/supabaseClient.js";
import { normalizeLegacyEntry } from "../lib/legacyEntry.js";
import { kindOfPost } from "../lib/legacyPosts.js";
import { LegacyFrame } from "../components/legacyFrame.jsx";
import { legacyLikeToggle } from "./profile.jsx";
import { mixFeed, FEED_KINDS } from "../lib/socialMix.js";
import { t, fmtDateOnly } from "../lib/i18n.js";

const PAGE = 10;
const INK = "#2A1B0E", SOFT = "#7A6648", LINE = "#D6C29A";
const THEME_LABEL = () => ({ sacrifice: t("기물 희생하기"), advantage: t("우위 점하기"), punish: t("실수 응징하기") });
const fmtDate = (ms) => (ms ? fmtDateOnly(ms, { year: "numeric", month: "2-digit", day: "2-digit" }) : "");

/* 서버의 유산 피드(최신순) — { posts: [{ owner, id, entry, savedAt, likes, ownerInfo }], more, loadMore, liked:Set("owner|id"), setLiked, setLikes } */
function useLegacyFeed(viewerUid, enabled) {
  const [posts, setPosts] = useState([]), [more, setMore] = useState(true), [loading, setLoading] = useState(false);
  const [liked, setLiked] = useState(() => new Set());
  const busy = useRef(false);
  const load = async (before) => {
    if (!SB_ON || busy.current) return;
    busy.current = true; setLoading(true);
    try {
      const r = await sbRpc("social_legacy_feed", { p_limit: 24, p_before: before == null ? null : before });
      const owners = (r && r.owners) || {};
      const got = ((r && r.posts) || []).map((x) => {
        const entry = normalizeLegacyEntry(x.entry);
        const kind = entry ? kindOfPost(x.id, entry) : null;
        return entry && kind ? { owner: x.owner, id: x.id, entry: { ...entry, savedAt: x.savedAt || entry.savedAt || null }, kind, likes: x.likes || 0, savedAt: x.savedAt || null, ownerInfo: owners[x.owner] || {} } : null;
      }).filter(Boolean);
      setPosts((prev) => { const seen = new Set(prev.map((p) => p.owner + "|" + p.id)); return [...prev, ...got.filter((p) => !seen.has(p.owner + "|" + p.id))]; });
      setMore(((r && r.posts) || []).length >= 24);
      if (viewerUid && got.length) {
        const ownersIn = [...new Set(got.map((p) => p.owner))].slice(0, 40);
        try {
          const rows = await sbSelect("legacy_likes?uid=eq." + encodeURIComponent(viewerUid) + "&owner_uid=in.(" + ownersIn.map(encodeURIComponent).join(",") + ")&select=owner_uid,slot_key");
          setLiked((s) => { const n = new Set(s); (rows || []).forEach((x) => n.add(x.owner_uid + "|" + x.slot_key)); return n; });
        } catch { /* 좋아요 표시 없이 진행 */ }
      }
    } catch { setMore(false); }
    busy.current = false; setLoading(false);
  };
  useEffect(() => { setPosts([]); setMore(true); setLiked(new Set()); if (enabled) load(null); }, [viewerUid, enabled]);   // eslint-disable-line react-hooks/exhaustive-deps
  const loadMore = () => { if (!more || loading || !posts.length) return; const last = posts[posts.length - 1].savedAt; if (!last) { setMore(false); return; } load(last); };   // 저장 시각이 없는 옛 유산까지 왔으면 끝
  const toggleLike = viewerUid ? async (post) => {
    const k = post.owner + "|" + post.id, was = liked.has(k);
    setLiked((s) => { const n = new Set(s); if (was) n.delete(k); else n.add(k); return n; });
    setPosts((ps) => ps.map((p) => (p.owner === post.owner && p.id === post.id ? { ...p, likes: Math.max(0, p.likes + (was ? -1 : 1)) } : p)));
    const r = await legacyLikeToggle(post.owner, post.id, viewerUid);
    if (!r) { setLiked((s) => { const n = new Set(s); if (was) n.add(k); else n.delete(k); return n; }); setPosts((ps) => ps.map((p) => (p.owner === post.owner && p.id === post.id ? { ...p, likes: Math.max(0, p.likes + (was ? 1 : -1)) } : p))); return; }
    setLiked((s) => { const n = new Set(s); if (r.liked) n.add(k); else n.delete(k); return n; });
    setPosts((ps) => ps.map((p) => (p.owner === post.owner && p.id === post.id ? { ...p, likes: r.likes } : p)));
  } : null;
  return { posts, more, loading, loadMore, liked, toggleLike };
}

function useSquareWidth() {
  const ref = useRef(null); const [w, setW] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const m = () => { if (el.clientWidth) setW(el.clientWidth); };
    m();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(m); ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* 프로필 원 — 사진이 있으면 사진, 없으면 첫 글자. ring: 게시물 종류 색 고리(인스타그램 스토리 고리처럼) */
function Avatar({ name, photo, ring }) {
  return (
    <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: "50%", padding: 2, background: ring, flexShrink: 0, display: "inline-flex" }}>
      <span style={{ width: "100%", height: "100%", borderRadius: "50%", border: "2px solid " + T.ivoryHi, overflow: "hidden", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#241509", fontSize: 13, fontWeight: 900 }}>
        {photo ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (name || "?").slice(0, 1).toUpperCase()}
      </span>
    </span>
  );
}
const actBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, minWidth: 36, height: 36, background: "none", border: "none", cursor: "pointer", padding: 0 };
const ctaBtn = { display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 10, border: "none", background: T.ebony2, color: T.brassHi, fontSize: 12.5, fontWeight: 800, fontFamily: SITE_FONT, cursor: "pointer" };

/* 게시물 틀(공용) */
function PostShell({ head, media, actions, children, onOpen, label }) {
  return (
    <article aria-label={label} style={{ background: T.ivoryHi, borderRadius: 16, border: "1px solid " + LINE, boxShadow: "0 3px 0 #B59A6E", overflow: "hidden" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>{head}</header>
      <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} className="press" style={{ cursor: "pointer" }}>{media}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px 0" }}>{actions}</div>
      <div style={{ padding: "2px 14px 14px", display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </article>
  );
}

export function PuzzlePost({ p, creator, isSolved, onOpen, onOpenProfile, solveCount, solvedTags, friendSolverNames, isLiked, likeCount, onToggleLike, isReposted, repostCount, onToggleRepost, shareCount, onShare }) {
  const [ref, w] = useSquareWidth();
  const setupLen = (p.setupSans ? p.setupSans.length : 0) + 1;
  const hasPreview = !!(p.setupSans && p.mistakeSan);
  const fenRoot = useMemo(() => { if (!p.fen) return null; try { return parseFenFull(p.fen); } catch { return null; } }, [p.fen]);
  const fenOnly = hasPreview && (!p.setupSans || !p.setupSans.length) ? fenRoot : null;
  const tree = useMemo(() => puzzleTreeOf(p), [p.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const total = useMemo(() => treeLinesOf(tree).length, [tree]);
  const stars = isSolved ? 3 : starsOf(solvedLineTagsOf(p, solvedTags).size, total);
  const themes = sortedThemesOf(p), labels = THEME_LABEL();
  const opening = (p.setupSans && firstNamedOpening(p.setupSans)) || p.opening || "";
  const solvers = solveCountText(solveCount, friendSolverNames);
  return (
    <PostShell label={t("퍼즐 #{0}", puzzleNo(p.id))} onOpen={onOpen}
      head={<>
        <button type="button" onClick={() => creator && onOpenProfile && onOpenProfile(creator)} className="press" style={{ background: "none", border: "none", padding: 0, cursor: creator ? "pointer" : "default", display: "inline-flex" }}><Avatar name={creator || "O"} ring={themeAccentBg(themes)} /></button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 900, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{creator || "OpenChess"}</div>
          <div style={{ fontSize: 11, color: SOFT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opening}</div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, color: themeAccentColor(themes), fontFamily: SITE_FONT, flexShrink: 0 }}><PuzzleIcon size={14} color={themeAccentColor(themes)} />#{puzzleNo(p.id)}</span>
      </>}
      media={<div ref={ref} style={{ width: "100%", aspectRatio: "1 / 1", background: "rgba(0,0,0,.06)" }}>
        {hasPreview ? <AnimatedMove sans={p.setupSans} san={p.mistakeSan} size={w} loopMs={2400} flip={fenOnly ? fenOnly.turn === "w" : setupLen % 2 !== 0} fenRoot={fenOnly} />
          : fenRoot ? <Board board={fenRoot.board} flip={fenRoot.turn === "b"} size={w} showEval={false} showCoords={false} interactive={false} /> : null}
      </div>}
      actions={<>
        {onToggleLike && <button type="button" onClick={() => onToggleLike(p.id)} aria-label={t("좋아요")} aria-pressed={!!isLiked} className="press" style={actBtn}><Heart size={24} color={isLiked ? "#D9534F" : INK} fill={isLiked ? "#D9534F" : "none"} /></button>}
        {onToggleRepost && <button type="button" onClick={() => onToggleRepost(p.id)} aria-label={t("리포스트")} aria-pressed={!!isReposted} className="press" style={actBtn}><Repeat2 size={25} color={isReposted ? T.brilliant : INK} /></button>}
        {onShare && <button type="button" onClick={() => onShare(p)} aria-label={t("공유하기")} className="press" style={actBtn}><Send size={22} color={INK} /></button>}
        <span style={{ flex: 1 }} />
        <LineStars total={3} solved={stars} />
        <button type="button" onClick={onOpen} className="press" style={{ ...ctaBtn, marginLeft: 8 }}>{isSolved ? t("다시 풀기") : t("풀기")}</button>
      </>}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{t("좋아요 {0}개", likeCount || 0)}{repostCount ? " · " + t("리포스트 {0}회", repostCount) : ""}{shareCount ? " · " + t("공유 {0}회", shareCount) : ""}</div>
      <div style={{ fontSize: 13.5, color: INK, lineHeight: 1.45 }}><b style={{ fontWeight: 900 }}>{creator || "OpenChess"}</b> {livePuzzleName(p) || opening}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <GamePhaseBadge p={p} compact />
        {themes.map((k) => <span key={k} style={{ fontSize: 11, fontWeight: 800, color: themeAccentColor([k]) }}>#{labels[k] || k}</span>)}
      </div>
      {solvers && <div style={{ fontSize: 11.5, color: "#2E6E2E", fontWeight: 700 }}>{solvers}</div>}
    </PostShell>
  );
}

export function LegacyPost({ post, liked, onLike, onOpen, onOpenProfile }) {
  const [ref, w] = useSquareWidth();
  const { entry, kind, ownerInfo } = post;
  const info = LEGACY_TYPES.find((x) => x.key === kind);
  const name = ownerInfo.nickname || ownerInfo.username || "";
  const before = useMemo(() => entry.sans.slice(0, entry.moveIndex), [entry]);
  return (
    <PostShell label={t("유산 {0}", legacyMoveLabel(entry))} onOpen={onOpen}
      head={<>
        <button type="button" onClick={() => ownerInfo.username && onOpenProfile && onOpenProfile(ownerInfo.username)} className="press" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex" }}><Avatar name={name} photo={ownerInfo.photo} ring="linear-gradient(135deg,#F3D27A,#B8862E 55%,#20324D)" /></button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 900, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          <div style={{ fontSize: 11, color: SOFT }}>{t("유산")} · {info ? info.label : ""}</div>
        </div>
        <span style={{ flexShrink: 0, display: "inline-flex" }}>{badgeIcon(kind, 22)}</span>
      </>}
      media={<div style={{ background: "linear-gradient(160deg,#20324D 0%,#14213A 55%,#0C1424 100%)", padding: 14 }}>
        <div style={{ position: "relative", padding: 12 }}>
          <LegacyFrame />
          <div ref={ref} style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 6, overflow: "hidden" }}>
            <AnimatedMove sans={before} san={entry.sans[entry.moveIndex]} size={w} loopMs={2400} flip={entry.side === "b"} badge={kind} />
          </div>
        </div>
      </div>}
      actions={<>
        {onLike && <button type="button" onClick={onLike} aria-label={t("좋아요")} aria-pressed={!!liked} className="press" style={actBtn}><Heart size={24} color={liked ? "#D9534F" : INK} fill={liked ? "#D9534F" : "none"} /></button>}
        <button type="button" onClick={onOpen} aria-label={t("공유하기")} className="press" style={actBtn}><Send size={22} color={INK} /></button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onOpen} className="press" style={ctaBtn}><Play size={13} />{t("재생")}</button>
      </>}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{t("좋아요 {0}개", post.likes || 0)}</div>
      <div style={{ fontSize: 13.5, color: INK, lineHeight: 1.45 }}><b style={{ fontWeight: 900 }}>{name}</b> <span style={{ fontFamily: LEGACY_FONT, fontWeight: 900 }}>{legacyMoveLabel(entry)}</span>{entry.opening ? " · " + entry.opening : ""}</div>
      <div style={{ fontSize: 11, color: SOFT }}>{fmtDate(post.savedAt)}</div>
    </PostShell>
  );
}

/* puzzles: 정렬·필터가 끝난 퍼즐 목록, cardProps(p): PuzzleCard와 같은 좋아요·리포스트·공유 속성, creatorOf(p): 만든 사람 아이디
   onOpenPuzzle(p), onOpenLegacy({ mid, id }), onOpenProfile(username) */
export function SocialFeed({ puzzles, cardProps, creatorOf, solved, onOpenPuzzle, viewerUid, onOpenLegacy, onOpenProfile, kind, setKind }) {
  const lf = useLegacyFeed(viewerUid, kind !== "puzzle");
  const items = useMemo(() => mixFeed(puzzles, lf.posts, kind), [puzzles, lf.posts, kind]);
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { setShown(PAGE); }, [kind]);
  const sentinel = useRef(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      setShown((n) => n + PAGE);
      if (kind !== "puzzle" && lf.more) lf.loadMore();
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  });
  const list = items.slice(0, shown);
  const kindLabel = { all: t("전체"), puzzle: t("퍼즐"), legacy: t("유산") };
  return (
    <div>
      <div role="tablist" aria-label={t("게시물 종류")} style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {FEED_KINDS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className="press"
            style={{ height: 32, padding: "0 14px", borderRadius: 999, border: kind === k ? "none" : "1px solid #5A4630", background: kind === k ? T.brass : "rgba(0,0,0,.25)", color: kind === k ? "#241509" : T.ivory, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: SITE_FONT }}>{kindLabel[k]}</button>
        ))}
      </div>
      {!list.length ? (
        <div style={{ background: T.paper, border: "1px dashed #C9B58C", borderRadius: 14, padding: 22, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>{lf.loading ? t("불러오는 중…") : t("표시할 게시물 없음")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {list.map((it, i) => (
            <FadeIn key={it.key} index={i % PAGE} lift>
              {it.type === "puzzle"
                ? <PuzzlePost p={it.p} creator={creatorOf(it.p)} isSolved={solved.has(it.p.id)} onOpen={() => onOpenPuzzle(it.p)} onOpenProfile={onOpenProfile} {...cardProps(it.p)} />
                : <LegacyPost post={it.post} liked={lf.liked.has(it.post.owner + "|" + it.post.id)} onLike={lf.toggleLike ? () => lf.toggleLike(it.post) : null}
                    onOpen={() => it.post.ownerInfo.mid && onOpenLegacy && onOpenLegacy({ mid: it.post.ownerInfo.mid, id: it.post.id })} onOpenProfile={onOpenProfile} />}
            </FadeIn>
          ))}
        </div>
      )}
      <div ref={sentinel} style={{ height: 1 }} />
      {lf.loading && list.length > 0 && <div style={{ textAlign: "center", color: T.inkSoft, fontSize: 12, padding: 12 }}>{t("불러오는 중…")}</div>}
    </div>
  );
}
