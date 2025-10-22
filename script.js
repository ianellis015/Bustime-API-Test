// === Config ===
const API_BASE = "http://localhost:3000"; // Your Node server
const DEFAULTS = {
  stpid: "1839,1840",
  rt: "1,2,55,73",
  top: "4",
};

// === DOM ===
const btn = document.getElementById("fetchStops");
const out = document.getElementById("output");

// === Utils ===
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const stpid = params.get("stpid") || DEFAULTS.stpid;
  const rt = params.get("rt") || DEFAULTS.rt;
  const top = params.get("top") || DEFAULTS.top;
  return { stpid, rt, top };
}

function buildUrl(base, route, params) {
  const qs = new URLSearchParams();
  // Only include defined/truthy params (avoid sending rt= when empty)
  if (params.stpid) qs.set("stpid", params.stpid);
  if (params.rt) qs.set("rt", params.rt);
  if (params.top) qs.set("top", params.top);
  return `${base}${route}?${qs.toString()}`;
}

function fmt(obj) {
  return JSON.stringify(obj, null, 2);
}

// Optional ETA helper if you want to show better UX later
function timeDiffFromNow(iso) {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return "—";
  const min = Math.round(ms / 60000);
  if (min < 0) return `${Math.abs(min)} min ago`;
  if (min === 0) return "now";
  return `${min} min`;
}

// === Core fetch ===
async function fetchPredictions() {
  try {
    out.textContent = "Loading…";
    const params = getQueryParams();
    const url = buildUrl(API_BASE, "/predictions", params);

    const res = await fetch(url, { method: "GET" });

    // Read as text first for better diagnostics if it's not JSON
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();

    if (!res.ok) {
      out.textContent = `HTTP ${res.status}\n\n${text.slice(0, 500)}`;
      return;
    }
    if (!contentType.includes("application/json")) {
      out.textContent = `Expected JSON but got "${contentType}".\n\nSample:\n${text.slice(0, 500)}`;
      return;
    }

    const json = JSON.parse(text);
    out.textContent = fmt(json);

    // If you prefer a briefer view, uncomment this:
    // const items = json.data || [];
    // out.textContent =
    //   items.length === 0
    //     ? "No predictions."
    //     : fmt(items.map(p => ({
    //         route: p.route,
    //         headsign: p.headsign || p.direction,
    //         stop: `${p.stopName} (ID ${p.stopId})`,
    //         vehicle: p.vehicleId,
    //         eta: p.countdownMin ?? timeDiffFromNow(p.predictedArrival),
    //         predictedArrival: p.predictedArrival
    //       })));

  } catch (err) {
    out.textContent = `Error: ${err?.message || String(err)}`;
    console.error(err);
  }
}

// === Events ===
btn.addEventListener("click", fetchPredictions);

// Optionally auto-fetch on page load:
// fetchPredictions();