#!/usr/bin/env python3
"""(v0.6.9) 기본 기물(public/{White,Black} *.png)에서 스킨 세트 기물 이미지를 만든다 → public/pieces/<세트>/<white|black>-<기물>.webp

기본 기물에서는 바깥 실루엣(알파)만 쓴다 — 기본 스킨의 금색 분할선·삼각형 포인트는 만든 사람의 디자인 요소라 이 세트들에서는 쓰지 않는다.
세트마다 몸통 안쪽을 전부 새로 설계한다.
  · 아르데코: 세로 홈(fluting)과 금 인레이 띠·마름모, 머리 동심원 선버스트
  · 고딕 성당: 석재 쌓기(ashlar), 첨두아치 창, 장미창, 기둥, 아케이드 받침
  · 단청: 층층 오방색 띠, 연꽃잎, 마름모 띠, 태극
  · 청자 상감: 덩굴 문양, 국화 메달리온, 여의두 구름 띠
  · 크리스털 주얼: 실루엣 안을 새로 삼각분할한 보석 절단면(면마다 빛깔·반짝임)
  · 외형: 받침 모양(모따기·계단·피너클·처마·둥근 모서리), 꼭대기 장식(스파이어·첨탑·보주·꼭지·결정)을 실루엣에 조금씩 더한다.
출력은 기본의 S(=3)배 해상도 캔버스에 기물을 K(=0.94)배로 줄여 아래 가운데에 붙인 이미지다(꼭대기·옆 장식 여백). theme.js의 SKIN_PIECE_SCALE·basePx와 같은 값을 쓴다.
실행: python3 scripts/build-skin-pieces.py [세트…]   (numpy·scipy·Pillow 필요. 결과 이미지는 저장소에 커밋한다 — 빌드에서는 실행하지 않는다)
새 세트: SETS에 항목을 더하고 theme.js의 PIECE_SKINS·BOARD_SKINS·SKIN_SETS와 이미지 세트 목록에 같은 id를 추가한다(check-skins가 확인).
"""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi
from scipy.spatial import Delaunay

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


# ───────────────────────── 분석 도구 ─────────────────────────
ZONE = {"P": 0.46, "B": 0.56, "R": 0.58, "Q": 0.50, "K": 0.50, "N": 0.58}      # 몸통 장식 시작(전체 높이 비율)
COLLAR = {"P": 0.35, "B": 0.50, "R": 0.53}
EMBLEM = {"B": 0.30, "R": 0.38, "Q": 0.66, "K": 0.62, "N": 0.50}                # 엠블럼(태극·장미창·국화) 세로 위치


class Ext:
    """행마다 알파의 왼쪽·오른쪽 끝 — 실루엣을 따라 줄어드는 세로 무늬를 그리는 기준."""

    def __init__(self, alpha, cx):
        m = alpha > 0.5; H, W = m.shape
        has = m.any(1)
        self.x0 = np.where(has, m.argmax(1), cx).astype(np.float32)
        self.x1 = np.where(has, W - 1 - m[:, ::-1].argmax(1), cx).astype(np.float32)
        self.H, self.W = H, W

    def span(self, y):
        y = int(np.clip(y, 0, self.H - 1)); return float(self.x0[y]), float(self.x1[y])

    def at(self, y, f):
        a, b = self.span(y); return a + f * (b - a)


def components(alpha):
    lab, n = ndi.label(alpha > 0.5); tot = float((alpha > 0.5).sum()); res = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        res.append({"area": len(ys), "cy": float(ys.mean()), "cx": float(xs.mean()), "y0": int(ys.min()), "y1": int(ys.max()), "x0": int(xs.min()), "x1": int(xs.max()), "frac": len(ys) / tot})
    return sorted(res, key=lambda c: c["y0"])


def head_and_jewels(comps, key):
    """폰의 둥근 머리 하나, 그리고 퀸 끝 공 같은 작은 둥근 조각(보석)들."""
    head, jewels = None, []
    for c in comps:
        w, h = c["x1"] - c["x0"] + 1, c["y1"] - c["y0"] + 1
        rnd = c["area"] / float(w * h)
        if c["frac"] < 0.5 and rnd > 0.68 and 0.7 < w / float(h) < 1.4:
            if key == "P" and head is None and c["frac"] > 0.12: head = c
            elif c["frac"] < 0.1: jewels.append(c)
    return head, jewels


def emblem_pos(sk, key, ext, head):
    if head is not None: return head["cx"], head["cy"], min(head["x1"] - head["x0"], head["y1"] - head["y0"]) / 2.0
    y = sk.top + (sk.bottom - sk.top) * EMBLEM.get(key, 0.5)
    a, b = ext.span(y); return (a + b) / 2.0, y, max(6.0 * S, min((b - a) * 0.17, 9.0 * S))


def volume(alpha, ext, strength):
    """원통 느낌의 명암: 왼쪽 위 밝음, 오른쪽 어두움, 가장자리 살짝 어두움."""
    H, W = alpha.shape; xs = np.arange(W, dtype=np.float32)[None, :]
    x0, x1 = ext.x0[:, None], ext.x1[:, None]
    u = np.clip((xs - x0) / np.maximum(x1 - x0, 1.0), 0, 1)
    v = (0.5 - u) * 0.8 + 0.45 * np.exp(-((u - 0.30) / 0.11) ** 2) - 0.55 * np.exp(-((u - 0.96) / 0.07) ** 2) - 0.25 * np.exp(-((u - 0.04) / 0.06) ** 2)
    yy = np.arange(H, dtype=np.float32)[:, None] / H
    return 1 + strength * v + 0.04 * (0.5 - yy)


def lancet(ink, cx_, yb, a, h, fill=None, outline=None, w=1.0):
    """첨두아치(정삼각 아치): 기둥 높이 + 두 호가 만나는 꼭짓점. h = 전체 높이."""
    rise = 1.732 * a; spring = yb - max(0.0, h - rise)
    left = [(cx_ + a - 2 * a * math.cos(math.radians(60 * k / 14)), spring - 2 * a * math.sin(math.radians(60 * k / 14))) for k in range(0, 15)]
    right = [(2 * cx_ - x, y) for x, y in reversed(left)]
    ink.poly([(cx_ - a, yb)] + left + right + [(cx_ + a, yb)], fill=fill, outline=outline, w=w)


def taegeuk(ink, cx, cy, r, red, blue, out):
    ink.ellipse(cx, cy, r, r, fill=blue)
    ink.d.pieslice([(cx - r) * OS, (cy - r) * OS, (cx + r) * OS, (cy + r) * OS], 90, 270, fill=red)
    ink.ellipse(cx, cy - r / 2, r / 2, r / 2, fill=red); ink.ellipse(cx, cy + r / 2, r / 2, r / 2, fill=blue)
    ink.ellipse(cx, cy, r, r, outline=out, w=0.9)


def chrysanthemum(ink, cx, cy, r, fill, line):
    for k in range(12):
        ang = math.radians(k * 30); px, py = cx + math.cos(ang) * r * 0.62, cy + math.sin(ang) * r * 0.62; pts = []
        for s_ in range(0, 360, 30):
            a2 = math.radians(s_); ex, ey = math.cos(a2) * r * 0.40, math.sin(a2) * r * 0.16
            pts.append((px + ex * math.cos(ang) - ey * math.sin(ang), py + ex * math.sin(ang) + ey * math.cos(ang)))
        ink.poly(pts, fill=fill, outline=line, w=0.8)
    ink.ellipse(cx, cy, r * 0.26, r * 0.26, fill=line); ink.ellipse(cx, cy, r * 1.08, r * 1.08, outline=line, w=0.9)


# ───────────────────────── 세트별 내부 설계 ─────────────────────────
def decor_deco(sk, key, color, ink, ext, comps):
    gold = rgba("#E8C766" if color == "b" else "#B4862A", 245); gd = rgba("#9A7420" if color == "b" else "#6E4C12", 225)
    head, jewels = head_and_jewels(comps, key)
    ys = sk.top + (sk.bottom - sk.top) * ZONE[key]; yb = sk.base_top - 1.5 * S
    for i, f in enumerate((0.2, 0.35, 0.5, 0.65, 0.8)):   # 세로 홈(fluting): 실루엣을 따라 모이는 선
        pts = [(ext.at(y, f), y) for y in np.arange(ys, yb, 2.0)]
        ink.line(pts, gold if i % 2 == 0 else gd, 2.6 if i % 2 == 0 else 1.5)
    for dy, wd in ((2.2 * S, 3.0), (5.0 * S, 1.8), (7.4 * S, 1.2)):         # 지구라트 띠
        y = yb - dy; a, b = ext.span(y); ink.line([(a, y), (b, y)], gold, wd)
    fx = ext.at(yb, 0.5); R = (yb - ys) * 0.5                                     # 몸통 아래쪽 부채꼴(번갈아 채운 쐐기)
    for k in range(-5, 5):
        a0, a1 = math.radians(-90 + k * 15 + 1.2), math.radians(-90 + (k + 1) * 15 - 1.2)
        if k % 2 == 0: ink.poly([(fx + math.cos(a0) * R * 0.18, yb + math.sin(a0) * R * 0.18), (fx + math.cos(a0) * R, yb + math.sin(a0) * R), (fx + math.cos(a1) * R, yb + math.sin(a1) * R), (fx + math.cos(a1) * R * 0.18, yb + math.sin(a1) * R * 0.18)], fill=(gold if color == "b" else gd))
    ym = ys + (yb - ys) * 0.28; dw, dh = 3.4 * S, 5.2 * S                 # 중심 마름모 인레이
    cxm = ext.at(ym, 0.5)
    ink.poly([(cxm, ym - dh), (cxm + dw, ym), (cxm, ym + dh), (cxm - dw, ym)], fill=gold, outline=gd, w=0.9)
    ink.poly([(cxm, ym - dh * 0.5), (cxm + dw * 0.5, ym), (cxm, ym + dh * 0.5), (cxm - dw * 0.5, ym)], fill=gd)
    if head is not None:                                       # 폰 머리: 동심원 + 선버스트
        r = (head["x1"] - head["x0"]) / 2.0
        for k in range(16):
            a = math.radians(k * 22.5); ink.line([(head["cx"] + math.cos(a) * r * 0.28, head["cy"] + math.sin(a) * r * 0.28), (head["cx"] + math.cos(a) * r * 0.78, head["cy"] + math.sin(a) * r * 0.78)], gold, 0.8)
        ink.ellipse(head["cx"], head["cy"], r * 0.82, r * 0.82, outline=gold, w=1.4); ink.ellipse(head["cx"], head["cy"], r * 0.25, r * 0.25, fill=gold)
    if key == "B":                                              # 비숍 미트라: 부채꼴 선버스트
        cy0 = sk.top + (sk.bottom - sk.top) * 0.47
        for ang in range(-52, 53, 13):
            a = math.radians(ang - 90); ink.line([(sk.cx + math.cos(a) * 3 * S, cy0 + math.sin(a) * 3 * S), (sk.cx + math.cos(a) * 20 * S, cy0 + math.sin(a) * 20 * S)], gold, 1.0)
    for j in jewels:                                            # 퀸 끝 공: 금 보석
        r = (j["x1"] - j["x0"]) / 2.0; ink.ellipse(j["cx"], j["cy"], r * 0.7, r * 0.7, fill=gold, outline=gd, w=0.9); ink.ellipse(j["cx"] - r * 0.2, j["cy"] - r * 0.25, r * 0.22, r * 0.22, fill=rgba("#FFF6D0"))
    bt, bo = sk.base_top, sk.bottom; mid = (bt + bo) / 2.0                     # 받침: 금 이중선 + 리벳
    for y in (bt + 1.2 * S, mid, bo - 1.2 * S):
        a, b = ext.span(y); ink.line([(a + 1, y), (b - 1, y)], gold, 1.1)
    x0, x1 = ext.span(mid); n = max(3, int((x1 - x0) / (6 * S)))
    for k in range(n): ink.ellipse(x0 + (k + 0.5) * (x1 - x0) / n, (bt + mid) / 2 + 0.2 * S, 0.9, 0.9, fill=gold)


def decor_gothic(sk, key, color, ink, ext, comps):
    groove = rgba("#2B2A28" if color == "w" else "#050506", 215); hi = rgba("#FFFFFF", 80) if color == "w" else rgba("#8F96A4", 110)
    glass = rgba("#1D2D55") if color == "w" else rgba("#F0A83A"); glass2 = rgba("#4A68AE") if color == "w" else rgba("#FFE29A")
    head, jewels = head_and_jewels(comps, key)
    ys = sk.top + (sk.bottom - sk.top) * ZONE[key]; yb = sk.base_top - 1.5 * S
    ch, cw = 6.5 * S, 13 * S; j = 0; y = ys                                       # 석재 쌓기
    while y < yb:
        a, b = ext.span(y + 1); ink.line([(a, y), (b, y)], groove, 0.9)
        x = a + (0 if j % 2 == 0 else cw / 2)
        while x < b: ink.line([(x, y), (x, min(y + ch, yb))], groove, 0.8); x += cw
        y += ch; j += 1
    for f in (0.08, 0.92):                                                          # 벽기둥(콜로네트)
        ink.line([(ext.at(y_, f), y_) for y_ in np.arange(ys, yb, 2.0)], hi, 1.4)
    ym = (ys + yb) / 2; a, b = ext.span(ym); aw = max(3.0 * S, min((b - a) * 0.17, 7 * S)); hh = (yb - ys) * 0.78
    cxw = ext.at(ym, 0.5)
    lancet(ink, cxw, yb - 0.8 * S, aw + 1.2 * S, hh + 1.6 * S, fill=rgba("#000000", 70), outline=hi, w=0.8)
    lancet(ink, cxw, yb - 0.8 * S, aw, hh, fill=glass, outline=groove, w=1.1)
    lancet(ink, cxw, yb - 1.4 * S, aw * 0.6, hh * 0.82, fill=glass2)
    ink.line([(cxw, yb - 0.8 * S), (cxw, yb - hh * 0.6)], groove, 0.9); ink.line([(cxw - aw, yb - hh * 0.32), (cxw + aw, yb - hh * 0.32)], groove, 0.7)
    ex, ey, er = emblem_pos(sk, key, ext, head)                                     # 장미창
    if key != "Q" or True:
        ink.ellipse(ex, ey, er * 0.78, er * 0.78, fill=glass, outline=groove, w=1.3)
        for k in range(8):
            a2 = math.radians(k * 45); ink.line([(ex, ey), (ex + math.cos(a2) * er * 0.78, ey + math.sin(a2) * er * 0.78)], groove, 0.9)
            ink.ellipse(ex + math.cos(a2 + 0.39) * er * 0.5, ey + math.sin(a2 + 0.39) * er * 0.5, er * 0.15, er * 0.15, fill=glass2)
        ink.ellipse(ex, ey, er * 0.2, er * 0.2, fill=glass2, outline=groove, w=0.8); ink.ellipse(ex, ey, er * 0.95, er * 0.95, outline=hi, w=0.8)
    bt, bo = sk.base_top, sk.bottom; x0, x1 = ext.span((bt + bo) / 2); n = max(4, int(round((x1 - x0) / (9 * S)))); step = (x1 - x0) / n   # 아케이드 받침
    for k in range(n):
        lancet(ink, x0 + (k + 0.5) * step, bo - 1.2 * S, step * 0.32, (bo - bt) * 0.62, fill=groove if color == "b" else rgba("#4A4844", 205))
    ink.line([(x0 + 1, bt + 0.8 * S), (x1 - 1, bt + 0.8 * S)], hi, 0.9)


def decor_dancheong(sk, key, color, ink, ext, comps):
    RED, BLUE, GRN, YEL, WHT = rgba("#C23B2B"), rgba("#1F5FA8"), rgba("#2E8B57"), rgba("#E3B53A"), rgba("#F6EFE0"); OUT = rgba("#F5EBD4" if color == "b" else "#4A2E1C", 230)
    head, jewels = head_and_jewels(comps, key)
    ys = sk.top + (sk.bottom - sk.top) * ZONE[key]; yb = sk.base_top - 6 * S
    n = 5; cols = [BLUE, RED, YEL, GRN, WHT]
    for i in range(n):                                                               # 층층 오방색 띠
        y = ys + (yb - ys) * (i + 0.5) / n
        a, b = ext.span(y); hh = 1.5 * S
        ink.poly([(a, y - hh), (b, y - hh), (b, y + hh), (a, y + hh)], fill=cols[i], outline=OUT, w=0.8)
        ink.line([(a, y), (b, y)], OUT, 0.5) if False else None
    ex, ey, er = emblem_pos(sk, key, ext, head)
    taegeuk(ink, ex, ey, er * (0.78 if head is not None else 1.0), RED, BLUE, OUT)
    if head is not None:                                                             # 머리 둘레 구슬 띠
        for k in range(14):
            a = math.radians(k * 360 / 14); ink.ellipse(ex + math.cos(a) * er * 0.92, ey + math.sin(a) * er * 0.92, 1.5, 1.5, fill=cols[k % 4])
    for j in jewels: r = (j["x1"] - j["x0"]) / 2.0; ink.ellipse(j["cx"], j["cy"], r * 0.6, r * 0.6, fill=RED, outline=OUT, w=0.9); ink.ellipse(j["cx"], j["cy"], r * 0.25, r * 0.25, fill=YEL)
    bt, bo = sk.base_top, sk.bottom; x0, x1 = ext.span((bt + bo) / 2); cy = (bt + bo) / 2 + 0.3 * S      # 받침: 마름모 띠
    n = max(4, int(round((x1 - x0) / (8 * S)))); step = (x1 - x0) / n
    for k in range(n):
        xc = x0 + (k + 0.5) * step; hw = step * 0.5; hh = (bo - bt) * 0.36
        ink.poly([(xc - hw, cy), (xc, cy - hh), (xc + hw, cy), (xc, cy + hh)], fill=cols[k % 4], outline=OUT, w=0.8)
    ink.line([(x0 + 1, bt + 1.0 * S), (x1 - 1, bt + 1.0 * S)], OUT, 0.9); ink.line([(x0 + 1, bo - 1.0 * S), (x1 - 1, bo - 1.0 * S)], OUT, 0.9)
    a, b = ext.span(bt - 3 * S); n2 = max(3, int(round((b - a) / (7.5 * S)))); st2 = (b - a) / n2; yb2 = bt - 0.4  # 연꽃잎 띠
    for k in range(n2):
        xc = a + (k + 0.5) * st2; r = st2 * 0.5
        ink.poly([(xc - r, yb2), (xc - r * 0.6, yb2 - r * 1.1), (xc, yb2 - r * 1.55), (xc + r * 0.6, yb2 - r * 1.1), (xc + r, yb2)], fill=(RED if k % 2 == 0 else YEL), outline=OUT, w=0.7)


def decor_celadon(sk, key, color, ink, ext, comps):
    inl = rgba("#2F5B49", 240) if color == "w" else rgba("#E9F2EC", 240); inl2 = rgba("#4C8068", 205) if color == "w" else rgba("#BFD6CB", 195)
    head, jewels = head_and_jewels(comps, key)
    ys = sk.top + (sk.bottom - sk.top) * ZONE[key]; yb = sk.base_top - 3 * S
    for f0, sgn in ((0.20, 1), (0.80, -1)):                                          # 좌우 덩굴
        pts = [(ext.at(y, f0 + sgn * 0.05 * math.sin((y - ys) / (5.5 * S))), y) for y in np.arange(ys, yb, 1.5)]
        ink.line(pts, inl, 1.3)
        for k, y in enumerate(np.arange(ys + 3 * S, yb - 2 * S, 5.5 * S * math.pi / 2)):
            x = ext.at(y, f0 + sgn * 0.05 * math.sin((y - ys) / (5.5 * S))); d = 1 if k % 2 == 0 else -1
            ink.poly([(x, y), (x + d * 3.2 * S, y - 1.6 * S), (x + d * 4.6 * S, y + 0.3 * S), (x + d * 2.4 * S, y + 1.5 * S)], fill=inl2, outline=inl, w=0.8)
    ex, ey, er = emblem_pos(sk, key, ext, head)
    chrysanthemum(ink, ex, ey, er * (0.82 if head is not None else 0.95), inl2, inl)
    for j in jewels: r = (j["x1"] - j["x0"]) / 2.0; ink.ellipse(j["cx"], j["cy"], r * 0.55, r * 0.55, fill=inl2, outline=inl, w=0.9)
    bt, bo = sk.base_top, sk.bottom; x0, x1 = ext.span((bt + bo) / 2); n = max(4, int(round((x1 - x0) / (9 * S)))); step = (x1 - x0) / n; yb3 = bo - 1.6 * S   # 여의두 구름 띠
    for k in range(n):
        xc = x0 + (k + 0.5) * step; rr = step * 0.42
        ink.arc(xc, yb3, rr, 180, 360, inl, 1.1); ink.arc(xc - rr * 0.62, yb3, rr * 0.42, 180, 360, inl2, 0.9); ink.arc(xc + rr * 0.62, yb3, rr * 0.42, 180, 360, inl2, 0.9)
    ink.line([(x0 + 1, bt + 1.0 * S), (x1 - 1, bt + 1.0 * S)], inl, 1.0)
    if key in COLLAR:
        cy = sk.top + (sk.bottom - sk.top) * COLLAR[key]; a, b = ext.span(cy)
        ink.line([(a + 1, cy - 0.8 * S), (b - 1, cy - 0.8 * S)], inl, 1.0); ink.line([(a + 1, cy + 1.2 * S), (b - 1, cy + 1.2 * S)], inl2, 0.9)


def decor_none(sk, key, color, ink, ext, comps):
    return


def crystal_layer(alpha, key, color, seed, ramp_stops):
    """실루엣 안을 새로 삼각분할(Delaunay)한 보석 절단면. 삼각형마다 빛깔을 칠하고 모서리를 밝게 그린다 → (H, W, 3) 색, (H, W) 모서리 강도."""
    H, W = alpha.shape; m = alpha > 0.5; rng = np.random.default_rng(seed)
    er = ndi.binary_erosion(m, iterations=2); edge = m & ~er
    ey, ex = np.nonzero(edge)
    pts = []; seen = set(); c2 = int(9 * S)                                  # 가장자리를 고르게(칸마다 하나) 뽑아 실루엣 끝까지 삼각형이 덮이게
    for i in rng.permutation(len(ey)):
        k = (int(ey[i]) // c2, int(ex[i]) // c2)
        if k not in seen: seen.add(k); pts.append((int(ex[i]), int(ey[i])))
    cell = 14 * S; gy, gx = np.nonzero(ndi.binary_erosion(m, iterations=int(3 * S)))
    for yy_ in range(0, H, cell):
        for xx_ in range(0, W, cell):
            px, py = xx_ + rng.integers(0, cell), yy_ + rng.integers(0, cell)
            if py < H and px < W and m[py, px] and er[py, px]: pts.append((px, py))
    pts = np.array(pts, np.float64)
    tri = Delaunay(pts)
    fill0 = tuple(int(v) for v in ramp(np.array(0.5), ramp_stops))
    big = Image.new("RGB", (W * 2, H * 2), fill0); d = ImageDraw.Draw(big)
    el = Image.new("L", (W * 2, H * 2), 0); de = ImageDraw.Draw(el)
    for simplex in tri.simplices:
        p = pts[simplex]; c = p.mean(0); cx, cy = int(c[0]), int(c[1])
        if not (0 <= cx < W and 0 <= cy < H and m[cy, cx]): continue
        ang = math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0])
        t = np.clip(0.52 + 0.30 * (0.5 - cy / H) + 0.22 * (0.5 - cx / W) + 0.34 * (math.sin(ang * 3.0 + simplex.sum()) * 0.5) + (rng.random() - 0.5) * 0.18, 0, 1)
        col = tuple(int(v) for v in ramp(np.array(t), ramp_stops))
        poly = [(float(q[0] * 2), float(q[1] * 2)) for q in p]
        d.polygon(poly, fill=col); de.line(poly + [poly[0]], fill=255, width=2)
    col = np.asarray(big.resize((W, H), Image.LANCZOS), np.float32)
    edge_i = np.asarray(el.resize((W, H), Image.LANCZOS), np.float32) / 255.0
    return col, edge_i


SETS = {
    "deco": {"body": {"w": "#EFE3C8", "b": "#17151B"}, "tex": tex_deco, "shape": shape_deco, "decor": decor_deco, "vol": 0.10, "inset": {"w": "#B4862A", "b": "#E8C766"}, "outline": {"w": "#7A5A18", "b": "#D4AC48"}},
    "gothic": {"body": {"w": "#CFC9BA", "b": "#2C3039"}, "tex": tex_stone, "shape": shape_gothic, "decor": decor_gothic, "vol": 0.13, "outline": {"w": "#3E3A33", "b": "#0A0B0E"}},
    "dancheong": {"body": {"w": "#F1E8D2", "b": "#1D2230"}, "tex": tex_hanji, "shape": shape_dancheong, "decor": decor_dancheong, "vol": 0.09, "outline": {"w": "#5A3A20", "b": "#E3B53A"}},
    "celadon": {"body": {"w": "#CFE2D6", "b": "#2E4A40"}, "tex": tex_celadon, "shape": shape_celadon, "decor": decor_celadon, "vol": 0.12, "inset": {"w": "#4C8068", "b": "#BFD6CB"}, "outline": {"w": "#2F5B49", "b": "#CFE3D8"}},
    "crystal": {"body": {"w": "#CFE6FA", "b": "#7C1A38"}, "tex": tex_none, "shape": shape_crystal, "decor": decor_none, "vol": 0.0, "crystal": True,
                "facetramp": {"w": ["#F6FBFF", "#BFE0FA", "#7FB4F0", "#4A7FD6"], "b": ["#FFB0C0", "#E8456A", "#B01E48", "#5C0E28"]}, "outline": {"w": "#3F6FC4", "b": "#4A0A20"}},
}


def render(color, key, st):
    sk = Skeleton(color, NAMES[key]); sk.anatomy()
    H, W = sk.H, sk.W
    alpha = np.clip(st["shape"](sk, key, sk.alpha), 0, 1)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    seed = (ord(NAMES[key][0]) * 31 + (7 if color == "b" else 3)) * 13
    ext = Ext(alpha, sk.cx); comps = components(alpha)
    base = hexc(st["body"][color])
    if st.get("crystal"):
        col, edge_i = crystal_layer(alpha, key, color, seed, st["facetramp"][color])
        out = col * (1 + 0.06 * (0.5 - yy / H))[..., None]
        out = out * (1 - 0.35 * edge_i[..., None]) + 255 * 0.35 * edge_i[..., None]
    else:
        out = base[None, None, :] * volume(alpha, ext, st["vol"])[..., None] * st["tex"]((H, W), color, seed)
        ink = Ink(W, H); st["decor"](sk, key, color, ink, ext, comps); ov = ink.result()
        oa = (ov[..., 3] / 255.0)[..., None]
        out = out * (1 - oa) + ov[..., :3] * oa
    m = alpha > 0.5
    if st.get("inset"):   # 실루엣을 따라 안쪽으로 들어간 가는 선(아르데코 금 핀스트라이프·청자 테두리 선)
        o, w_ = int(3.2 * S), max(2, int(0.55 * S))
        ring = ndi.gaussian_filter((ndi.binary_erosion(m, iterations=o) & ~ndi.binary_erosion(m, iterations=o + w_)).astype(np.float32), 0.6)
        out = out * (1 - 0.9 * ring[..., None]) + hexc(st["inset"][color])[None, None, :] * 0.9 * ring[..., None]
    er = ndi.binary_erosion(m, iterations=max(1, int(S * 0.55)))
    edge = ndi.gaussian_filter((m & ~er).astype(np.float32), 0.5)
    oc = hexc(st["outline"][color])
    out = out * (1 - 0.85 * edge[..., None]) + oc[None, None, :] * 0.85 * edge[..., None]
    if st.get("crystal"):   # 반짝이는 별
        rng = np.random.default_rng(seed + 1)
        for _ in range(3 if key in ("Q", "K", "N") else 2):
            ys, xs = np.nonzero(er)
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
