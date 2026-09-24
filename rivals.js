const CITIES = {
  "New York City": {
    station: "KNYC",
    standardUtcOffset: -5,
  },
  Houston: {
    station: "KHOU",
    standardUtcOffset: -6,
  },
  "Los Angeles": {
    station: "KLAX",
    standardUtcOffset: -8,
  },
};

function getReportingDay(offset, now = new Date()) {
  const localStandard = new Date(
    now.getTime() + offset * 3600000
  );

  const date = localStandard.toISOString().slice(0, 10);

  const start = new Date(
    Date.parse(`${date}T00:00:00Z`) -
    offset * 3600000
  );

  const end = new Date(start.getTime() + 86400000);

  return { date, start, end };
}

async function fetchText(url) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${url}`
    );
  }

  return response.text();
}

function parseNwsCurrentPage(html) {
  const doc = new DOMParser().parseFromString(
    html,
    "text/html"
  );

  const text = doc.body.innerText || doc.body.textContent;

  // An inspection parser, not yet a final six-hour-extrema calculator
  const section = text.match(
    /Maximum and Minimum Temperatures([\s\S]*?)24 Hour Summary/i
  );

  return {
    sixHourSection: section
      ? section[1].trim()
      : null,
    pageText: text,
  };
}

async function fetchNwsObservations(cityName) {
  const city = CITIES[cityName];
  if (!city) throw new Error(`Unknown city: ${cityName}`);

  const url =
    `https://tgftp.nws.noaa.gov/weather/current/` +
    `${city.station}.html`;

  const html = await fetchText(url);

  return {
    source: "NWS current conditions",
    city: cityName,
    station: city.station,
    url,
    collectedAt: new Date().toISOString(),
    ...parseNwsCurrentPage(html),
  };
}

async function fetchLamp(cityName) {
  const city = CITIES[cityName];
  if (!city) throw new Error(`Unknown city: ${cityName}`);
  
  // Inspect its actual response before writing a temperature parser
  const url = new URL(
    "https://lamp.mdl.nws.noaa.gov/lamp/meteo/bullpop.php"
  );

  url.searchParams.set(
    "sta",
    city.station.toLowerCase()
  );

  url.searchParams.set("forecast_time", "22");

  const html = await fetchText(url.toString());

  const doc = new DOMParser().parseFromString(
    html,
    "text/html"
  );

  const text = doc.body.innerText || doc.body.textContent;

  return {
    source: "NOAA LAMP",
    city: cityName,
    station: city.station,
    url: url.toString(),
    collectedAt: new Date().toISOString(),
    text,
  };
}

async function testRivals(cityName = "New York City") {
  const city = CITIES[cityName];

  if (!city) {
    console.error("Unknown city:", cityName);
    return;
  }

  const reportingDay = getReportingDay(
    city.standardUtcOffset
  );

  console.log("🐍🐺 RIVALS TEST");
  console.log("City:", cityName);
  console.log("Station:", city.station);
  console.log("Reporting date:", reportingDay.date);
  console.log(
    "Reporting window:",
    reportingDay.start.toISOString(),
    "to",
    reportingDay.end.toISOString()
  );

  const results = await Promise.allSettled([
    fetchNwsObservations(cityName),
    fetchLamp(cityName),
  ]);

  const [nws, lamp] = results;

  if (nws.status === "fulfilled") {
    console.log("🌡️ NWS:", nws.value);
    console.log(
      "Six-hour reports:",
      nws.value.sixHourSection
    );
  } else {
    console.error(
      "NWS fetch failed:",
      nws.reason
    );
  }

  if (lamp.status === "fulfilled") {
    console.log("💡 LAMP:", lamp.value);
    console.log(
      "LAMP response preview:",
      lamp.value.text.slice(0, 3000)
    );
  } else {
    console.error(
      "LAMP fetch failed:",
      lamp.reason
    );
  }
}

testRivals();
