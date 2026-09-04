import { setStatus, ensureSessionForDailySave } from "./script.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ckyqknlxmjqlkqnxhgef.supabase.co";
const SUPABASE_PUB_KEY = "sb_publishable_lQ27fzzwJf27dUWPEW8UQA_NTY7naO6";

if (!window.__supabase_client) {
  window.__supabase_client = createClient(SUPABASE_URL, SUPABASE_PUB_KEY);
}
const client = window.__supabase_client;

console.log("[FINANCE] finance.js loaded", new Date().toISOString());

const FINANCE_ASSETS = [
  {
    key: "gas",
    label: "Gas",
    emoji: "⛽",
    name: "(US average gas price)",
    inputId: "gasPriceInput",
    sliderId: "gasPriceSlider",
    cacheKey: "finance:latest-gas",
    min: 0.1,
    max: 10,
    step: 0.1,
    sliderStep: 0.1,
    placeholder: "5",
    formatValue: (v) => Number(v).toFixed(2),
    formatDisplay: (v) => `$${Number(v).toFixed(3)}`,
    yesterdayLabel: "Yesterday price",
  },
  {
    key: "btc",
    label: "Bitcoin",
    emoji: "₿",
    name: "(BTC price at 1PM)",
    inputId: "btcPriceInput",
    sliderId: "btcPriceSlider",
    cacheKey: "finance:latest-btc",
    min: 200,
    max: 200000,
    step: 200,
    sliderStep: 200,
    placeholder: "100,000",
    formatValue: (v) => Number(v).toFixed(0),
    formatDisplay: (v) => `$${Number(v).toLocaleString()}`,
    yesterdayLabel: "Yesterday price",
  },
  {
    key: "gold",
    label: "Gold",
    emoji: "🥇",
    name: "(1OZ price at 2PM)",
    inputId: "goldPriceInput",
    sliderId: "goldPriceSlider",
    cacheKey: "finance:latest-gold",
    min: 10,
    max: 10000,
    step: 10,
    sliderStep: 10,
    placeholder: "5,000",
    formatValue: (v) => Number(v).toFixed(0),
    formatDisplay: (v) => `$${Number(v).toLocaleString()}`,
    yesterdayLabel: "Yesterday price",
  },
];

const FINANCE_TIMEZONE = "America/Los_Angeles";
let midnightTimer = null;

function formatThousands(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return "";
  return num.toLocaleString("en-US");
}

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

function shouldDefaultToTomorrow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FINANCE_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  return Number(parts.hour) >= 14;  // 2 PM PT
}

function getCurrentPTHour() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FINANCE_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  return Number(parts.hour || 0);
}

function isAssetLocked(assetKey, forecastDate) {
  const todayPT = getPTTodayYmd();
  const hourPT = getCurrentPTHour();

  if (forecastDate > todayPT) {  // tomorrow is always editable
    return false;
  }

  if (assetKey === "gas") {  // gas locked today
    return true;
  }

  return hourPT >= 12;  // BTC & Gold editable until noon
}

async function resolveAuthUserId() {
  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();

  if (sessionError) {
    throw new Error(`Session check failed: ${sessionError.message}`);
  }

  return sessionData?.session?.user?.id || null;
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

  const userId = await resolveAuthUserId().catch((error) => {
    console.warn("Unable to resolve user ID:", error);
    return null;
  });

  const cards = [];

  for (const asset of FINANCE_ASSETS) {
    const assetLocked = isAssetLocked(asset.key, forecastDate);
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
      <div class="asset-card asset-card--finance ${assetLocked ? "is-locked" : ""}">

        <div class="asset-card-header asset-card-header--finance">
          <div class="asset-emoji">${asset.emoji}</div>
          <div class="asset-title asset-title--finance">${asset.label}</div>
          <small class="asset-name asset-name--finance">${asset.name}</small>
        </div>

        <div class="asset-card-content asset-card-content--finance">
          <p class="forecast-meta"><small>${asset.yesterdayLabel}: ${yesterdayText}</small></p>
          <p class="forecast-line"><small>${forecastText}</small></p>

          <label class="finance-label">
            Price ($)
            <input
              type="${asset.key === "gas" ? "number" : "text"}"
              inputmode="numeric"
              class="finance-input"
              id="${asset.inputId}"
              step="${asset.step}"
              min="${asset.min}"
              max="${asset.max}"
              value="${
                hasForecast
                  ? (asset.key === "gas"
                      ? asset.formatValue(saved[asset.key])
                      : formatThousands(saved[asset.key]))
                  : ""
              }"
              placeholder="${asset.placeholder}"
              ${assetLocked ? "disabled" : ""}
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
            ${assetLocked ? "disabled" : ""}
          />

          <small class="slider-help"> Use the slider to choose a price </small>
          ${assetLocked ? "<small class='locked-note'> Past cutoff time </small>" : ""}
        </div>
      </div>
    `);
  }

  grid.innerHTML = cards.join("");

    for (const asset of FINANCE_ASSETS) {
      const assetLocked = isAssetLocked(asset.key, forecastDate);
      if (assetLocked) continue;
      const priceInput = document.getElementById(asset.inputId);
      const priceSlider = document.getElementById(asset.sliderId);

      const syncPrice = (value) => {
        const parsed = Number.parseFloat(value);
        if (Number.isNaN(parsed)) return;
        if (priceInput) {
          priceInput.value =
            asset.key === "gas"
              ? asset.formatValue(parsed)
              : formatThousands(parsed);
        }
        if (priceSlider) priceSlider.value = String(parsed);
      };

      if (priceSlider) {
        priceSlider.addEventListener("input", (event) => {
          syncPrice(event.target.value);
        });
      }

      if (priceInput) {
        priceInput.addEventListener("input", (event) => {
          if (asset.key !== "gas") {
            const raw = event.target.value.replace(/,/g, "");
            const parsed = Number(raw);
      
            if (!Number.isNaN(parsed)) {
              event.target.value = formatThousands(parsed);
      
              if (priceSlider) {
                priceSlider.value = parsed;
              }
            }
          } else {
            const parsed = Number(event.target.value);
      
            if (!Number.isNaN(parsed) && priceSlider) {
              priceSlider.value = parsed;
            }
          }
        });
      }
    }
  }

async function handleSubmit(event) {
  event.preventDefault();

  const forecastDaySelect = document.getElementById("forecastDay");
  const forecastDay = forecastDaySelect?.value || "today";
  const forecastDate = getFinanceForecastDateISO(forecastDay);
  
  const values = {};
  for (const asset of FINANCE_ASSETS) {
    if (isAssetLocked(asset.key, forecastDate)) continue;
    const input = document.getElementById(asset.inputId);
  
    if (!input) continue;
  
    const raw = input.value?.trim();
  
    if (!raw) continue;
  
    values[asset.key] =
      asset.key === "gas"
        ? Number(raw)
        : Number(raw.replace(/,/g, ""));
  }
  
  if (Object.keys(values).length === 0) {
    setStatus(
      "<span style='color:red;'> Enter at least one forecast before saving. </span>"
    );
    return;
  }

console.log("[FINANCE] starting save, about to ensure session");

const session = await ensureSessionForDailySave();

console.log("[FINANCE] ensureSessionForDailySave returned", session);
console.log("finance session", session);

if (!session?.user?.id) {
  console.warn("finance save blocked: no session user id");

  setStatus(
    "<span style='color:red;'> No active session yet. Your first daily temps save will create a guest session. </span>"
  );
  return;
}

const userId = session.user.id;
console.log("finance userId", userId);

const payload = {
  user_id: userId,
  date: forecastDate,
  ...values,
};

console.log("finance payload", payload);

const { error } = await client
  .from("finance_forecasts")
  .upsert(payload, {
    onConflict: "user_id,date"  // update an existing forecast day instead of creating extra rows
  })
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
const saveButton = document.getElementById("financeSaveBtn");

console.log("[FINANCE] wiring", {
  form: financeForm,
  button: saveButton,
});

if (saveButton) {
  saveButton.addEventListener("click", async (event) => {
    console.log("[FINANCE] BUTTON CLICK FIRED");
    await handleSubmit(event);
  });
}

const forecastDaySelect = document.getElementById("forecastDay");
if (forecastDaySelect) {
  if (shouldDefaultToTomorrow()) {
    forecastDaySelect.value = "tomorrow";
  }

  forecastDaySelect.addEventListener("change", () => {
    updateCurrentDate();
    buildFinanceGrid();
  });
}

if (document.getElementById("financeGrid")) {
  buildFinanceGrid();
  scheduleMidnightRefresh();
}
