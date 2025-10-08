#!/usr/bin/env bash
# convert-images-to-avif.sh
# Recursively convert images to AVIF in a given directory.
# Usage: ./convert-images-to-avif.sh [options] [directory]
# Default directory: current working directory
# Requires one of: cavif, avifenc, magick, or ffmpeg

set -euo pipefail

DIR="."
ENCODER="auto"
QUALITY="80"   # for cavif/magick (1-100)
CRF="30"       # for ffmpeg (8-63, lower = better quality)
JOBS=4
KEEP_ORIGINALS=1
VERBOSE=1

print_help() {
  cat <<EOF
convert-images-to-avif.sh

Recursively converts images to AVIF. Skips files that already have an up-to-date .avif.

Usage: $0 [options] [directory]

Options:
  -e, --encoder <auto|cavif|avifenc|magick|ffmpeg>  Choose encoder (default: auto)
  -q, --quality <1-100>     Quality for cavif/magick (default: $QUALITY)
  --crf <8-63>              CRF for ffmpeg (default: $CRF)
  -j, --jobs <N>            Parallel jobs (default: $JOBS)
  --keep                    Keep original files (default)
  --delete-originals        Delete originals after successful conversion
  -v, --verbose             Verbose output
  -h, --help                Show this help

Examples:
  $0 --encoder cavif -q 85 apps/horika/gallery
EOF
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) print_help; exit 0 ;;
    -e|--encoder) ENCODER="$2"; shift 2 ;;
    -q|--quality) QUALITY="$2"; shift 2 ;;
    --crf) CRF="$2"; shift 2 ;;
    -j|--jobs) JOBS="$2"; shift 2 ;;
    --keep) KEEP_ORIGINALS=1; shift ;;
    --delete-originals) KEEP_ORIGINALS=0; shift ;;
    -v|--verbose) VERBOSE=1; shift ;;
    --no-verbose) VERBOSE=0; shift ;;
    --) shift; break ;;
    -*) echo "Unknown option: $1" >&2; print_help; exit 1 ;;
    *) DIR="$1"; shift ;;
  esac
done

# Validate directory
if [[ ! -d "$DIR" ]]; then
  echo "Directory not found: $DIR" >&2
  exit 2
fi

log() { if [[ $VERBOSE -eq 1 ]]; then echo "$@"; fi }

# Find available encoder if auto
detect_encoder() {
  if [[ "$ENCODER" != "auto" ]]; then
    echo "$ENCODER"
    return
  fi
  if command -v cavif >/dev/null 2>&1; then
    echo cavif
  elif command -v avifenc >/dev/null 2>&1; then
    echo avifenc
  elif command -v magick >/dev/null 2>&1 || command -v convert >/dev/null 2>&1; then
    echo magick
  elif command -v ffmpeg >/dev/null 2>&1; then
    echo ffmpeg
  else
    echo "none"
  fi
}

ENC=$(detect_encoder)
if [[ "$ENC" == "none" ]]; then
  echo "No suitable encoder found. Install one of: cavif, avifenc (libavif), ImageMagick (magick), or ffmpeg." >&2
  exit 3
fi
log "Using encoder: $ENC"

# Supported extensions (case-insensitive)
EXTS=(jpg jpeg png heic heif tif tiff gif webp bmp svg)

# Convert single file function
convert_file() {
  local src="$1"
  local dst="${src%.*}.avif"

  # Skip if destination exists and is newer than source
  if [[ -f "$dst" && "$dst" -nt "$src" ]]; then
    log "Skipping (up-to-date): $src"
    return 0
  fi

  log "Converting: $src -> $dst"

  case "$ENC" in
    cavif)
      # cavif: cavif [options] input -o output
      if ! command -v cavif >/dev/null 2>&1; then echo "cavif not available"; return 2; fi
      cavif -q "$QUALITY" "$src" -o "$dst"
      ;;
    avifenc)
      # avifenc: simple call with defaults; add quality if numeric
      if ! command -v avifenc >/dev/null 2>&1; then echo "avifenc not available"; return 2; fi
      if [[ "$QUALITY" =~ ^[0-9]+$ ]]; then
        avifenc -j all -q "$QUALITY" "$src" "$dst" || avifenc "$src" "$dst"
      else
        avifenc "$src" "$dst"
      fi
      ;;
    magick)
      # ImageMagick: magick input -quality N output
      if command -v magick >/dev/null 2>&1; then
        magick "$src" -quality "$QUALITY" "$dst"
      else
        # older installs may have 'convert'
        convert "$src" -quality "$QUALITY" "$dst"
      fi
      ;;
    ffmpeg)
      if ! command -v ffmpeg >/dev/null 2>&1; then echo "ffmpeg not available"; return 2; fi
      # Use libaom-av1 if available; fallback uses default libavif/encoder in ffmpeg
      if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libaom-av1; then
        ffmpeg -y -hide_banner -loglevel error -i "$src" -c:v libaom-av1 -crf "$CRF" -b:v 0 "$dst"
      else
        ffmpeg -y -hide_banner -loglevel error -i "$src" -c:v libsvtav1 -crf "$CRF" -preset 8 "$dst" || \
        ffmpeg -y -hide_banner -loglevel error -i "$src" -c:v av1 -crf "$CRF" "$dst" || \
        ffmpeg -y -hide_banner -loglevel error -i "$src" -c:v copy "$dst"
      fi
      ;;
    *)
      echo "Unsupported encoder: $ENC" >&2; return 2
      ;;
  esac

  local status=$?
  if [[ $status -ne 0 ]]; then
    echo "Conversion failed for $src (exit $status)" >&2
    return $status
  fi

  if [[ $KEEP_ORIGINALS -eq 0 ]]; then
    rm -f -- "$src"
  fi

  return 0
}

# Export function for xargs subshells
export -f convert_file
export VERBOSE
export ENC
export QUALITY
export CRF
export KEEP_ORIGINALS
export -f log 2>/dev/null || true

# Build find command and process
log "Searching for images under: $DIR"

# Build find expression with -iname parts (portable across GNU/BSD find)
find_expr=( )
for ext in "${EXTS[@]}"; do
  find_expr+=( -iname "*.$ext" -o -iname "*.$(echo "$ext" | tr '[:lower:]' '[:upper:]')" -o )
done
# Remove trailing -o
unset 'find_expr[${#find_expr[@]}-1]'

# Use find -print0 and xargs -0 for safe handling of filenames with spaces/newlines
if command -v xargs >/dev/null 2>&1; then
  # Count files first for logging
  file_count=$(find "$DIR" -type f \( "${find_expr[@]}" \) -print0 | tr -cd '\0' | wc -c || true)
  if [[ -z "$file_count" || "$file_count" -eq 0 ]]; then
    log "No images found matching ${EXTS[*]} in $DIR"
    exit 0
  fi
  log "Found $file_count files. Starting conversion with $JOBS parallel jobs..."

  find "$DIR" -type f \( "${find_expr[@]}" \) -print0 | xargs -0 -n1 -P "$JOBS" -I {} bash -c 'convert_file "{}"'
else
  # Fallback: read null-delimited list and spawn jobs with throttling
  files_found=0
  while IFS= read -r -d '' file; do
    files_found=$((files_found+1))
    convert_file "$file" &
    # throttle
    while (( $(jobs -rp | wc -l) >= JOBS )); do sleep 0.2; done
  done < <(find "$DIR" -type f \( "${find_expr[@]}" \) -print0)
  wait
  if [[ $files_found -eq 0 ]]; then
    log "No images found matching ${EXTS[*]} in $DIR"
    exit 0
  fi
  log "Done."
fi

log "Done."
exit 0
