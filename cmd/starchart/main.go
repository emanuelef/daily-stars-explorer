// Command starchart renders a GitHub repository's star history to a PNG, SVG
// or Mermaid block, ready to embed in a README.
//
// It reads GitHub's aggregate star history endpoint, so a full history costs
// roughly one request per 30 weeks — a few seconds for any repository, with no
// browser and no server. A token is optional: unauthenticated callers get 60
// requests/hour, which is enough for many repositories per hour.
//
//	starchart -repo gofiber/fiber -out stars.png
//	starchart -repo gofiber/fiber -out stars-dark.svg -theme dark
//	starchart -repo gofiber/fiber -out stars.md -format mermaid
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/emanuelef/gh-repo-stats-server/starchart"
	"github.com/emanuelef/gh-repo-stats-server/starhistory"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "starchart: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		repo    = flag.String("repo", "", "repository as owner/name (required)")
		out     = flag.String("out", "star-history.png", "output file; - writes to stdout")
		format  = flag.String("format", "", "png, svg or mermaid (default: inferred from -out)")
		theme   = flag.String("theme", "light", "light, dark or transparent")
		width   = flag.Int("width", 800, "image width in pixels")
		height  = flag.Int("height", 400, "image height in pixels")
		daily   = flag.Bool("daily", false, "overlay daily counts on a second axis")
		caption = flag.String("caption", "", "small attribution text in the bottom-right corner")
		token   = flag.String("token", "", "GitHub token (default: $GITHUB_TOKEN, then $PAT; optional)")
		timeout = flag.Duration("timeout", 2*time.Minute, "overall timeout")
	)
	flag.Parse()

	if *repo == "" {
		flag.Usage()
		return fmt.Errorf("-repo is required")
	}
	if _, _, err := starhistory.SplitRepo(*repo); err != nil {
		return err
	}

	resolvedFormat, err := resolveFormat(*format, *out)
	if err != nil {
		return err
	}

	th, err := starchart.ThemeByName(*theme)
	if err != nil {
		return err
	}

	tok := *token
	if tok == "" {
		tok = firstNonEmpty(os.Getenv("GITHUB_TOKEN"), os.Getenv("PAT"))
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	start := time.Now()
	series, err := starhistory.New(tok).DailyHistory(ctx, *repo, nil)
	if err != nil {
		return err
	}
	if len(series) == 0 {
		return fmt.Errorf("no star history returned for %s", *repo)
	}

	w, closeOut, err := openOutput(*out)
	if err != nil {
		return err
	}
	defer closeOut()

	opts := starchart.Options{
		Repo:    *repo,
		Theme:   th,
		Width:   *width,
		Height:  *height,
		Daily:   *daily,
		Caption: *caption,
	}

	switch resolvedFormat {
	case "png":
		err = starchart.RenderPNG(w, series, opts)
	case "svg":
		err = starchart.RenderSVG(w, series, opts)
	case "mermaid":
		err = starchart.RenderMermaid(w, series, opts)
	}
	if err != nil {
		return err
	}

	total := series[len(series)-1].TotalStars
	fmt.Fprintf(os.Stderr, "starchart: %s — %d stars over %d days -> %s (%s) in %s\n",
		*repo, total, len(series), *out, resolvedFormat, time.Since(start).Round(time.Millisecond))

	// Expose results to later workflow steps.
	writeGitHubOutput(map[string]string{
		"stars": fmt.Sprintf("%d", total),
		"days":  fmt.Sprintf("%d", len(series)),
		"file":  *out,
	})

	return nil
}

func resolveFormat(format, out string) (string, error) {
	if format != "" {
		f := strings.ToLower(format)
		switch f {
		case "png", "svg", "mermaid":
			return f, nil
		default:
			return "", fmt.Errorf("unknown format %q (want png, svg or mermaid)", format)
		}
	}

	switch strings.ToLower(filepath.Ext(out)) {
	case ".svg":
		return "svg", nil
	case ".md", ".mmd", ".markdown":
		return "mermaid", nil
	default:
		return "png", nil
	}
}

func openOutput(path string) (io.Writer, func(), error) {
	if path == "-" {
		return os.Stdout, func() {}, nil
	}

	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, nil, err
		}
	}

	f, err := os.Create(path)
	if err != nil {
		return nil, nil, err
	}
	return f, func() { _ = f.Close() }, nil
}

// writeGitHubOutput appends key=value pairs to $GITHUB_OUTPUT when running
// inside Actions. Failures are ignored: they must not fail the render.
func writeGitHubOutput(values map[string]string) {
	path := os.Getenv("GITHUB_OUTPUT")
	if path == "" {
		return
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0o644)
	if err != nil {
		return
	}
	defer func() { _ = f.Close() }()

	for k, v := range values {
		_, _ = fmt.Fprintf(f, "%s=%s\n", k, v)
	}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
