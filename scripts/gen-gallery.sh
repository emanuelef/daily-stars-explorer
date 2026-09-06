#!/usr/bin/env bash
#
# Render every starchart variant for a repository and write a Markdown gallery
# that shows them all. Runs identically on a laptop and in GitHub Actions.
#
#   ./scripts/gen-gallery.sh                      # defaults to gofiber/fiber
#   ./scripts/gen-gallery.sh kubernetes/kubernetes
#   ./scripts/gen-gallery.sh helm/helm docs/gallery
#
# A GitHub token is optional. Set GITHUB_TOKEN or PAT to lift the
# unauthenticated 60 requests/hour limit.

set -euo pipefail

REPO="${1:-gofiber/fiber}"
OUT_DIR="${2:-examples/gallery}"

REPO_SLUG="${REPO//\//-}"
CAPTION="emanuelef.github.io/daily-stars-explorer"

# Run the CLI from this checkout so the gallery reflects local changes.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_chart() { (cd "$ROOT" && go run ./cmd/starchart "$@"); }

# Resolve the output directory to an absolute path once. run_chart cd's into
# $ROOT, so a relative path has to be anchored there — but blindly prefixing
# $ROOT would mangle an absolute path into "$ROOT//tmp/...".
case "$OUT_DIR" in
  /*) OUT_ABS="$OUT_DIR" ;;
  *) OUT_ABS="$ROOT/$OUT_DIR" ;;
esac

mkdir -p "$OUT_ABS"
echo "Rendering $REPO into $OUT_ABS/"

run_chart -repo "$REPO" -out "$OUT_ABS/$REPO_SLUG-light.png"       -theme light       -caption "$CAPTION"
run_chart -repo "$REPO" -out "$OUT_ABS/$REPO_SLUG-dark.png"        -theme dark        -caption "$CAPTION"
run_chart -repo "$REPO" -out "$OUT_ABS/$REPO_SLUG-transparent.png" -theme transparent -caption "$CAPTION"
run_chart -repo "$REPO" -out "$OUT_ABS/$REPO_SLUG-daily.png"       -theme light       -daily -caption "$CAPTION"
run_chart -repo "$REPO" -out "$OUT_ABS/$REPO_SLUG-wide.png"        -theme light       -width 1200 -height 300
run_chart -repo "$REPO" -out "$OUT_ABS/$REPO_SLUG.svg"             -theme light       -caption "$CAPTION"
run_chart -repo "$REPO" -out "$OUT_ABS/$REPO_SLUG-mermaid.md"      -format mermaid

MERMAID="$(cat "$OUT_ABS/$REPO_SLUG-mermaid.md")"
# Count the x-axis labels, not every comma in the file: the line series has the
# same number again, which would double the figure.
MERMAID_POINTS="$(sed -n 's/.*x-axis \[\(.*\)\].*/\1/p' "$OUT_ABS/$REPO_SLUG-mermaid.md" | tr ',' '\n' | wc -l | tr -d ' ')"
GENERATED="$(date -u '+%Y-%m-%d %H:%M UTC')"

cat > "$OUT_ABS/README.md" <<EOF
# Star chart gallery — \`$REPO\`

Every output the [\`starchart\`](../../cmd/starchart) tool can produce, so you can
pick one for your own README. Regenerate with:

\`\`\`bash
./scripts/gen-gallery.sh $REPO
\`\`\`

Generated $GENERATED.

## PNG — \`-theme light\` (default)

\`\`\`markdown
![Star History](./$REPO_SLUG-light.png)
\`\`\`

![Star History light](./$REPO_SLUG-light.png)

## PNG — \`-theme dark\`

![Star History dark](./$REPO_SLUG-dark.png)

## PNG — \`-theme transparent\`

Draws no background, so it sits on whichever GitHub theme the reader uses. This
is the one to pick if you only want to ship a single image.

![Star History transparent](./$REPO_SLUG-transparent.png)

## Light and dark in one image

GitHub picks per reader theme with a \`<picture>\` element:

\`\`\`html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./$REPO_SLUG-dark.png">
  <img alt="Star History" src="./$REPO_SLUG-light.png">
</picture>
\`\`\`

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./$REPO_SLUG-dark.png">
  <img alt="Star History" src="./$REPO_SLUG-light.png">
</picture>

## PNG — \`-daily\`

Overlays per-day counts on a second axis, so spikes are visible instead of
being flattened into the cumulative curve.

![Star History with daily counts](./$REPO_SLUG-daily.png)

## PNG — \`-width 1200 -height 300\`

A banner shape, for the top of a README.

![Star History wide](./$REPO_SLUG-wide.png)

## SVG

Same renderer, vector output. Stays sharp when the reader zooms the page, and
is usually a smaller file.

\`\`\`markdown
![Star History](./$REPO_SLUG.svg)
\`\`\`

![Star History svg](./$REPO_SLUG.svg)

## Mermaid — the only zoomable option

Not an image: GitHub renders this natively, so it follows the reader's theme
and gets GitHub's built-in pan and zoom controls. The trade-off is that it is
downsampled to $MERMAID_POINTS points and is much less precise than the images above.

$MERMAID

## Clickable chart

Wrap any image in a link to the live explorer, so a click goes from a static
picture to the full interactive chart:

\`\`\`markdown
[![Star History](./$REPO_SLUG-light.png)](https://emanuelef.github.io/daily-stars-explorer/#/$REPO)
\`\`\`

[![Star History](./$REPO_SLUG-light.png)](https://emanuelef.github.io/daily-stars-explorer/#/$REPO)
EOF

echo "Wrote $OUT_ABS/README.md"
