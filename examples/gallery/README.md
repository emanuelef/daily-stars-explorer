# Star chart gallery — `gofiber/fiber`

Every output the [`starchart`](../../cmd/starchart) tool can produce, so you can
pick one for your own README. Regenerate with:

```bash
./scripts/gen-gallery.sh gofiber/fiber
```

Generated 2026-09-06 19:17 UTC.

## PNG — `-theme light` (default)

```markdown
![Star History](./gofiber-fiber-light.png)
```

![Star History light](./gofiber-fiber-light.png)

## PNG — `-theme dark`

![Star History dark](./gofiber-fiber-dark.png)

## PNG — `-theme transparent`

Draws no background, so it sits on whichever GitHub theme the reader uses. This
is the one to pick if you only want to ship a single image.

![Star History transparent](./gofiber-fiber-transparent.png)

## Light and dark in one image

GitHub picks per reader theme with a `<picture>` element:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./gofiber-fiber-dark.png">
  <img alt="Star History" src="./gofiber-fiber-light.png">
</picture>
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./gofiber-fiber-dark.png">
  <img alt="Star History" src="./gofiber-fiber-light.png">
</picture>

## PNG — `-daily`

Overlays per-day counts on a second axis, so spikes are visible instead of
being flattened into the cumulative curve.

![Star History with daily counts](./gofiber-fiber-daily.png)

## PNG — `-width 1200 -height 300`

A banner shape, for the top of a README.

![Star History wide](./gofiber-fiber-wide.png)

## SVG

Same renderer, vector output. Stays sharp when the reader zooms the page, and
is usually a smaller file.

```markdown
![Star History](./gofiber-fiber.svg)
```

![Star History svg](./gofiber-fiber.svg)

## Mermaid — the only zoomable option

Not an image: GitHub renders this natively, so it follows the reader's theme
and gets GitHub's built-in pan and zoom controls. The trade-off is that it is
downsampled to 40 points and is much less precise than the images above.

```mermaid
xychart-beta
    title "gofiber/fiber — 40.1k stars"
    x-axis ["Jan 20", "Mar 20", "May 20", "Jul 20", "Sep 20", "Nov 20", "Jan 21", "Mar 21", "May 21", "Jul 21", "Sep 21", "Nov 21", "Jan 22", "Apr 22", "Jun 22", "Aug 22", "Oct 22", "Dec 22", "Feb 23", "Apr 23", "Jun 23", "Aug 23", "Oct 23", "Dec 23", "Feb 24", "Apr 24", "Jun 24", "Aug 24", "Oct 24", "Dec 24", "Feb 25", "Apr 25", "Jun 25", "Aug 25", "Oct 25", "Dec 25", "Mar 26", "May 26", "Jul 26", "Sep 26"]
    y-axis "Stars" 0 --> 50000
    line [1, 3037, 4890, 6108, 7346, 9192, 10330, 11409, 12460, 13277, 14354, 15368, 16737, 18050, 19062, 19977, 21374, 22295, 23257, 24436, 25473, 26557, 27560, 28409, 29206, 30249, 30954, 31761, 32749, 33522, 34287, 35432, 36252, 36871, 37724, 38399, 38970, 39444, 39813, 40130]
```

## Clickable chart

Wrap any image in a link to the live explorer, so a click goes from a static
picture to the full interactive chart:

```markdown
[![Star History](./gofiber-fiber-light.png)](https://emanuelef.github.io/daily-stars-explorer/#/gofiber/fiber)
```

[![Star History](./gofiber-fiber-light.png)](https://emanuelef.github.io/daily-stars-explorer/#/gofiber/fiber)
