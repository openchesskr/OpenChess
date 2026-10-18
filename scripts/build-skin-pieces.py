#!/usr/bin/env python3
"""(v0.6.9) 기본 기물(public/{White,Black} *.png)에서 스킨 세트 기물 이미지를 만든다 → public/pieces/<세트>/<white|black>-<기물>.webp

기본 기물의 로우폴리 실루엣과 금색 분할선은 '뼈대'로 두고, 세트마다 다음을 바꾼다.
  · 외형: 받침 모양(모따기·계단·아치·둥근 모서리), 꼭대기 장식(첨탑·보주·스파이어)
  · 장식 문양: 아르데코 선버스트, 고딕 첨두아치 창, 단청 연꽃·마름모 띠, 청자 상감 국화·여의두 띠, 크리스털 면 그라디언트
  · 재질: 대리석 결·석재·한지·자기 유약 등 몸통 질감, 면마다 다른 명암
출력은 기본의 S(=3)배 해상도 캔버스에 기물을 K(=0.94)배로 줄여 아래 가운데에 붙인 이미지다(꼭대기·옆 장식 여백). theme.js의 SKIN_PIECE_SCALE·basePx와 같은 값을 쓴다.
실행: python3 scripts/build-skin-pieces.py [세트…]   (numpy·scipy·Pillow 필요. 결과 이미지는 저장소에 커밋한다 — 빌드에서는 실행하지 않는다)
새 세트: SETS에 항목을 더하고 DECOR에 장식 함수를 연결한 뒤 theme.js의 PIECE_SKINS·BOARD_SKINS·SKIN_SETS와 이미지 세트 목록에 같은 id를 추가한다(check-skins가 확인).
"""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PUB = os.path.join(ROOT, "public")
NAMES = {"P": "Pawn", "N": "Knight", "B": "Bishop", "R": "Rook", "Q": "Queen", "K": "King"}
S = 3        # 기본 대비 해상도 배율
K = 0.94     # 캔버스 안에서 기물을 줄이는 비율(위·옆 장식 여백)
OS = 2       # 장식 그림은 S배 위에서 다시 2배로 그려 줄여 붙인다(안티앨리어싱)


def hexc(h):
    h = h.lstrip("#"); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def rgba(h, a=255):
    c = h.lstrip("#"); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def ramp(t, stops):
    cols = [hexc(c) for c in stops]; n = len(cols) - 1
    x = np.clip(t, 0, 1) * n; i = np.minimum(x.astype(int), n - 1); f = (x - i)[..., None]
    arr = np.stack(cols)
    return arr[i] * (1 - f) + arr[i + 1] * f


def noise(shape, cell, seed, aniso=(1.0, 1.0)):
    rng = np.random.default_rng(seed); h, w = shape
    gh, gw = max(2, int(h / (cell * aniso[0])) + 3), max(2, int(w / (cell * aniso[1])) + 3)
    g = rng.random((gh, gw)).astype(np.float32)
    z = ndi.zoom(g, (h / (gh - 1.0), w / (gw - 1.0)), order=3)[:h, :w]
    if z.shape != (h, w): z = np.pad(z, ((0, h - z.shape[0]), (0, w - z.shape[1])), mode="edge")
    return (z - z.min()) / (np.ptp(z) + 1e-6)


def fbm(shape, base, seed, octaves=3, aniso=(1.0, 1.0)):
    out = np.zeros(shape, np.float32); amp = 1.0; tot = 0.0
    for o in range(octaves):
        out += amp * noise(shape, max(2.0, base / (2 ** o)), seed + 17 * o, aniso); tot += amp; amp *= 0.5
    return out / tot


# ───────────────────────── 기본 이미지 → 뼈대 ─────────────────────────
class Skeleton:
    """기본 기물 한 장을 S배·K배로 옮긴 뼈대 레이어(알파·금색 비중·금색 밝기·면 라벨)와 해부 정보."""

    def __init__(self, color, name):
        src = Image.open(os.path.join(PUB, ("White " if color == "w" else "Black ") + name + ".png")).convert("RGBA")
        a = np.asarray(src, np.float32)
        alpha = a[..., 3] / 255.0; rgb = a[..., :3]
        sat = (rgb.max(-1) - rgb.min(-1)) / 255.0
        g = np.clip(sat / 0.42, 0, 1) * (alpha > 0.02)
        t = np.clip((rgb.max(-1) / 255.0 - 0.62) / (0.97 - 0.62), 0, 1)
        body = (alpha > 0.5) & (g < 0.35)
        lab, n = ndi.label(body)
        idx = ndi.distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
        lab = lab[idx[0], idx[1]]
        self.n = n
        self.H0, self.W0 = alpha.shape
        self.H, self.W = self.H0 * S, self.W0 * S
        w2, h2 = int(round(self.W0 * S * K)), int(round(self.H0 * S * K))
        self.ox, self.oy = (self.W - w2) // 2, self.H - h2

        def put(arr, mode, res):
            im = Image.fromarray(arr.astype(np.float32 if mode == "F" else np.int32), mode=mode).resize((w2, h2), res)
            out = np.zeros((self.H, self.W), np.float32 if mode == "F" else np.int32)
            out[self.oy:self.oy + h2, self.ox:self.ox + w2] = np.asarray(im)
            return out
        self.alpha = np.clip(put(alpha, "F", Image.BICUBIC), 0, 1)
        self.g = np.clip(put(g, "F", Image.BICUBIC), 0, 1)
        self.t = np.clip(put(t, "F", Image.BICUBIC), 0, 1)
        self.lab = put(lab, "I", Image.NEAREST)
        self.facet_info = {}
        for i in range(1, n + 1):
            ys, xs = np.nonzero(lab == i)
            if len(ys): self.facet_info[i] = {"area": len(ys), "cy": ys.mean() / self.H0, "cx": xs.mean() / self.W0,
                                              "bw": xs.max() - xs.min() + 1, "bh": ys.max() - ys.min() + 1, "top": ys.min() / self.H0}

    # 해부(해상도 S 기준 픽셀): 위·아래·중심·받침 위쪽
    def anatomy(self):
        m = self.alpha > 0.5
        rows = np.nonzero(m.any(1))[0]
        self.top, self.bottom = int(rows.min()), int(rows.max())
        wid = m.sum(1)
        slab = wid[self.bottom - 3 * S]
        y = self.bottom
        while y > self.top and wid[y] >= 0.88 * slab: y -= 1
        self.base_top = y + 1
        xs = np.nonzero(m[self.bottom - 3 * S])[0]
        self.cx = float((xs.min() + xs.max()) / 2); self.base_x0, self.base_x1 = int(xs.min()), int(xs.max())
        return self

    def width_at(self, y):
        xs = np.nonzero(self.alpha[int(np.clip(y, 0, self.H - 1))] > 0.5)[0]
        return (int(xs.min()), int(xs.max())) if len(xs) else (int(self.cx), int(self.cx))


COLLAR = {"P": 0.35, "B": 0.50, "R": 0.53}
ZONE = {"P": 0.42, "B": 0.55, "R": 0.58, "Q": 0.45, "K": 0.45, "N": 0.62}   # 몸통 장식 영역 시작(전체 높이 비율)


class Ink:
    """S 해상도 좌표로 그리는 장식 레이어(내부적으로 OS배 확대해 그리고 줄인다)."""

    def __init__(self, W, H):
        self.W, self.H = W, H
        self.im = Image.new("RGBA", (W * OS, H * OS), (0, 0, 0, 0)); self.d = ImageDraw.Draw(self.im)

    def u(self, v): return [x * OS for x in v] if isinstance(v, (list, tuple)) else v * OS
    def line(self, pts, fill, w=1.0): self.d.line([(x * OS, y * OS) for x, y in pts], fill=fill, width=max(1, int(round(w * OS))), joint="curve")
    def poly(self, pts, fill=None, outline=None, w=1.0):
        P = [(x * OS, y * OS) for x, y in pts]
        if fill: self.d.polygon(P, fill=fill)
        if outline: self.d.line(P + [P[0]], fill=outline, width=max(1, int(round(w * OS))), joint="curve")
    def ellipse(self, cx, cy, rx, ry, fill=None, outline=None, w=1.0):
        self.d.ellipse([(cx - rx) * OS, (cy - ry) * OS, (cx + rx) * OS, (cy + ry) * OS], fill=fill, outline=outline, width=max(1, int(round(w * OS))))
    def arc(self, cx, cy, r, a0, a1, fill, w=1.0):
        self.d.arc([(cx - r) * OS, (cy - r) * OS, (cx + r) * OS, (cy + r) * OS], a0, a1, fill=fill, width=max(1, int(round(w * OS))))
    def rect(self, x0, y0, x1, y1, fill=None, outline=None, w=1.0): self.d.rectangle([x0 * OS, y0 * OS, x1 * OS, y1 * OS], fill=fill, outline=outline, width=max(1, int(round(w * OS))))

    def result(self):
        im = self.im.filter(ImageFilter.GaussianBlur(0.4 * OS / 2)).resize((self.W, self.H), Image.LANCZOS)
        return np.asarray(im, np.float32)   # (H, W, 4)


def reshape_alpha(alpha, fn):
    """알파를 4배로 키워 fn(ImageDraw, 4)로 더하거나(255) 빼고(0) 줄인다."""
    im = Image.fromarray((np.clip(alpha, 0, 1) * 255).astype(np.uint8), "L")
    big = im.resize((im.width * 4, im.height * 4), Image.BICUBIC); d = ImageDraw.Draw(big)
    fn(d, 4)
    return np.asarray(big.resize(im.size, Image.LANCZOS), np.float32) / 255.0


# ───────────────────────── 세트별 외형 변형 ─────────────────────────
def shape_deco(sk, key, alpha):
    """아르데코: 받침 모서리 모따기 + 위쪽 단 들여쓰기(계단) + 꼭대기 스파이어."""
    bt, bo, x0, x1, cx = sk.base_top, sk.bottom, sk.base_x0, sk.base_x1, sk.cx
    mid = (bt + bo) / 2.0
    def f(d, q):
        c = 6.0 * S / 3 * 1.0
        for sx, ex in ((x0, 1), (x1, -1)):
            d.polygon([(sx * q, bo * q + q), ((sx + ex * c) * q, bo * q + q), (sx * q, (bo - c) * q)], fill=0)          # 아래 모서리 모따기
            d.polygon([(sx * q, bt * q - q), ((sx + ex * c * 0.8) * q, bt * q - q), (sx * q, (bt + c * 0.8) * q)], fill=0)   # 위 모서리 모따기
            d.rectangle([min(sx, sx + ex * 2.6 * S) * q, (bt - 1) * q, max(sx, sx + ex * 2.6 * S) * q, mid * q], fill=0)    # 위쪽 단 들여쓰기(계단)
        if key in ("P", "B"):   # 꼭대기 스파이어
            top = sk.top
            d.polygon([((cx - 1.6 * S) * q, (top + 1) * q), ((cx + 1.6 * S) * q, (top + 1) * q), (cx * q, (top - 5.5 * S) * q)], fill=255)
    return reshape_alpha(alpha, f)


def shape_gothic(sk, key, alpha):
    """고딕: 받침 양끝 피너클(작은 뾰족탑) + 꼭대기 첨탑."""
    bt, x0, x1, cx = sk.base_top, sk.base_x0, sk.base_x1, sk.cx
    def f(d, q):
        for sx, ex in ((x0 + 1.2 * S, 1), (x1 - 1.2 * S, -1)):
            d.polygon([((sx - 1.3 * S) * q, (bt + 1) * q), ((sx + 1.3 * S) * q, (bt + 1) * q), (sx * q, (bt - 7.5 * S) * q)], fill=255)
        if key in ("P", "B"):
            top = sk.top
            d.polygon([((cx - 1.2 * S) * q, (top + 1.5) * q), ((cx + 1.2 * S) * q, (top + 1.5) * q), (cx * q, (top - 8 * S) * q)], fill=255)
            for k in (-1, 1): d.ellipse([(cx + k * 1.7 * S - 0.7 * S) * q, (top - 1.4 * S) * q, (cx + k * 1.7 * S + 0.7 * S) * q, (top + 0.4 * S) * q], fill=255)   # 크로켓
    return reshape_alpha(alpha, f)


def shape_dancheong(sk, key, alpha):
    """단청: 받침 양끝이 처마처럼 살짝 들리고, 꼭대기에 보주(구슬)."""
    bt, bo, x0, x1, cx = sk.base_top, sk.bottom, sk.base_x0, sk.base_x1, sk.cx
    def f(d, q):
        for sx, ex in ((x0, -1), (x1, 1)):
            d.polygon([(sx * q, (bt + 1) * q), ((sx + ex * 3.0 * S) * q, (bt - 2.2 * S) * q), ((sx + ex * 0.4 * S) * q, (bt + 3.5 * S) * q)], fill=255)   # 처마 끝
        if key in ("P", "B"):
            top = sk.top
            d.rectangle([(cx - 0.9 * S) * q, (top - 2.2 * S) * q, (cx + 0.9 * S) * q, (top + 1) * q], fill=255)
            d.ellipse([(cx - 2.3 * S) * q, (top - 6.2 * S) * q, (cx + 2.3 * S) * q, (top - 1.6 * S) * q], fill=255)
    return reshape_alpha(alpha, f)


def shape_celadon(sk, key, alpha):
    """청자: 받침 모서리를 둥글리고, 몸통 아래를 살짝 불룩하게."""
    bt, bo, x0, x1, cx = sk.base_top, sk.bottom, sk.base_x0, sk.base_x1, sk.cx
    def f(d, q):
        r = 5.0 * S / 1.5
        for sx, ex in ((x0, 1), (x1, -1)):
            for cy_, ey in ((bo, -1), (bt, 1)):
                d.rectangle([min(sx, sx + ex * r) * q, min(cy_, cy_ + ey * r) * q, max(sx, sx + ex * r) * q, max(cy_, cy_ + ey * r) * q], fill=0)
                cxr = sx + ex * r; cyr = cy_ + ey * r
                d.pieslice([(cxr - r) * q, (cyr - r) * q, (cxr + r) * q, (cyr + r) * q], 0, 360, fill=255)
        if key in ("P", "B"):
            top = sk.top
            d.ellipse([(cx - 1.8 * S) * q, (top - 3.4 * S) * q, (cx + 1.8 * S) * q, (top + 0.2 * S) * q], fill=255)   # 작은 꼭지
    return reshape_alpha(alpha, f)


def shape_crystal(sk, key, alpha):
    """크리스털: 꼭대기에 뾰족한 결정 하나."""
    cx = sk.cx
    def f(d, q):
        if key in ("P", "B"):
            top = sk.top
            d.polygon([((cx - 2.0 * S) * q, (top + 1.5) * q), ((cx + 2.0 * S) * q, (top + 1.5) * q), (cx * q, (top - 6.5 * S) * q)], fill=255)
    return reshape_alpha(alpha, f)


# ───────────────────────── 세트별 장식 문양 ─────────────────────────
def body_zone(sk, key):
    top, bt = sk.top, sk.base_top
    y0 = top + (sk.bottom - top) * ZONE[key]
    return y0, bt - 2


def decor_deco(sk, key, color, ink):
    gold = rgba("#E8C766" if color == "b" else "#A87A22", 235); gold2 = rgba("#FFF0B8" if color == "b" else "#7A5414", 200)
    y0, y1 = body_zone(sk, key); cx = sk.cx
    # 선버스트: 몸통 영역 맨 아래 가운데에서 부채꼴로 퍼지는 금 핀스트라이프
    zh = max(8, y1 - y0)
    for i, ang in enumerate(range(-66, 67, 11)):
        r1 = zh * (1.25 if i % 2 == 0 else 0.8)
        a = math.radians(ang - 90)
        ink.line([(cx + math.cos(a) * zh * 0.12, y1 + math.sin(a) * zh * 0.12), (cx + math.cos(a) * r1, y1 + math.sin(a) * r1)], gold if i % 2 == 0 else gold2, 0.55 * S / 3 + 0.2)
    # 받침 띠: 금 이중선 + 리벳
    bt, bo = sk.base_top, sk.bottom
    mid = (bt + bo) / 2
    x0, x1 = sk.width_at(mid)
    for y in (bt + 1.2 * S, mid, bo - 1.2 * S):
        a, b = sk.width_at(y); ink.line([(a + 1, y), (b - 1, y)], gold, 0.7)
    n = max(3, int((x1 - x0) / (7 * S / 3)))
    for k in range(n):
        x = x0 + (k + 0.5) * (x1 - x0) / n; ink.ellipse(x, (bt + mid) / 2 + 0.2 * S, 0.5 * S / 2, 0.5 * S / 2, fill=gold2)
    # 목 띠: V자 셰브론
    if key in ("P", "B", "R"):
        cy = COLLAR[key] * (sk.bottom - sk.top) + sk.top
        a, b = sk.width_at(cy)
        for dy in (0, 2.0 * S / 3):
            ink.line([(a + 1, cy + dy - 1.2 * S / 3), (cx, cy + dy + 1.4 * S / 3), (b - 1, cy + dy - 1.2 * S / 3)], gold, 0.6)


def decor_gothic(sk, key, color, ink):
    groove = rgba("#2B2A28" if color == "w" else "#050506", 230); hi = rgba("#FFFFFF", 70) if color == "w" else rgba("#9AA0AC", 90)
    win = (rgba("#1D2D55") if color == "w" else rgba("#F0A83A")); win2 = (rgba("#3F5C9C", 255) if color == "w" else rgba("#FFE29A", 255))
    y0, y1 = body_zone(sk, key); cx = sk.cx
    aw = min(0.17 * (sk.width_at((y0 + y1) / 2)[1] - sk.width_at((y0 + y1) / 2)[0]), 11 * S / 3)
    hh = (y1 - y0) * 0.86
    if key in ("P", "N"): aw *= 0.8; hh *= 0.8
    def lancet(cx_, yb, a, h, fill=None, outline=None, w=1.0):
        """첨두아치(정삼각 아치): 기둥 높이 + 두 호가 만나는 꼭짓점. h = 전체 높이."""
        rise = 1.732 * a; spring = yb - max(0.0, h - rise)
        left = [(cx_ + a - 2 * a * math.cos(math.radians(60 * k / 14)), spring - 2 * a * math.sin(math.radians(60 * k / 14))) for k in range(0, 15)]
        right = [(2 * cx_ - x, y) for x, y in reversed(left)]
        ink.poly([(cx_ - a, yb)] + left + right + [(cx_ + a, yb)], fill=fill, outline=outline, w=w)
    lancet(cx, y1, aw, hh, fill=win, outline=groove, w=0.9)
    lancet(cx, y1 - 0.8 * S / 3, aw * 0.62, hh * 0.84, fill=win2, outline=None)
    ink.line([(cx, y1), (cx, y1 - hh * 0.62)], groove, 0.7)
    ink.line([(cx - aw, y1 - hh * 0.3), (cx + aw, y1 - hh * 0.3)], groove, 0.5)
    lancet(cx, y1 + 0.6, aw + 1.2 * S / 3, hh + 1.6 * S / 3, fill=None, outline=hi, w=0.5)
    # 받침 아케이드: 작은 첨두아치 열
    bt, bo = sk.base_top, sk.bottom; x0, x1 = sk.width_at((bt + bo) / 2)
    n = max(4, int((x1 - x0) / (9 * S / 3))); step = (x1 - x0) / n
    for k in range(n):
        xc = x0 + (k + 0.5) * step; a = step * 0.32; yb = bo - 1.2 * S / 3; h = (bo - bt) * 0.62
        lancet(xc, yb, a, h, fill=groove if color == "b" else rgba("#4A4844", 200), outline=None)
    ink.line([(x0 + 1, bt + 0.8 * S / 3), (x1 - 1, bt + 0.8 * S / 3)], hi, 0.5)
    # 목 띠: 쌍선
    if key in ("P", "B", "R"):
        cy = COLLAR[key] * (sk.bottom - sk.top) + sk.top; a, b = sk.width_at(cy)
        ink.line([(a + 1, cy), (b - 1, cy)], groove, 0.6); ink.line([(a + 1, cy + 1.6 * S / 3), (b - 1, cy + 1.6 * S / 3)], hi, 0.5)


def decor_dancheong(sk, key, color, ink):
    RED, BLUE, GRN, YEL = rgba("#C23B2B"), rgba("#1F5FA8"), rgba("#2E8B57"), rgba("#E3B53A"); OUT = rgba("#F5EBD4" if color == "b" else "#4A2E1C", 230)
    bt, bo = sk.base_top, sk.bottom; x0, x1 = sk.width_at((bt + bo) / 2); cx = sk.cx
    # 받침: 머리초 마름모 띠
    n = max(4, int((x1 - x0) / (9 * S / 3))); step = (x1 - x0) / n; cy = (bt + bo) / 2 + 0.3 * S / 3
    cols = [RED, BLUE, GRN, YEL]
    for k in range(n):
        xc = x0 + (k + 0.5) * step; hw = step * 0.5; hh = (bo - bt) * 0.36
        ink.poly([(xc - hw, cy), (xc, cy - hh), (xc + hw, cy), (xc, cy + hh)], fill=cols[k % 4], outline=OUT, w=0.45)
    ink.line([(x0 + 1, bt + 1.0 * S / 3), (x1 - 1, bt + 1.0 * S / 3)], OUT, 0.55); ink.line([(x0 + 1, bo - 1.0 * S / 3), (x1 - 1, bo - 1.0 * S / 3)], OUT, 0.55)
    # 받침 바로 위: 연꽃잎 띠
    ya, yb = bt - 0.4, bt - 0.4
    a, b = sk.width_at(bt - 3 * S); n2 = max(3, int(round((b - a) / (7.5 * S)))); st2 = (b - a) / n2
    for k in range(n2):
        xc = a + (k + 0.5) * st2; r = st2 * 0.5
        ink.poly([(xc - r, yb), (xc - r * 0.6, yb - r * 1.1), (xc, yb - r * 1.55), (xc + r * 0.6, yb - r * 1.1), (xc + r, yb)], fill=(RED if k % 2 == 0 else YEL), outline=OUT, w=0.4)
    # 몸통 가운데: 태극 문양(작게)
    if key in ("P", "B", "R", "Q", "K", "N"):
        y0, y1 = body_zone(sk, key); y1 -= 6 * S; ym = (y0 + y1) / 2; r = min(6.0 * S, (y1 - y0) * 0.30)
        ink.ellipse(cx, ym, r, r, fill=BLUE, outline=OUT, w=0.5)
        ink.d.pieslice([(cx - r) * OS, (ym - r) * OS, (cx + r) * OS, (ym + r) * OS], 90, 270, fill=RED)
        ink.ellipse(cx, ym - r / 2, r / 2, r / 2, fill=RED); ink.ellipse(cx, ym + r / 2, r / 2, r / 2, fill=BLUE)
        ink.ellipse(cx, ym, r, r, outline=OUT, w=0.5)
    # 목 띠: 세 줄 단청 줄무늬
    if key in ("P", "B", "R"):
        cy2 = COLLAR[key] * (sk.bottom - sk.top) + sk.top; a2, b2 = sk.width_at(cy2)
        for k, c in enumerate((BLUE, RED, GRN)): ink.line([(a2 + 1, cy2 - 1.6 * S + k * 1.6 * S), (b2 - 1, cy2 - 1.6 * S + k * 1.6 * S)], c, 1.2 * S / 2)


def decor_celadon(sk, key, color, ink):
    inl = rgba("#2F5B49", 235) if color == "w" else rgba("#E9F2EC", 235)
    inl2 = rgba("#3F7A62", 200) if color == "w" else rgba("#BFD6CB", 190)
    y0, y1 = body_zone(sk, key); cx = sk.cx; ym = (y0 + y1) / 2
    r = min((y1 - y0) * 0.36, 0.18 * (sk.width_at(ym)[1] - sk.width_at(ym)[0]) + 4)
    r = max(r, 4.0 * S / 3)
    # 국화 상감: 꽃잎 타원 둘레 + 가운데 원
    for k in range(12):
        ang = math.radians(k * 30)
        px, py = cx + math.cos(ang) * r * 0.62, ym + math.sin(ang) * r * 0.62
        pts = []
        for s_ in range(0, 360, 30):
            a2 = math.radians(s_); ex, ey = math.cos(a2) * r * 0.40, math.sin(a2) * r * 0.16
            pts.append((px + ex * math.cos(ang) - ey * math.sin(ang), py + ex * math.sin(ang) + ey * math.cos(ang)))
        ink.poly(pts, fill=inl2, outline=inl, w=0.45)
    ink.ellipse(cx, ym, r * 0.28, r * 0.28, fill=inl, outline=None)
    ink.ellipse(cx, ym, r * 1.08, r * 1.08, outline=inl, w=0.5)
    # 받침: 여의두(구름머리) 띠
    bt, bo = sk.base_top, sk.bottom; x0, x1 = sk.width_at((bt + bo) / 2)
    n = max(4, int(round((x1 - x0) / (9 * S)))); step = (x1 - x0) / n; yb = bo - 1.6 * S
    for k in range(n):
        xc = x0 + (k + 0.5) * step; rr = step * 0.42
        ink.arc(xc, yb, rr, 180, 360, inl, 1.1); ink.arc(xc - rr * 0.62, yb, rr * 0.42, 180, 360, inl2, 0.9); ink.arc(xc + rr * 0.62, yb, rr * 0.42, 180, 360, inl2, 0.9)
    ink.line([(x0 + 1, bt + 1.0 * S / 3), (x1 - 1, bt + 1.0 * S / 3)], inl, 0.5)
    if key in ("P", "B", "R"):
        cy = COLLAR[key] * (sk.bottom - sk.top) + sk.top; a, b = sk.width_at(cy)
        ink.line([(a + 1, cy - 0.8 * S), (b - 1, cy - 0.8 * S)], inl, 1.0); ink.line([(a + 1, cy + 1.2 * S), (b - 1, cy + 1.2 * S)], inl2, 0.9)


def decor_crystal(sk, key, color, ink):
    return   # 크리스털은 장식 문양 대신 면 그라디언트·반짝임으로 표현한다(render 안)


# ───────────────────────── 재질 ─────────────────────────
def tex_deco(shape, color, seed):
    n = fbm(shape, 2.0, seed, 2); soft = fbm(shape, 30, seed + 3, 3)
    if color == "w":   # 샴페인 에나멜
        m = 1 + 0.025 * (n - 0.5) * 2 + 0.03 * (soft - 0.5) * 2
        return np.stack([m * 1.0, m * 0.985, m * 0.95], -1)
    m = 1 + 0.03 * (n - 0.5) * 2 + 0.05 * (soft - 0.5) * 2   # 칠흑 옻칠
    return np.stack([m, m, m * 1.04], -1)


def tex_stone(shape, color, seed):
    h, w = shape; gr = fbm(shape, 2.4, seed, 2); cl = fbm(shape, 22, seed + 2, 4)
    if color == "w":   # 석회암
        m = 1 + 0.07 * (gr - 0.5) * 2 + 0.10 * (cl - 0.5) * 2
        return np.stack([m * 1.0, m * 0.99, m * 0.95], -1)
    m = 1 + 0.08 * (gr - 0.5) * 2 + 0.14 * (cl - 0.5) * 2   # 슬레이트
    return np.stack([m * 0.97, m * 1.0, m * 1.06], -1)


def tex_hanji(shape, color, seed):
    fib = fbm(shape, 1.6, seed, 2, (1.0, 5.0)) ; fib2 = fbm(shape, 1.6, seed + 4, 2, (5.0, 1.0)); soft = fbm(shape, 26, seed + 7, 3)
    if color == "w":   # 한지
        m = 1 + 0.045 * (fib - 0.5) * 2 + 0.04 * (fib2 - 0.5) * 2 + 0.03 * (soft - 0.5) * 2
        return np.stack([m, m * 0.985, m * 0.94], -1)
    m = 1 + 0.06 * (fib - 0.5) * 2 + 0.06 * (soft - 0.5) * 2   # 먹 옻칠
    return np.stack([m * 0.98, m, m * 1.07], -1)


def tex_celadon(shape, color, seed):
    h, w = shape; rng = np.random.default_rng(seed); n = 10 if color == "w" else 14
    pts = np.stack([rng.random(n) * h, rng.random(n) * w], 1); yy, xx = np.mgrid[0:h, 0:w]
    d = np.stack([np.hypot(yy - p[0], xx - p[1]) for p in pts], 0); srt = np.sort(d, 0)
    crack = np.clip(1 - (srt[1] - srt[0]) / (1.4 * S), 0, 1) ** 1.6; gl = fbm(shape, 34, seed + 1, 3)
    m = 1 - 0.05 * crack + 0.07 * (gl - 0.5) * 2 if color == "w" else 1 + 0.12 * crack + 0.10 * (gl - 0.5) * 2
    return np.stack([m * 0.99, m * 1.01, m * 1.0], -1)


def tex_none(shape, color, seed):
    return np.ones(shape + (3,), np.float32)


SETS = {
    "deco": {   # 아르데코
        "body": {"w": "#EFE3C8", "b": "#17151B"}, "tex": tex_deco, "shape": shape_deco, "decor": decor_deco, "light": 0.05, "facet": 0.03, "line": 0.55,
        "metal": {"w": ["#7A5A18", "#B98A30", "#E8C766", "#FFF0B8"], "b": ["#9A7420", "#D4AC48", "#F3D98E", "#FFF3CA"]}, "outline": {"w": "#7A5A18", "b": "#D4AC48"},
    },
    "gothic": {   # 고딕 성당
        "body": {"w": "#CFC9BA", "b": "#2C3039"}, "tex": tex_stone, "shape": shape_gothic, "decor": decor_gothic, "light": 0.08, "facet": 0.06, "line": 0.75,
        "metal": {"w": ["#4A463E", "#6E695C", "#A19A88", "#D9D3C2"], "b": ["#6B5A3A", "#A58A52", "#D9BE82", "#F3E2B4"]}, "outline": {"w": "#3E3A33", "b": "#0A0B0E"},
    },
    "dancheong": {   # 단청
        "body": {"w": "#F1E8D2", "b": "#1D2230"}, "tex": tex_hanji, "shape": shape_dancheong, "decor": decor_dancheong, "light": 0.05, "facet": 0.03, "line": 0.7,
        "metal": {"w": ["#8A6A1E", "#C29A38", "#E8CB78", "#FFF0BC"], "b": ["#A8821F", "#D8B24C", "#F0D68A", "#FFF3C6"]}, "outline": {"w": "#5A3A20", "b": "#E3B53A"},
    },
    "celadon": {   # 청자 상감
        "body": {"w": "#CFE2D6", "b": "#2E4A40"}, "tex": tex_celadon, "shape": shape_celadon, "decor": decor_celadon, "light": 0.06, "facet": 0.035, "line": 0.55,
        "metal": {"w": ["#2F5B49", "#4C8068", "#8DB9A3", "#D7EBE0"], "b": ["#A9C4B7", "#D3E4DB", "#EFF7F2", "#FFFFFF"]}, "outline": {"w": "#2F5B49", "b": "#CFE3D8"},
    },
    "crystal": {   # 크리스털 주얼
        "body": {"w": "#CFE6FA", "b": "#7C1A38"}, "tex": tex_none, "shape": shape_crystal, "decor": decor_crystal, "light": 0.10, "facet": 0.0, "line": 1.0, "crystal": True,
        "facetramp": {"w": ["#F6FBFF", "#BFE0FA", "#7FB4F0", "#4A7FD6"], "b": ["#FFB0C0", "#E8456A", "#B01E48", "#5C0E28"]},
        "metal": {"w": ["#9CC4F2", "#DDEEFF", "#FFFFFF", "#FFFFFF"], "b": ["#FFC2CE", "#FFE0E6", "#FFFFFF", "#FFFFFF"]}, "outline": {"w": "#3F6FC4", "b": "#4A0A20"},
    },
}


def render(color, key, st):
    sk = Skeleton(color, NAMES[key]); sk.anatomy()
    H, W = sk.H, sk.W
    alpha = st["shape"](sk, key, sk.alpha)
    alpha = np.clip(alpha, 0, 1)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    seed = (ord(NAMES[key][0]) * 31 + (7 if color == "b" else 3)) * 13
    light = 1 + st["light"] * ((0.5 - yy / H) * 1.2 + (0.5 - xx / W) * 0.8)
    rng = np.random.default_rng(seed)
    delta = np.zeros(sk.n + 2, np.float32)
    for i, inf in sk.facet_info.items():
        lit = 0.5 - inf["cy"] * 0.6 - (inf["cx"] - 0.5) * 0.4
        delta[i] = (rng.random() - 0.5) * 2 * st["facet"] + lit * st["facet"] * 0.8
    base = hexc(st["body"][color])
    body = base[None, None, :] * (light * (1 + delta[sk.lab]))[..., None] * st["tex"]((H, W), color, seed)
    if st.get("crystal"):   # 면마다 다른 색 그라디언트 + 반짝이는 모서리
        fr = np.zeros((H, W), np.float32)
        for i, inf in sk.facet_info.items():
            m = sk.lab == i
            if not m.any(): continue
            ys, xs = np.nonzero(m)
            ang = rng.random() * 2 * math.pi; ux, uy = math.cos(ang), math.sin(ang)
            proj = (xs - xs.mean()) * ux + (ys - ys.mean()) * uy
            rng_ = (np.ptp(proj) + 1e-6)
            t0 = np.clip(0.5 + (inf["cy"] * -0.55) + (rng.random() - 0.5) * 0.7 + 0.35, 0, 1)
            fr[ys, xs] = np.clip(t0 + (proj / rng_) * 0.38, 0, 1)
        body = ramp(fr, st["facetramp"][color]) * light[..., None]
    # 장식 문양
    ink = Ink(W, H); st["decor"](sk, key, color, ink); ov = ink.result()
    oa = (ov[..., 3] / 255.0)[..., None]
    body = body * (1 - oa) + ov[..., :3] * oa
    # 금속 선·삼각형(기본 분할선)
    metal = ramp(0.25 + 0.75 * sk.t, st["metal"][color]) * (1 + st["light"] * 0.6 * (0.5 - yy / H))[..., None]
    # 큰 삼각형 포인트는 그대로, 가는 분할선만 세트별로 약하게(line)
    big = ndi.binary_dilation(ndi.binary_opening(sk.g > 0.5, structure=np.ones((2 * S, 2 * S))), iterations=S)
    G = np.where(big, sk.g, sk.g * st["line"])[..., None]
    out = body * (1 - G) + metal * G
    # 실루엣 테두리: 안쪽으로 1.2px 어두운(또는 밝은) 윤곽 + 안쪽 베벨 하이라이트
    m = alpha > 0.5
    er = ndi.binary_erosion(m, iterations=max(1, int(S * 0.55)))
    edge = (m & ~er).astype(np.float32)
    edge = ndi.gaussian_filter(edge, 0.5)
    oc = hexc(st["outline"][color])
    out = out * (1 - 0.8 * edge[..., None]) + oc[None, None, :] * 0.8 * edge[..., None]
    if st.get("crystal"):   # 크리스털: 반짝이는 별(4방향)
        for _ in range(3 if key in ("Q", "K", "N") else 2):
            ys, xs = np.nonzero(er & (sk.g < 0.2))
            if len(ys):
                j = rng.integers(len(ys)); cy, cx = ys[j], xs[j]; L = 4 * S
                for d_ in range(-L, L + 1):
                    f = 1 - abs(d_) / L
                    for (py, px) in ((cy + d_, cx), (cy, cx + d_)):
                        if 0 <= py < H and 0 <= px < W and alpha[py, px] > 0.4: out[py, px] = out[py, px] * (1 - f) + 255 * f
    rgba_ = np.concatenate([np.clip(out, 0, 255), (alpha * 255)[..., None]], -1).astype(np.uint8)
    return Image.fromarray(rgba_, "RGBA")


def main():
    only = sys.argv[1:]
    for sid, st in SETS.items():
        if only and sid not in only: continue
        d = os.path.join(PUB, "pieces", sid); os.makedirs(d, exist_ok=True)
        for color, cname in (("w", "white"), ("b", "black")):
            for key, nm in NAMES.items():
                render(color, key, st).save(os.path.join(d, f"{cname}-{nm.lower()}.webp"), "WEBP", quality=84, method=6)
        print("✔", sid)


if __name__ == "__main__":
    main()
