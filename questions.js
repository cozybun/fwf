const questions = [
  {
    id: 1,
    type: "numeric",
    text: "How many coins will I earn?",
    prefix: "🪙",
    placeholder: "Enter coins"
  },
  {
    id: 2,
    type: "multiple",
    text: "What will be the toughest category?",
    options: [
      "Temps 🌞",
      "Finance 📈",
    ]
  }
];

const questionTextEl = document.getElementById("question-text");
const answerAreaEl = document.getElementById("answer-area");
const saveAnswerBtn = document.getElementById("save-answer");
const questionStatusEl = document.getElementById("question-status");
const questionProgressEl = document.getElementById("question-progress");

let currentQuestionIndex = 0;
let selectedAnswer = null;

function renderQuestion() {
  const question = questions[currentQuestionIndex];

  questionTextEl.textContent = question.text;
  questionProgressEl.textContent =
    `${currentQuestionIndex + 1} / ${questions.length}`;

  answerAreaEl.innerHTML = "";
  questionStatusEl.textContent = "";
  selectedAnswer = null;
  saveAnswerBtn.disabled = true;

  if (question.type === "numeric") {
    const inputWrap = document.createElement("div");
    inputWrap.className = "numeric-answer-wrap";

    const prefix = document.createElement("span");
    prefix.textContent = question.prefix || "";

    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "0";
    input.step = "1";
    input.placeholder = question.placeholder || "Enter number";
    input.className = "numeric-answer";

    input.addEventListener("input", () => {
      const value = input.value.trim();

      selectedAnswer = value === "" ? null : Number(value);
      saveAnswerBtn.disabled = selectedAnswer == null;
    });

    inputWrap.appendChild(prefix);
    inputWrap.appendChild(input);
    answerAreaEl.appendChild(inputWrap);
  }

  if (question.type === "multiple") {
    question.options.forEach((option) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "answer-option";
      button.textContent = option;

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
}

saveAnswerBtn.addEventListener("click", () => {
  if (selectedAnswer == null) return;

  questionStatusEl.textContent = `Saved: ${selectedAnswer} ✓`;
});

renderQuestion();
