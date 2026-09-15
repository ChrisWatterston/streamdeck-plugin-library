const fs = require("node:fs");
const path = require("node:path");

const PLUGIN_UUID = "com.chriswatterston.cabin-analytics";
const ACTION_UUID = "com.chriswatterston.cabin-analytics.stat";
const CABIN_API_URL = "https://api.withcabin.com/v1/analytics";
const CABIN_SITE_URL = "https://withcabin.com/";
const CACHE_TTL_MS = 60 * 1000;
const DOUBLE_PRESS_MS = 450;

// The tile renderer reads your editable key background from here, then layers text over it.
const KEY_BACKGROUND_PATH = path.resolve(__dirname, "../imgs/key-image.svg");

// Each metric defines the label shown on the tile and the Cabin API scope needed to fetch it.
const METRICS = {
  page_views: { label: "Views", scope: "core" },
  unique_visitors: { label: "Visitors", scope: "core" },
  bounces: { label: "Bounces", scope: "core" },
  bounce_rate: { label: "Bounce", scope: "core" },
  top_country: { label: "Country", scope: "core" },
  top_browser: { label: "Browser", scope: "core" },
  top_device: { label: "Device", scope: "core" },
  search_traffic: { label: "Search", scope: "core" },
  social_traffic: { label: "Social", scope: "core" },
  top_page: { label: "Top Page", scope: "core,pages" },
  top_referral: { label: "Referral", scope: "core,referrals" },
  co2_grams: { label: "CO2", scope: "core,pages" },
};

const DEFAULT_SETTINGS = {
  domain: "",
  metric: "page_views",
  datePreset: "today",
  refreshMinutes: "60",
};

// Human-friendly labels for the bottom line on the Stream Deck key.
const DATE_PRESET_LABELS = {
  today: "Today",
  yesterday: "Yesterday",
  last_7_days: "Last 7 days",
  last_14_days: "Last 14 days",
  last_30_days: "Last 30 days",
  this_month: "This month",
};

let websocket;
let pluginUuid;
let registerEvent;
let globalSettings = { apiKey: "" };
let keyBackgroundDataUri;

const visibleActions = new Map();
const responseCache = new Map();

main();

function main() {
  // Stream Deck launches the plugin with connection details as command-line args.
  const args = parseArgs(process.argv.slice(2));
  const port = args.port;
  pluginUuid = args.pluginUUID ?? PLUGIN_UUID;
  registerEvent = args.registerEvent;

  if (!port || !registerEvent) {
    console.error("Stream Deck launch arguments are missing.");
    process.exit(1);
  }

  websocket = new WebSocket(`ws://127.0.0.1:${port}`);
  websocket.addEventListener("open", onOpen);
  websocket.addEventListener("message", onMessage);
  websocket.addEventListener("close", () => clearAllTimers());
  websocket.addEventListener("error", (error) => {
    console.error("Stream Deck websocket error", error);
  });
}

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^-/, "");
    const value = args[index + 1];

    if (key) {
      parsed[key] = value;
    }
  }

  return parsed;
}

function onOpen() {
  send({
    event: registerEvent,
    uuid: pluginUuid,
  });

  requestGlobalSettings();
}

function onMessage(event) {
  let message;

  try {
    message = JSON.parse(event.data);
  } catch (error) {
    console.error("Unable to parse Stream Deck message", error);
    return;
  }

  switch (message.event) {
    // A key using this action has appeared on a profile/page.
    case "willAppear":
      handleWillAppear(message);
      break;
    // The key disappeared, so stop its timer.
    case "willDisappear":
      handleWillDisappear(message);
      break;
    // Per-key settings changed in the property inspector.
    case "didReceiveSettings":
      handleDidReceiveSettings(message);
      break;
    // Global settings changed, currently just the Cabin API key.
    case "didReceiveGlobalSettings":
      handleDidReceiveGlobalSettings(message);
      break;
    // Single press refreshes; double press opens the Cabin website.
    case "keyDown":
      handleKeyDown(message.context);
      break;
    case "sendToPlugin":
      if (message.payload?.type === "refreshNow") {
        refreshAction(message.context, { force: true });
      }
      break;
    default:
      break;
  }
}

function handleWillAppear(message) {
  if (message.action !== ACTION_UUID) {
    return;
  }

  const settings = normalizeSettings(message.payload?.settings);

  // Store per-visible-key state so each key can have its own domain/metric/timer.
  visibleActions.set(message.context, {
    settings,
    timer: undefined,
    pressTimer: undefined,
  });

  setTile(message.context, settings, "Loading");
  scheduleAction(message.context, { immediate: true });
}

function handleWillDisappear(message) {
  const actionState = visibleActions.get(message.context);

  if (actionState?.timer) {
    clearTimeout(actionState.timer);
  }

  if (actionState?.pressTimer) {
    clearTimeout(actionState.pressTimer);
  }

  visibleActions.delete(message.context);
}

function handleDidReceiveSettings(message) {
  const settings = normalizeSettings(message.payload?.settings);
  const existing = visibleActions.get(message.context);

  visibleActions.set(message.context, {
    settings,
    timer: existing?.timer,
    pressTimer: existing?.pressTimer,
  });

  setTile(message.context, settings, "Loading");
  scheduleAction(message.context, { immediate: true });
}

function handleDidReceiveGlobalSettings(message) {
  globalSettings = normalizeGlobalSettings(message.payload?.settings);

  for (const context of visibleActions.keys()) {
    scheduleAction(context, { immediate: true });
  }
}

function handleKeyDown(context) {
  const actionState = visibleActions.get(context);

  if (!actionState) {
    return;
  }

  // First press starts a short timer. A second press within the window becomes a double press.
  if (actionState.pressTimer) {
    clearTimeout(actionState.pressTimer);
    actionState.pressTimer = undefined;
    visibleActions.set(context, actionState);
    openCabinWebsite();
    showOk(context);
    return;
  }

  actionState.pressTimer = setTimeout(() => {
    actionState.pressTimer = undefined;
    visibleActions.set(context, actionState);
    refreshAction(context, { force: true });
  }, DOUBLE_PRESS_MS);

  visibleActions.set(context, actionState);
}

function requestGlobalSettings() {
  send({
    event: "getGlobalSettings",
    context: pluginUuid,
  });
}

function scheduleAction(context, { immediate = false } = {}) {
  const actionState = visibleActions.get(context);

  if (!actionState) {
    return;
  }

  if (actionState.timer) {
    clearTimeout(actionState.timer);
    actionState.timer = undefined;
  }

  // Run once now when a key appears, settings change, or the timer fires.
  if (immediate) {
    refreshAction(context).catch((error) => {
      console.error("Refresh failed", error);
    });
  }

  const refreshMs = toRefreshMs(actionState.settings.refreshMinutes);

  actionState.timer = setTimeout(() => {
    scheduleAction(context, { immediate: true });
  }, refreshMs);

  visibleActions.set(context, actionState);
}

async function refreshAction(context, { force = false } = {}) {
  const actionState = visibleActions.get(context);

  if (!actionState) {
    return;
  }

  const { settings } = actionState;
  const apiKey = globalSettings.apiKey?.trim();
  const domain = normalizeDomain(settings.domain);

  // Missing setup is shown directly on the key instead of calling Cabin.
  if (!apiKey) {
    await setTile(context, settings, "API key?");
    return;
  }

  if (!domain) {
    await setTile(context, settings, "Domain?");
    return;
  }

  try {
    await setTile(context, settings, "Loading");

    const data = await fetchAnalytics({
      apiKey,
      domain,
      datePreset: settings.datePreset,
      metric: settings.metric,
      force,
    });

    const value = formatMetricTitle(settings.metric, data);
    await setTile(context, settings, value);
  } catch (error) {
    console.error("Cabin API error", error);
    await setTile(context, settings, formatErrorTitle(error));
    showAlert(context);
  }
}

async function fetchAnalytics({ apiKey, domain, datePreset, metric, force }) {
  const metricConfig = METRICS[metric] ?? METRICS.page_views;
  const dateRange = getDateRange(datePreset);

  // Cabin returns optional list-style data; 10 is enough for the top-item metrics we show.
  const params = new URLSearchParams({
    domain,
    date_from: dateRange.from,
    date_to: dateRange.to,
    scope: metricConfig.scope,
    limit_lists: "10",
  });

  const cacheKey = `${domain}:${params.toString()}`;
  const cached = responseCache.get(cacheKey);
  const now = Date.now();

  // Keep rapid duplicate requests from multiple keys polite to the Cabin API.
  if (!force && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  if (!force && cached?.promise) {
    return cached.promise;
  }

  const promise = fetch(`${CABIN_API_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      accept: "application/json",
    },
  }).then(async (response) => {
    const text = await response.text();
    const body = parseJson(text, {});

    if (!response.ok) {
      const message =
        body?.message ||
        body?.error ||
        response.statusText ||
        "Cabin API request failed.";
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return body;
  });

  responseCache.set(cacheKey, {
    fetchedAt: now,
    promise,
  });

  try {
    const data = await promise;
    responseCache.set(cacheKey, {
      fetchedAt: Date.now(),
      data,
    });
    return data;
  } catch (error) {
    responseCache.delete(cacheKey);
    throw error;
  }
}

function normalizeSettings(settings = {}) {
  // Settings are normalized because older profiles may contain missing or now-removed values.
  return {
    domain: stringOrDefault(settings.domain, DEFAULT_SETTINGS.domain),
    metric: METRICS[settings.metric]
      ? settings.metric
      : DEFAULT_SETTINGS.metric,
    datePreset: isKnownDatePreset(settings.datePreset)
      ? settings.datePreset
      : DEFAULT_SETTINGS.datePreset,
    refreshMinutes: isKnownRefreshMinutes(settings.refreshMinutes)
      ? settings.refreshMinutes
      : DEFAULT_SETTINGS.refreshMinutes,
  };
}

function normalizeGlobalSettings(settings = {}) {
  return {
    apiKey: stringOrDefault(settings.apiKey, ""),
  };
}

function stringOrDefault(value, defaultValue) {
  return typeof value === "string" ? value : defaultValue;
}

function normalizeDomain(value) {
  if (typeof value !== "string") {
    return "";
  }

  return (
    value
      .trim()
      // Let users paste either example.com or a full URL into the property inspector.
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .split("?")[0]
      .trim()
  );
}

function isKnownRefreshMinutes(value) {
  return ["15", "30", "60", "360", "720", "1440"].includes(String(value));
}

function isKnownDatePreset(value) {
  return [
    "today",
    "yesterday",
    "last_7_days",
    "last_14_days",
    "last_30_days",
    "this_month",
  ].includes(String(value));
}

function toRefreshMs(refreshMinutes) {
  const minutes = Number.parseInt(refreshMinutes, 10);
  return (Number.isNaN(minutes) ? 60 : minutes) * 60 * 1000;
}

function getDateRange(datePreset) {
  const today = startOfLocalDay(new Date());
  const from = new Date(today);
  const to = new Date(today);

  // Cabin expects explicit date_from/date_to values rather than named presets.
  switch (datePreset) {
    case "yesterday":
      from.setDate(from.getDate() - 1);
      to.setDate(to.getDate() - 1);
      break;
    case "last_7_days":
      from.setDate(from.getDate() - 6);
      break;
    case "last_14_days":
      from.setDate(from.getDate() - 13);
      break;
    case "last_30_days":
      from.setDate(from.getDate() - 29);
      break;
    case "this_month":
      from.setDate(1);
      break;
    case "today":
    default:
      break;
  }

  return {
    from: formatDate(from),
    to: formatDate(to),
  };
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMetricTitle(metric, data) {
  // Convert Cabin's JSON response into the central value displayed on the key.
  switch (metric) {
    case "page_views":
      return formatNumber(data.summary?.page_views);
    case "unique_visitors":
      return formatNumber(data.summary?.unique_visitors);
    case "bounces":
      return formatNumber(data.summary?.bounces);
    case "bounce_rate":
      return formatPercent(data.summary?.bounce_rate);
    case "top_country":
      return formatTopList(data.countries, "code");
    case "top_browser":
      return formatTopList(data.browsers, "name");
    case "top_device":
      return formatTopObject(data.devices);
    case "search_traffic":
      return formatNumber(data.traffic_sources?.search);
    case "social_traffic":
      return formatNumber(data.traffic_sources?.social);
    case "top_page":
      return formatTopList(data.pages, "path", "page_views");
    case "top_referral":
      return formatTopList(data.referrals, "source", "page_views");
    case "co2_grams":
      return formatCo2(data.energy?.total_co2_grams);
    default:
      return "No data";
  }
}

function formatTopList(items, nameKey, valueKey = "value") {
  // Used for top-country/top-page-style metrics that return an ordered array.
  const first = Array.isArray(items) ? items[0] : undefined;

  if (!first) {
    return "No data";
  }

  const name = truncate(String(first[nameKey] ?? "Unknown"), 12);
  return `${name}\n${formatNumber(first[valueKey])}`;
}

function formatTopObject(values) {
  // Used for metrics where Cabin returns a map such as { desktop: 10, mobile: 5 }.
  if (!values || typeof values !== "object") {
    return "No data";
  }

  const [name, value] =
    Object.entries(values).sort(
      (left, right) => Number(right[1]) - Number(left[1]),
    )[0] ?? [];

  if (!name) {
    return "No data";
  }

  return `${titleCase(name)}\n${formatNumber(value)}`;
}

function formatNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "No data";
  }

  return new Intl.NumberFormat("en", {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "No data";
  }

  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCo2(value) {
  const formatted = formatNumber(value);
  return formatted === "No data" ? formatted : `${formatted}g`;
}

function titleCase(value) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function formatErrorTitle(error) {
  if (error.status === 401 || error.status === 403) {
    return "Auth error";
  }

  if (error.status === 429) {
    return "Rate limit";
  }

  if (error.name === "TypeError") {
    return "Network";
  }

  return "Error";
}

function parseJson(value, fallback) {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function setTitle(context, title) {
  return send({
    event: "setTitle",
    context,
    payload: {
      title,
      target: 0,
    },
  });
}

function setTile(context, settings, value) {
  // We render the full tile as an SVG image, so text placement is consistent across devices.
  return Promise.all([
    setTitle(context, ""),
    setImage(context, createTileSvg(settings, value)),
  ]);
}

function setImage(context, svg) {
  return send({
    event: "setImage",
    context,
    payload: {
      image: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
      target: 0,
    },
  });
}

function createTileSvg(settings, value) {
  // Tweak the x/y/width/height/font values below to adjust the visual layout.
  const domain = truncateMiddle(
    normalizeDomain(settings.domain) || "Cabin Analytics",
    22,
  );
  const metricLabel = METRICS[settings.metric]?.label ?? "Metric";
  const dateLabel = DATE_PRESET_LABELS[settings.datePreset] ?? "Today";
  const valueMarkup = createValueText(value);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <!-- Editable background loaded from imgs/key-image.svg. -->
  <image href="${getKeyBackgroundDataUri()}" x="0" y="0" width="144" height="144" preserveAspectRatio="xMidYMid slice"/>
  <!-- Top domain pill. -->
  <rect x="0" y="-1" width="144" height="20" rx="7" fill="#263229" fill-opacity="0.92"/>
  <text x="72" y="13" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="12" font-weight="500" fill="#d3d7d1">${escapeXml(domain)}</text>
  ${valueMarkup}
  <!-- Bottom metric/date panel. -->
  <rect x="16" y="79" width="112" height="38" rx="8" fill="#27332a" fill-opacity="0.94"/>
  <text x="72" y="96" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="14" font-weight="800" fill="#ffffff">${escapeXml(metricLabel)}</text>
  <text x="72" y="111" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="12" font-weight="500" fill="#c7cbc5">${escapeXml(dateLabel)}</text>
</svg>`;
}

function createValueText(value) {
  // Some metrics return two-line values, such as "example.com" plus a count.
  const lines = String(value ?? "No data")
    .split("\n")
    .slice(0, 2);

  if (lines.length === 1) {
    return `<text x="72" y="65" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="${valueFontSize(lines[0])}" font-weight="900" fill="#ffffff">${escapeXml(truncateMiddle(lines[0], 12))}</text>`;
  }

  return `<text x="72" y="57" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="18" font-weight="850" fill="#ffffff">${escapeXml(truncateMiddle(lines[0], 13))}</text>
  <text x="72" y="76" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="16" font-weight="750" fill="#d9ded8">${escapeXml(truncateMiddle(lines[1], 13))}</text>`;
}

function valueFontSize(value) {
  // Short numbers get the biggest type; longer text shrinks to avoid clipping.
  if (value.length >= 12) {
    return 19;
  }

  if (value.length >= 9) {
    return 24;
  }

  return 30;
}

function getKeyBackgroundDataUri() {
  if (keyBackgroundDataUri) {
    return keyBackgroundDataUri;
  }

  try {
    // Cache the encoded SVG so we only read the file once per plugin process.
    const svg = fs.readFileSync(KEY_BACKGROUND_PATH, "utf8");
    keyBackgroundDataUri = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  } catch (error) {
    console.error("Unable to read key background", error);
    keyBackgroundDataUri =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNDQiIGhlaWdodD0iMTQ0Ij48cmVjdCB3aWR0aD0iMTQ0IiBoZWlnaHQ9IjE0NCIgZmlsbD0iIzE4MjExZCIvPjwvc3ZnPg==";
  }

  return keyBackgroundDataUri;
}

function escapeXml(value) {
  // User-controlled values like domains must be escaped before being inserted into SVG markup.
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateMiddle(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  const headLength = Math.ceil((maxLength - 3) / 2);
  const tailLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, headLength)}...${value.slice(-tailLength)}`;
}

function showAlert(context) {
  send({
    event: "showAlert",
    context,
  });
}

function showOk(context) {
  send({
    event: "showOk",
    context,
  });
}

function openCabinWebsite() {
  send({
    event: "openUrl",
    payload: {
      url: CABIN_SITE_URL,
    },
  });
}

function send(message) {
  if (websocket?.readyState !== WebSocket.OPEN) {
    return Promise.resolve();
  }

  websocket.send(JSON.stringify(message));
  return Promise.resolve();
}

function clearAllTimers() {
  for (const actionState of visibleActions.values()) {
    if (actionState.timer) {
      clearTimeout(actionState.timer);
    }

    if (actionState.pressTimer) {
      clearTimeout(actionState.pressTimer);
    }
  }

  visibleActions.clear();
}
