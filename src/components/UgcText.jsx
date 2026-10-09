// (v0.6.5 기능, 사용자 요청) 다른 사람이 쓴 글(수 설명 "note"·프로필 소개글 "bio")을 내 언어로 번역해 보여 주는 래퍼.
// 번역이 없거나 꺼져 있으면(설정 > 언어) 원문을 그대로 그린다. 번역됐을 때만 "원문 보기" 토글이 붙는다.
// 채팅 메시지에는 쓰지 않는다 — kind는 "note"·"bio"뿐이고 scripts/check-ugc-translate.mjs가 채팅 화면의 사용을 막는다.
import { useState, useEffect, useSyncExternalStore } from "react";
import { Languages } from "lucide-react";
import { T } from "../lib/theme.js";
import { t } from "../lib/i18n.js";
import { loadUgcTranslatePref } from "../lib/prefs.js";
import { peekTranslation, requestTranslation } from "../lib/ugcTranslate.js";

const subscribePref = (cb) => { window.addEventListener("occ-ugc-translate", cb); return () => window.removeEventListener("occ-ugc-translate", cb); };

/** 번역문(없으면 null). 설정이 꺼지면 즉시 null. */
export function useUgcTranslation(text, kind) {
  const on = useSyncExternalStore(subscribePref, loadUgcTranslatePref, () => true);
  const [res, setRes] = useState(() => (on ? peekTranslation(text, kind) : null));
  useEffect(() => {
    let live = true;
    if (!on) { setRes(null); return undefined; }
    const hit = peekTranslation(text, kind);
    if (hit) { setRes(hit); return undefined; }
    setRes(null);
    requestTranslation(text, kind).then((r) => { if (live) setRes(r); });
    return () => { live = false; };
  }, [text, kind, on]);
  return res && !res.same ? res.text : null;
}

/** render(보여줄 글, 토글 노드)로 글을 그린다. inline이면 토글 노드를 render가 직접 놓고, 아니면 글 아래에 한 줄로 붙인다. */
export default function UgcText({ text, kind, render, inline = false }) {
  const tr = useUgcTranslation(text, kind);
  const [orig, setOrig] = useState(false);
  const shown = tr && !orig ? tr : text;
  const label = orig ? t("번역 보기") : t("원문 보기");
  if (!tr) return render(text, null);
  // inline은 <button> 안(유저 검색 행 등)에도 놓이므로 중첩 버튼을 피해 span[role=button]으로 만든다.
  const flip = (e) => { e.stopPropagation(); e.preventDefault(); setOrig((v) => !v); };
  const toggle = inline
    ? <span role="button" tabIndex={0} className="press" title={label} aria-label={label} onClick={flip} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") flip(e); }} style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle", marginRight: 4, cursor: "pointer", color: orig ? T.inkSoft : T.brass }}><Languages size={12} /></span>
    : <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 10.5, color: T.inkSoft }}>
      <Languages size={11} style={{ color: T.brass, flexShrink: 0 }} /><span>{orig ? t("원문") : t("번역됨")}</span><span aria-hidden="true">·</span>
      <button type="button" className="press" onClick={() => setOrig((v) => !v)} style={{ padding: 0, border: "none", background: "none", cursor: "pointer", color: T.brass, fontWeight: 800, fontSize: 10.5, fontFamily: "inherit" }}>{label}</button>
    </div>;
  return <>{render(shown, inline ? toggle : null)}{inline ? null : toggle}</>;
}
