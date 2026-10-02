import { roofOutlines } from "./roof-outlines.js?v=20261002";
import {
  $,
  money,
  count,
  compact,
  percent,
  escapeHTML as esc,
  reducedMotion,
  layers,
  loadJSON,
  period,
  chrome,
  site,
  areaSearchText,
} from "./common.js?v=20261002";
chrome();
const params = new URLSearchParams(location.hash.slice(1));
const state = {
  layer: layers[params.get("layer")] ? params.get("layer") : "tax",
  flat: params.get("view") === "flat",
  zip: null,
};
const RAMP = ["#2e493c", "#497456", "#74df91", "#e9ffd2"];
const SELECTED_COLOR = "#f0c75e";
let hoveredId = null;
const PEAK = 8500; // Fixed map meters. Never adjust extrusion height by zoom.
export let map;
let data,
  meta,
  rows,
  ready = false;
const savedZip = params.get("zip");
const breaks = [100000, 300000, 1200000];
const maxValue = 1200000;
function updateURL() {
  const p = new URLSearchParams({
    layer: state.layer,
    view: state.flat ? "flat" : "stacked",
  });
  if (state.zip) p.set("zip", state.zip);
  history.replaceState(null, "", "#" + p);
}
function applyLocation() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.layer = layers[p.get("layer")] ? p.get("layer") : "tax";
  state.flat = p.get("view") === "flat";
  state.zip = rows.has(p.get("zip")) ? p.get("zip") : null;
  render();
  if (ready) {
    applyPaint();
    map.easeTo({
      pitch: state.flat ? 0 : 48,
      duration: reducedMotion() ? 0 : 500,
    });
    if (state.zip) focusArea(state.zip);
  }
}
function colorExpression() {
  const field = layers[state.layer].field;
  return [
    "case",
    ["==", ["get", "zip"], state.zip || ""],
    SELECTED_COLOR,
    ["boolean", ["feature-state", "hover"], false],
    "#e9cf79",
    ["==", ["get", field], null],
    "#466059",
    [
      "interpolate",
      ["linear"],
      ["get", field],
      0,
      RAMP[0],
      ...breaks.flatMap((v, i) => [v, RAMP[i + 1]]),
    ],
  ];
}
// The same RGB interpolation as the map, before selection/hover highlights.
function incomeColor(value) {
  if (value == null) return "#466059";
  const stops = [0, ...breaks];
  const v = Math.max(0, Math.min(value, maxValue));
  const index = Math.min(
    stops.length - 2,
    stops.findIndex((stop, i) => i < stops.length - 1 && v <= stops[i + 1]),
  );
  const t = (v - stops[index]) / (stops[index + 1] - stops[index]);
  const channels = (hex) =>
    [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  const low = channels(RAMP[index]),
    high = channels(RAMP[index + 1]);
  return `rgb(${low.map((channel, i) => Math.round(channel + (high[i] - channel) * t)).join(", ")})`;
}
function heightExpression() {
  return state.flat
    ? 0
    : [
        "*",
        ["max", 0, ["coalesce", ["get", layers[state.layer].field], 0]],
        PEAK / maxValue,
      ];
}
function applyPaint() {
  if (!ready) return;
  map.setPaintProperty("areas", "fill-extrusion-color", colorExpression());
  map.setPaintProperty("areas", "fill-extrusion-height", heightExpression());
}
function render() {
  const layer = layers[state.layer];
  document
    .querySelectorAll("[data-layer]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.layer === state.layer),
      ),
    );
  $("stacked").setAttribute("aria-pressed", String(!state.flat));
  $("flat").setAttribute("aria-pressed", String(state.flat));
  $("reading").innerHTML =
    `<p class="eyebrow">Two sources. One ${site.regionNoun}.</p><h2>${layer.title}</h2><p>${layer.description}</p><div class="map-equation" role="math" aria-label="Annual ${state.layer === "tax" ? "IRS" : "ACS"} income divided by households equals annual income per household"><span>${state.layer === "tax" ? "Annual IRS income" : "Annual ACS income"}</span><span aria-hidden="true">÷</span><span>Households</span><span aria-hidden="true">=</span><strong>${layer.unit}</strong></div><p class="reading-limit">${layer.limit} <a href="data.html#process">See the calculation</a></p>`;
  $("map-period").textContent =
    `${layer.source} · ${period(meta, layer.source === "Census Bureau" ? "acs" : "irs")}`;
  $("legend").innerHTML =
    `<strong class="legend-title">Annual income per household</strong><div class="legend-ramp"></div><div class="legend-labels"><span>$0</span><span>$100k</span><span>$300k</span><span>$1.2m+</span></div><span class="legend-unavailable"><i aria-hidden="true"></i> Not available</span><p>2022 dollars · Same scale in both views.${state.flat ? "" : " Height is proportional to income."}</p>`;
  renderSelection();
  updateURL();
}
function selectionCard(zip) {
  const p = rows.get(zip);
  if (!p) return "";
  const income = (label, field) =>
    `<div style="--income-color:${incomeColor(p[field])}"><dt>${label}</dt><dd class="${p[field] == null ? "unavailable" : ""}">${money(p[field])}</dd></div>`;
  return `<section class="selection-card"><button class="close-area" data-remove="zip" aria-label="Close ZIP area ${esc(zip)}" title="Close area">×</button><div class="deed-band"><span class="zip">${esc(zip)}</span><h3>${esc(p.name)}</h3></div><div class="deed-body"><p class="household-count">${esc(p[site.groupField])} · ${count(p.acs_households)} households</p><p class="income-caption">Annual income per household <span>2022 dollars</span></p><dl class="income-comparison">${income("IRS", "irs_income_per_household_2022")}${income("Census Bureau", "acs_mean_household_income")}</dl><dl class="investment-stats"><div><dt>From investments <small>Share of IRS income</small></dt><dd>${percent(p.irs_investment_share_2022)}</dd></div><div><dt>Total annual investment income</dt><dd>${compact(p.irs_investment_annual_2022)}</dd></div><div><dt>Share of ${site.shortName} investment income</dt><dd>${percent(p[site.shareField])}</dd></div></dl><details class="area-notes"><summary>Area & calculation details</summary><p>Postal ZIPs ${esc(p.zips_included)}. ${site.searchType === "municipality" ? "Municipality" : "Neighborhood"} names are approximate.${p.nj_land_share < 0.9999 ? " This ZCTA crosses the state border: Census covers the whole area, while IRS data cover NJ returns." : ""}</p><p>${period(meta)} annual averages. Income per household uses ${count(p.acs_households)} ACS households. Investment figures use IRS data; ${site.shortName} share uses area totals.</p><a href="data.html#process">Full calculation</a></details></div></section>`;
}
let renderedZip;
function renderSelection() {
  document
    .querySelector(".reader")
    .classList.toggle("has-selection", Boolean(state.zip));
  if (renderedZip !== state.zip) {
    $("selection").innerHTML = state.zip
      ? selectionCard(state.zip)
      : '<p class="fine">Select an area to see its figures.</p>';
    renderedZip = state.zip;
    document
      .querySelector("[data-remove]")
      ?.addEventListener("click", clearSelection);
  }
  syncMobileDetails();
}

function clearSelection() {
  state.zip = null;
  renderSelection();
  applyPaint();
  updateURL();
  if (innerWidth <= 720) {
    const target =
      map?.getCanvas() || document.querySelector('[data-layer="tax"]');
    target.focus({ preventScroll: true });
  }
}

function syncMobileDetails() {
  const mobile = innerWidth <= 720;
  const active = mobile && Boolean(state.zip);
  const reader = document.querySelector(".reader");
  reader.classList.toggle("open", active);
  reader.setAttribute("role", active ? "dialog" : "complementary");
  if (active) reader.setAttribute("aria-modal", "true");
  else reader.removeAttribute("aria-modal");
  for (const selector of [
    ".masthead",
    "#mobile-search-slot",
    ".map-stage",
    ".atlas-foot",
  ]) {
    document.querySelector(selector).inert = active;
  }
  if (active && !reader.contains(document.activeElement)) {
    document.activeElement?.blur();
    $("reader-content").scrollTop = 0;
    $("back-to-map").focus({ preventScroll: true });
  }
}

function select(zip, fly = true) {
  if (!rows.has(zip)) return;
  state.zip = zip;
  renderSelection();
  applyPaint();
  updateURL();
  if (fly && ready) focusArea(zip);
  if (innerWidth > 720) $("reader-content").scrollTop = 0;
}
function focusArea(zip) {
  const feature = data.features.find((f) => f.properties.zip === zip);
  const bounds = new maplibregl.LngLatBounds();
  function coords(a) {
    if (typeof a[0] === "number") bounds.extend(a);
    else a.forEach(coords);
  }
  coords(feature.geometry.coordinates);
  map.easeTo({
    center: bounds.getCenter(),
    zoom: site.focusZoom,
    pitch: state.flat ? 0 : 48,
    duration: reducedMotion() ? 0 : 650,
  });
}
function reset() {
  if (!ready) return;
  const width = $("map").clientWidth,
    height = $("map").clientHeight;
  const scale = Math.min(width / site.referenceWidth, height / site.referenceHeight);
  map.jumpTo({
    center: innerWidth <= 720 ? site.mobileCenter : site.center,
    zoom: site.zoom + Math.log2(scale),
    pitch: state.flat ? 0 : 48,
    bearing: map.getBearing(),
  });
}
function search() {
  const q = $("search").value.trim().toLowerCase();
  if (!q) {
    $("results").innerHTML = "";
    return;
  }
  const found = [...rows.values()]
    .filter((p) =>
      areaSearchText(p).includes(q),
    )
    .slice(0, 12);
  $("results").innerHTML = found.length
    ? found
        .map(
          (p) =>
            `<button data-zip="${esc(p.zip)}"><strong>${esc(p.zip)}</strong> · ${esc(p.name)}<br>${esc(p[site.groupField])}</button>`,
        )
        .join("")
    : `<p>No matching area. Try a ZIP code or ${site.groupField}.</p>`;
  $("results")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          select(b.dataset.zip);
          $("search").value = "";
          $("results").innerHTML = "";
          if (innerWidth > 720) $("search").focus({ preventScroll: true });
        }),
    );
}
class CameraControls {
  onAdd(map) {
    this.map = map;
    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl camera-controls";
    this.container.setAttribute("role", "group");
    this.container.setAttribute("aria-label", "Zoom and rotate map");
    this.container.innerHTML = `<div class="camera-group zoom-controls" role="group" aria-label="Zoom"><button type="button" data-camera="in" aria-label="Zoom in" title="Zoom in">+</button><button type="button" data-camera="out" aria-label="Zoom out" title="Zoom out">−</button></div><div class="camera-group"><button type="button" data-camera="right" aria-label="Rotate map 45 degrees clockwise" title="Rotate map"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5 M20 12a8 8 0 1 0-2.34 5.66"/></svg></button></div><div class="camera-group"><button type="button" data-camera="north" class="north-control" aria-label="Reset map to north" title="Reset to north"><span class="north-label" aria-hidden="true">N</span><svg class="north-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 6 20l6-4 6 4Z"/></svg></button></div>`;
    this.container.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const duration = reducedMotion() ? 0 : 300;
      switch (button.dataset.camera) {
        case "in":
          map.zoomIn({ duration });
          break;
        case "out":
          map.zoomOut({ duration });
          break;
        case "right":
          map.rotateTo(map.getBearing() + 45, { duration });
          break;
        case "north":
          map.rotateTo(0, { duration });
          break;
      }
    });
    this.update = () => {
      this.container.querySelector(".north-arrow").style.transform =
        `rotate(${-map.getBearing()}deg)`;
      this.container.querySelector('[data-camera="in"]').disabled =
        map.getZoom() >= map.getMaxZoom();
      this.container.querySelector('[data-camera="out"]').disabled =
        map.getZoom() <= map.getMinZoom();
    };
    map.on("rotate", this.update);
    map.on("zoom", this.update);
    this.update();
    return this.container;
  }
  onRemove() {
    this.map.off("rotate", this.update);
    this.map.off("zoom", this.update);
    this.container.remove();
    this.map = null;
  }
}
function setupMap() {
  if (!window.maplibregl) {
    showMapError();
    return;
  }
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#102d26" },
        },
      ],
    },
    center: site.center,
    zoom: site.zoom,
    pitch: state.flat ? 0 : 48,
    bearing: 0,
    attributionControl: false,
    antialias: true,
    dragRotate: true,
    pitchWithRotate: false,
    touchPitch: false,
    cooperativeGestures: false,
  });

  const mobileRotation = matchMedia("(max-width:720px)");
  const setTouchRotation = () => {
    if (mobileRotation.matches) map.touchZoomRotate.disableRotation();
    else map.touchZoomRotate.enableRotation();
  };
  setTouchRotation();
  mobileRotation.addEventListener("change", setTouchRotation);

  map.addControl(new CameraControls(), "bottom-right");
  map.on("error", (event) => {
    console.error("Map error", event.error);
    showMapError();
  });
  map.on("load", () => {
    map.addSource("zips", { type: "geojson", data, generateId: true });
    map.addLayer({
      id: "ground",
      type: "fill",
      source: "zips",
      paint: { "fill-color": "#264438", "fill-opacity": 1 },
    });
    map.addLayer({
      id: "areas",
      type: "fill-extrusion",
      source: "zips",
      paint: {
        "fill-extrusion-color": colorExpression(),
        "fill-extrusion-height": heightExpression(),
        "fill-extrusion-opacity": 1,
        "fill-extrusion-height-transition": { duration: 0 },
        "fill-extrusion-vertical-gradient": true,
      },
    });
    map.addLayer(
      roofOutlines(data, () => ({
        field: layers[state.layer].field,
        flat: state.flat,
        scale: PEAK / maxValue,
      })),
    );
    map.setLight({
      anchor: "viewport",
      color: "#ffffff",
      intensity: 0.35,
      position: [1.5, 210, 45],
    });
    ready = true;
    $("map-message").hidden = true;
    applyPaint();
    reset();
    // Reconcile the WebGL surface after its first full frame and later layout changes.
    map.once("idle", () => {
      map.resize();
      map.triggerRepaint();
    });
    new ResizeObserver(() => {
      map.resize();
      if (!state.zip) reset();
    }).observe($("map"));
    for (const [name, coordinates] of site.labels) {
      const el = document.createElement("span");
      el.className = "borough-label";
      el.textContent = name;
      new maplibregl.Marker({ element: el }).setLngLat(coordinates).addTo(map);
    }
    if (state.zip) focusArea(state.zip);
    map.on("click", "areas", (e) =>
      select(e.features[0].properties.zip, false),
    );
    map.on("mousemove", "areas", (e) => {
      map.getCanvas().style.cursor = "pointer";
      if (e.originalEvent.pointerType === "touch") return;
      const id = e.features[0].id;
      if (hoveredId !== id) {
        if (hoveredId != null)
          map.setFeatureState(
            { source: "zips", id: hoveredId },
            { hover: false },
          );
        hoveredId = id;
        map.setFeatureState({ source: "zips", id }, { hover: true });
      }
      const p = e.features[0].properties,
        layer = layers[state.layer];
      $("map-tip").innerHTML =
        `<strong>${esc(p.zip)} · ${esc(p.name)}</strong><br>${layer.format(p[layer.field])}`;
      $("map-tip").hidden = false;
      $("map-tip").style.left =
        Math.min(e.point.x + 12, $("map").clientWidth - 245) + "px";
      $("map-tip").style.top = Math.max(8, e.point.y - 65) + "px";
    });
    map.on("mouseleave", "areas", () => {
      if (hoveredId != null)
        map.setFeatureState(
          { source: "zips", id: hoveredId },
          { hover: false },
        );
      hoveredId = null;
      map.getCanvas().style.cursor = "";
      $("map-tip").hidden = true;
    });
    map.on("movestart", () => {
      $("map-tip").hidden = true;
    });
  });
}
function showMapError() {
  $("map-message").hidden = false;
  $("map-message").innerHTML =
    'The 3D map could not load. You can still search areas here or <a href="data.html#table">use the complete data table</a>.';
}
async function init() {
  try {
    [data, meta] = await Promise.all([
      loadJSON(`data/${site.dataStem}.geojson`),
      loadJSON("data/meta.json"),
    ]);
    rows = new Map(data.features.map((f) => [f.properties.zip, f.properties]));
    $("search").placeholder = site.searchExample;
    state.zip = rows.has(savedZip) ? savedZip : null;
    render();

    const mobileQuery = matchMedia("(max-width:720px)");
    const searchBlock = document.querySelector(".search-block");
    const placeSearch = () => {
      if (mobileQuery.matches)
        $("mobile-search-slot").append($("controls"), searchBlock);
      else $("reader-content").prepend($("controls"), searchBlock);
      syncMobileDetails();
    };
    placeSearch();
    mobileQuery.addEventListener("change", placeSearch);
    $("back-to-map").onclick = clearSelection;
    document.querySelector(".reader").addEventListener("keydown", (event) => {
      if (!mobileQuery.matches || !state.zip) return;
      if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
      }
      if (event.key === "Tab") {
        const controls = [
          ...document
            .querySelector(".reader")
            .querySelectorAll("button, input, a, summary"),
        ].filter(
          (element) =>
            element.getClientRects().length &&
            !element.disabled &&
            !element.closest("[inert]") &&
            (!element.closest("details:not([open])") ||
              element.tagName === "SUMMARY"),
        );
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    $("snapshot").textContent =
      `${period(meta)} · Annual averages · 2022 dollars`;
    $("search").addEventListener("input", search);
    $("search").addEventListener("keydown", (e) => {
      if (e.key === "Escape") $("results").innerHTML = "";
      if (e.key === "ArrowDown") {
        e.preventDefault();
        $("results").querySelector("button")?.focus();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        $("results").querySelector("button")?.click();
      }
    });
    $("results").addEventListener("keydown", (e) => {
      const buttons = [...$("results").querySelectorAll("button")],
        i = buttons.indexOf(document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        buttons[Math.min(i + 1, buttons.length - 1)]?.focus();
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (i <= 0) $("search").focus();
        else buttons[i - 1].focus();
      }
      if (e.key === "Escape") {
        $("results").innerHTML = "";
        $("search").focus();
      }
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-block")) $("results").innerHTML = "";
    });
    document.querySelectorAll("[data-layer]").forEach((button) => {
      button.onclick = () => {
        state.layer = button.dataset.layer;
        render();
        applyPaint();
      };
    });
    for (const id of ["flat", "stacked"])
      $(id).onclick = () => {
        state.flat = id === "flat";
        render();
        applyPaint();
        if (ready)
          map.easeTo({
            pitch: state.flat ? 0 : 48,
            duration: reducedMotion() ? 0 : 500,
          });
      };
    window.addEventListener("hashchange", applyLocation);
    try {
      setupMap();
    } catch (error) {
      console.error(error);
      showMapError();
    }
  } catch (error) {
    console.error(error);
    $("map-message").textContent =
      "The data could not load. Reload the page or open the Data page.";
    $("reading").innerHTML =
      '<h2>Data unavailable</h2><p><a href="data.html">Open downloads and source notes</a>.</p>';
    $("snapshot").textContent = "Source data unavailable";
  }
}
init();
