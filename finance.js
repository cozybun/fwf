function getFinanceForecastDateISO(forecastDay = "today") {
  const nowET = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  const baseDate = new Date(nowET);
  if (forecastDay === "tomorrow") {
    baseDate.setDate(baseDate.getDate() + 1);
  }
  return baseDate.toISOString().slice(0, 10);
}

async function buildFinanceGrid() {
  const grid = document.getElementById("financeGrid");
  if (!grid) return;

  grid.textContent = "Loading gas forecast…";

  updateCurrentDate(); // keep the ET clock in sync if you use it elsewhere
  const forecastDaySelect = document.getElementById("forecastDay");
  const forecastDay = forecastDaySelect?.value || "today";
  const forecastDate = getFinanceForecastDateISO(forecastDay);
  const showYesterday = forecastDay === "today";

  const forecastKey = `gas_${forecastDate}`;
  const userForecasts = [];

  if (userId) {
    try {
      const { data, error } = await client
        .from("gas_forecasts")
        .select("price")
        .eq("user_id", userId)
        .eq("forecast_date", forecastDate)
        .single();

      if (error && error.code !== "PGRST116") {
        console.warn("Could not load gas forecast:", error);
      } else if (data) {
        userForecasts.push(data);
      }
    } catch (err) {
      console.warn("Gas forecast load failed:", err);
    }
  }

  const saved = userForecasts[0] || {};
  const hasForecast = saved.price !== undefined && saved.price !== null;
  const yesterdayText = showYesterday ? "—" : "Pending";  // AAA data pending
  const forecastText = hasForecast
    ? `My current forecast: $${saved.price.toFixed(2)}`
    : "Awaiting my forecast";

  grid.innerHTML = `
    <div class="city-card expanded">
      <div class="city-card-header">
        <span class="city-title"> Gas </span>
        <small class="city-station">(AAA ${showYesterday ? "Yesterday" : "Latest"})</small>
      </div>
      <div class="city-card-content">
        <p><small>Yesterday price: ${yesterdayText}</small></p>
        <p class="forecast-line"><small>${forecastText}</small></p>
        <label>
          Price ($)
          <input
            type="number"
            class="daily-high"
            id="gasPriceInput"
            step="0.001"
            min="0.001"
            max="10"
            value="${hasForecast ? saved.price.toFixed(2) : ""}"
            placeholder="0.00"
          />
        </label>
        <input
          type="range"
          id="gasPriceSlider"
          min="0.01"
          max="10"
          step="0.01"
          value="${hasForecast ? saved.price.toFixed(2) : 5}"
          class="mt-2 w-full"
          aria-label="Gas price slider"
        />
        <small class="text-muted block mt-1"> Slide to choose a price between 1¢ and $10 </small>
      </div>
    </div>
  `;

  const priceInput = document.getElementById("gasPriceInput");
  const priceSlider = document.getElementById("gasPriceSlider");

  const syncPrice = (value) => {
    if (priceInput) priceInput.value = parseFloat(value).toFixed(2);
    if (priceSlider) priceSlider.value = parseFloat(value);
  };

  if (priceSlider) {
    priceSlider.addEventListener("input", (event) => {
      syncPrice(event.target.value);
    });
  }

  if (priceInput) {
    priceInput.addEventListener("input", (event) => {
      const parsed = parseFloat(event.target.value);
      if (!Number.isNaN(parsed)) {
        priceSlider.value = parsed;
      }
    });
  }

  grid.textContent = ""; // clear loading text
}

if (document.getElementById("financeGrid")) {
  buildFinanceGrid();
}
