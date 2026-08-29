from pathlib import Path
import sys

from PIL import Image


CELL = 128
COLS = 4
ROWS = 2


def main(source_name: str, output_name: str) -> None:
    source = Image.open(source_name).convert("RGBA")
    width, height = source.size
    atlas = Image.new("RGBA", (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))

    for row in range(ROWS):
        for column in range(COLS):
            box = (
                round(column * width / COLS),
                round(row * height / ROWS),
                round((column + 1) * width / COLS),
                round((row + 1) * height / ROWS),
            )
            sprite = source.crop(box)
            alpha = sprite.getchannel("A").point(lambda value: 0 if value < 24 else value)
            sprite.putalpha(alpha)
            visible = alpha.getbbox()
            if visible is None:
                continue
            sprite = sprite.crop(visible)
            scale = min(118 / sprite.width, 118 / sprite.height)
            size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
            sprite = sprite.resize(size, Image.Resampling.NEAREST)
            position = (
                column * CELL + (CELL - sprite.width) // 2,
                row * CELL + (CELL - sprite.height) // 2,
            )
            atlas.alpha_composite(sprite, position)

    atlas = atlas.quantize(colors=224, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    output = Path(output_name)
    output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output, format="PNG", optimize=True, compress_level=9)
    print(f"{output}: {output.stat().st_size} bytes, {atlas.size[0]}x{atlas.size[1]}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: optimize-polish-fx-atlas.py SOURCE OUTPUT")
    main(sys.argv[1], sys.argv[2])
