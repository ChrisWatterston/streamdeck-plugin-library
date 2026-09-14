# Cabin Analytics Stream Deck Plugin

Display Cabin website analytics on Stream Deck keys.

## Features

- API key configured once in the Stream Deck property inspector.
- Per-key domain, metric, date range, and refresh interval settings.
- Refresh intervals: 15 minutes, 30 minutes, 1 hour, 6 hours, 12 hours, and 24 hours.
- Single press manually refreshes the key.
- Double press opens the Cabin website.
- Shared in-memory request cache so multiple keys with the same Cabin query do not all call the API at once.

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

## Installation

Installation is quick and easy, Simply copy the `com.chriswatterston.cabin-analytics.sdPlugin` folder into your Stream Deck plugins folder, then restart Stream Deck.

For macOS, the plugins folder is usually located at `~/Library/Application Support/com.elgato.StreamDeck/Plugins`.

Note: This version requires Stream Deck 7.3 or newer.

## Configuration

1. Add the "Cabin Stat" action to a key.
2. Enter your Cabin API key in the property inspector.
3. Set the domain exactly as Cabin expects it, for example `example.com`.
4. Choose the metric, date range, and refresh interval.

Cabin API keys are stored as Stream Deck global plugin settings. Other button settings are stored per key.
