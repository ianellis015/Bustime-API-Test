const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());

const API_KEY = process.env.API_KEY;
const BASE_URL = process.env.BASE_URL;

// Supported stop IDs -> human friendly labels
const STOP_NAMES = {
  "1839": "SAC West Bus Stop",
  "1840": "Cabrillo Gym Bus Stop"
};

// Normalize one Bustime prediction object -> your shape
function normalizePrediction(p) {
  // Create a Date treating the input as Pacific local clock time (handles DST).
  const toPacificDate = (y, mo, d, h, mi, s) => {
    const asUTC = Date.UTC(y, mo - 1, d, h, mi, s);

    // Figure out the offset between UTC and America/Los_Angeles at that instant.
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).formatToParts(new Date(asUTC));

    const vals = {};
    for (const { type, value } of parts) {
      if (type !== "literal") vals[type] = value;
    }

    const zonedAsUTC = Date.UTC(
      Number(vals.year),
      Number(vals.month) - 1,
      Number(vals.day),
      Number(vals.hour),
      Number(vals.minute),
      Number(vals.second)
    );

    const offsetMs = zonedAsUTC - asUTC; // negative when PT is behind UTC
    return new Date(asUTC - offsetMs);   // apply the offset to get the real UTC instant
  };

  const toISO = (ymdHm) => {
    if (!ymdHm || typeof ymdHm !== "string") return null;

    // Accept formats like:
    //  - 20250130 14:05
    //  - 20250130 14:05:27
    //  - 20250130T1405 (rare)
    //  - 20250130 1405 (API quirks)
    // Normalize by extracting digits and optional separators.
    const m = ymdHm.match(
      /^(\d{4})(\d{2})(\d{2})[ T]?(\d{2}):?(\d{2})(?::?(\d{2}))?$/
    );
    if (!m) return null; // don't throw; just return null

    const [, y, mo, d, h, mi, s = "00"] = m;
    const dt = toPacificDate(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s));
    if (isNaN(dt.getTime())) return null; // still guard against bad input

    return dt.toISOString();
  };

  return {
    timestamp: toISO(p.tmstmp),
    type: p.typ,                   // "A" = arrival prediction
    stopName: p.stpnm,
    stopId: p.stpid,
    distanceToStopMeters: p.dstp ? Number(p.dstp) : null,
    route: p.rt,
    direction: p.rtdir,
    headsign: p.des,
    predictedArrival: toISO(p.prdtm),
    countdownMin: p.prdctdn !== undefined ? Number(p.prdctdn) : null,
    serviceDate: p.stsd || null,
    // Keep raw in case you need anything else later:
    _raw: p
  };
}

// Map a stop ID to a display name (only two stops supported)
function stopNameFor(stpid) {
  return STOP_NAMES[stpid] || null;
}

// Fallback minutes: use numeric prdctdn when available, otherwise compute diff
function minutesUntil(pred) {
  const rawCountdown = pred._raw?.prdctdn;
  const numericCountdown = Number(pred.countdownMin);
  if (Number.isFinite(numericCountdown)) return numericCountdown;

  const rawIsDue = typeof rawCountdown === "string" && rawCountdown.toUpperCase() === "DUE";
  const predicted = Date.parse(pred.predictedArrival);
  const timestamp = Date.parse(pred.timestamp);

  if (!Number.isFinite(predicted) || !Number.isFinite(timestamp)) return null;
  const diffMinutes = Math.round((predicted - timestamp) / 60000);

  // If Bustime said "DUE", clamp negative small values to 0 for friendlier UX.
  if (rawIsDue && diffMinutes < 1) return 0;
  return diffMinutes;
}

// Render arrival time in Pacific Time for UI display
function formatPacific(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit"
  });
}

// Extract a readable destination/headsign
function destinationFor(pred) {
  const source = pred.headsign || pred.direction || "";
  if (!source) return "Unknown";

  // Strip trailing "via ..." segments
  let clean = source.replace(/\bvia\b.*$/i, "").trim();

  // Remove stop names to avoid redundancy
  Object.values(STOP_NAMES).forEach((name) => {
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    clean = clean.replace(new RegExp(safe, "i"), "").trim();
  });

  // Tidy leftover punctuation
  clean = clean.replace(/\s+-\s*$/, "").trim();

  return clean || source;
}

// GET /predictions?stpid=1839,1840&rt=1,2,55,73&top=4
app.get("/predictions", async (req, res) => {
  try {
    const { stpid, rt, top } = req.query;

    const resp = await axios.get(`${BASE_URL}/getpredictions`, {
      params: {
        key: API_KEY,
        stpid,            // comma-separated string is fine
        rt,               // comma-separated string is fine
        top,              // optional
        format: "json"    // 👈 ask for JSON (no XML parsing needed)
      },
      timeout: 10_000
    });

    const body = resp.data?.["bustime-response"] || {};
    const preds = Array.isArray(body.prd) ? body.prd : [];

    // If the API returns errors (e.g., bad stop IDs), surface them
    if (body.error) {
      return res.status(400).json({ ok: false, error: body.error });
    }

    const normalized = preds.map(normalizePrediction);

    // Group by stop and build UI-friendly shape
    const grouped = {};

    for (const pred of normalized) {
      const stopId = pred.stopId;
      const stopName = stopNameFor(stopId);
      if (!stopName) continue; // only support the two configured stops

      if (!grouped[stopName]) grouped[stopName] = [];
      grouped[stopName].push(pred);
    }

    const response = {};

    Object.entries(grouped).forEach(([stopName, items]) => {
      const sorted = [...items].sort((a, b) => {
        const aTime = Date.parse(a.predictedArrival);
        const bTime = Date.parse(b.predictedArrival);
        return (Number.isFinite(aTime) ? aTime : Infinity) - (Number.isFinite(bTime) ? bTime : Infinity);
      });

      const [first, ...rest] = sorted;
      if (!first) return;

      const makeEntry = (p) => ({
        minutes: minutesUntil(p),
        destination: destinationFor(p),
        route: p.route,
        arrivalTimePT: formatPacific(p.predictedArrival)
      });

      response[stopName] = {
        nextArrival: makeEntry(first),
        upcomingRoutes: rest.map((p) => ({
          destination: destinationFor(p),
          route: p.route,
          arrivalTimePT: formatPacific(p.predictedArrival)
        }))
      };
    });

    return res.json({ ok: true, data: response });
  } catch (err) {
    console.error("getpredictions failed:", err.message);
    return res.status(502).json({ ok: false, error: "Upstream error", detail: err.message });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
