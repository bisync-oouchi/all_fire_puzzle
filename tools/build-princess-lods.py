from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


CELL = 192
COLS = 7
PRINCESS_INDEX = 13


def build_lod(source: Image.Image, size: int, output: Path) -> None:
    # LANCZOS decides which high-resolution details survive once, at build time.
    # A restrained contrast/sharpen pass restores the deliberate pixel clusters
    # without the unstable one-pixel sampling produced by Canvas at runtime.
    lod = source.resize((size, size), Image.Resampling.LANCZOS)
    lod = ImageEnhance.Contrast(lod).enhance(1.08)
    lod = lod.filter(ImageFilter.UnsharpMask(radius=0.55, percent=95, threshold=3))
    output.parent.mkdir(parents=True, exist_ok=True)
    lod.save(output, format="PNG", optimize=True, compress_level=9)
    print(f"{output}: {output.stat().st_size} bytes, {size}x{size}")


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    atlas = Image.open(root / "assets" / "sfc-object-atlas-64-v2.png").convert("RGBA")
    column = PRINCESS_INDEX % COLS
    row = PRINCESS_INDEX // COLS
    princess = atlas.crop((column * CELL, row * CELL, (column + 1) * CELL, (row + 1) * CELL))
    build_lod(princess, 28, root / "assets" / "princess-lod-28.png")
    build_lod(princess, 64, root / "assets" / "princess-lod-64.png")


if __name__ == "__main__":
    main()
