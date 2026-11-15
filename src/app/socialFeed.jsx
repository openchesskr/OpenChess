// (v0.7.6, 사용자 요청) 소셜 탭(예전 퍼즐 탭) 피드 — 인스타그램 피드처럼 한 줄로 세로로 내려가는 게시물 카드.
//  · 게시물 두 종류: 퍼즐(정렬·필터가 적용된 퍼즐 피드 그대로) + 유산(모든 사용자의 공개 유산, 서버 social_legacy_feed RPC, 최신순).
//  · 섞는 규칙(mixFeed, lib/socialMix.js): 퍼즐 2개마다 유산 1개. 종류 토글(전체·퍼즐·유산)로 하나만 볼 수도 있다.
//  · 게시물 구성: 머리(프로필 원 + 이름 + 부제 + 종류 표시) → 정사각 미리보기 보드(가장자리까지) → 동작 줄(좋아요·리포스트·공유 / 오른쪽 풀기·재생) → 좋아요 수·캡션·날짜.
//  · 화면 아래에 닿으면 10개씩 더 그린다(IntersectionObserver). 유산은 다 그리면 서버에서 다음 묶음(p_before)을 읽는다.
import { useState, useEffect, useMemo, useRef, useLayoutEffect, useContext } from "react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { Heart, Repeat2, Send, Play, Trash2, Puzzle as PuzzleIcon } from "../components/ocIcons.jsx";
import { badgeIcon, postBadge } from "../components/badges.jsx";
import { PUZZLE_THEME_KEYS, puzzleThemeLabel, AnimatedMove, Board, LineStars, GamePhaseBadge, puzzleNo, livePuzzleName, sortedThemesOf, themeAccentColor, solveCountText, puzzleTreeOf, treeLinesOf, starsOf, solvedLineTagsOf, firstNamedOpening, postTypeInfo, legacyRootOf, gamePostTitle, legacyMoveLabel, LEGACY_FONT, FadeIn } from "./common.jsx";
import { parseFenFull } from "../lib/chessRules.js";
import { SB_ON, sbRpc, sbSelect } from "../lib/supabaseClient.js";
import { normalizeLegacyEntry } from "../lib/legacyEntry.js";
import { kindOfPost, isSaved } from "../lib/legacyPosts.js";
import { LegacyActionsCtx } from "./legacyFeed.jsx";
import { LegacyFrame } from "../components/legacyFrame.jsx";
import { legacyLikeToggle } from "./profile.jsx";
import { mixFeed, FEED_KINDS } from "../lib/socialMix.js";
import { t, fmtDateOnly } from "../lib/i18n.js";

const PAGE = 10;
const INK = "#2A1B0E", SOFT = "#7A6648", LINE = "#D6C29A";
const THEME_LABEL = () => Object.fromEntries(PUZZLE_THEME_KEYS.map((k) => [k, puzzleThemeLabel(k)]));   // (v0.7.7) 테마 목록 공용
const fmtDate = (ms) => (ms ? fmtDateOnly(ms, { year: "numeric", month: "2-digit", day: "2-digit" }) : "");

/* 서버 응답 한 줄 → 유산 게시물 { owner, id, entry, kind, likes, reposts, at, ownerInfo } (모양이 틀리면 null). 피드·프로필 소셜 섹션이 같이 쓴다. */
export function legacyItemFrom(x, owners, at) {
  if (!x || !x.owner || !x.id) return null;
  const entry = normalizeLegacyEntry(x.entry);
  const kind = entry ? kindOfPost(x.id, entry) : null;
  if (!entry || !kind) return null;
  const when = at != null ? at : (x.savedAt || entry.savedAt || null);
  return { owner: x.owner, id: x.id, entry: { ...entry, savedAt: x.savedAt || entry.savedAt || null }, kind, likes: x.likes || 0, reposts: x.reposts || 0, at: when, savedAt: x.savedAt || entry.savedAt || null, ownerInfo: (owners && owners[x.owner]) || {} };
}
const keyOf = (p) => p.owner + "|" + p.id;
/* 유산 게시물의 좋아요·리포스트 상태 — 내가 누른 좋아요(서버 legacy_likes), 리포스트(내 리포스트함 = LegacyActionsCtx.saved), 숫자는 서버 값 + 이번에 바꾼 값.
   리포스트는 내 리포스트함과 서버 집계(legacy_repost_toggle)를 함께 바꾼다(legacyFeed.jsx doRepost와 같은 순서). 내 게시물은 리포스트할 수 없다. */
export function useLegacyActions(viewerUid, posts) {
  const ctx = useContext(LegacyActionsCtx);
  const [liked, setLiked] = useState(() => new Set());
  const [likes, setLikes] = useState({}), [reposts, setReposts] = useState({});
  const ownersKey = [...new Set((posts || []).map((p) => p.owner))].sort().join(",");
  useEffect(() => {
    if (!SB_ON || !viewerUid || !ownersKey) return undefined;
    let off = false;
    const ids = ownersKey.split(",").slice(0, 60);
    sbSelect("legacy_likes?uid=eq." + encodeURIComponent(viewerUid) + "&owner_uid=in.(" + ids.map(encodeURIComponent).join(",") + ")&select=owner_uid,slot_key")
      .then((rows) => { if (!off) setLiked((s) => { const n = new Set(s); (rows || []).forEach((x) => n.add(x.owner_uid + "|" + x.slot_key)); return n; }); }).catch(() => {});
    return () => { off = true; };
  }, [viewerUid, ownersKey]);
  const likeCount = (p) => (keyOf(p) in likes ? likes[keyOf(p)] : p.likes || 0);
  const repostCount = (p) => (keyOf(p) in reposts ? reposts[keyOf(p)] : p.reposts || 0);
  const isReposted = (p) => !!(ctx && isSaved(ctx.saved, p.owner, p.id));
  const toggleLike = viewerUid ? async (p) => {
    const k = keyOf(p), was = liked.has(k), base = likeCount(p);
    setLiked((s) => { const n = new Set(s); if (was) n.delete(k); else n.add(k); return n; });
    setLikes((m) => ({ ...m, [k]: Math.max(0, base + (was ? -1 : 1)) }));
    const r = await legacyLikeToggle(p.owner, p.id, viewerUid);
    if (!r) { setLiked((s) => { const n = new Set(s); if (was) n.add(k); else n.delete(k); return n; }); setLikes((m) => ({ ...m, [k]: base })); return; }
    setLiked((s) => { const n = new Set(s); if (r.liked) n.add(k); else n.delete(k); return n; });
    setLikes((m) => ({ ...m, [k]: r.likes }));
  } : null;
  const canRepost = (p) => !!(viewerUid && ctx && ctx.toggleSave && p.owner !== viewerUid);
  const toggleRepost = async (p) => {
    if (!canRepost(p)) return;
    const k = keyOf(p), was = isReposted(p), base = repostCount(p);
    ctx.toggleSave({ owner: p.owner, ownerName: p.ownerInfo.username || "", id: p.id, entry: p.entry });
    setReposts((m) => ({ ...m, [k]: Math.max(0, base + (was ? -1 : 1)) }));
    const call = async () => { try { const r = await sbRpc("legacy_repost_toggle", { p_owner_uid: p.owner, p_slot_key: p.id }); const row = Array.isArray(r) ? r[0] : r; return row ? { reposted: !!row.reposted, reposts: row.reposts || 0 } : null; } catch { return null; } };
    let r = await call();
    if (r && r.reposted === was) r = await call();   // 서버와 어긋나 있었으면 한 번 더 눌러 맞춘다
    if (r) setReposts((m) => ({ ...m, [k]: r.reposts }));
  };
  return { liked, likeCount, repostCount, isReposted, canRepost, toggleLike, toggleRepost, openPost: ctx && ctx.openPost, removeMine: ctx && ctx.removeMine };
}
/* 서버의 유산 피드(최신순) — { posts, more, loading, loadMore } */
function useLegacyFeed(enabled) {
  const [posts, setPosts] = useState([]), [more, setMore] = useState(true), [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const load = async (before) => {
    if (!SB_ON || busy.current) return;
    busy.current = true; setLoading(true);
    try {
      const r = await sbRpc("social_legacy_feed", { p_limit: 24, p_before: before == null ? null : before });
      const got = ((r && r.posts) || []).map((x) => legacyItemFrom(x, r && r.owners)).filter(Boolean);
      setPosts((prev) => { const seen = new Set(prev.map(keyOf)); return [...prev, ...got.filter((p) => !seen.has(keyOf(p)))]; });
      setMore(((r && r.posts) || []).length >= 24);
    } catch { setMore(false); }
    busy.current = false; setLoading(false);
  };
  useEffect(() => { setPosts([]); setMore(true); if (enabled) load(null); }, [enabled]);   // eslint-disable-line react-hooks/exhaustive-deps
  const loadMore = () => { if (!more || loading || !posts.length) return; const last = posts[posts.length - 1].savedAt; if (!last) { setMore(false); return; } load(last); };   // 저장 시각이 없는 옛 유산까지 왔으면 끝
  return { posts, more, loading, loadMore };
}

/* (v0.7.7, 사용자 요청) 퍼즐 작성자도 프로필 사진을 보인다 — 퍼즐에는 작성자 아이디만 있어 아이디로 사진을 모아 읽는다(모듈 캐시, 한 번에 최대 40명). */
const photoCache = new Map();   // username → 사진 data URL | "" (없음)
const photoWait = new Set(), photoSubs = new Set();
let photoTimer = null;
function requestPhotos(names) {
  for (const n of names) if (n && !photoCache.has(n)) photoWait.add(n);
  if (!photoWait.size || photoTimer || !SB_ON) return;
  photoTimer = setTimeout(async () => {
    photoTimer = null;
    const batch = [...photoWait].slice(0, 40); batch.forEach((n) => photoWait.delete(n));
    try {
      const rows = await sbSelect("profiles?username=in.(" + batch.map(encodeURIComponent).join(",") + ")&select=username,photo:pub->>photo");
      const got = new Map((rows || []).map((r) => [r.username, typeof r.photo === "string" ? r.photo : ""]));
      batch.forEach((n) => photoCache.set(n, got.get(n) || ""));
    } catch { batch.forEach((n) => photoCache.set(n, "")); }
    photoSubs.forEach((f) => f());
    if (photoWait.size) requestPhotos([]);
  }, 60);
}
function usePhotoOf(username) {
  const [, bump] = useState(0);
  useEffect(() => { if (!username) return undefined; const f = () => bump((x) => x + 1); photoSubs.add(f); requestPhotos([username]); return () => { photoSubs.delete(f); }; }, [username]);
  return username ? photoCache.get(username) || null : null;
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

/* 프로필 원 — 사진이 있으면 사진, 없으면 아이디 첫 글자. (v0.7.6 사용자 요청) 바깥 색 고리는 없앴다. */
function Avatar({ name, photo }) {
  return (
    <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#241509", fontSize: 13, fontWeight: 900 }}>
      {photo ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
/* (v0.7.7, 사용자 요청) 게시물 머리 — 퍼즐·유산이 같은 모양: 프로필 사진(없으면 아이디 첫 글자) · 아이디(닉네임 아님) · "종류 · 세부" · 오른쪽 표지 */
function PostHead({ username, photo, kindLabel, detail, right, onOpenProfile }) {
  const name = username || "OpenChess";
  return (
    <>
      <button type="button" onClick={() => username && onOpenProfile && onOpenProfile(username)} disabled={!username} aria-label={username ? t("{0} 프로필", username) : undefined} className="press" style={{ background: "none", border: "none", padding: 0, cursor: username ? "pointer" : "default", display: "inline-flex" }}><Avatar name={name} photo={photo} /></button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <button type="button" onClick={() => username && onOpenProfile && onOpenProfile(username)} disabled={!username} className="press" style={{ display: "block", maxWidth: "100%", background: "none", border: "none", padding: 0, textAlign: "left", cursor: username ? "pointer" : "default", fontSize: 13.5, fontWeight: 900, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: SITE_FONT }}>{name}</button>
        <div style={{ fontSize: 11, color: SOFT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kindLabel}{detail ? " · " + detail : ""}</div>
      </div>
      <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center" }}>{right}</span>
    </>
  );
}
/* 게시물 본문 첫 줄 — 아이디 + 제목(같은 모양) */
const Caption = ({ name, children }) => <div style={{ fontSize: 13.5, color: INK, lineHeight: 1.45 }}><b style={{ fontWeight: 900 }}>{name || "OpenChess"}</b> {children}</div>;
const actBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, minWidth: 36, height: 36, padding: "0 6px", background: "none", border: "none", cursor: "pointer" };
// (v0.7.6 사용자 요청) 숫자는 따로 줄을 두지 않고 아이콘 바로 옆에 숫자만
const Num = ({ n, color }) => <span style={{ fontSize: 13, fontWeight: 800, color: color || INK, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" }}>{n || 0}</span>;
const ctaBtn = { display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 10, border: "none", background: T.ebony2, color: T.brassHi, fontSize: 12.5, fontWeight: 800, fontFamily: SITE_FONT, cursor: "pointer" };

/* 게시물 틀(공용) */
function PostShell({ head, media, actions, children, onOpen, label }) {
  return (
    <article aria-label={label} style={{ contain: "inline-size", minWidth: 0, background: T.ivoryHi, borderRadius: 16, border: "1px solid " + LINE, boxShadow: "0 3px 0 #B59A6E", overflow: "hidden" }}>
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
  const photo = usePhotoOf(creator);
  return (
    <PostShell label={t("퍼즐 #{0}", puzzleNo(p.id))} onOpen={onOpen}
      head={<PostHead username={creator} photo={photo} kindLabel={t("퍼즐")} detail={opening} onOpenProfile={onOpenProfile}
        right={<span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, color: themeAccentColor(themes), fontFamily: SITE_FONT }}><PuzzleIcon size={14} color={themeAccentColor(themes)} />#{puzzleNo(p.id)}</span>} />}
      media={<div ref={ref} style={{ width: "100%", aspectRatio: "1 / 1", background: "rgba(0,0,0,.06)" }}>
        {hasPreview ? <AnimatedMove sans={p.setupSans} san={p.mistakeSan} size={w} loopMs={2400} flip={fenOnly ? fenOnly.turn === "w" : setupLen % 2 !== 0} fenRoot={fenOnly} />
          : fenRoot ? <Board board={fenRoot.board} flip={fenRoot.turn === "b"} size={w} showEval={false} showCoords={false} interactive={false} /> : null}
      </div>}
      actions={<>
        <button type="button" onClick={onToggleLike ? () => onToggleLike(p.id) : undefined} disabled={!onToggleLike} aria-label={t("좋아요")} aria-pressed={!!isLiked} className="press" style={actBtn}><Heart size={24} color={isLiked ? "#D9534F" : INK} fill={isLiked ? "#D9534F" : "none"} /><Num n={likeCount} color={isLiked ? "#D9534F" : INK} /></button>
        <button type="button" onClick={onToggleRepost ? () => onToggleRepost(p.id) : undefined} disabled={!onToggleRepost} aria-label={t("리포스트")} aria-pressed={!!isReposted} className="press" style={actBtn}><Repeat2 size={25} color={isReposted ? T.brilliant : INK} /><Num n={repostCount} color={isReposted ? T.brilliant : INK} /></button>
        <button type="button" onClick={onShare ? () => onShare(p) : undefined} disabled={!onShare} aria-label={t("공유하기")} className="press" style={actBtn}><Send size={22} color={INK} /><Num n={shareCount} /></button>
        <span style={{ flex: 1 }} />
        <LineStars total={3} solved={stars} />
        <button type="button" onClick={onOpen} className="press" style={{ ...ctaBtn, marginLeft: 8 }}>{isSolved ? t("다시 풀기") : t("풀기")}</button>
      </>}>
      <Caption name={creator}>{livePuzzleName(p) || opening}</Caption>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <GamePhaseBadge p={p} compact />
        {themes.map((k) => <span key={k} style={{ fontSize: 11, fontWeight: 800, color: themeAccentColor([k]) }}>#{labels[k] || k}</span>)}
      </div>
      {solvers && <div style={{ fontSize: 11.5, color: "#2E6E2E", fontWeight: 700 }}>{solvers}</div>}
    </PostShell>
  );
}

export function LegacyPost({ post, actions: A, onOpenProfile, isOwn }) {
  const [ref, w] = useSquareWidth();
  const { entry, kind, ownerInfo } = post;
  const info = postTypeInfo(kind);
  const isGame = kind === "game";   // (v0.7.7) 대국 게시물 — 마지막 수를 보여 주고, 캡션은 "백 vs 흑 · 결과"
  const name = ownerInfo.username || "";   // (v0.7.6 사용자 요청) 닉네임 대신 아이디
  const before = useMemo(() => entry.sans.slice(0, entry.moveIndex), [entry]);
  const root = useMemo(() => legacyRootOf(entry), [entry]);
  const open = () => { if (ownerInfo.mid && A.openPost) A.openPost({ mid: ownerInfo.mid, id: post.id }); };
  const liked = A.liked.has(post.owner + "|" + post.id), reposted = A.isReposted(post), canRepost = A.canRepost(post);
  const [armed, setArmed] = useState(false);
  const cachedPhoto = usePhotoOf(ownerInfo.photo ? null : name);   // 서버가 사진을 함께 주지 않은 옛 응답 대비
  return (
    <PostShell label={isGame ? t("대국 {0}", gamePostTitle(entry)) : t("유산 {0}", legacyMoveLabel(entry))} onOpen={open}
      head={<PostHead username={name} photo={ownerInfo.photo || cachedPhoto} kindLabel={isGame ? t("대국") : t("유산")} detail={isGame ? t("{0}수", Math.ceil(entry.sans.length / 2)) : info ? info.label : ""} onOpenProfile={onOpenProfile} right={postBadge(kind, 22)} />}
      media={<div style={{ background: "linear-gradient(160deg,#20324D 0%,#14213A 55%,#0C1424 100%)", padding: 14 }}>
        {/* (v0.7.7, 사용자 요청) 유산 미리보기는 남색 바탕 + 금색 액자를 유지한다(머리·캡션·동작 줄은 퍼즐과 같은 형식) */}
        <div style={{ position: "relative", padding: 12 }}>
          <LegacyFrame />
          <div ref={ref} style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 6, overflow: "hidden" }}>
            <AnimatedMove sans={before} san={entry.sans[entry.moveIndex]} size={w} loopMs={2400} flip={entry.side === "b"} badge={isGame ? null : kind} fenRoot={root} />
          </div>
        </div>
      </div>}
      actions={<>
        <button type="button" onClick={A.toggleLike ? () => A.toggleLike(post) : undefined} disabled={!A.toggleLike} aria-label={t("좋아요")} aria-pressed={liked} className="press" style={actBtn}><Heart size={24} color={liked ? "#D9534F" : INK} fill={liked ? "#D9534F" : "none"} /><Num n={A.likeCount(post)} color={liked ? "#D9534F" : INK} /></button>
        <button type="button" onClick={canRepost ? () => A.toggleRepost(post) : undefined} disabled={!canRepost} title={!canRepost && post.owner && isOwn ? t("내 게시물은 리포스트할 수 없음") : undefined} aria-label={t("리포스트")} aria-pressed={reposted} className="press" style={actBtn}><Repeat2 size={25} color={reposted ? T.brilliant : INK} /><Num n={A.repostCount(post)} color={reposted ? T.brilliant : INK} /></button>
        <button type="button" onClick={open} aria-label={t("공유하기")} className="press" style={actBtn}><Send size={22} color={INK} /></button>
        <span style={{ flex: 1 }} />
        {isOwn && A.removeMine && <button type="button" onClick={() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 2600); return; } A.removeMine(post.id); }} aria-label={t("삭제")} title={armed ? t("한 번 더 누르면 삭제") : t("삭제")} className="press" style={{ ...actBtn, color: armed ? T.blunder : SOFT, fontSize: 11.5, fontWeight: 800 }}><Trash2 size={18} color={armed ? T.blunder : SOFT} />{armed ? t("한 번 더 누르면 삭제") : null}</button>}
        <button type="button" onClick={open} className="press" style={ctaBtn}><Play size={13} />{t("재생")}</button>
      </>}>
      <Caption name={name}><span style={{ fontFamily: LEGACY_FONT, fontWeight: 900 }}>{isGame ? gamePostTitle(entry) : legacyMoveLabel(entry)}</span>{entry.opening ? " · " + entry.opening : ""}</Caption>
      <div style={{ fontSize: 11, color: SOFT }}>{fmtDate(post.savedAt)}</div>
    </PostShell>
  );
}

/* puzzles: 정렬·필터가 끝난 퍼즐 목록, cardProps(p): PuzzleCard와 같은 좋아요·리포스트·공유 속성, creatorOf(p): 만든 사람 아이디
   onOpenPuzzle(p), onOpenProfile(username). 유산 열기·리포스트함은 LegacyActionsCtx(App)에서 받는다. */
export function SocialFeed({ puzzles, cardProps, creatorOf, solved, onOpenPuzzle, viewerUid, onOpenProfile, kind, setKind }) {
  const lf = useLegacyFeed(kind !== "puzzle");
  const la = useLegacyActions(viewerUid, lf.posts);
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
  const kindLabel = { all: t("전체"), puzzle: t("퍼즐"), legacy: t("유산"), game: t("대국") };
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
                : <LegacyPost post={it.post} actions={la} onOpenProfile={onOpenProfile} isOwn={!!viewerUid && it.post.owner === viewerUid} />}
            </FadeIn>
          ))}
        </div>
      )}
      <div ref={sentinel} style={{ height: 1 }} />
      {lf.loading && list.length > 0 && <div style={{ textAlign: "center", color: T.inkSoft, fontSize: 12, padding: 12 }}>{t("불러오는 중…")}</div>}
    </div>
  );
}

/* (v0.7.6, 사용자 요청) /user 프로필의 "소셜" 섹션 — "게시물"(그 사람이 만든 퍼즐 + 유산, 종류 구분 없이 최신순)과 "리포스트"(퍼즐·유산, 리포스트한 최신순).
   서버 social_profile(p_uid) 한 번으로 두 목록을 받는다. 카드는 소셜 탭 피드와 같은 게시물 카드를 가로로 넘겨 본다.
   pz: 퍼즐 카드 속성 묶음 { mySolved, myLineSolves, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare, onOpenPuzzle } */
export function ProfileSocial({ ownerUid, viewerUid, onOpenProfile, pz = {} }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!SB_ON || !ownerUid) { setData({ posts: [], reposts: [] }); return undefined; }
    let off = false; setData(null);
    sbRpc("social_profile", { p_uid: ownerUid }).then((r) => {
      if (off) return;
      const owners = (r && r.owners) || {};
      const conv = (x) => (x && x.type === "puzzle" && x.puzzle && x.puzzle.id ? { type: "puzzle", key: "p:" + x.puzzle.id, p: x.puzzle, creator: x.creator || null, at: x.at, likes: x.likes || 0, reposts: x.reposts || 0, shares: x.shares || 0 }
        : x && x.type === "legacy" ? (() => { const post = legacyItemFrom(x, owners, x.at); return post ? { type: "legacy", key: "l:" + post.owner + ":" + post.id, post } : null; })() : null);
      setData({ posts: ((r && r.posts) || []).map(conv).filter(Boolean), reposts: ((r && r.reposts) || []).map(conv).filter(Boolean) });
    }).catch(() => { if (!off) setData({ posts: [], reposts: [] }); });
    return () => { off = true; };
  }, [ownerUid]);
  const legacyPosts = useMemo(() => (data ? [...data.posts, ...data.reposts].filter((x) => x.type === "legacy").map((x) => x.post) : []), [data]);
  const la = useLegacyActions(viewerUid, legacyPosts);
  const card = (it) => {
    if (it.type === "legacy") return <LegacyPost post={it.post} actions={la} onOpenProfile={onOpenProfile} isOwn={!!viewerUid && it.post.owner === viewerUid} />;
    const p = it.p, no = puzzleNo(p.id);
    const num = (map, fb) => (map && map[no] != null ? map[no] : fb);
    return <PuzzlePost p={p} creator={it.creator} isSolved={pz.mySolved ? pz.mySolved.has(p.id) : false} solvedTags={pz.myLineSolves ? pz.myLineSolves[p.id] : null}
      onOpen={() => pz.onOpenPuzzle && pz.onOpenPuzzle(p)} onOpenProfile={onOpenProfile}
      isLiked={pz.likedPuzzles ? pz.likedPuzzles.has(p.id) : false} likeCount={num(pz.likeCounts, it.likes)} onToggleLike={pz.onToggleLike}
      isReposted={pz.repostedPuzzles ? pz.repostedPuzzles.has(p.id) : false} repostCount={num(pz.repostCounts, it.reposts)} onToggleRepost={pz.onToggleRepost}
      shareCount={num(pz.shareCounts, it.shares)} onShare={pz.onShare} />;
  };
  const row = (title, list, empty) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900, color: T.ink }}>{title}</span>
        {list && <span style={{ fontSize: 11.5, fontWeight: 800, color: T.inkSoft, fontFamily: SITE_FONT }}>{list.length}</span>}
      </div>
      {!list ? <div style={{ fontSize: 12, color: T.inkSoft }}>{t("불러오는 중…")}</div>
        : !list.length ? <div style={{ fontSize: 12, color: T.inkSoft, padding: "14px 12px", borderRadius: 12, border: "1px dashed #C9B58C" }}>{empty}</div>
        : <div className="profile-social-row" style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch" }}>
            {list.map((it) => <div key={it.key} style={{ flex: "0 0 min(300px, 82%)", minWidth: 0, scrollSnapAlign: "start" }}>{card(it)}</div>)}
          </div>}
    </div>
  );
  return (
    <section aria-label={t("소셜")} style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: T.ink, marginBottom: 10 }}>{t("소셜")}</div>
      {row(t("게시물"), data && data.posts, t("아직 올린 게시물 없음"))}
      {row(t("리포스트"), data && data.reposts, t("아직 리포스트한 게시물 없음"))}
    </section>
  );
}
