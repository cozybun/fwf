import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ckyqknlxmjqlkqnxhgef.supabase.co";
const SUPABASE_PUB_KEY = "sb_publishable_lQ27fzzwJf27dUWPEW8UQA_NTY7naO6";

if (!window.__supabase_client) {
  window.__supabase_client = createClient(SUPABASE_URL, SUPABASE_PUB_KEY);
}

const client = window.__supabase_client;

const questions = [
  {
    id: 1,
    type: "numeric",
    text: "How many coins will I earn today?",
    prefix: "🪙",
    placeholder: "Enter #"
  },
  {
    id: 2,
    type: "multiple",
    text: "Which will be the toughest category?",
    options: [
      "Temps 🌞",
      "Finance 📈"
    ]
  }
  /* {
    id: 3,
    type: "multiple",
    text: "Will Snake or Wolf earn more coins?",
    options: [
      "Snake 🐍",
      "Wolf 🐺"
    ]
  } */
];

const todayInPT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

function areQuestionsLocked() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hour12: false
  })
    .formatToParts(new Date())
    .reduce((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }

      return acc;
    }, {});

  return Number(parts.hour || 0) >= 12;
}

const questionsDateLabelEl = document.getElementById("questions-date-label");
const howToPlayBtn = document.getElementById("how-to-play");
const questionsHelpModal = document.getElementById("questionsHelpModal");
const questionsHelpDoneBtn = document.getElementById("questionsHelpDoneBtn");

function openQuestionsHelp() { questionsHelpModal.classList.remove("hidden"); }
function closeQuestionsHelp() { questionsHelpModal.classList.add("hidden"); }

howToPlayBtn.addEventListener("click", openQuestionsHelp);
questionsHelpDoneBtn.addEventListener("click", closeQuestionsHelp);

const displayDateInPT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Los_Angeles",
  day: "numeric",
  month: "short",
  year: "numeric"
}).format(new Date());

questionsDateLabelEl.textContent = displayDateInPT;

let currentUserId = null;

async function loadCurrentUser() {
  const {
    data: { user },
    error
  } = await client.auth.getUser();

  if (error) {
    console.error("Could not get current user:", error);
    return;
  }

  if (!user) {
    console.error("No current user found");
    return;
  }

  currentUserId = user.id;

  console.log("Questions user found:", !!currentUserId);
}

async function loadSavedAnswers() {
  if (!currentUserId) {
    console.error("Cannot load answers: no current user");
    return;
  }

  const { data, error } = await client
    .from("questions_answers")
    .select("coins_earned, toughest_category")
    .eq("user_id", currentUserId)
    .eq("date", todayInPT)
    .maybeSingle();

  if (error) {
    console.error("Could not load saved answers:", error);
    return;
  }

  if (!data) {
    return;
  }

  if (data.coins_earned != null) {
    savedAnswers[1] = data.coins_earned;
  }

  const categoryMap = {
    temps: "Temps 🌞",
    finance: "Finance 📈"
  };

  if (data.toughest_category != null) {
    savedAnswers[2] = categoryMap[data.toughest_category];
  }

  console.log("Saved question answers loaded");
}

const questionCardEl = document.getElementById("question-card");
const questionTextEl = document.getElementById("question-text");
const answerAreaEl = document.getElementById("answer-area");
const saveAnswerBtn = document.getElementById("save-answer");
const questionStatusEl = document.getElementById("question-status");
const questionProgressEl = document.getElementById("question-progress");

let currentQuestionIndex = 0;
let selectedAnswer = null;

/*
  Temporary front-end storage.

  Later these answers will come from / save to Supabase.
*/
const savedAnswers = {};

function renderQuestion() {
  const question = questions[currentQuestionIndex];

  questionProgressEl.style.display = "";
  questionTextEl.style.display = "";
  answerAreaEl.style.display = "";
  saveAnswerBtn.style.display = "";

  questionProgressEl.textContent =
    `${currentQuestionIndex + 1} / ${questions.length}`;

  questionTextEl.textContent = question.text;
  answerAreaEl.innerHTML = "";
  questionStatusEl.textContent = "";

  selectedAnswer = savedAnswers[question.id] ?? null;

  saveAnswerBtn.disabled = selectedAnswer == null;
  saveAnswerBtn.textContent =
    savedAnswers[question.id] != null ? "Update" : "Save";

  if (question.type === "numeric") {
    renderNumericQuestion(question);
  }

  if (question.type === "multiple") {
    renderMultipleQuestion(question);
  }
}

function renderNumericQuestion(question) {
  const inputWrap = document.createElement("div");
  inputWrap.className = "numeric-answer-wrap";

  const prefix = document.createElement("span");
  prefix.textContent = question.prefix || "";

  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "0";
  input.step = "1";
  input.placeholder = question.placeholder || "Enter #";
  input.className = "numeric-answer";

  if (selectedAnswer != null) {
    input.value = selectedAnswer;
  }

  input.addEventListener("input", () => {
    const value = input.value.trim();

    selectedAnswer = value === "" ? null : Number(value);
    saveAnswerBtn.disabled = selectedAnswer == null;
  });

  inputWrap.appendChild(prefix);
  inputWrap.appendChild(input);

  answerAreaEl.appendChild(inputWrap);
}

function renderMultipleQuestion(question) {
  question.options.forEach((option) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "answer-option";
    button.textContent = option;

    if (selectedAnswer === option) {
      button.classList.add("selected");
    }

    button.addEventListener("click", () => {
      selectedAnswer = option;

      document
        .querySelectorAll(".answer-option")
        .forEach((btn) => btn.classList.remove("selected"));

      button.classList.add("selected");
      saveAnswerBtn.disabled = false;
    });

    answerAreaEl.appendChild(button);
  });
}

function transitionToNext() {
  questionCardEl.classList.add("card-out");

  setTimeout(() => {
    currentQuestionIndex++;

    if (currentQuestionIndex >= questions.length) {
      renderComplete();
    } else {
      renderQuestion();
    }

    questionCardEl.classList.remove("card-out");
    questionCardEl.classList.add("card-in");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        questionCardEl.classList.remove("card-in");
      });
    });
  }, 220);
}

function renderComplete() {
  questionProgressEl.style.display = "none";
  questionTextEl.style.display = "none";
  saveAnswerBtn.style.display = "none";
  questionStatusEl.textContent = "";

  answerAreaEl.style.display = "";
  answerAreaEl.innerHTML = `
    <div>
      <h2> All answers saved ✅ </h2>
      <p> You answered today's questions! </p>

      <div class="completion-actions">
        <button
          id="edit-answers"
          class="completion-button"
          type="button"
        >
          Edit Answers
        </button>

        <a
          id="view-score"
          class="completion-button"
          href="score"
        >
          View Score
        </a>
      </div>
    </div>
  `;

  document
    .getElementById("edit-answers")
    .addEventListener("click", startEditing);

  document
    .getElementById("view-score")
    .addEventListener("click", () => {
      localStorage.setItem("scoreCategory", "questions");
    });
}

function startEditing() {
  currentQuestionIndex = 0;

  questionCardEl.classList.add("card-out");

  setTimeout(() => {
    renderQuestion();

    questionCardEl.classList.remove("card-out");
    questionCardEl.classList.add("card-in");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        questionCardEl.classList.remove("card-in");
      });
    });
  }, 220);
}

async function saveCoinsAnswer(value) {
  if (!currentUserId) {
    console.error("Cannot save: no current user.");
    return false;
  }

  const { error } = await client
    .from("questions_answers")
    .upsert(
      {
        user_id: currentUserId,
        date: todayInPT,
        coins_earned: value,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "user_id,date"
      }
    );

  if (error) {
    console.error("Could not save coins answer:", error);
    return false;
  }

  console.log("Coins answer saved");
  return true;
}

async function saveToughestCategory(value) {
  if (!currentUserId) {
    console.error("Cannot save: no current user.");
    return false;
  }

  const categoryMap = {
    "Temps 🌞": "temps",
    "Finance 📈": "finance"
  };

  const databaseValue = categoryMap[value];

  if (!databaseValue) {
    console.error("Invalid toughest category:", value);
    return false;
  }

  const { error } = await client
    .from("questions_answers")
    .upsert(
      {
        user_id: currentUserId,
        date: todayInPT,
        toughest_category: databaseValue,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "user_id,date"
      }
    );

  if (error) {
    console.error("Could not save toughest category:", error);
    return false;
  }

  console.log("Toughest category saved.");
  return true;
}

saveAnswerBtn.addEventListener("click", async () => {
  if (selectedAnswer == null) return;

  if (areQuestionsLocked()) {
    saveAnswerBtn.disabled = true;
    questionStatusEl.textContent = "Today's questions closed at noon";
    return;
  }

  const question = questions[currentQuestionIndex];

  if (question.id === 1) {  // save coins answer to db
    saveAnswerBtn.disabled = true;

    const saved = await saveCoinsAnswer(selectedAnswer);

    if (!saved) {
      saveAnswerBtn.disabled = false;
      questionStatusEl.textContent = "Could not save. Try again.";
      return;
    }
  }
  if (question.id === 2) {  // save toughest category answer to db
    saveAnswerBtn.disabled = true;
  
    const saved = await saveToughestCategory(selectedAnswer);
  
    if (!saved) {
      saveAnswerBtn.disabled = false;
      questionStatusEl.textContent = "Could not save. Try again.";
      return;
    }
  }

  savedAnswers[question.id] = selectedAnswer;  // temporary local storage still handles the editing UI
  transitionToNext();
});

async function initQuestions() {
  await loadCurrentUser();
  await loadSavedAnswers();

  const allAnswered = questions.every(
    (question) => savedAnswers[question.id] != null
  );

  if (allAnswered) {
    renderComplete();
  } else {
    renderQuestion();
  }
}

initQuestions();
