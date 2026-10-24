"""Encode screenshots from record-preview.cjs; requires Pillow, not needed by the app."""
from pathlib import Path
from PIL import Image

project = Path(__file__).resolve().parent.parent
sources = sorted((project / "artifacts" / "preview-frames").glob("frame-*.png"))
if len(sources) != 72:
    raise RuntimeError("Expected exactly 72 demo frames")
frames = [Image.open(source).convert("RGB").resize((840, 615), Image.Resampling.LANCZOS) for source in sources]
samples = Image.new("RGB", (420 * 3, 308 * 2))
for index, frame in enumerate(frames[::12]):
    samples.paste(frame.resize((420, 308)), ((index % 3) * 420, (index // 3) * 308))
palette = samples.quantize(colors=224, method=Image.Quantize.MEDIANCUT)
encoded = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
destination = project / "docs" / "cirrus-preview.gif"
destination.parent.mkdir(exist_ok=True)
encoded[0].save(destination, save_all=True, append_images=encoded[1:], duration=130, loop=0, optimize=True, disposal=1)
print(f"Encoded {len(encoded)} demo frames, {destination.stat().st_size} bytes")
