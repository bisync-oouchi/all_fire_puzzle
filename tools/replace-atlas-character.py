from pathlib import Path
import sys

from PIL import Image


CELL = 192
COLS = 7
TARGET_INDEX = 13


def main(atlas_name: str, character_name: str, output_name: str) -> None:
    atlas = Image.open(atlas_name)
    character = Image.open(character_name).convert("RGBA")
    alpha = character.getchannel("A")
    if alpha.getextrema() == (255, 255):
        pixels = character.load()
        for y in range(character.height):
            for x in range(character.width):
                red, green, blue, _ = pixels[x, y]
                pixels[x, y] = (red, green, blue, 0 if max(red, green, blue) <= 5 else 255)
        alpha = character.getchannel("A")
    alpha = alpha.point(lambda value: 0 if value < 24 else 255)
    character.putalpha(alpha)
    visible = alpha.getbbox()
    if visible is None:
        raise ValueError("replacement character has no visible pixels")
    character = character.crop(visible)
    scale = min(176 / character.width, 180 / character.height)
    size = (max(1, min(150, round(character.width * scale * 1.2))), max(1, round(character.height * scale)))
    character = character.resize(size, Image.Resampling.NEAREST)

    column = TARGET_INDEX % COLS
    row = TARGET_INDEX // COLS
    left = column * CELL
    top = row * CELL
    position = (left + (CELL - character.width) // 2, top + CELL - character.height - 4)
    if atlas.mode == "P":
        transparency = atlas.info.get("transparency")
        alpha_table = transparency if isinstance(transparency, bytes) else bytes([255] * 256)
        transparent_index = min(range(len(alpha_table)), key=alpha_table.__getitem__)
        atlas.paste(transparent_index, (left, top, left + CELL, top + CELL))
        indexed = character.convert("RGB").quantize(palette=atlas, dither=Image.Dither.NONE)
        atlas.paste(indexed, position, character.getchannel("A"))
    else:
        atlas = atlas.convert("RGBA")
        atlas.paste((0, 0, 0, 0), (left, top, left + CELL, top + CELL))
        atlas.alpha_composite(character, position)

    output = Path(output_name)
    output.parent.mkdir(parents=True, exist_ok=True)
    save_options = {"format": "PNG", "optimize": True, "compress_level": 9}
    if atlas.mode == "P" and "transparency" in atlas.info:
        save_options["transparency"] = atlas.info["transparency"]
    atlas.save(output, **save_options)
    print(f"{output}: {output.stat().st_size} bytes, {atlas.size[0]}x{atlas.size[1]}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: replace-atlas-character.py ATLAS CHARACTER OUTPUT")
    main(sys.argv[1], sys.argv[2], sys.argv[3])
