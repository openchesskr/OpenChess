// (v0.6.6, 사용자 요청) 다른 탭(집중 분석의 대회 이름 링크)에서 도감 마스터 트리로 "이 대회로 찾아가라"는 요청을 넘기는 한 칸짜리 보관소.
// App이 setMasterNav로 요청을 두고 도감 탭으로 바꾸면, 새로 열린 마스터 트리(MastersSchematic)가 시작 연출이 끝난 뒤 takeMasterNav로 꺼내 회로선을 따라 이동한다.
let target = null;   // { tourId, year } | null
export const setMasterNav = (t) => { target = t; };
export const peekMasterNav = () => target;
export const takeMasterNav = () => { const t = target; target = null; return t; };
