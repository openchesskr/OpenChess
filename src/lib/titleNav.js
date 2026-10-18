// (v0.6.9, 사용자 요청) 프로필의 장착 칭호를 누르면 도감 업적 화면으로 가서 그 칭호를 흔들어 보여 주는 요청을 넘기는 한 칸짜리 보관소(masterNav.js와 같은 방식).
// App이 setTitleNav로 요청을 두고 도감 탭으로 바꾸면, 새로 열린 업적 화면이 peekTitleNav로 읽어 그 계열을 고르고 takeTitleNav로 비운다.
let target = null;   // 칭호 id("계열:단계") | null
export const setTitleNav = (id) => { target = id; };
export const peekTitleNav = () => target;
export const takeTitleNav = () => { const t = target; target = null; return t; };
