package starchart

import (
	"fmt"
	"io"
	"strings"

	"github.com/emanuelef/gh-repo-stats-server/starhistory"
)

// MermaidMaxPoints caps how many points go into a Mermaid chart.
//
// Mermaid renders in the reader's browser and labels every x-axis category, so
// a few thousand daily points produce an unreadable axis and a slow render.
// Forty is enough to keep the curve's shape.
const MermaidMaxPoints = 40

// RenderMermaid writes a Mermaid `xychart-beta` block for the series.
//
// Unlike the PNG and SVG output this is not an image: GitHub renders it
// natively in Markdown, which means it inherits the reader's light/dark theme
// and gets GitHub's built-in pan and zoom controls. The trade-off is that it is
// downsampled and far less precise. `xychart-beta` needs Mermaid v10.5+.
func RenderMermaid(w io.Writer, series []starhistory.StarsPerDay, opts Options) error {
	if len(series) == 0 {
		return fmt.Errorf("no star history to render")
	}
	opts = opts.withDefaults()

	points := downsample(series, MermaidMaxPoints)

	labels := make([]string, len(points))
	values := make([]string, len(points))
	maxTotal := 0
	for i, p := range points {
		labels[i] = `"` + p.Day.Time().Format("Jan 06") + `"`
		values[i] = fmt.Sprintf("%d", p.TotalStars)
		if p.TotalStars > maxTotal {
			maxTotal = p.TotalStars
		}
	}

	var b strings.Builder
	b.WriteString("```mermaid\n")
	b.WriteString("xychart-beta\n")
	fmt.Fprintf(&b, "    title \"%s — %s stars\"\n", opts.Repo, humanize(series[len(series)-1].TotalStars))
	fmt.Fprintf(&b, "    x-axis [%s]\n", strings.Join(labels, ", "))
	fmt.Fprintf(&b, "    y-axis \"Stars\" 0 --> %d\n", headroom(maxTotal))
	fmt.Fprintf(&b, "    line [%s]\n", strings.Join(values, ", "))
	b.WriteString("```\n")

	_, err := io.WriteString(w, b.String())
	return err
}

// downsample picks at most max evenly spaced points, always keeping the first
// and last so the chart starts at zero and ends at the current total.
func downsample(series []starhistory.StarsPerDay, max int) []starhistory.StarsPerDay {
	if max <= 0 || len(series) <= max {
		return series
	}
	if max == 1 {
		return series[len(series)-1:]
	}

	out := make([]starhistory.StarsPerDay, max)
	for i := range out {
		out[i] = series[i*(len(series)-1)/(max-1)]
	}
	return out
}

// niceSteps is the ladder of mantissas a rounded axis maximum may land on.
var niceSteps = []float64{1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10}

// headroom rounds a maximum up to the nearest "nice" number so the Mermaid
// y-axis ends somewhere readable: 40127 -> 50000, 126364 -> 150000.
func headroom(n int) int {
	if n <= 0 {
		return 1
	}

	magnitude := 1.0
	for magnitude*10 <= float64(n) {
		magnitude *= 10
	}

	for _, step := range niceSteps {
		if candidate := step * magnitude; candidate >= float64(n) {
			return int(candidate)
		}
	}
	return int(10 * magnitude)
}
