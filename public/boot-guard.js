// 앱이 뜨기 전(스크립트 로드 실패, 오래 걸림)에 흰 화면으로 굳지 않게 하는 안전장치. 앱이 그려지면 #boot가 React 화면으로 바뀌므로 할 일이 없다.
(function () {
  var ko = /^ko/i.test(navigator.language || "");
  var KEY = "oc_boot_reload_at";
  function show(msg) {
    var boot = document.getElementById("boot");
    if (!boot) return;   // 앱이 이미 그려졌다
    boot.innerHTML = '<div style="max-width:320px;text-align:center;padding:0 24px"><div style="font-size:17px;font-weight:800;margin-bottom:8px">' + (ko ? "화면 불러오기 실패" : "Couldn't load the page") + '</div><div style="font-size:13px;line-height:1.6;opacity:.8;margin-bottom:16px">' + msg + '</div><button id="boot-retry" style="padding:11px 26px;border-radius:10px;border:none;background:#D4AF55;color:#241509;font-weight:800;font-size:14px">' + (ko ? "새로고침" : "Reload") + '</button></div>';
    var b = document.getElementById("boot-retry"); if (b) b.onclick = function () { location.reload(); };
  }
  function fail() {
    var last = 0;
    try { last = Number(sessionStorage.getItem(KEY) || 0); } catch (e) { }
    if (Date.now() - last > 60000) {   // 처음 실패하면 한 번만 조용히 다시 시도(새 배포 직후 예전 파일을 찾는 경우가 대부분)
      try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) { }
      location.reload();
      return;
    }
    show(ko ? "네트워크가 불안정하거나 사이트가 업데이트됐을 수 있음. 새로고침 필요." : "Your connection may be unstable or the site was just updated. Please reload.");
  }
  window.addEventListener("error", function (e) {
    var t = e && e.target;
    if (t && t.tagName === "SCRIPT" && document.getElementById("boot")) fail();   // 모듈 스크립트 자체를 못 받음
  }, true);
  setTimeout(function () { if (document.getElementById("boot")) show(ko ? "불러오는 시간이 오래 걸리는 중. 새로고침 필요." : "This is taking a while. Try reloading."); }, 15000);
})();
