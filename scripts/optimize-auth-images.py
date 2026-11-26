from pathlib import Path
from PIL import Image
import re

ROOT = Path(".")
TARGETS = ("coach-entry.png", "trainee-entry.png")
converted = []

for name in TARGETS:
    source = ROOT / "assets" / "auth" / name
    if not source.exists():
        raise SystemExit(f"Required source image not found: {source}")

    with Image.open(source) as image:
        image = image.convert("RGB")
        original_size = image.size
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        output = source.with_suffix(".webp")
        image.save(output, "WEBP", quality=82, method=6)
        converted.append((source, output, original_size, image.size, output.stat().st_size))

# Change only references to the two authentication illustrations.
text_extensions = {".html", ".css", ".js", ".json", ".webmanifest"}
for path in ROOT.rglob("*"):
    if not path.is_file() or path.suffix.lower() not in text_extensions:
        continue
    if ".git" in path.parts:
        continue
    try:
        original = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        continue
    updated = original
    for name in TARGETS:
        updated = updated.replace(name, Path(name).with_suffix(".webp").name)
    if updated != original:
        path.write_text(updated, encoding="utf-8")

for source, output, old_size, new_size, bytes_written in converted:
    print(f"{source}: {old_size[0]}x{old_size[1]} -> {new_size[0]}x{new_size[1]}, {bytes_written:,} bytes ({bytes_written/1024:.1f} KiB)")
