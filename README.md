# Pixel-Snap (global)

Convert AI-generated "mixel" images into true pixel-perfect PNGs.

## What it does

1. **Snap** — detect latent pixel grid via gradient peaks; quantize palette via k-means; collapse each detected cell to its dominant RGBA value. Bundled binary is [Hugo-Dz/spritefusion-pixel-snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper) (MIT).
2. **Chroma key** — auto-detect background color from corners (3-of-4 vote within tolerance 20), or force a specific hex; pixels within `--tolerance` Chebyshev distance become alpha=0.
3. **Trim** (optional) — crop to alpha bounding box.

Output is a PNG at **true native resolution** (e.g. 39×36, 84×84). Scales cleanly to any display size when imported with `Filter Mode = Point`.

## Setup

One-time:

```powershell
python -m pip install Pillow
```

Optional — add to PATH for `snap` from any folder:

```powershell
# session-only
$env:PATH = "$env:USERPROFILE\OneDrive\Documents\Tools\pixel-snap;$env:PATH"
```

To make permanent: System Properties → Environment Variables → User PATH → add `C:\Users\sasha\OneDrive\Documents\Tools\pixel-snap`.

## Usage

### Web app

Double-click `Pixel Snap Web.bat` to open the browser app. It starts a local-only web server on `127.0.0.1` automatically, because ES modules + WASM cannot load reliably from `file://`.

### Console (any folder)

```powershell
# Most common — auto-detect bg, trim to bbox, output a tight pixel-perfect PNG
snap.bat input.png output.png --trim

# Character with foot anchor — keep full frame
snap.bat hero.png hero_pixel.png

# Tile (no chroma key, no trim)
snap.bat grass.png grass_pixel.png --chroma off

# Force specific background color (e.g. magenta)
snap.bat sprite.png sprite_pixel.png --trim --chroma force --chroma-color FF00FF

# Override auto-detected pixel size when grid detection fails
snap.bat sprite.png sprite_pixel.png --pixel-size 16 --trim

# Save the intermediate snap (background intact) too
snap.bat sprite.png sprite_pixel.png --trim --snapped-out sprite_snapped.png
```

### Direct Python invocation

```powershell
python C:\Users\sasha\OneDrive\Documents\Tools\pixel-snap\snap.py input.png output.png --trim
```

### PowerShell launcher

```powershell
& "$env:USERPROFILE\OneDrive\Documents\Tools\pixel-snap\snap.ps1" input.png output.png --trim
```

## Flags reference

| flag | default | what |
|---|---|---|
| `--k N` | 16 | k-means colors. Bump to 24/32 for shaded sprites. |
| `--pixel-size N` | auto | override native pixel size (use when auto-detect picks wrong cell size) |
| `--chroma auto\|off\|force` | auto | auto = corner-vote; off = skip; force = use --chroma-color |
| `--chroma-color HHHHHH` | — | hex bg for `--chroma force` |
| `--trim` | off | crop to alpha bbox after chroma |
| `--tolerance N` | 30 | RGB Chebyshev distance for chroma match |
| `--snapped-out PATH` | — | also save the post-snap PNG (background intact) |

## Recipes

| input type | recommended flags |
|---|---|
| Isolated object (item, prop) on flat magenta/green | `--trim` |
| Character on flat bg, foot at bottom-center | (no flags — keeps frame) |
| Tilemap tile (full-frame texture) | `--chroma off` |
| Sprite where snapper picks wrong cell size | `--pixel-size N` (try 8, 12, 16, 24, 32) |
| Multi-color bg or noisy bg | manual matte first, or `--chroma force --chroma-color HHHHHH` |

## Pitfalls

- **Do NOT run on a multi-frame spritesheet.** Auto-detect picks one global cell size; one off-grid frame poisons the rest. Snap each frame independently, composite afterwards.
- **Auto-detect can mispick on low-edge sprites** (mostly-flat color). Override with `--pixel-size`.
- **Don't upscale before saving.** Native-resolution PNG IS the deliverable. Scale at runtime.
- Snapper does not blend — it picks the **mode** of each cell. Dithering survives, anti-aliasing dies. Intentional.

## Upgrading the snapper binary

```powershell
git clone https://github.com/Hugo-Dz/spritefusion-pixel-snapper.git $env:TEMP\sf-snapper
cd $env:TEMP\sf-snapper
cargo build --release
copy target\release\spritefusion-pixel-snapper.exe `
     "$env:USERPROFILE\OneDrive\Documents\Tools\pixel-snap\pixel-snapper.exe"
```

## License

- Snapper binary: MIT (Hugo Duprez) — see `LICENSE-snapper.txt`.
- Wrapper scripts (`snap.py`, `snap.bat`, `snap.ps1`): use freely.
