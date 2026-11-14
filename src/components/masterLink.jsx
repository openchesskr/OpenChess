// (v0.7.6, 사용자 요청) 마스터 이름 → 마스터 페이지(/master/<slug>) 링크. 마스터 통계·마스터 대국·마스터 스타일·도감 카드 등 이름이 나오는 곳에서 쓴다.
// 프로필(마스터 페이지)이 있는 선수만 링크가 되고, 없으면 글자만 그대로 보인다. 감싼 줄(대국 줄 등)의 클릭은 막는다(stopPropagation).
// 링크 여부는 주소표(lib/masterPages.js)만으로 즉시 정한다 — 큰 프로필 파일을 받지 않는다.
import { useMemo } from "react";
import { slugForName, openMasterPage, masterPath } from "../lib/masterPages.js";
import { t } from "../lib/i18n.js";

export const useMasterSlug = (name) => useMemo(() => slugForName(name), [name]);
export function MasterNameLink({ name, children, style }) {
  const slug = useMasterSlug(name);
  if (!slug) return <>{children}</>;
  return (
    <a href={masterPath(slug)} title={t("마스터 페이지 보기")} className="oc-master-link"
      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) { e.stopPropagation(); return; } e.preventDefault(); e.stopPropagation(); openMasterPage(slug); }}
      onKeyDown={(e) => e.stopPropagation()}
      style={{ color: "inherit", textDecoration: "underline", textDecorationColor: "rgba(168,132,47,.55)", textUnderlineOffset: 3, cursor: "pointer", ...style }}>{children}</a>
  );
}
