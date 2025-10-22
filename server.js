const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());

const API_KEY = process.env.API_KEY;
const BASE_URL = process.env.BASE_URL; // e.g. https://rt.scmetro.org/bustime/api/v3

// Normalize one Bustime prediction object -> your shape
function normalizePrediction(p) {
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

    // Construct a Date safely. Use Date.UTC to avoid local-time DST surprises.
    const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
    if (isNaN(dt.getTime())) return null; // still guard against bad input

    return dt.toISOString();
  };

  return {
    timestamp: toISO(p.tmstmp),
    type: p.typ,                     // "A" = arrival prediction
    stopName: p.stpnm,
    stopId: p.stpid,
    vehicleId: p.vid,
    distanceToStopMeters: p.dstp ? Number(p.dstp) : null,
    route: p.rt,
    routePublic: p.rtdd,
    direction: p.rtdir,
    headsign: p.des,
    predictedArrival: toISO(p.prdtm),
    countdownMin: p.prdctdn !== undefined ? Number(p.prdctdn) : null,
    delayed: p.dly === "true" || p.dly === true,
    tripId: p.tatripid,
    blockId: p.tablockid,
    serviceDate: p.stsd || null,
    // Keep raw in case you need anything else later:
    _raw: p
  };
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
    return res.json({ ok: true, count: normalized.length, data: normalized });
  } catch (err) {
    console.error("getpredictions failed:", err.message);
    return res.status(502).json({ ok: false, error: "Upstream error", detail: err.message });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));