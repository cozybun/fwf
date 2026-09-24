// Phase 1: NWS observations for NYC. No database writes yet

const RIVAL_STATIONS = {
  "New York City": {
    station: "KNYC",
    standardUtcOffset: -5, // EST all year
  },
  "Houston": {
    station: "KHOU",
    standardUtcOffset: -6, // CST all year
  },
  "Los Angeles": {
    station: "KLAX",
    standardUtcOffset: -8, // PST all year
  },
};

function getStandardTimeDay(offsetHours, now = new Date()) {
  // Shift UTC into the city's fixed standard time.
  const shifted = new Date(
    now.getTime() + offsetHours * 60 * 60 * 1000
  );

  const date = shifted.toISOString().slice(0, 10);

  // Midnight standard time, expressed in UTC.
  const start = new Date(
    `${date}T00:00:00Z`
  );

  start.setUTCHours(
    start.getUTCHours() - offsetHours
  );

  const end = new Date(
    start.getTime() + 24 * 60 * 60 * 1000
  );

  return { date, start, end };
}

function celsiusToFahrenheit(celsius) {
  return celsius * 9 / 5 + 32;
}

async function fetchObservedTemperatures(cityName) {
  const city = RIVAL_STATIONS[cityName];

  if (!city) {
    throw new Error(`Unknown city: ${cityName}`);
  }

  const { date, start, end } = getStandardTimeDay(
    city.standardUtcOffset
  );

  const now = new Date();

  const url = new URL(
    `https://api.weather.gov/stations/${city.station}/observations`
  );

  url.searchParams.set("start", start.toISOString());
  url.searchParams.set(
    "end",
    new Date(Math.min(end.getTime(), now.getTime()))
      .toISOString()
  );

  const response = await fetch(url, {
    headers: {
      Accept: "application/geo+json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `NWS request failed: ${response.status}`
    );
  }

  const data = await response.json();

  const readings = (data.features || [])
    .map(feature => {
      const p = feature.properties;
      const celsius = p?.temperature?.value;
      const timestamp = p?.timestamp;

      if (
        !Number.isFinite(celsius) ||
        !timestamp
      ) {
        return null;
      }

      const time = new Date(timestamp);

      // Only observations inside today's
      // local-standard-time calendar day.
      if (time < start || time >= end || time > now) {
        return null;
      }

      return {
        time: timestamp,
        fahrenheit: celsiusToFahrenheit(celsius),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time.localeCompare(b.time));

  const temperatures = readings.map(
    reading => reading.fahrenheit
  );

  return {
    city: cityName,
    station: city.station,
    date,
    collectedAt: now.toISOString(),
    readingCount: readings.length,
    observedHigh: temperatures.length
      ? Math.max(...temperatures)
      : null,
    observedLow: temperatures.length
      ? Math.min(...temperatures)
      : null,
    readings,
  };
}

// Temporary test: NYC only.
async function testRivals() {
  console.log("🐍🐺 Testing NYC observations...");

  try {
    const result = await fetchObservedTemperatures(
      "New York City"
    );

    console.log("Station:", result.station);
    console.log("Date:", result.date);
    console.log("Readings:", result.readingCount);

    console.log(
      "Observed high so far:",
      result.observedHigh === null
        ? "Unavailable"
        : `${result.observedHigh.toFixed(1)}°F`
    );

    console.log(
      "Observed low so far:",
      result.observedLow === null
        ? "Unavailable"
        : `${result.observedLow.toFixed(1)}°F`
    );

    console.table(result.readings);
  } catch (error) {
    console.error("Rivals test failed:", error);
  }
}

testRivals();
