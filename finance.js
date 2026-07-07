import {setStatus, isValidEmail, isInvalidRefreshTokenError, clearSupabaseAuthStorage, recoverByResettingAuth, getBackupUsernameFromMetadata, syncPublicUsersTable, 
        claimBackupEmail, promptAndSaveBackupEmail, getUserIdFromAuthPayload, getSessionFromAuthPayload, createAnonymousSession,
        isAnonymousUser, setAuthRecoveryState, popAuthRecoveryState, sendReauthMagicLink, refreshAndRecoverSession, normalizeSessionResult,
        ensureSessionForDailySave, ensureSession, upsertWithSessionRecovery, handleAuthCallbackFromUrl, loadUserScopedDataOrEmpty} from "./script.js";

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = 'https://ckyqknlxmjqlkqnxhgef.supabase.co';
const SUPABASE_PUB_KEY = "sb_publishable_lQ27fzzwJf27dUWPEW8UQA_NTY7naO6";
if (!window.__supabase_client) {
  window.__supabase_client = createClient(SUPABASE_URL, SUPABASE_PUB_KEY);
}
const client = window.__supabase_client;

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

function formatDisplayDate(ymd) {
  if (!ymd) return "";

  const [year, month, day] = ymd.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));  // use a safe UTC noon for locale formatting

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(date).reduce((acc, p) => {
    if (p.type === "day") acc.day = p.value;
    if (p.type === "month") acc.month = p.value.replace(/\.$/, "");  // remove optional trailing dot in some locales
    if (p.type === "year") acc.year = p.value;
    return acc;
  }, {});

  return `${parts.day} ${parts.month} ${parts.year}`;
}

function refreshForecastDayOptions() {
  const forecastDaySelect = document.getElementById("forecastDay");
  if (!forecastDaySelect) return;

  const todayOption = forecastDaySelect.querySelector('option[value="today"]');
  const tomorrowOption = forecastDaySelect.querySelector('option[value="tomorrow"]');
  if (!todayOption || !tomorrowOption) return;

  todayOption.textContent = "Today";
  tomorrowOption.textContent = "Tomorrow";

  forecastDaySelect.value = shouldAutoUseTomorrowET() ? "tomorrow" : "today";  // force select to autoswitch date on refresh
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

// Determine autoswitch for date selector default
function shouldAutoUseTomorrowET() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .find((p) => p.type === "hour").value
  );
  return hour >= 10;  // 10AM autoswitch
}

function updateCurrentDate() {
  const dateDisplay = document.getElementById("currentDate");
  const forecastDaySelect = document.getElementById("forecastDay");
  if (!dateDisplay || !forecastDaySelect) return;

  refreshForecastDayOptions();
  const selected = forecastDaySelect.value || (shouldAutoUseTomorrowET() ? "tomorrow" : "today");
  const iso = getFinanceForecastDateISO(selected);
  dateDisplay.textContent = formatDisplayDate(iso);
}

async function buildFinanceGrid() {
  const grid = document.getElementById("financeGrid");
  if (!grid) return;

  grid.textContent = "Loading finance forecasts…";

  updateCurrentDate(); // keep the ET clock in sync if you use it elsewhere
  const forecastDaySelect = document.getElementById("forecastDay");
  const forecastDay = forecastDaySelect?.value || "today";
  const forecastDate = getFinanceForecastDateISO(forecastDay);
  const showYesterday = forecastDay === "today";

  const userForecasts = [];

  const userId = await resolveAuthUserId().catch((error) => {
    console.warn("Unable to resolve user ID:", error);
    return null;
  });
        
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
        userForecasts.push(data);
      }
    } catch (err) {
      console.warn("Finance forecasts load failed:", err);
    }
  }

  const saved = userForecasts[0] || {};
  const hasForecast = saved.price !== undefined && saved.price !== null;
  const yesterdayText = showYesterday ? "—" : "Pending";  // AAA data pending
  const forecastText = hasForecast
    ? `My current forecast: $${saved.price.toFixed(2)}`
    : "Awaiting my forecast";

  grid.innerHTML = `
    <div class="asset-card expanded">
      <div class="asset-card-header">
        <span class="asset-title"> Gas </span>
        <small class="asset-name"> (National average gas price) </small>
      </div>
      <div class="asset-card-content">
        <p><small>Yesterday price: ${yesterdayText}</small></p>
        <p class="forecast-line"><small>${forecastText}</small></p>
        <label>
          Price ($)
          <input
            type="number"
            class="daily-high"
            id="gasPriceInput"
            step="0.001"
            min="0"
            max="10"
            value="${hasForecast ? saved.price.toFixed(2) : ""}"
            placeholder="0.000"
          />
        </label>
        <input
          type="range"
          id="gasPriceSlider"
          min="0.01"
          max="10"
          step="0"
          value="${hasForecast ? saved.price.toFixed(2) : 5}"
          class="mt-2 w-full"
          aria-label="Gas price slider"
        />
        <small class="text-muted block mt-1"> Slide to choose a price between 0¢ and $10 </small>
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
}

// Save handler
async function handleSubmit(event) {
  event.preventDefault();

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

  const forecastDaySelect = document.getElementById("forecastDay");
  const needsTomorrow = shouldAutoUseTomorrowET();
  const forecastDay =
    forecastDaySelect?.value || (needsTomorrow ? "tomorrow" : "today");

  if (forecastDay === "today" && needsTomorrow) {
    if (forecastDaySelect) {
      forecastDaySelect.value = "tomorrow";
    }
    updateCurrentDate();
    setStatus(
      "<span style='color:red;'>The 10 AM cutoff for today's forecast has passed. Please forecast tomorrow instead.</span>"
    );
    return;
  }

  const forecastDate = getFinanceForecastDateISO(forecastDay);

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

if (document.getElementById("financeGrid")) {
  buildFinanceGrid();
}
