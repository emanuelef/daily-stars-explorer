// Package starchart renders a repository's star history as a self-contained
// image suitable for embedding in a README.
//
// It exists because the daily history is now cheap to fetch (see the
// starhistory package), so a chart can be regenerated from scratch in a GitHub
// Action in a couple of seconds without a browser, a server, or a headless
// screenshot.
package starchart

import (
	"fmt"
	"io"
	"math"
	"strings"
	"time"

	"github.com/emanuelef/gh-repo-stats-server/starhistory"
	chart "github.com/wcharczuk/go-chart/v2"
	"github.com/wcharczuk/go-chart/v2/drawing"
)

// Theme is a colour scheme for the rendered chart.
type Theme struct {
	Name       string
	Background drawing.Color
	Canvas     drawing.Color
	Text       drawing.Color
	Muted      drawing.Color
	Grid       drawing.Color
	Line       drawing.Color
	Fill       drawing.Color
}

// Themes are picked to sit naturally on GitHub's own README backgrounds.
var (
	LightTheme = Theme{
		Name:       "light",
		Background: drawing.ColorFromHex("ffffff"),
		Canvas:     drawing.ColorFromHex("ffffff"),
		Text:       drawing.ColorFromHex("1f2328"),
		Muted:      drawing.ColorFromHex("656d76"),
		Grid:       drawing.ColorFromHex("e4e8ed"),
		Line:       drawing.ColorFromHex("2f81f7"),
		Fill:       drawing.ColorFromHex("2f81f7").WithAlpha(38),
	}

	DarkTheme = Theme{
		Name:       "dark",
		Background: drawing.ColorFromHex("0d1117"),
		Canvas:     drawing.ColorFromHex("0d1117"),
		Text:       drawing.ColorFromHex("e6edf3"),
		Muted:      drawing.ColorFromHex("8b949e"),
		Grid:       drawing.ColorFromHex("21262d"),
		Line:       drawing.ColorFromHex("58a6ff"),
		Fill:       drawing.ColorFromHex("58a6ff").WithAlpha(45),
	}

	// TransparentTheme adapts to whichever GitHub theme the reader is using.
	// Only safe with mid-tone ink, since it has to stay legible on both.
	TransparentTheme = Theme{
		Name:       "transparent",
		Background: drawing.Color{},
		Canvas:     drawing.Color{},
		Text:       drawing.ColorFromHex("7d8590"),
		Muted:      drawing.ColorFromHex("7d8590"),
		Grid:       drawing.ColorFromHex("7d8590").WithAlpha(45),
		Line:       drawing.ColorFromHex("2f81f7"),
		Fill:       drawing.ColorFromHex("2f81f7").WithAlpha(38),
	}
)

// ThemeByName resolves a theme name, defaulting to light.
func ThemeByName(name string) (Theme, error) {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "", "light":
		return LightTheme, nil
	case "dark":
		return DarkTheme, nil
	case "transparent", "auto":
		return TransparentTheme, nil
	default:
		return Theme{}, fmt.Errorf("unknown theme %q (want light, dark or transparent)", name)
	}
}

// Options controls what gets drawn.
type Options struct {
	Repo   string
	Theme  Theme
	Width  int
	Height int

	// Daily overlays per-day counts on a second axis instead of drawing only
	// the cumulative curve.
	Daily bool

	// Caption is drawn bottom-right; empty means no caption.
	Caption string
}

// Defaults fills in zero values. 800x400 renders crisply at README width
// without forcing GitHub to downscale.
func (o Options) withDefaults() Options {
	if o.Width <= 0 {
		o.Width = 800
	}
	if o.Height <= 0 {
		o.Height = 400
	}
	if o.Theme.Name == "" {
		o.Theme = LightTheme
	}
	return o
}

// RenderPNG draws the star history and writes a PNG to w.
func RenderPNG(w io.Writer, series []starhistory.StarsPerDay, opts Options) error {
	graph, err := build(series, opts)
	if err != nil {
		return err
	}
	return graph.Render(chart.PNG, w)
}

// RenderSVG draws the star history and writes an SVG to w. SVG stays sharp at
// any zoom level, which is why it is worth offering alongside PNG.
func RenderSVG(w io.Writer, series []starhistory.StarsPerDay, opts Options) error {
	graph, err := build(series, opts)
	if err != nil {
		return err
	}
	return graph.Render(chart.SVG, w)
}

func build(series []starhistory.StarsPerDay, opts Options) (*chart.Chart, error) {
	if len(series) == 0 {
		return nil, fmt.Errorf("no star history to render")
	}
	opts = opts.withDefaults()
	th := opts.Theme

	xs := make([]time.Time, len(series))
	totals := make([]float64, len(series))
	dailies := make([]float64, len(series))
	for i, s := range series {
		xs[i] = s.Day.Time()
		totals[i] = float64(s.TotalStars)
		dailies[i] = float64(s.Stars)
	}

	finalTotal := series[len(series)-1].TotalStars

	// go-chart rejects a series it cannot compute an x-range from ("zero
	// x-range delta"). A repository created today has exactly one day, so give
	// it a flat leading point rather than failing to render.
	if len(xs) == 1 {
		xs = []time.Time{xs[0].AddDate(0, 0, -1), xs[0]}
		totals = []float64{0, totals[0]}
		dailies = []float64{0, dailies[0]}
	}

	axisStyle := chart.Style{
		FontColor:   th.Muted,
		FontSize:    9,
		StrokeColor: th.Grid,
		StrokeWidth: 1,
	}
	gridStyle := chart.Style{StrokeColor: th.Grid, StrokeWidth: 1}

	graphSeries := []chart.Series{
		chart.TimeSeries{
			Name:    "Total stars",
			XValues: xs,
			YValues: totals,
			Style: chart.Style{
				StrokeColor: th.Line,
				StrokeWidth: 2.2,
				FillColor:   th.Fill,
			},
		},
	}

	// A second axis keeps the daily counts readable; they are two or three
	// orders of magnitude smaller than the cumulative total.
	if opts.Daily {
		graphSeries = append(graphSeries, chart.TimeSeries{
			Name:    "Daily stars",
			XValues: xs,
			YValues: dailies,
			YAxis:   chart.YAxisSecondary,
			Style: chart.Style{
				StrokeColor: th.Line.WithAlpha(90),
				StrokeWidth: 1,
			},
		})
	}

	graph := &chart.Chart{
		Title: fmt.Sprintf("%s — %s stars", opts.Repo, humanize(finalTotal)),
		TitleStyle: chart.Style{
			FontColor: th.Text,
			FontSize:  15,
		},
		Width:  opts.Width,
		Height: opts.Height,
		Background: chart.Style{
			FillColor: th.Background,
			Padding:   chart.Box{Top: 42, Left: 14, Right: 22, Bottom: 12},
		},
		Canvas: chart.Style{FillColor: th.Canvas},
		XAxis: chart.XAxis{
			Style:          axisStyle,
			GridMajorStyle: gridStyle,
			ValueFormatter: dateFormatter(xs),
			// Explicit ticks: go-chart's automatic spacing picks a count from
			// pixel width, which on a multi-year span lands two ticks inside the
			// same year and prints "2020 2020 2021 2021".
			Ticks: timeTicks(xs),
		},
		YAxis: chart.YAxis{
			Style:          axisStyle,
			GridMajorStyle: gridStyle,
			ValueFormatter: func(v any) string {
				if f, ok := v.(float64); ok {
					return humanize(int(math.Round(f)))
				}
				return ""
			},
		},
		Series: graphSeries,
	}

	if opts.Daily {
		graph.YAxisSecondary = chart.YAxis{
			Style: axisStyle,
			ValueFormatter: func(v any) string {
				if f, ok := v.(float64); ok {
					return humanize(int(math.Round(f)))
				}
				return ""
			},
		}
	} else {
		// Without this the unused secondary axis still renders, leaving a
		// stray "0.00" clipped against the left edge of the image.
		graph.YAxisSecondary = chart.YAxis{Style: chart.Style{Hidden: true}}
	}

	if opts.Caption != "" {
		graph.Elements = []chart.Renderable{captionRenderer(opts.Caption, th)}
	}

	return graph, nil
}

// tickLayouts run coarse to fine; timeTicks picks the coarsest one that still
// gives every tick a distinct label.
var tickLayouts = []string{"2006", "Jan 2006", "2 Jan 2006", "2 Jan 15:04"}

// timeTicks returns evenly spaced ticks across the series with unique labels.
func timeTicks(xs []time.Time) []chart.Tick {
	const want = 6

	if len(xs) == 0 {
		return nil
	}
	if len(xs) == 1 {
		return []chart.Tick{{
			Value: float64(xs[0].UnixNano()),
			Label: xs[0].Format("2 Jan 2006"),
		}}
	}

	first, last := xs[0], xs[len(xs)-1]

	// Multi-year spans read best on calendar-year boundaries. Evenly spaced
	// sampling skips years unevenly (2020, 2021, 2022, 2024, 2025) because the
	// endpoints rarely land on 1 January.
	if years := last.Year() - first.Year(); years >= 2 && years <= 12 {
		ticks := make([]chart.Tick, 0, years+1)
		for y := first.Year(); y <= last.Year(); y++ {
			at := time.Date(y, time.January, 1, 0, 0, 0, 0, time.UTC)
			if at.Before(first) {
				at = first
			}
			if at.After(last) {
				break
			}
			ticks = append(ticks, chart.Tick{
				Value: float64(at.UnixNano()),
				Label: at.Format("2006"),
			})
		}
		if len(ticks) >= 2 {
			return ticks
		}
	}

	count := want
	if len(xs) < count {
		count = len(xs)
	}

	idx := make([]int, count)
	for i := range idx {
		idx[i] = i * (len(xs) - 1) / (count - 1)
	}

	for _, layout := range tickLayouts {
		seen := make(map[string]struct{}, count)
		unique := true
		for _, i := range idx {
			label := xs[i].Format(layout)
			if _, dup := seen[label]; dup {
				unique = false
				break
			}
			seen[label] = struct{}{}
		}
		if !unique {
			continue
		}

		ticks := make([]chart.Tick, count)
		for i, at := range idx {
			ticks[i] = chart.Tick{
				Value: float64(xs[at].UnixNano()),
				Label: xs[at].Format(layout),
			}
		}
		return ticks
	}

	// Every layout collided (points closer together than a minute); fall back
	// to the finest one rather than returning nothing.
	ticks := make([]chart.Tick, count)
	for i, at := range idx {
		ticks[i] = chart.Tick{
			Value: float64(xs[at].UnixNano()),
			Label: xs[at].Format(tickLayouts[len(tickLayouts)-1]),
		}
	}
	return ticks
}

// dateFormatter picks a date layout that suits the span being drawn, so a
// three-month chart does not print the year on every tick and a ten-year one
// does not print the day.
func dateFormatter(xs []time.Time) chart.ValueFormatter {
	layout := "Jan 2006"
	if len(xs) > 1 {
		span := xs[len(xs)-1].Sub(xs[0])
		switch {
		case span < 90*24*time.Hour:
			layout = "2 Jan"
		case span < 3*365*24*time.Hour:
			layout = "Jan 2006"
		default:
			layout = "2006"
		}
	}

	return func(v any) string {
		switch t := v.(type) {
		case time.Time:
			return t.Format(layout)
		case int64:
			return time.Unix(0, t).Format(layout)
		case float64:
			return time.Unix(0, int64(t)).Format(layout)
		}
		return ""
	}
}

// captionRenderer draws a small attribution line in the bottom-right corner.
func captionRenderer(caption string, th Theme) chart.Renderable {
	return func(r chart.Renderer, box chart.Box, _ chart.Style) {
		style := chart.Style{
			FontColor: th.Muted,
			FontSize:  8,
			Font:      chart.StyleTextDefaults().GetFont(),
		}
		style.GetTextOptions().WriteToRenderer(r)
		r.SetFontColor(th.Muted.WithAlpha(200))
		r.SetFontSize(8)

		tb := r.MeasureText(caption)
		r.Text(caption, box.Right-tb.Width()-10, box.Bottom-6)
	}
}

// humanize renders a star count compactly: 40127 -> "40.1k".
func humanize(n int) string {
	switch {
	case n >= 1_000_000:
		return trimZero(fmt.Sprintf("%.1f", float64(n)/1_000_000)) + "M"
	case n >= 10_000:
		return trimZero(fmt.Sprintf("%.1f", float64(n)/1_000)) + "k"
	case n >= 1_000:
		return trimZero(fmt.Sprintf("%.2f", float64(n)/1_000)) + "k"
	default:
		return fmt.Sprintf("%d", n)
	}
}

func trimZero(s string) string {
	s = strings.TrimRight(s, "0")
	return strings.TrimSuffix(s, ".")
}
