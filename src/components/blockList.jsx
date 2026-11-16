// (v0.7.8, 사용자 요청) 설정 탭 차단 목록 — 누르면 따로 뜨던 시트(BlockListSheet) 대신 블록 안에 바로 목록을 보여 주고, 많으면 "더보기"로
//  모바일은 화면 전체를 쓰는 별도 화면, 데스크톱은 채팅처럼 옮길 수 있는 작은 창(DockWindows, App이 type "blocklist"로 연다)에서 전체 목록을 본다.
//  세 곳(설정 블록·전체 화면·도킹 창)이 같은 목록을 보도록 계정별 상태를 이 모듈 하나에 둔다 — 한 곳에서 해제하면 나머지도 바로 바뀐다.
import { useEffect, useState } from "react";
import { T } from "../lib/theme.js";
import { t, tx } from "../lib/i18n.js";
import { chatBlocksFetch, chatBlockSet } from "../lib/chatApi.js";
import { usersProfiles } from "../app/common.jsx";
import { ChevronLeft, ChevronRight } from "./ocIcons.jsx";

export const BLOCK_INLINE_MAX = 5;   // 설정 블록 안에 바로 보이는 수 — 넘으면 "더보기"
const store = { uid: null, items: null, loading: false, subs: new Set() };
const emit = () => store.subs.forEach((f) => { try { f(); } catch { /* ignore */ } });
async function load(myUid, force = false) {
  if (!myUid) return;
  if (!force && store.uid === myUid && (store.items || store.loading)) return;
  store.uid = myUid; store.loading = true; emit();
  try {
    const uids = await chatBlocksFetch(myUid);
    const prof = uids.length ? await usersProfiles(uids) : {};
    if (store.uid !== myUid) return;
    store.items = uids.map((uid) => ({ uid, name: (prof[uid] && ((prof[uid].pub && prof[uid].pub.nickname) || prof[uid].username)) || t("알 수 없는 사용자"), username: prof[uid] && prof[uid].username }));
  } catch { if (store.uid === myUid) store.items = store.items || []; }
  store.loading = false; emit();
}
export function useBlockList(myUid) {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); store.subs.add(f); load(myUid); return () => { store.subs.delete(f); }; }, [myUid]);
  const mine = store.uid === myUid;
  return {
    items: mine ? store.items : null,
    loading: !mine || store.loading,
    unblock: async (uid) => { if (await chatBlockSet(myUid, uid, false)) { store.items = (store.items || []).filter((x) => x.uid !== uid); emit(); return true; } return false; },
    reload: () => load(myUid, true),
  };
}

function Row({ u, onUnblock }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center justify-between" style={{ gap: 10, padding: "8px 10px", borderRadius: 10, background: "#fff", border: "1px solid #E4D5B6" }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
      <button disabled={busy} onClick={async () => { setBusy(true); await onUnblock(u.uid); setBusy(false); }} className="press"
        style={{ flexShrink: 0, padding: "6px 11px", borderRadius: 8, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 800, fontSize: 11.5, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>{t("차단 해제")}</button>
    </div>
  );
}
/* 목록 본문 — limit이 있으면 그만큼만 보이고 남은 수를 "더보기"로(onMore) */
export function BlockListBody({ myUid, limit, onMore }) {
  const { items, loading, unblock } = useBlockList(myUid);
  if (loading && !items) return <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "8px 0 0" }}>{t("불러오는 중…")}</p>;
  if (!items || !items.length) return <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "8px 0 0" }}>{t("차단한 사용자 없음")}</p>;
  const shown = limit ? items.slice(0, limit) : items;
  const rest = items.length - shown.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
      {shown.map((u) => <Row key={u.uid} u={u} onUnblock={unblock} />)}
      {rest > 0 && onMore && (
        <button onClick={onMore} className="press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "8px 10px", borderRadius: 10, border: "1px dashed #C9B58C", background: "transparent", color: T.ink, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
          {tx("더보기 ({0})", rest)}<ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
/* 모바일 전체 화면 */
export function BlockListPage({ myUid, onClose }) {
  const { items } = useBlockList(myUid);
  return (
    <div role="dialog" aria-label={t("차단 목록")} style={{ position: "fixed", inset: 0, zIndex: 300, background: T.paper, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "calc(10px + env(safe-area-inset-top)) 12px 10px", background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi }}>
        <button onClick={onClose} aria-label={t("뒤로")} className="press" style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "transparent", color: T.ivoryHi, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={20} /></button>
        <span style={{ fontSize: 15, fontWeight: 900, flex: 1 }}>{t("차단 목록")}</span>
        {items && <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>{items.length}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 14px calc(16px + env(safe-area-inset-bottom))" }}>
        <BlockListBody myUid={myUid} />
      </div>
    </div>
  );
}
/* 데스크톱 도킹 창 안 내용 */
export function BlockListDocked({ myUid }) {
  return <div style={{ padding: "4px 12px 14px" }}><BlockListBody myUid={myUid} /></div>;
}
