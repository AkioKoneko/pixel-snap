"""
Global pixel-snap CLI.

Usage:
    python snap.py SRC OUT [flags]
    python snap.py SRC OUT --snapped-out SNAPPED [flags]

If --snapped-out omitted, the intermediate snap (background intact) is discarded
after chroma keying.

Flags:
    --k N                 k-means colors, default 16
    --pixel-size N        override auto-detected native pixel size
    --chroma auto|off|force   default auto
    --chroma-color HHHHHH for --chroma force, e.g. FF00FF
    --trim                crop to alpha bbox after chroma
    --tolerance N         RGB Chebyshev distance for chroma match, default 30

Requires Pillow:  python -m pip install Pillow
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SNAPPER_EXE = HERE / "pixel-snapper.exe"


def run_snapper(src: Path, dst: Path, k_colors: int = 16, pixel_size: int | None = None) -> None:
    if not SNAPPER_EXE.exists():
        sys.exit(f"snapper binary missing: {SNAPPER_EXE}")
    cmd = [str(SNAPPER_EXE), str(src), str(dst), str(k_colors)]
    if pixel_size is not None:
        cmd += ["--pixel-size", str(pixel_size)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        sys.exit(f"snapper failed: {res.stderr or res.stdout}")
    print(res.stdout.rstrip())


def detect_bg_color(img: Image.Image) -> tuple[int, int, int] | None:
    rgb = img.convert("RGB")
    w, h = rgb.size
    corners = [rgb.getpixel((0, 0)), rgb.getpixel((w - 1, 0)),
               rgb.getpixel((0, h - 1)), rgb.getpixel((w - 1, h - 1))]
    def close(a, b):
        return all(abs(x - y) <= 20 for x, y in zip(a, b))
    counts: list[tuple[tuple[int, int, int], int]] = []
    for c in corners:
        for i, (existing, _) in enumerate(counts):
            if close(c, existing):
                counts[i] = (existing, counts[i][1] + 1)
                break
        else:
            counts.append((c, 1))
    counts.sort(key=lambda kv: -kv[1])
    if counts and counts[0][1] >= 3:
        return counts[0][0]
    return None


def chroma_key(img: Image.Image, bg: tuple[int, int, int], tolerance: int = 30) -> Image.Image:
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    br, bg_, bb = bg
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if abs(r - br) <= tolerance and abs(g - bg_) <= tolerance and abs(b - bb) <= tolerance:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def alpha_trim(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    pad = 1
    w, h = img.size
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)))


def main() -> int:
    ap = argparse.ArgumentParser(description="Pixel-snap a single PNG (snap + chroma + trim).")
    ap.add_argument("src", help="input PNG")
    ap.add_argument("out", help="output PNG (final, transparent bg)")
    ap.add_argument("--snapped-out", default=None, help="optional intermediate (post-snap, bg intact)")
    ap.add_argument("--k", type=int, default=16)
    ap.add_argument("--pixel-size", type=int, default=None)
    ap.add_argument("--chroma", choices=["auto", "off", "force"], default="auto")
    ap.add_argument("--chroma-color", default=None, help="hex for --chroma force, e.g. FF00FF")
    ap.add_argument("--trim", action="store_true")
    ap.add_argument("--tolerance", type=int, default=30)
    args = ap.parse_args()

    color = None
    if args.chroma_color:
        s = args.chroma_color.lstrip("#")
        color = (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))

    src = Path(args.src)
    final_out = Path(args.out)
    final_out.parent.mkdir(parents=True, exist_ok=True)

    # stage 1: snap
    if args.snapped_out:
        snapped_path = Path(args.snapped_out)
        snapped_path.parent.mkdir(parents=True, exist_ok=True)
        run_snapper(src, snapped_path, k_colors=args.k, pixel_size=args.pixel_size)
        snapped = Image.open(snapped_path)
    else:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            run_snapper(src, tmp_path, k_colors=args.k, pixel_size=args.pixel_size)
            snapped = Image.open(tmp_path).copy()
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    # stage 2: chroma
    if args.chroma == "off":
        bg = None
    elif args.chroma == "force":
        bg = color
    else:
        bg = detect_bg_color(snapped)

    if bg is None:
        out = snapped.convert("RGBA")
        print("  chroma: skipped")
    else:
        out = chroma_key(snapped, bg, tolerance=args.tolerance)
        print(f"  chroma: keyed bg=rgb{bg} tol={args.tolerance}")
        if args.trim:
            before = out.size
            out = alpha_trim(out)
            print(f"  trimmed: {before} -> {out.size}")

    out.save(final_out)
    print(f"  final: {final_out} {out.size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
