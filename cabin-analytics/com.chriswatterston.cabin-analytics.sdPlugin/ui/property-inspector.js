const ACTION_UUID = "com.chriswatterston.cabin-analytics.stat";

// These defaults are used when a new Cabin Stat action is first dropped onto a key.
const DEFAULT_SETTINGS = {
  domain: "",
  metric: "page_views",
  datePreset: "today",
  refreshMinutes: "60",
};

let websocket;
let propertyInspectorUuid;
let currentSettings = { ...DEFAULT_SETTINGS };
let currentGlobalSettings = { apiKey: "" };
let isHydrating = false;
let actionSaveTimer;
let globalSaveTimer;

const fields = {};

window.connectElgatoStreamDeckSocket = (
  port,
  uuid,
  registerEvent,
  info,
  actionInfo,
) => {
  // Stream Deck calls this global function when the property inspector opens.
  propertyInspectorUuid = uuid;
  websocket = new WebSocket(`ws://127.0.0.1:${port}`);

  websocket.addEventListener("open", () => {
    send({
      event: registerEvent,
      uuid,
    });

    const parsedActionInfo = parseJson(actionInfo, {});
    currentSettings = normalizeSettings(parsedActionInfo.payload?.settings);
    hydrate();

    // API key is stored globally so you only enter it once for the whole plugin.
    send({
      event: "getGlobalSettings",
      context: propertyInspectorUuid,
    });
  });

  websocket.addEventListener("message", (event) => {
    const message = parseJson(event.data, {});

    if (message.event === "didReceiveSettings") {
      currentSettings = normalizeSettings(message.payload?.settings);
      hydrate();
    }

    if (message.event === "didReceiveGlobalSettings") {
      currentGlobalSettings = normalizeGlobalSettings(
        message.payload?.settings,
      );
      hydrate();
    }
  });
};

document.addEventListener("DOMContentLoaded", () => {
  // Cache DOM references once. Add new property-inspector controls to these lists.
  for (const id of [
    "apiKey",
    "domain",
    "metric",
    "datePreset",
    "refreshMinutes",
  ]) {
    fields[id] = document.getElementById(id);
  }

  for (const id of ["domain", "metric", "datePreset", "refreshMinutes"]) {
    // Save key-specific settings such as domain, metric, date range, and refresh interval.
    fields[id].addEventListener("change", saveActionSettings);
    fields[id].addEventListener("input", queueActionSettingsSave);
  }

  // The API key is global plugin state, not per-key state.
  fields.apiKey.addEventListener("change", saveGlobalSettings);
  fields.apiKey.addEventListener("input", queueGlobalSettingsSave);

  document.getElementById("refreshNow").addEventListener("click", () => {
    saveActionSettings();
    saveGlobalSettings();
    send({
      event: "sendToPlugin",
      action: ACTION_UUID,
      context: propertyInspectorUuid,
      payload: {
        type: "refreshNow",
      },
    });
  });

  hydrate();
});

function hydrate() {
  if (!fields.domain) {
    return;
  }

  isHydrating = true;

  // Fill the form from Stream Deck's saved settings without triggering another save.
  fields.apiKey.value = currentGlobalSettings.apiKey ?? "";
  fields.domain.value = currentSettings.domain;
  fields.metric.value = currentSettings.metric;
  fields.datePreset.value = currentSettings.datePreset;
  fields.refreshMinutes.value = currentSettings.refreshMinutes;

  isHydrating = false;
}

function saveActionSettings() {
  if (isHydrating) {
    return;
  }

  currentSettings = normalizeSettings({
    domain: fields.domain.value.trim(),
    metric: fields.metric.value,
    datePreset: fields.datePreset.value,
    refreshMinutes: fields.refreshMinutes.value,
  });

  send({
    event: "setSettings",
    context: propertyInspectorUuid,
    payload: currentSettings,
  });
}

function queueActionSettingsSave() {
  // Debounce typing so every keystroke in the domain field does not trigger a plugin refresh.
  clearTimeout(actionSaveTimer);
  actionSaveTimer = setTimeout(saveActionSettings, 600);
}

function saveGlobalSettings() {
  if (isHydrating) {
    return;
  }

  currentGlobalSettings = normalizeGlobalSettings({
    apiKey: fields.apiKey.value.trim(),
  });

  send({
    event: "setGlobalSettings",
    context: propertyInspectorUuid,
    payload: currentGlobalSettings,
  });
}

function queueGlobalSettingsSave() {
  clearTimeout(globalSaveTimer);
  globalSaveTimer = setTimeout(saveGlobalSettings, 600);
}

function normalizeSettings(settings = {}) {
  // Guard against stale saved settings or manual edits to Stream Deck profile data.
  return {
    domain:
      typeof settings.domain === "string"
        ? settings.domain
        : DEFAULT_SETTINGS.domain,
    metric: isKnownMetric(settings.metric)
      ? settings.metric
      : DEFAULT_SETTINGS.metric,
    datePreset: isKnownDatePreset(settings.datePreset)
      ? settings.datePreset
      : DEFAULT_SETTINGS.datePreset,
    refreshMinutes: isKnownRefreshMinutes(settings.refreshMinutes)
      ? String(settings.refreshMinutes)
      : DEFAULT_SETTINGS.refreshMinutes,
  };
}

function normalizeGlobalSettings(settings = {}) {
  return {
    apiKey: typeof settings.apiKey === "string" ? settings.apiKey : "",
  };
}

function isKnownMetric(value) {
  return [
    "page_views",
    "unique_visitors",
    "bounces",
    "bounce_rate",
    "top_country",
    "top_browser",
    "top_device",
    "search_traffic",
    "social_traffic",
    "top_page",
    "top_referral",
    "co2_grams",
  ].includes(value);
}

function isKnownDatePreset(value) {
  return [
    "today",
    "yesterday",
    "last_7_days",
    "last_14_days",
    "last_30_days",
    "this_month",
  ].includes(value);
}

function isKnownRefreshMinutes(value) {
  return ["15", "30", "60", "360", "720", "1440"].includes(String(value));
}

function parseJson(value, fallback) {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function send(message) {
  if (websocket?.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify(message));
  }
}
