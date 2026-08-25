import { setStatus, ensureSessionForDailySave } from "./script.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ckyqknlxmjqlkqnxhgef.supabase.co";
const SUPABASE_PUB_KEY = "sb_publishable_lQ27fzzwJf27dUWPEW8UQA_NTY7naO6";

if (!window.__supabase_client) {
  window.__supabase_client = createClient(SUPABASE_URL, SUPABASE_PUB_KEY);
}
const client = window.__supabase_client;

const FINANCE_ASSETS = [
  {
    key: "gas",
    label: "Gas",
    name: "(US average gas price)",
    inputId: "gasPriceInput",
    sliderId: "gasPriceSlider",
    cacheKey: "finance:latest-gas",
    min: 1,
    max: 10,
    step: 0.01,
    sliderStep: 0.01,
    placeholder: "5",
    formatValue: (v) => Number(v).toFixed(2),
    formatDisplay: (v) => `$${Number(v).toFixed(3)}`,
    yesterdayLabel: "Yesterday price",
  },
  {
    key: "btc",
    label: "Bitcoin",
    name: "(BTC price at 1PM)",
    inputId: "btcPriceInput",
    sliderId: "btcPriceSlider",
    cacheKey: "finance:latest-btc",
    min: 100,
    max: 150000,
    step: 100,
    sliderStep: 100,
    placeholder: "50000",
    formatValue: (v) => Number(v).toFixed(0),
    formatDisplay: (v) => `$${Number(v).toLocaleString()}`,
    yesterdayLabel: "Yesterday price",
  },
  {
    key: "gold",
    label: "Gold",
    name: "(Gold price per oz at settlement)",
    inputId: "goldPriceInput",
    sliderId: "goldPriceSlider",
    cacheKey: "finance:latest-gold",
    min: 10,
    max: 10000,
    step: 10,
    sliderStep: 10,
    placeholder: "5000",
    formatValue: (v) => Number(v).toFixed(0),
    formatDisplay: (v) => `$${Number(v).toLocaleString()}`,
    yesterdayLabel: "Yesterday price",
  },
];

const FINANCE_TIMEZONE = "America/Los_Angeles";
let midnightTimer = null;

function readCachedForecast(cacheKey) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCachedForecast(cacheKey, { date, price }) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ date, price }));
  } catch {  // ignore storage errors
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

async function fetchYesterdayPrice(assetKey) {
  if (assetKey === "btc") return fetchYesterdayBtcPrice();
  if (assetKey === "gold") return fetchYesterdayGoldPrice();
  return fetchYesterdayGasPrice();
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

async function fetchYesterdayBTCPrice() {
  const yesterdayDate = getYesterdayPTYmd();

  const { data, error } = await client
    .from("finance_actuals")
    .select("btc")
    .eq("date", yesterdayDate)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.warn("Could not load yesterday BTC price:", error);
    return null;
  }

  return data?.btc ?? null;
}

async function fetchYesterdayGoldPrice() {
  const yesterdayDate = getYesterdayPTYmd();

  const { data, error } = await client
    .from("finance_actuals")
    .select("gold")
    .eq("date", yesterdayDate)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.warn("Could not load yesterday gold price:", error);
    return null;
  }

  return data?.gold ?? null;
}

async function buildFinanceGrid() {
  const grid = document.getElementById("financeGrid");
  if (!grid) return;

  grid.textContent = "Loading finance forecasts…";
  updateCurrentDate();

  const forecastDaySelect = document.getElementById("forecastDay");
  const forecastDay = forecastDaySelect?.value || "today";
  const forecastDate = getFinanceForecastDateISO(forecastDay);
  const isLocked = isForecastDateLocked(forecastDate);

  const userId = await resolveAuthUserId().catch((error) => {
    console.warn("Unable to resolve user ID:", error);
    return null;
  });

  const cards = [];

  for (const asset of FINANCE_ASSETS) {
    const cached = readCachedForecast(asset.cacheKey);
    const cachedMatches = cached && cached.date === forecastDate;
    let saved = cachedMatches ? { [asset.key]: cached.price } : {};

    let yesterdayValue = null;

    if (userId) {
      try {
        const { data, error } = await client
          .from("finance_forecasts")
          .select(asset.key)
          .eq("user_id", userId)
          .eq("date", forecastDate)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          console.warn(`Could not load ${asset.key} forecast:`, error);
        } else if (data) {
          saved = data;
          writeCachedForecast(asset.cacheKey, { date: forecastDate, price: data[asset.key] });
        }

        yesterdayValue = await fetchYesterdayPrice(asset.key);
      } catch (err) {
        console.warn(`Finance ${asset.key} load failed:`, err);
      }
    }

    const hasForecast = saved?.[asset.key] != null;
    const yesterdayText =
      yesterdayValue != null ? asset.formatDisplay(yesterdayValue) : "—";

    const forecastText = hasForecast
      ? `My current forecast: ${asset.formatDisplay(saved[asset.key])}`
      : "Awaiting my forecast";

    cards.push(`
      <div class="asset-card asset-card--finance ${isLocked ? "is-locked" : ""}">
        <div class="asset-card-header asset-card-header--finance">
          <div class="asset-title asset-title--finance"> ${asset.label} </div>
          <small class="asset-name asset-name--finance"> ${asset.name} </small>
        </div>

        <div class="asset-card-content asset-card-content--finance">
          <p class="forecast-meta"><small>${asset.yesterdayLabel}: ${yesterdayText}</small></p>
          <p class="forecast-line"><small>${forecastText}</small></p>

          <label class="finance-label">
            Price ($)
            <input
              type="number"
              class="finance-input"
              id="${asset.inputId}"
              step="${asset.step}"
              min="${asset.min}"
              max="${asset.max}"
              value="${hasForecast ? asset.formatValue(saved[asset.key]) : ""}"
              placeholder="${asset.placeholder}"
              ${isLocked ? "disabled" : ""}
            />
          </label>

          <input
            type="range"
            id="${asset.sliderId}"
            class="finance-slider"
            min="${asset.min}"
            max="${asset.max}"
            step="${asset.sliderStep}"
            value="${hasForecast ? asset.formatValue(saved[asset.key]) : String((asset.min + asset.max) / 2)}"
            aria-label="${asset.label} slider"
            ${isLocked ? "disabled" : ""}
          />

          <small class="slider-help"> Use the slider to choose a price </small>
          ${isLocked ? "<small class='locked-note'> Past cutoff time </small>" : ""}
        </div>
      </div>
    `);
  }

  grid.innerHTML = cards.join("");

  if (!isLocked) {
    for (const asset of FINANCE_ASSETS) {
      const priceInput = document.getElementById(asset.inputId);
      const priceSlider = document.getElementById(asset.sliderId);

      const syncPrice = (value) => {
        const parsed = Number.parseFloat(value);
        if (Number.isNaN(parsed)) return;
        if (priceInput) priceInput.value = asset.formatValue(parsed);
        if (priceSlider) priceSlider.value = String(parsed);
      };

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
}

async function handleSubmit(event) {
  event.preventDefault();

  const forecastDaySelect = document.getElementById("forecastDay");
  const forecastDay = forecastDaySelect?.value || "today";
  const forecastDate = getFinanceForecastDateISO(forecastDay);

  if (isForecastDateLocked(forecastDate)) {
    setStatus("<span style='color:red;'> The cutoff time has passed. Forecast for tomorrow. </span>");
    return;
  }

  const values = {};
  for (const asset of FINANCE_ASSETS) {
    const input = document.getElementById(asset.inputId);
    if (!input) {
      setStatus(`Unable to find the ${asset.key} input`);
      return;
    }

    const raw = input.value;
    if (!raw) {
      setStatus(`Please enter a ${asset.key} forecast before saving`);
      return;
    }

    values[asset.key] = Number(raw);
  }

  const session = await ensureSessionForDailySave();

console.log("finance session", session);

if (!session?.user?.id) {
  console.warn("finance save blocked: no session user id");

  setStatus(
    "<span style='color:red;'> No active session yet. Your first daily temps save will create a guest session. </span>"
  );
  return;
}

const userId = await resolveAuthUserId().catch((error) => {
  console.error("resolveAuthUserId failed", error);
  return null;
});

console.log("finance userId", userId);

if (!userId) {
  setStatus(
    "<span style='color:red;'> Unable to determine your account. Please refresh and try again. </span>"
  );
  return;
}

const payload = {
  user_id: userId,
  date: forecastDate,
  ...values,
};

console.log("finance payload", payload);

const { error } = await client
  .from("finance_forecasts")
  .upsert(payload)
  .select()
  .single();

if (error) {
  console.error("Finance forecast save failed:", error);

  setStatus(
    "<span style='color:red;'> Unable to save your forecasts right now. Please try again. </span>"
  );

  return;
}

console.log("finance save succeeded");

setStatus("<span style='color:green;'> Forecasts saved! ✅ </span>");

  for (const asset of FINANCE_ASSETS) {
    writeCachedForecast(asset.cacheKey, {
      date: forecastDate,
      price: values[asset.key],
    });
  }

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
