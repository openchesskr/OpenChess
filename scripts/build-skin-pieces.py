#!/usr/bin/env python3
"""(v0.6.9) 기본 기물(public/{White,Black} *.png)에서 스킨 세트 기물 이미지를 만든다 → public/pieces/<세트>/<white|black>-<기물>.webp

기본 기물에서는 바깥 실루엣(알파)만 쓴다 — 기본 스킨의 금색 분할선·삼각형 포인트는 만든 사람의 디자인 요소라 이 세트들에서는 쓰지 않는다.
세트마다 몸통 안쪽을 전부 새로 설계한다.
  · 아르데코: 세로 홈(fluting)과 금 인레이 띠·마름모·부채꼴, 머리 동심원 선버스트, 금 핀스트라이프
  · 산호와 진주: 진주 자개 몸통에 조개 능선(부채꼴), 산호 가지, 진주 목걸이와 진주 머리, 물거품 받침
  · 비취 용: 비취(백)·흑요석(흑) 몸통 전체를 덮는 겹친 용 비늘, 여의주 머리, 금 구름 메달리온, 청해파 받침, 뿔과 지느러미
  · 별자리: 달무리 오팔·밤하늘 성운 몸통에 별자리 선, 초승달, 궤도 고리, 별 띠, 번지는 별빛(glow)
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

    def result(self, glow=0.0):
        im = self.im
        if glow:   # 번지는 빛: 흐린 복사본을 아래에 깐다
            g = im.filter(ImageFilter.GaussianBlur(glow * OS)); g.putalpha(g.split()[3].point(lambda v: min(255, int(v * 1.9))))
            im = Image.alpha_composite(g, im)
        im = im.filter(ImageFilter.GaussianBlur(0.4 * OS / 2)).resize((self.W, self.H), Image.LANCZOS)
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


def synth_head(alpha):
    """폰의 둥근 머리: 스케일·변형으로 머리와 몸통이 한 덩어리가 돼도 행 너비의 목(최소)으로 찾는다."""
    m = alpha > 0.5; H = m.shape[0]; wid = m.sum(1).astype(np.float32)
    top = int(np.nonzero(wid)[0].min()); ref = float(wid[top:top + int(H * 0.30)].max())
    gap = [y for y in range(top + int(H * 0.16), top + int(H * 0.45)) if wid[y] < 0.06 * ref]      # 머리와 몸통 사이 틈(첫 빈 행)
    if gap: neck = gap[0]; peak = top + int(np.argmax(wid[top:neck])); wpk = float(wid[peak])
    else:
        lim = top + int(H * 0.30); peak = top + int(np.argmax(wid[top:lim])); wpk = float(wid[peak])
        seg = wid[peak:min(H - 1, peak + int(H * 0.2))]; neck = peak + int(np.argmin(seg))
    r = wpk / 2.0; xs = np.nonzero(m[peak])[0]; cx = float((xs.min() + xs.max()) / 2); cy = neck - r
    return {"area": math.pi * r * r, "cx": cx, "cy": float(cy), "x0": int(cx - r), "x1": int(cx + r), "y0": int(cy - r), "y1": int(cy + r), "frac": 0.2, "syn": True}


def head_and_jewels(comps, key):
    """폰의 둥근 머리 하나, 그리고 퀸 끝 공 같은 작은 둥근 조각(보석)들."""
    head, jewels = None, []
    for c in comps:
        if c.get("syn"): head = c; continue
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



# ───────────────────────── 새 테마 도구 ─────────────────────────
def star4(ink, cx, cy, r, fill, inner=0.26):
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2; rr = r if i % 2 == 0 else r * inner
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    ink.poly(pts, fill=fill)


def lerp_hex(a, b, t):
    ca, cb = hexc(a), hexc(b); c = ca * (1 - t) + cb * t; return "#%02X%02X%02X" % tuple(int(v) for v in c)


def pearl(ink, cx, cy, r, white):
    lo, hi = ("#C9BFC8", "#FBF6F3") if white else ("#43606E", "#C7DAE4")
    for i in range(9):
        t = i / 8.0; rr = r * (1 - 0.8 * t); off = -0.26 * r * t
        ink.ellipse(cx + off, cy + off, rr, rr, fill=rgba(lerp_hex(lo, hi, t)))
    ink.ellipse(cx - 0.34 * r, cy - 0.38 * r, r * 0.2, r * 0.14, fill=rgba("#FFFFFF", 235))


def coral_branch(ink, x, y, ang, ln, depth, rng, cols, w):
    x2, y2 = x + math.cos(ang) * ln, y + math.sin(ang) * ln
    c = cols[min(len(cols) - 1, 3 - depth)]
    ink.line([(x, y), (x2, y2)], c, w); ink.ellipse(x2, y2, w * 0.5, w * 0.5, fill=c)
    if depth > 0:
        for da in (-0.62, 0.52):
            coral_branch(ink, x2, y2, ang + da + (rng.random() - 0.5) * 0.35, ln * 0.7, depth - 1, rng, cols, max(1.0, w * 0.72))


def shape_coral(sk, key, alpha):
    bt, x0, x1, cx = sk.base_top, sk.base_x0, sk.base_x1, sk.cx
    def f(d, q):
        x = x0 + 2.4 * S
        while x < x1 - 1.5 * S:
            d.ellipse([(x - 2.6 * S) * q, (bt - 2.0 * S) * q, (x + 2.6 * S) * q, (bt + 2.0 * S) * q], fill=255); x += 5.2 * S
        if key == "B": d.ellipse([(cx - 2.5 * S) * q, (sk.top - 4.6 * S) * q, (cx + 2.5 * S) * q, (sk.top + 0.2 * S) * q], fill=255)
    return reshape_alpha(alpha, f)


def shape_stars(sk, key, alpha):
    cx = sk.cx
    def f(d, q):
        if key in ("P", "B", "K"):
            top = sk.top - (4.0 * S if key != "K" else 5.8 * S); r = 4.8 * S; pts = []
            for i in range(8):
                a = math.pi / 4 * i - math.pi / 2; rr = r if i % 2 == 0 else r * 0.3
                pts.append(((cx + math.cos(a) * rr) * q, (top + math.sin(a) * rr) * q))
            d.polygon(pts, fill=255)
    return reshape_alpha(alpha, f)


# 새 세트 몸통 색(질감 포함 전체 색 장)
def body_coral(shape, color, seed, sk, alpha, ext):
    H, W = shape; n = fbm(shape, 38, seed, 3); yy = np.arange(H, dtype=np.float32)[:, None]
    if color == "w":   # 진주 자개: 분홍·청록·라벤더 무지갯빛 번짐
        col = ramp(n, ["#FBF1EA", "#F4CFDB", "#C9E9EE", "#DAD0F4", "#FBF1EA"])
        return col * (1 + 0.03 * np.sin(yy / (5 * S) + n * 4))[..., None]
    col = ramp(n, ["#06151F", "#0D3345", "#15586C", "#0A2A3A"])   # 심해 청흑색
    return col


def decor_coral(sk, key, color, ink, ext, comps):
    w = color == "w"; rng = np.random.default_rng(31 + ord(key) * 7 + (3 if w else 0))
    dark = rgba("#8E6A7C", 62) if w else rgba("#01070B", 110); hi = rgba("#FFFFFF", 150) if w else rgba("#4FE3E0", 50)
    head, jewels = head_and_jewels(comps, key)
    y0 = sk.top + (sk.bottom - sk.top) * (0.30 if key != "P" else 0.40); F = (sk.cx, sk.base_top + 1.0 * S)
    R = sk.bottom - y0 + 12 * S
    for ang in np.arange(-86.0, 86.1, 5.6):                                        # 조개 능선(부채꼴)
        a = math.radians(ang - 90); a2 = math.radians(ang - 90 + 1.9)
        ink.line([(F[0] + math.cos(a) * 3 * S, F[1] + math.sin(a) * 3 * S), (F[0] + math.cos(a) * R, F[1] + math.sin(a) * R)], dark, 1.3)
        ink.line([(F[0] + math.cos(a2) * 3 * S, F[1] + math.sin(a2) * 3 * S), (F[0] + math.cos(a2) * R, F[1] + math.sin(a2) * R)], hi, 0.9)
    cols = ["#F2A38F", "#EA8571", "#DF6B5A", "#CF5649"] if w else ["#7FFFE8", "#3FE0D0", "#22B8C8", "#FF5FD2"]
    a, b = ext.span(sk.base_top - 2 * S)                                           # 좌우 산호 가지
    coral_branch(ink, a + 6 * S, sk.base_top - 1 * S, -1.25, 13 * S, 3, rng, [rgba(c) for c in cols], 4.2)
    coral_branch(ink, b - 6 * S, sk.base_top - 1 * S, -1.89, 13 * S, 3, rng, [rgba(c) for c in cols], 4.2)
    for key_y, rr in (((sk.base_top - 3.4 * S), 1.9 * S), ((sk.top + (sk.bottom - sk.top) * COLLAR[key]) if key in COLLAR else None, 2.0 * S)):   # 진주 목걸이
        if key_y is None: continue
        aa, bb = ext.span(key_y); n = max(3, int((bb - aa) / (rr * 2.3)))
        for k in range(n): pearl(ink, aa + (k + 0.5) * (bb - aa) / n, key_y + 0.5 * math.sin(k) , rr, w)
    if head is not None: pearl(ink, head["cx"], head["cy"], (head["x1"] - head["x0"]) / 2.0 * 0.97, w)
    for j in jewels: pearl(ink, j["cx"], j["cy"], (j["x1"] - j["x0"]) / 2.0 * 0.95, w)
    bt, bo = sk.base_top, sk.bottom; x0, x1 = ext.span((bt + bo) / 2)             # 받침: 물결 띠
    pts = [(x, (bt + bo) / 2 + math.sin((x - x0) / (3.4 * S)) * 1.6 * S) for x in np.arange(x0 + 2, x1 - 2, 1.5)]
    ink.line(pts, rgba("#7FB7C4") if w else rgba("#3FE0D0"), 1.4)


CONST = {
    "K": ([(0.12, 0.08), (0.42, 0.18), (0.30, 0.52), (0.5, 0.5), (0.7, 0.48), (0.52, 0.85), (0.88, 0.92), (0.8, 0.22)], [(0, 1), (1, 3), (3, 2), (2, 0), (3, 4), (4, 5), (4, 7), (5, 6)]),           # 오리온
    "Q": ([(0.06, 0.25), (0.28, 0.75), (0.5, 0.35), (0.72, 0.8), (0.94, 0.3)], [(0, 1), (1, 2), (2, 3), (3, 4)]),                                                                   # 카시오페이아 W
    "R": ([(0.05, 0.3), (0.28, 0.4), (0.5, 0.5), (0.7, 0.55), (0.78, 0.9), (0.98, 0.75), (0.95, 0.3)], [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 3)]),                       # 북두칠성
    "B": ([(0.5, 0.05), (0.5, 0.45), (0.5, 0.95), (0.12, 0.38), (0.88, 0.38), (0.3, 0.7)], [(0, 1), (1, 2), (3, 1), (1, 4), (1, 5)]),                                                   # 백조자리(십자)
    "N": ([(0.1, 0.2), (0.45, 0.1), (0.5, 0.5), (0.1, 0.62), (0.85, 0.35), (0.8, 0.9)], [(0, 1), (1, 2), (2, 3), (3, 0), (1, 4), (2, 5)]),                                           # 페가수스 사각형
    "P": ([(0.2, 0.1), (0.7, 0.2), (0.8, 0.55), (0.45, 0.62), (0.4, 0.95)], [(0, 1), (1, 2), (2, 3), (3, 0), (3, 4)]),                                                                # 작은곰자리
}


def body_stars(shape, color, seed, sk, alpha, ext):
    H, W = shape; rng = np.random.default_rng(seed + 9); m = alpha > 0.5; yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    if color == "w":   # 달: 은회색 표면 + 크레이터
        n = fbm(shape, 36, seed, 4); col = ramp(n, ["#E6E8F0", "#D2D6E2", "#EEF0F8", "#C8CCDA"])
        ys, xs = np.nonzero(m); mult = np.ones(shape, np.float32)
        for _ in range(11):
            j = rng.integers(len(ys)); cy, cx = ys[j], xs[j]; r = rng.uniform(3, 8) * S
            d = np.hypot(yy - cy, xx - cx) / r; lit = np.clip((-(yy - cy) - (xx - cx)) / (r * 1.4), -1, 1)
            mult *= 1 - 0.09 * np.exp(-(d / 0.8) ** 2) + 0.10 * np.exp(-((d - 1.0) / 0.13) ** 2) * lit
        return col * mult[..., None]
    n = fbm(shape, 46, seed, 4); n2 = fbm(shape, 80, seed + 5, 3)
    col = ramp(n ** 1.25, ["#04061A", "#0B1136", "#1F1A5C", "#3A1F7A"]) + ramp(n2, ["#000000", "#04252E", "#3A0F46"]) * 0.9   # 보라·청록 성운
    band = np.exp(-(((xx - W * 0.5) * 0.6 + (yy - H * 0.5) * 0.8) / (14 * S)) ** 2)                                          # 은하수 띠
    col = col + band[..., None] * np.array([34, 30, 58], np.float32) * (0.4 + fbm(shape, 6, seed + 11, 2)[..., None])
    dust = np.zeros(shape, np.float32); ys, xs = np.nonzero(m); cnt = int(len(ys) / (34.0 * S * S / 9)); idx = rng.integers(0, len(ys), cnt)
    dust[ys[idx], xs[idx]] = rng.random(cnt) ** 4
    return col + ndi.gaussian_filter(dust, 0.8)[..., None] * np.array([255, 245, 215], np.float32) * 7


def decor_stars(sk, key, color, ink, ext, comps):
    w = color == "w"; rng = np.random.default_rng(55 + ord(key) * 17)
    line = rgba("#3B2F9A", 225) if w else rgba("#FFF0C4", 215); node = rgba("#2A1F7E") if w else rgba("#FFF6D8"); gold = rgba("#B88620") if w else rgba("#FFD97A")
    head, jewels = head_and_jewels(comps, key)
    ys = sk.top + (sk.bottom - sk.top) * (0.20 if key != "P" else 0.47); yb = sk.base_top - 3 * S
    pts, edges = CONST[key]
    ya, yz = ys + 2 * S, yb - 3 * S; ym = (ya + yz) / 2
    ax, bx = ext.span(ym); span_w = (min(ext.span(y)[1] for y in (ya, ym, yz)) - max(ext.span(y)[0] for y in (ya, ym, yz))) * 0.78
    cx0 = (ax + bx) / 2.0; P = [(cx0 + (px - 0.5) * span_w, ya + py * (yz - ya)) for px, py in pts]
    for a_, b_ in edges: ink.line([P[a_], P[b_]], line, 1.2)
    for i, (x, y) in enumerate(P): star4(ink, x, y, (2.2 + (i % 3) * 1.1) * S, node, 0.3); ink.ellipse(x, y, 0.5 * S, 0.5 * S, fill=rgba("#FFFFFF") if not w else rgba("#FFFFFF", 200))
    ex, ey, er = emblem_pos(sk, key, ext, head); r = er * (0.7 if head is not None else 0.85)
    if key in ("B", "R") or head is not None:   # 초승달(세 기물만 — 별자리와 겹치지 않게 위쪽에)
        ink.ellipse(ex, ey, r, r, fill=gold); ink.d.ellipse([(ex + 0.42 * r - 0.86 * r) * OS, (ey - 0.1 * r - 0.86 * r) * OS, (ex + 0.42 * r + 0.86 * r) * OS, (ey - 0.1 * r + 0.86 * r) * OS], fill=(0, 0, 0, 0))
        star4(ink, ex + 0.55 * r, ey - 0.35 * r, 0.3 * r, gold, 0.3)
    if key in ("Q", "K", "N"):   # 유성: 꼬리가 옅어지는 대각선
        x0_, y0_ = cx0 + span_w * 0.38, ya - 1 * S
        for k in range(24):
            f = k / 24.0; ink.line([(x0_ - f * 14 * S, y0_ + f * 7 * S), (x0_ - (f + 0.05) * 14 * S, y0_ + (f + 0.05) * 7 * S)], gold[:3] + (int(240 * (1 - f)),), 1.8 * (1 - f) + 0.4)
        star4(ink, x0_, y0_, 2.4 * S, gold, 0.3)
    for jw in jewels: star4(ink, jw["cx"], jw["cy"], (jw["x1"] - jw["x0"]) / 2.0 * 1.15, gold, 0.34)
    bt, bo = sk.base_top, sk.bottom; x0, x1 = ext.span((bt + bo) / 2)
    ink.line([(x0 + 1, bt + 1.4 * S), (x1 - 1, bt + 1.4 * S)], gold[:3] + (210,), 1.1); ink.line([(x0 + 1, bo - 1.4 * S), (x1 - 1, bo - 1.4 * S)], gold[:3] + (210,), 1.1)
    n = max(4, int((x1 - x0) / (9 * S)))
    for k in range(n):
        xk = x0 + (k + 0.5) * (x1 - x0) / n
        if k % 3 == 1: ink.ellipse(xk, (bt + bo) / 2, 1.5 * S, 1.5 * S, outline=gold, w=0.9)     # 궤도 고리 점
        else: star4(ink, xk, (bt + bo) / 2, 1.9 * S, gold, 0.34)


# ───────────────────────── 비취 용 ─────────────────────────
def shape_dragon(sk, key, alpha):
    """비취 용: 받침 양끝의 위로 휜 지느러미, 폰·비숍 꼭대기에 용의 뿔 한 쌍."""
    bt, bo, x0, x1, cx = sk.base_top, sk.bottom, sk.base_x0, sk.base_x1, sk.cx
    def f(d, q):
        for sx, ex in ((x0, -1), (x1, 1)):   # 받침 양끝: 위로 휜 지느러미(곡선 두 단)
            d.polygon([(sx * q, (bt + 1.5 * S) * q), ((sx + ex * 3.0 * S) * q, (bt - 2.0 * S) * q), ((sx + ex * 6.4 * S) * q, (bt - 7.0 * S) * q),
                       ((sx + ex * 5.2 * S) * q, (bt - 2.4 * S) * q), ((sx + ex * 2.4 * S) * q, (bt + 1.5 * S) * q)], fill=255)
        if key in ("P", "B"):               # 꼭대기: 굵고 휜 뿔 한 쌍
            top = sk.top
            for ex in (-1, 1):
                pts = [((cx + ex * 1.6 * S) * q, (top + 2.5 * S) * q), ((cx + ex * 3.0 * S) * q, (top - 1.2 * S) * q), ((cx + ex * 5.6 * S) * q, (top - 4.2 * S) * q), ((cx + ex * 8.2 * S) * q, (top - 6.4 * S) * q),
                       ((cx + ex * 7.0 * S) * q, (top - 3.0 * S) * q), ((cx + ex * 5.2 * S) * q, (top - 0.2 * S) * q), ((cx + ex * 4.6 * S) * q, (top + 2.5 * S) * q)]
                d.polygon(pts, fill=255)
    return reshape_alpha(alpha, f)


def body_dragon(shape, color, seed, sk, alpha, ext):
    m = alpha > 0.5; dist = ndi.distance_transform_edt(m).astype(np.float32)
    n = fbm(shape, 34, seed, 4); n2 = fbm(shape, 70, seed + 3, 3); depth = np.clip(dist / (11 * S), 0, 1)
    H, W = shape; yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    if color == "w":   # 비취: 가장자리는 투명하게 밝고, 안쪽은 깊은 초록. 구름 같은 흰 결.
        col = ramp(np.clip(0.30 + 0.55 * depth + (n - 0.5) * 0.45, 0, 1), ["#E4F6E8", "#B9E2C6", "#8FCBA4", "#6DB88A"])
        veins = np.exp(-((np.sin((xx * 0.5 + yy * 0.8) / S * 0.35 + n2 * 6) ) / 0.18) ** 2) * 0.10
        return col * (1 - veins[..., None] * 0.6) + veins[..., None] * 255 * 0.25
    col = ramp(np.clip(0.2 + 0.4 * depth + (n - 0.5) * 0.35, 0, 1), ["#050304", "#140B0C", "#2A1013", "#43161C"])   # 흑요석에 비치는 붉은 속빛
    return col


def scale(ink, x, y, r, pal, tint):
    rim, mid, hi, ridge = pal
    ink.ellipse(x + 0.2 * r, y + 0.3 * r, r, r, fill=rgba("#000000", 70))
    ink.ellipse(x, y, r, r, fill=rgba(lerp_hex(rim, mid, 0.0)), outline=None)
    ink.ellipse(x - 0.04 * r, y - 0.05 * r, r * 0.9, r * 0.9, fill=rgba(lerp_hex(mid, hi, tint * 0.4)))
    ink.ellipse(x - 0.14 * r, y - 0.2 * r, r * 0.55, r * 0.5, fill=rgba(lerp_hex(mid, hi, 0.55 + tint * 0.35), 210))
    ink.arc(x, y, r * 0.66, 205, 335, rgba(ridge, 235), 1.0)
    ink.arc(x, y, r * 0.96, 0, 360, rgba(rim, 230), 1.0)


def cloud(ink, cx, cy, r, fill, line):
    """여의두 구름 문양: 세 개의 둥근 엽 + 소용돌이."""
    for dx, dy, rr in ((-0.62, 0.12, 0.5), (0.62, 0.12, 0.5), (0.0, -0.18, 0.62)):
        ink.ellipse(cx + dx * r, cy + dy * r, rr * r, rr * r, fill=fill, outline=line, w=0.9)
    ink.rect(cx - 1.1 * r, cy + 0.12 * r, cx + 1.1 * r, cy + 0.5 * r, fill=fill)
    ink.line([(cx - 1.1 * r, cy + 0.5 * r), (cx + 1.1 * r, cy + 0.5 * r)], line, 0.9)
    ink.arc(cx, cy - 0.05 * r, 0.3 * r, 20, 330, line, 1.0); ink.arc(cx - 0.62 * r, cy + 0.12 * r, 0.2 * r, 30, 330, line, 0.9); ink.arc(cx + 0.62 * r, cy + 0.12 * r, 0.2 * r, 30, 330, line, 0.9)


def decor_dragon(sk, key, color, ink, ext, comps):
    w = color == "w"
    pal = ("#2C7552", "#6FBF8F", "#E3F7E8", "#F0D58C") if w else ("#050304", "#2E161B", "#A23F4A", "#F06464")
    gold = rgba("#E3B53A"); goldd = rgba("#7A5414"); goldl = rgba("#FFF0B8")
    rng = np.random.default_rng(71 + ord(key) * 11 + (2 if w else 0))
    head, jewels = head_and_jewels(comps, key)
    r = 5.0 * S; dy = r * 0.74; dx = r * 1.78
    y_top = sk.top + 2 * S; y_bot = sk.base_top - 1.0 * S                                  # 겹친 비늘: 아래 줄부터 그려 위 줄이 덮는다
    rows = int((y_bot - y_top) / dy) + 2
    for j in range(rows):
        y = y_bot - j * dy
        if y < y_top - r: break
        a, b = ext.span(min(max(y, y_top + 1), y_bot))
        x = a - dx * (0.5 if j % 2 else 0.0)
        while x < b + r:
            if a - r * 0.6 <= x <= b + r * 0.6: scale(ink, x, y, r, pal, rng.random() * 0.8)
            x += dx
    ex, ey, er = emblem_pos(sk, key, ext, head)                                          # 구름 메달리온(폰은 여의주)
    if head is not None:
        hr = (head["x1"] - head["x0"]) / 2.0
        for i in range(10):
            t = i / 9.0; rr = hr * (1 - 0.82 * t); off = -0.24 * hr * t
            ink.ellipse(head["cx"] + off, head["cy"] + off, rr, rr, fill=rgba(lerp_hex("#3FA874" if w else "#6A1218", "#F4FFF4" if w else "#FF8A80", t)))
        for k in range(3): ink.arc(head["cx"], head["cy"], hr * (0.5 + 0.17 * k), 200 + 40 * k, 330 + 20 * k, gold, 1.5)
        ink.ellipse(head["cx"] - 0.36 * hr, head["cy"] - 0.4 * hr, hr * 0.2, hr * 0.14, fill=rgba("#FFFFFF", 235))
        ink.ellipse(head["cx"], head["cy"], hr * 0.99, hr * 0.99, outline=gold, w=1.5)
    else:
        cloud(ink, ex, ey, er * 1.4, gold, goldd); ink.ellipse(ex, ey - 0.2 * er, er * 0.24, er * 0.24, fill=goldl)
    for j_ in jewels: ink.ellipse(j_["cx"], j_["cy"], (j_["x1"] - j_["x0"]) / 2.0, (j_["x1"] - j_["x0"]) / 2.0, fill=gold, outline=goldd, w=1.1); ink.ellipse(j_["cx"] - 1.2, j_["cy"] - 1.4, 1.6, 1.6, fill=goldl)
    bt, bo = sk.base_top, sk.bottom; x0, x1 = ext.span((bt + bo) / 2)                       # 받침: 청해파(파도 문양) + 금 테두리
    ink.rect(x0 + 0.6, bt + 0.4 * S, x1 - 0.6, bo - 0.4 * S, fill=rgba("#16513A") if w else rgba("#14090A"))
    rr = 4.2 * S; n = int((x1 - x0) / (rr * 1.5)) + 2
    for row, yb in enumerate((bo - 1.0 * S, (bt + bo) / 2 + 1.0 * S)):
        for k in range(n):
            xc = x0 + rr * 0.2 + k * rr * 1.5 + (rr * 0.75 if row else 0)
            for q in (1.0, 0.72, 0.44): ink.arc(xc, yb, rr * q, 180, 360, gold if q == 1.0 else rgba("#F7DC8A", 210), 0.9)
    ink.line([(x0 + 1, bt + 0.6 * S), (x1 - 1, bt + 0.6 * S)], gold, 1.6); ink.line([(x0 + 1, bo - 0.5 * S), (x1 - 1, bo - 0.5 * S)], gold, 1.4)


SETS = {
    "deco": {"body": {"w": "#EFE3C8", "b": "#17151B"}, "tex": tex_deco, "shape": shape_deco, "decor": decor_deco, "vol": 0.10, "inset": {"w": "#B4862A", "b": "#E8C766"}, "outline": {"w": "#7A5A18", "b": "#D4AC48"}},
    "coral": {"body_fn": body_coral, "shape": shape_coral, "decor": decor_coral, "vol": 0.16, "glow": {"w": 0, "b": 2.4}, "outline": {"w": "#8A6A86", "b": "#02070B"}, "inset": {"w": "#FFFFFF", "b": "#2FA8B8"}},
    "dragon": {"body_fn": body_dragon, "shape": shape_dragon, "decor": decor_dragon, "vol": 0.18, "glow": {"w": 0, "b": 1.6}, "outline": {"w": "#14513A", "b": "#050304"}, "inset": {"w": "#F0D58C", "b": "#D94B4B"}},
    "stars": {"body_fn": body_stars, "shape": shape_stars, "decor": decor_stars, "vol": 0.10, "glow": {"w": 1.8, "b": 3.0}, "outline": {"w": "#4A3D9A", "b": "#C99A2E"}, "inset": {"w": "#8E80E0", "b": "#FFD97A"}},
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
    if key == "P": comps.insert(0, synth_head(alpha))
    base = hexc(st["body"][color]) if st.get("body") else None
    if st.get("crystal"):
        col, edge_i = crystal_layer(alpha, key, color, seed, st["facetramp"][color])
        out = col * (1 + 0.06 * (0.5 - yy / H))[..., None]
        out = out * (1 - 0.35 * edge_i[..., None]) + 255 * 0.35 * edge_i[..., None]
    else:
        if st.get("body_fn"): out = st["body_fn"]((H, W), color, seed, sk, alpha, ext) * volume(alpha, ext, st["vol"])[..., None]
        else: out = base[None, None, :] * volume(alpha, ext, st["vol"])[..., None] * st["tex"]((H, W), color, seed)
        ink = Ink(W, H); st["decor"](sk, key, color, ink, ext, comps); ov = ink.result((st.get("glow") or {}).get(color, 0))
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
