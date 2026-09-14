# Cabin Analytics Stream Deck Plugin

Display Cabin website analytics on Stream Deck keys.

## Features

- API key configured once in the Stream Deck property inspector.
- Per-key domain, metric, date range, and refresh interval settings.
- Refresh intervals: 15 minutes, 30 minutes, 1 hour, 6 hours, 12 hours, and 24 hours.
- Single press manually refreshes the key.
- Double press opens the Cabin website.
- Shared in-memory request cache so multiple keys with the same Cabin query do not all call the API at once.
- Dynamic key layout that uses `imgs/key-image.svg` as the background, with domain at the top, live value in the middle, and metric/date range at the bottom.

## File Guide

- `com.chriswatterston.cabin-analytics.sdPlugin/manifest.json`
  Defines how Stream Deck discovers the plugin, action name, icons, runtime, and property inspector path. JSON files cannot contain comments, so keep notes here instead.
- `com.chriswatterston.cabin-analytics.sdPlugin/bin/plugin.js`
  Main plugin runtime. It talks to Stream Deck, calls the Cabin API, schedules refreshes, handles single/double key presses, formats metric values, and renders the key image.
- `com.chriswatterston.cabin-analytics.sdPlugin/ui/property-inspector.html`
  The settings form shown in Stream Deck when you select a Cabin Stat key.
- `com.chriswatterston.cabin-analytics.sdPlugin/ui/property-inspector.js`
  Saves form values into Stream Deck settings and sends "refresh now" messages to the plugin runtime.
- `com.chriswatterston.cabin-analytics.sdPlugin/imgs/key-image.svg`
  The base background used behind the rendered tile text.

## Tweaking The Tile

Most visual changes live in `createTileSvg()` inside `bin/plugin.js`.

- Change the top domain pill by editing the first `<rect>` and `<text>` after the background `<image>`.
- Change the central value size in `createValueText()` and `valueFontSize()`.
- Change the bottom metric/date panel by editing the bottom `<rect>` and two `<text>` elements.
- Change the background artwork by replacing `imgs/key-image.svg`.

After editing installed plugin files, restart Stream Deck or remove and re-add the key if Stream Deck keeps a cached image.

## Metrics

- Page views
- Unique visitors
- Bounces
- Bounce rate
- Top country
- Top browser
- Top device
- Search traffic
- Social traffic
- Top page
- Top referral
- CO2 grams

## Install For Local Testing

Copy or symlink `com.chriswatterston.cabin-analytics.sdPlugin` into your Stream Deck plugins folder, then restart Stream Deck.

On macOS, the plugins folder is usually:

```text
~/Library/Application Support/com.elgato.StreamDeck/Plugins
```

The plugin does not require a build step for v1. The Stream Deck runtime runs `bin/plugin.js` directly.

This v1 targets Stream Deck's Node.js 24 plugin runtime so it can stay small and dependency-free.
It requires Stream Deck 7.3 or newer.

## Configuration

1. Add the "Cabin Stat" action to a key.
2. Enter your Cabin API key in the property inspector.
3. Set the domain exactly as Cabin expects it, for example `example.com`.
4. Choose the metric, date range, and refresh interval.

Cabin API keys are stored as Stream Deck global plugin settings. Other button settings are stored per key.

## Cabin API

This plugin calls:

```text
https://api.withcabin.com/v1/analytics
```

Authentication is sent with the `x-api-key` header.
