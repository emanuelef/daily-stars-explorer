package starchart

import (
	"bytes"
	"image/png"
	"strings"
	"testing"
	"time"

	"github.com/emanuelef/gh-repo-stats-server/starhistory"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func day(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t.UTC()
}

// growing builds a series of n days starting at from, gaining `per` stars a day.
func growing(from time.Time, n, per int) []starhistory.StarsPerDay {
	series := make([]starhistory.StarsPerDay, n)
	total := 0
	for i := range series {
		total += per
		series[i] = starhistory.StarsPerDay{
			Day:        starhistory.JSONDay(from.AddDate(0, 0, i)),
			Stars:      per,
			TotalStars: total,
		}
	}
	return series
}

func TestThemeByName(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"", "light"}, {"light", "light"}, {"LIGHT", "light"},
		{"dark", "dark"}, {" Dark ", "dark"},
		{"transparent", "transparent"}, {"auto", "transparent"},
	} {
		got, err := ThemeByName(tc.in)
		require.NoError(t, err, tc.in)
		assert.Equal(t, tc.want, got.Name, tc.in)
	}

	_, err := ThemeByName("neon")
	require.Error(t, err)
}

func TestRenderPNGProducesADecodableImage(t *testing.T) {
	var buf bytes.Buffer
	err := RenderPNG(&buf, growing(day("2024-01-01"), 400, 3), Options{
		Repo: "owner/name", Width: 640, Height: 320,
	})
	require.NoError(t, err)

	img, err := png.Decode(bytes.NewReader(buf.Bytes()))
	require.NoError(t, err, "output must be a valid PNG")
	assert.Equal(t, 640, img.Bounds().Dx())
	assert.Equal(t, 320, img.Bounds().Dy())
}

func TestRenderPNGDefaultsDimensions(t *testing.T) {
	var buf bytes.Buffer
	require.NoError(t, RenderPNG(&buf, growing(day("2024-01-01"), 30, 1), Options{Repo: "a/b"}))

	img, err := png.Decode(bytes.NewReader(buf.Bytes()))
	require.NoError(t, err)
	assert.Equal(t, 800, img.Bounds().Dx())
	assert.Equal(t, 400, img.Bounds().Dy())
}

func TestRenderAllThemesAndDaily(t *testing.T) {
	series := growing(day("2022-01-01"), 900, 2)

	for _, name := range []string{"light", "dark", "transparent"} {
		for _, daily := range []bool{false, true} {
			th, err := ThemeByName(name)
			require.NoError(t, err)

			var buf bytes.Buffer
			err = RenderPNG(&buf, series, Options{
				Repo: "owner/name", Theme: th, Daily: daily, Caption: "example.com",
			})
			require.NoError(t, err, "%s daily=%v", name, daily)

			_, err = png.Decode(bytes.NewReader(buf.Bytes()))
			require.NoError(t, err, "%s daily=%v", name, daily)
		}
	}
}

func TestRenderSVG(t *testing.T) {
	var buf bytes.Buffer
	require.NoError(t, RenderSVG(&buf, growing(day("2024-01-01"), 200, 5), Options{Repo: "owner/name"}))

	out := buf.String()
	assert.True(t, strings.Contains(out, "<svg"), "must emit an svg element")
	assert.Contains(t, out, "</svg>")
}

func TestRenderRejectsEmptySeries(t *testing.T) {
	var buf bytes.Buffer
	assert.Error(t, RenderPNG(&buf, nil, Options{Repo: "a/b"}))
	assert.Error(t, RenderSVG(&buf, nil, Options{Repo: "a/b"}))
	assert.Error(t, RenderMermaid(&buf, nil, Options{Repo: "a/b"}))
}

func TestSingleDaySeriesRenders(t *testing.T) {
	// A repository created today has exactly one point; the tick generator
	// must not divide by zero.
	var buf bytes.Buffer
	require.NoError(t, RenderPNG(&buf, growing(day("2026-09-06"), 1, 1), Options{Repo: "a/b"}))
	_, err := png.Decode(bytes.NewReader(buf.Bytes()))
	require.NoError(t, err)
}

func TestTimeTicksHaveUniqueLabels(t *testing.T) {
	cases := map[string][]time.Time{
		"one day":     {day("2026-09-06")},
		"two days":    {day("2026-09-05"), day("2026-09-06")},
		"three weeks": {day("2026-08-16"), day("2026-08-23"), day("2026-09-06")},
	}
	for name, xs := range cases {
		t.Run(name, func(t *testing.T) {
			seen := map[string]struct{}{}
			for _, tick := range timeTicks(xs) {
				_, dup := seen[tick.Label]
				assert.False(t, dup, "duplicate tick label %q", tick.Label)
				seen[tick.Label] = struct{}{}
			}
		})
	}

	t.Run("multi-year spans snap to calendar years", func(t *testing.T) {
		xs := make([]time.Time, 0, 2000)
		for d := day("2020-06-01"); !d.After(day("2026-01-15")); d = d.AddDate(0, 0, 1) {
			xs = append(xs, d)
		}
		ticks := timeTicks(xs)
		require.NotEmpty(t, ticks)

		labels := make([]string, len(ticks))
		for i, tk := range ticks {
			labels[i] = tk.Label
		}
		// 2020 is clamped to the series start; every later year is present.
		assert.Equal(t, []string{"2020", "2021", "2022", "2023", "2024", "2025", "2026"}, labels)
	})

	t.Run("empty", func(t *testing.T) {
		assert.Nil(t, timeTicks(nil))
	})
}

func TestRenderMermaid(t *testing.T) {
	var buf bytes.Buffer
	series := growing(day("2020-01-01"), 2400, 17)
	require.NoError(t, RenderMermaid(&buf, series, Options{Repo: "owner/name"}))

	out := buf.String()
	assert.True(t, strings.HasPrefix(out, "```mermaid\n"), "must be a fenced mermaid block")
	assert.True(t, strings.HasSuffix(out, "```\n"))
	assert.Contains(t, out, "xychart-beta")
	assert.Contains(t, out, `title "owner/name`)
	assert.Contains(t, out, "x-axis [")
	assert.Contains(t, out, "line [")

	// Must be downsampled: labelling 2400 points would be unreadable and slow.
	xAxis := between(t, out, "x-axis [", "]")
	assert.LessOrEqual(t, strings.Count(xAxis, ",")+1, MermaidMaxPoints)

	values := between(t, out, "line [", "]")
	assert.Equal(t, strings.Count(xAxis, ",")+1, strings.Count(values, ",")+1,
		"labels and values must be the same length or mermaid drops points")

	// The final value must be the true current total, not a sampled midpoint.
	assert.Contains(t, values, "40800")
}

func TestDownsampleKeepsEndpoints(t *testing.T) {
	series := growing(day("2020-01-01"), 1000, 1)

	got := downsample(series, 10)
	require.Len(t, got, 10)
	assert.Equal(t, series[0].TotalStars, got[0].TotalStars, "first point kept")
	assert.Equal(t, series[len(series)-1].TotalStars, got[len(got)-1].TotalStars, "last point kept")

	assert.Len(t, downsample(series, 0), len(series), "no cap means no downsampling")
	assert.Len(t, downsample(series[:5], 10), 5, "shorter than the cap is untouched")
	assert.Len(t, downsample(series, 1), 1)
}

func TestHumanize(t *testing.T) {
	for in, want := range map[int]string{
		0: "0", 7: "7", 999: "999",
		1000: "1k", 1500: "1.5k", 9999: "10k",
		40127: "40.1k", 126364: "126.4k",
		1_000_000: "1M", 2_500_000: "2.5M",
	} {
		assert.Equal(t, want, humanize(in), "humanize(%d)", in)
	}
}

func TestHeadroomRoundsUp(t *testing.T) {
	for in, want := range map[int]int{
		0: 1, 7: 8, 95: 100, 40127: 50000, 126364: 150000, 1000: 1000,
	} {
		got := headroom(in)
		assert.GreaterOrEqual(t, got, in, "headroom(%d) must not clip the data", in)
		assert.Equal(t, want, got, "headroom(%d)", in)
	}
}

func between(t *testing.T, s, start, end string) string {
	t.Helper()
	i := strings.Index(s, start)
	require.GreaterOrEqual(t, i, 0, "missing %q", start)
	rest := s[i+len(start):]
	j := strings.Index(rest, end)
	require.GreaterOrEqual(t, j, 0, "missing %q", end)
	return rest[:j]
}
