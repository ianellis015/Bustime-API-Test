const express = require("express");
const axios = require("axios");
const cors = require("cors");

require("dotenv").config();


const app = express();
app.use(cors());

// Correct backend route seems to be 'predictions/bystop/bustime:1840'
// TODO: Look into this

const API_KEY = process.env.API_KEY;
const BASE_URL = process.env.BASE_URL;

// Function to fetch all routes
async function getAllStops() {
  try {
    // Step 1: Get all routes
    const routesResponse = await axios.get(`${BASE_URL}/getroutes`, {
      params: { key: API_KEY, format: "json" },
    });

    const routes = routesResponse.data["bustime-response"].routes;
    let allStops = [];

    // Step 2: Iterate over each route to get directions
    for (let route of routes) {
      const directionsResponse = await axios.get(`${BASE_URL}/getdirections`, {
        params: { key: API_KEY, rt: route.rt, format: "json" },
      });

      const directions = directionsResponse.data["bustime-response"].directions;

      // Step 3: Iterate over each direction to get stops
      for (let direction of directions) {
        const stopsResponse = await axios.get(`${BASE_URL}/getstops`, {
          params: { key: API_KEY, rt: route.rt, dir: direction.id, format: "json" },
        });

        const stops = stopsResponse.data["bustime-response"].stops;
        allStops = allStops.concat(stops);
      }
    }

    return allStops;
  } catch (error) {
    console.error("Error fetching stops:", error.message);
    return [];
  }
}

// Endpoint to fetch all stops
app.get("/allstops", async (req, res) => {
  const stops = await getAllStops();
  res.json(stops);
});

app.listen(3000, () => console.log("Server running on port 3000"));