from pathlib import Path
import sys

from PIL import Image


COLS = 7
ROWS = 3


def main(source_name: str, output_name: str, cell: int = 128) -> None:
    source = Image.open(source_name)
    if source.mode != "RGBA":
        source = source.convert("RGBA")
        # Generated edit variants may use a flat black matte. Key out only
        # near-black pixels; the remaining dark outline shades stay intact.
        alpha = source.convert("L").point(lambda value: 0 if value <= 3 else 255)
        source.putalpha(alpha)
    sprite_max = cell - 12
    atlas = Image.new("RGBA", (cell * COLS, cell * ROWS), (0, 0, 0, 0))
    width, height = source.size

    for row in range(ROWS):
        for column in range(COLS):
            left = round(column * width / COLS)
            top = round(row * height / ROWS)
            right = round((column + 1) * width / COLS)
            bottom = round((row + 1) * height / ROWS)
            sprite = source.crop((left, top, right, bottom))
            if row * COLS + column == 18:
                # The source strong-oni cape slightly crosses into the water
                # tank cell. Remove that edge fragment before fitting.
                sprite.paste((0, 0, 0, 0), (0, 0, sprite.width // 5, sprite.height))
            alpha_box = sprite.getchannel("A").getbbox()
            if alpha_box is None:
                continue
            sprite = sprite.crop(alpha_box)
            scale = min(sprite_max / sprite.width, sprite_max / sprite.height)
            size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
            sprite = sprite.resize(size, Image.Resampling.NEAREST)
            x = column * cell + (cell - sprite.width) // 2
            y = row * cell + cell - sprite.height - 4
            atlas.alpha_composite(sprite, (x, y))

    # A shared indexed palette is close to original console constraints and
    # substantially smaller than a full RGBA atlas while preserving alpha.
    atlas = atlas.quantize(colors=256 if cell >= 192 else 192, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    output = Path(output_name)
    output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output, format="PNG", optimize=True, compress_level=9)
    print(f"{output}: {output.stat().st_size} bytes, {atlas.size[0]}x{atlas.size[1]}")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        raise SystemExit("usage: optimize-sprite-atlas.py SOURCE OUTPUT [CELL]")
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) == 4 else 128)
