import { setStatus, ensureSessionForDailySave } from "./script.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ckyqknlxmjqlkqnxhgef.supabase.co";
const SUPABASE_PUB_KEY = "sb_publishable_lQ27fzzwJf27dUWPEW8UQA_NTY7naO6";

if (!window.__supabase_client) {
  window.__supabase_client = createClient(SUPABASE_URL, SUPABASE_PUB_KEY);
}
const client = window.__supabase_client;

const GAS_CACHE_KEY = "finance:latest-gas";
const FINANCE_TIMEZONE = "America/Los_Angeles";
let midnightTimer = null;

function readCachedGasForecast() {
  try {
    const raw = localStorage.getItem(GAS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCachedGasForecast({ date, price }) {
  try {
    localStorage.setItem(GAS_CACHE_KEY, JSON.stringify({ date, price }));
  } catch {
    // ignore storage errors
  }
}

function getYmdInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .filter((p) => p.type !== "literal")
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysYmd(ymd, deltaDays) {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + deltaDays);
  return utc.toISOString().slice(0, 10);
}

function getPTTodayYmd() {
  return getYmdInTimeZone(new Date(), FINANCE_TIMEZONE);
}

function getYesterdayPTYmd() {
  return addDaysYmd(getPTTodayYmd(), -1);
}

function getFinanceForecastDateISO(forecastDay = "today") {
  const todayPT = getPTTodayYmd();
  return forecastDay === "tomorrow" ? addDaysYmd(todayPT, 1) : todayPT;
}

function isForecastDateLocked(forecastDate) {
  const todayPT = getPTTodayYmd();
  return forecastDate <= todayPT;
}

function formatDisplayDate(ymd) {
  if (!ymd) return "";

  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: FINANCE_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function refreshForecastDayOptions() {
  const forecastDaySelect = document.getElementById("forecastDay");
  if (!forecastDaySelect) return;

  const todayOption = forecastDaySelect.querySelector('option[value="today"]');
  const tomorrowOption = forecastDaySelect.querySelector('option[value="tomorrow"]');
  if (!todayOption || !tomorrowOption) return;

  todayOption.textContent = "Today";
  tomorrowOption.textContent = "Tomorrow";
}

function updateCurrentDate() {
  const dateDisplay = document.getElementById("currentDate");
  const forecastDaySelect = document.getElementById("forecastDay");
  if (!dateDisplay || !forecastDaySelect) return;

  refreshForecastDayOptions();

  const selected = forecastDaySelect.value || "today";
  const iso = getFinanceForecastDateISO(selected);
  dateDisplay.textContent = formatDisplayDate(iso);
}

function scheduleMidnightRefresh() {
  if (midnightTimer) clearTimeout(midnightTimer);

  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FINANCE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(now)
    .reduce((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const h = Number(parts.hour || 0);
  const m = Number(parts.minute || 0);
  const s = Number(parts.second || 0);

  const msUntilMidnight =
    ((23 - h) * 60 * 60 + (59 - m) * 60 + (59 - s)) * 1000 + 1000;

  midnightTimer = setTimeout(() => {
    updateCurrentDate();
    buildFinanceGrid();
    scheduleMidnightRefresh();
  }, msUntilMidnight);
}

async function resolveAuthUserId() {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error(`Session check failed: ${sessionError.message}`);

  if (sessionData?.session?.user?.id) return sessionData.session.user.id;

  const { data: anonData, error: anonError } = await client.auth.signInAnonymously();
  if (anonError) throw new Error(`Anonymous sign-in failed: ${anonError.message}`);

  const anonUser = anonData?.user ?? anonData?.session?.user;
  if (!anonUser?.id) throw new Error("Could not determine authenticated user after anonymous sign-in");
  return anonUser.id;
}

async function fetchYesterdayGasPrice() {
  const yesterdayDate = getYesterdayPTYmd();

  const { data, error } = await client
    .from("finance_actuals")
    .select("gas")
    .eq("date", yesterdayDate)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.warn("Could not load yesterday gas price:", error);
    return null;
  }

  return data?.gas ?? null;
}

async function buildFinanceGrid() {
  const grid = document.getElementById("financeGrid");
  if (!grid) return;

  grid.textContent = "Loading finance forecasts…";
  updateCurrentDate();

  const forecastDaySelect = document.getElementById("forecastDay");
  const forecastDay = forecastDaySelect?.value || "tomorrow";
  const forecastDate = getFinanceForecastDateISO(forecastDay);
  const isLocked = isForecastDateLocked(forecastDate);

  const cached = readCachedGasForecast();
  const cachedMatches = cached && cached.date === forecastDate;
  let saved = cachedMatches ? { gas: cached.price } : {};

  const userId = await resolveAuthUserId().catch((error) => {
    console.warn("Unable to resolve user ID:", error);
    return null;
  });

  let yesterdayGas = null;

  if (userId) {
    try {
      const { data, error } = await client
        .from("finance_forecasts")
        .select("gas")
        .eq("user_id", userId)
        .eq("date", forecastDate)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.warn("Could not load finance forecasts:", error);
      } else if (data) {
        saved = data;
        writeCachedGasForecast({ date: forecastDate, price: data.gas });
      }

      yesterdayGas = await fetchYesterdayGasPrice();
    } catch (err) {
      console.warn("Finance forecasts load failed:", err);
    }
  }

  const hasForecast = saved?.gas != null;
  const yesterdayText =
    yesterdayGas != null ? `$${Number(yesterdayGas).toFixed(3)}` : "—";

  const forecastText = hasForecast
    ? `My current forecast: $${Number(saved.gas).toFixed(2)}`
    : "Awaiting my forecast";

  grid.innerHTML = `
    <div class="asset-card asset-card--finance ${isLocked ? "is-locked" : ""}">
      <div class="asset-card-header asset-card-header--finance">
        <div class="asset-title asset-title--finance"> Gas </div>
        <small class="asset-name asset-name--finance"> (US average gas price) </small>
      </div>

      <div class="asset-card-content asset-card-content--finance">
        <p class="forecast-meta"><small>Yesterday price: ${yesterdayText}</small></p>
        <p class="forecast-line"><small>${forecastText}</small></p>

        <label class="finance-label">
          Price ($)
          <input
            type="number"
            class="daily-high finance-input"
            id="gasPriceInput"
            step="0.001"
            min="1"
            max="10"
            value="${hasForecast ? Number(saved.gas).toFixed(2) : ""}"
            placeholder="0.000"
            ${isLocked ? "disabled" : ""}
          />
        </label>

        <input
          type="range"
          id="gasPriceSlider"
          class="finance-slider"
          min="1"
          max="10"
          step="0.01"
          value="${hasForecast ? Number(saved.gas).toFixed(2) : 5}"
          aria-label="Gas price slider"
          ${isLocked ? "disabled" : ""}
        />

        <small class="slider-help"> Slide to choose a price between 1¢ and $10 </small>
        ${isLocked ? "<small class='locked-note'> Past cutoff time </small>" : ""}
      </div>
    </div>
  `;

  const priceInput = document.getElementById("gasPriceInput");
  const priceSlider = document.getElementById("gasPriceSlider");

  const syncPrice = (value) => {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) return;
    if (priceInput) priceInput.value = parsed.toFixed(2);
    if (priceSlider) priceSlider.value = String(parsed);
  };

  if (!isLocked) {
    if (priceSlider) {
      priceSlider.addEventListener("input", (event) => {
        syncPrice(event.target.value);
      });
    }

    if (priceInput) {
      priceInput.addEventListener("input", (event) => {
        const parsed = Number.parseFloat(event.target.value);
        if (!Number.isNaN(parsed) && priceSlider) {
          priceSlider.value = String(parsed);
        }
      });
    }
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const forecastDaySelect = document.getElementById("forecastDay");
  const forecastDay = forecastDaySelect?.value || "tomorrow";
  const forecastDate = getFinanceForecastDateISO(forecastDay);

  if (isForecastDateLocked(forecastDate)) {
    setStatus("<span style='color:red;'> The cutoff time has passed. Forecast for tomorrow. </span>");
    return;
  }

  const priceInput = document.getElementById("gasPriceInput");
  if (!priceInput) {
    setStatus("Unable to find the gas price input");
    return;
  }

  const rawPrice = priceInput.value;
  if (!rawPrice) {
    setStatus("Please enter a gas price before saving");
    return;
  }

  const session = await ensureSessionForDailySave();
  if (!session?.user?.id) {
    setStatus(
      "<span style='color:red;'> No active session yet. Your first daily temps save will create a guest session. </span>"
    );
    return;
  }

  const userId = await resolveAuthUserId().catch((error) => {
    console.warn("Unable to resolve user ID:", error);
    return null;
  });

  const { error } = await client
    .from("finance_forecasts")
    .upsert({
      user_id: userId,
      date: forecastDate,
      gas: Number(rawPrice),
    })
    .select()
    .single();

  if (error) {
    console.warn("Finance forecast save failed:", error);
    setStatus(
      "<span style='color:red;'> Unable to save your forecasts right now. Please try again. </span>"
    );
    return;
  }

  setStatus("<span style='color:green;'> Forecasts saved! </span>");
  writeCachedGasForecast({ date: forecastDate, price: Number(rawPrice) });
  buildFinanceGrid();
}

const financeForm = document.getElementById("financeForm");
if (financeForm) {
  financeForm.addEventListener("submit", handleSubmit);
} else {
  const saveButton = document.getElementById("saveFinanceForecast");
  if (saveButton) {
    saveButton.addEventListener("click", handleSubmit);
  }
}

const forecastDaySelect = document.getElementById("forecastDay");
if (forecastDaySelect) {
  forecastDaySelect.addEventListener("change", () => {
    updateCurrentDate();
    buildFinanceGrid();
  });
}

if (document.getElementById("financeGrid")) {
  buildFinanceGrid();
  scheduleMidnightRefresh();
}
