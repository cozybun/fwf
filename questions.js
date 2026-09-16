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
    text: "What will be the toughest category?",
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
    console.error("No current user found.");
    return;
  }

  currentUserId = user.id;

  console.log("Questions user:", currentUserId);
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

saveAnswerBtn.addEventListener("click", () => {
  if (selectedAnswer == null) return;

  const question = questions[currentQuestionIndex];

  savedAnswers[question.id] = selectedAnswer;

  transitionToNext();
});

loadCurrentUser();
renderQuestion();
