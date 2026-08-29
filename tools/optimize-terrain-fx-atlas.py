from pathlib import Path
import sys

from PIL import Image


CELL = 128
COLS = 6
ROWS = 3


def visible_box(sprite: Image.Image):
    alpha = sprite.getchannel("A")
    return alpha.point(lambda value: 255 if value >= 48 else 0).getbbox()


def main(source_name: str, output_name: str) -> None:
    source = Image.open(source_name).convert("RGBA")
    width, height = source.size
    atlas = Image.new("RGBA", (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))

    for row in range(ROWS):
        for column in range(COLS):
            source_box = (
                round(column * width / COLS),
                round(row * height / ROWS),
                round((column + 1) * width / COLS),
                round((row + 1) * height / ROWS),
            )
            sprite = source.crop(source_box)
            box = visible_box(sprite)
            if box is None:
                continue
            sprite = sprite.crop(box)
            alpha = sprite.getchannel("A").point(lambda value: 0 if value < 24 else value)
            sprite.putalpha(alpha)
            if row == 0:
                size = (CELL, CELL)
                position = (column * CELL, 0)
            else:
                scale = min(116 / sprite.width, 116 / sprite.height)
                size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
                position = (
                    column * CELL + (CELL - size[0]) // 2,
                    row * CELL + (CELL - size[1]) // 2,
                )
            sprite = sprite.resize(size, Image.Resampling.NEAREST)
            atlas.alpha_composite(sprite, position)

    atlas = atlas.quantize(colors=224, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    output = Path(output_name)
    output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output, format="PNG", optimize=True, compress_level=9)
    print(f"{output}: {output.stat().st_size} bytes, {atlas.size[0]}x{atlas.size[1]}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: optimize-terrain-fx-atlas.py SOURCE OUTPUT")
    main(sys.argv[1], sys.argv[2])
