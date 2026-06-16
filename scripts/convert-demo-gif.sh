#!/usr/bin/env bash
set -euo pipefail

input="${1:-public/demo.mov}"
output="${2:-public/demo.gif}"
width="${GIF_WIDTH:-800}"
fps="${GIF_FPS:-12}"
colors="${GIF_COLORS:-96}"

if ! command -v ffmpeg >/dev/null 2>&1; then
	echo "ffmpeg is required to convert the demo video." >&2
	exit 1
fi

mkdir -p "$(dirname "$output")"

ffmpeg -y \
	-i "$input" \
	-filter_complex "fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=${colors}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" \
	-loop 0 \
	"$output"
