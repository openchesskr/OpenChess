// (v0.6.0, 다국어) 앱 밖의 정적 페이지(/about·/faq·/privacy·/terms) 머리글에 두는 언어 선택. 바꾸면 저장 후 새로고침한다.
import React from "react";
import LangPicker from "./LangPicker.jsx";

export default function LangSwitch({ style }) {
  return <LangPicker compact style={style} />;
}
