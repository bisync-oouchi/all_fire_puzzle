from collections import deque
from pathlib import Path
import sys

from PIL import Image, ImageFilter


CELL_W = 128
CELL_H = 192
HIGH_ACTOR_SIZES = (
    (112, 176),  # princess: preserve the illustrated head/body proportion
    (116, 144),  # fat oni: deliberately stocky, but with visible legs
    (100, 160),  # small oni: light and athletic
    (112, 160),  # big oni: bulky without returning to a square tile
    (112, 168),  # strong oni: tall armour silhouette
)
LOD_ACTOR_SIZES = (
    (96, 176),   # compact princess remains narrow for small-map readability
    *HIGH_ACTOR_SIZES[1:],
)
HEAD_SPLITS = (.38, .48, .46, .44, .44)


def remove_edge_background(image: Image.Image) -> Image.Image:
    """Remove an opaque white/checker preview background without touching highlights."""
    image = image.convert("RGBA")
    if image.getchannel("A").getextrema()[0] < 255:
        return image
    pixels = image.load()
    width, height = image.size
    seen = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def candidate(x: int, y: int) -> bool:
        red, green, blue, _ = pixels[x, y]
        return min(red, green, blue) >= 224 and max(red, green, blue) - min(red, green, blue) <= 18

    def add(x: int, y: int) -> None:
        index = y * width + x
        if not seen[index] and candidate(x, y):
            seen[index] = 1
            queue.append((x, y))

    for x in range(width):
        add(x, 0)
        add(x, height - 1)
    for y in range(height):
        add(0, y)
        add(width - 1, y)
    while queue:
        x, y = queue.popleft()
        pixels[x, y] = (*pixels[x, y][:3], 0)
        if x:
            add(x - 1, y)
        if x + 1 < width:
            add(x + 1, y)
        if y:
            add(x, y - 1)
        if y + 1 < height:
            add(x, y + 1)
    return image


def prepare(
    source: Path,
    size: tuple[int, int],
    head_split: float,
    stretch_lower: bool = True,
    emphasize_head: bool = False,
) -> Image.Image:
    image = remove_edge_background(Image.open(source))
    alpha = image.getchannel("A").point(lambda value: 0 if value < 20 else value)
    image.putalpha(alpha)
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError(f"no visible actor pixels: {source}")
    image = image.crop(bounds)
    target_width, target_height = size
    if emphasize_head:
        # Maximum zoom needs more pixels for the face than a proportional
        # full-body reduction provides. Enlarge only the upper 30%, then use
        # the saved height to shorten the dress/body below it.
        scale = target_height / image.height
        natural_width = max(1, round(image.width * scale))
        uniform = image.resize((natural_width, target_height), Image.Resampling.LANCZOS)
        split = max(1, round(target_height * .30))
        head_height = min(target_height - 1, round(split * 1.20))
        head_width = min(target_width, round(natural_width * 1.20))
        head = uniform.crop((0, 0, natural_width, split)).resize(
            (head_width, head_height), Image.Resampling.LANCZOS
        )
        lower = uniform.crop((0, split, natural_width, target_height)).resize(
            (natural_width, target_height - head_height), Image.Resampling.LANCZOS
        )
        result = Image.new("RGBA", size, (0, 0, 0, 0))
        result.alpha_composite(head, ((target_width - head_width) // 2, 0))
        result.alpha_composite(lower, ((target_width - natural_width) // 2, head_height))
        return result.filter(ImageFilter.UnsharpMask(radius=0.55, percent=90, threshold=3))
    if not stretch_lower:
        scale = min(target_width / image.width, target_height / image.height)
        result = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
        return result.filter(ImageFilter.UnsharpMask(radius=0.55, percent=90, threshold=3))
    uniform_height = max(1, round(image.height * target_width / image.width))
    if uniform_height >= target_height:
        uniform_width = max(1, round(image.width * target_height / image.height))
        result = image.resize((uniform_width, target_height), Image.Resampling.LANCZOS)
    else:
        # Preserve the head and face at their natural aspect ratio. Only the
        # lower body, legs and dress absorb the extra vertical height needed by
        # the over-tile actor silhouette.
        uniform = image.resize((target_width, uniform_height), Image.Resampling.LANCZOS)
        split = min(uniform_height - 1, max(1, round(uniform_height * head_split)))
        top = uniform.crop((0, 0, target_width, split))
        lower = uniform.crop((0, split, target_width, uniform_height)).resize(
            (target_width, target_height - split), Image.Resampling.LANCZOS
        )
        result = Image.new("RGBA", size, (0, 0, 0, 0))
        result.alpha_composite(top, (0, 0))
        result.alpha_composite(lower, (0, split))
    return result.filter(ImageFilter.UnsharpMask(radius=0.55, percent=90, threshold=3))


def save_compact(image: Image.Image, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    indexed = image.quantize(colors=96, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    indexed.save(output, format="PNG", optimize=True, compress_level=9)
    print(f"{output}: {output.stat().st_size} bytes, {image.width}x{image.height}")


def main(arguments: list[str]) -> None:
    if len(arguments) != 5:
        raise SystemExit("usage: build-actor-atlases.py PRINCESS FAT_ONI SMALL_ONI BIG_ONI STRONG_ONI")
    root = Path(__file__).resolve().parent.parent
    sources = tuple(map(Path, arguments))
    high = Image.new("RGBA", (CELL_W * 5, CELL_H), (0, 0, 0, 0))
    compact_source = Image.new("RGBA", (CELL_W * 5, CELL_H), (0, 0, 0, 0))
    for index, (source, high_size, lod_size, head_split) in enumerate(zip(sources, HIGH_ACTOR_SIZES, LOD_ACTOR_SIZES, HEAD_SPLITS)):
        # At medium/maximum zoom the princess uses the source illustration's
        # natural proportions. Other actors retain their body-only extension.
        actor = prepare(source, high_size, head_split, stretch_lower=index != 0, emphasize_head=index == 0)
        left = index * CELL_W + (CELL_W - actor.width) // 2
        top = CELL_H - actor.height - 4
        high.alpha_composite(actor, (left, top))
        # The smallest map view keeps its already-approved compact silhouette.
        compact = prepare(source, lod_size, head_split)
        compact_left = index * CELL_W + (CELL_W - compact.width) // 2
        compact_top = CELL_H - compact.height - 4
        compact_source.alpha_composite(compact, (compact_left, compact_top))
    save_compact(high, root / "assets" / "sfc-actor-atlas-tall.png")

    low = Image.new("RGBA", (32 * 5, 48), (0, 0, 0, 0))
    for index in range(5):
        cell = compact_source.crop((index * CELL_W, 0, (index + 1) * CELL_W, CELL_H))
        low.alpha_composite(cell.resize((32, 48), Image.Resampling.LANCZOS), (index * 32, 0))
    save_compact(low, root / "assets" / "sfc-actor-atlas-tall-lod.png")


if __name__ == "__main__":
    main(sys.argv[1:])
