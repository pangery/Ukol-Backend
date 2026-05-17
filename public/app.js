const API = "/v1";

const DIFFICULTY_LABELS = {
  Easy: "Snadná",
  Medium: "Střední",
  Hard: "Náročná",
};

const state = {
  goals: [],
  selectedId: null,
  selectedGoal: null,
  editingGoalId: null,
  editingDestinationId: null,
  busy: false,
};

const $ = (sel) => document.querySelector(sel);

const goalsCount = $("#goals-count");
const goalsTable = $("#goals-table");
const goalsList = $("#goals-list");
const goalsEmpty = $("#goals-empty");
const goalsLoading = $("#goals-loading");
const detailPanel = $("#detail-panel");
const detailPlaceholder = $("#detail-placeholder");
const detailLoading = $("#detail-loading");
const breadcrumbName = $("#breadcrumb-name");
const detailHeading = $("#detail-heading");
const detailMeta = $("#detail-meta");
const metricCount = $("#metric-count");
const metricDays = $("#metric-days");
const metricBudget = $("#metric-budget");
const destinationsTable = $("#destinations-table");
const destinationsList = $("#destinations-list");
const destinationsFoot = $("#destinations-foot");
const destinationsTotal = $("#destinations-total");
const destinationsEmpty = $("#destinations-empty");
const goalModal = $("#goal-modal");
const goalForm = $("#goal-form");
const goalModalTitle = $("#goal-modal-title");
const goalSubmit = $("#goal-submit");
const destinationModal = $("#destination-modal");
const destinationForm = $("#destination-form");
const destinationModalTitle = $("#destination-modal-title");
const destinationSubmit = $("#destination-submit");
const budgetHint = $("#budget-hint");
const confirmModal = $("#confirm-modal");
const confirmMessage = $("#confirm-message");
const confirmForm = $("#confirm-form");
const notification = $("#notification");
const progressBar = $("#progress-bar");

let notificationTimer;
let confirmResolver = null;
let goalsRequestId = 0;
let detailAbortController = null;
let progressCount = 0;

const API_TIMEOUT_MS = 15000;

function formatCurrency(amount) {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDays(count) {
  if (count === 1) return "1 den";
  if (count >= 2 && count <= 4) return `${count} dny`;
  return `${count} dní`;
}

function escapeHtml(str) {
  const el = document.createElement("div");
  el.textContent = str;
  return el.innerHTML;
}

function formatDifficulty(difficulty) {
  const label = DIFFICULTY_LABELS[difficulty] || difficulty;
  return `<span class="tag">${escapeHtml(label)}</span>`;
}

function motionEnabled() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function playAnimation(el, className, durationMs = 400) {
  if (!el || !motionEnabled()) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), durationMs);
}

function animateRow(el, index) {
  if (!el || !motionEnabled()) return;
  el.classList.add("animate-row-in");
  el.style.animationDelay = `${Math.min(index, 12) * 35}ms`;
}

function progressStart() {
  progressCount += 1;
  if (!progressBar) return;
  progressBar.hidden = false;
  progressBar.classList.add("is-active");
}

function progressEnd() {
  progressCount = Math.max(0, progressCount - 1);
  if (!progressBar || progressCount > 0) return;
  progressBar.classList.remove("is-active");
  window.setTimeout(() => {
    if (progressCount === 0) progressBar.hidden = true;
  }, 280);
}

function animateValue(el, endValue, formatter) {
  if (!el) return;
  if (!motionEnabled() || typeof endValue !== "number") {
    el.textContent = formatter(endValue);
    playAnimation(el, "stat-flash", 550);
    return;
  }
  const start = performance.now();
  const duration = 520;
  const tick = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = formatter(Math.round(endValue * eased));
    if (t < 1) requestAnimationFrame(tick);
    else playAnimation(el, "stat-flash", 550);
  };
  requestAnimationFrame(tick);
}

function setStatValue(el, text, numericValue = null, formatter = String) {
  if (!el) return;
  if (numericValue !== null && typeof numericValue === "number") {
    animateValue(el, numericValue, formatter);
  } else {
    el.textContent = text;
    playAnimation(el, "stat-flash", 550);
  }
}

function updateEmptySteps(activeStep) {
  const steps = document.querySelectorAll(".empty-view__steps .step");
  const lines = document.querySelectorAll(".empty-view__steps .step-line");
  steps.forEach((step, i) => {
    step.classList.toggle("is-done", i < activeStep);
    step.classList.toggle("is-active", i === activeStep);
  });
  lines.forEach((line, i) => {
    line.classList.toggle("is-done", i < activeStep);
  });
}

function transitionDetail(updateFn) {
  if (!motionEnabled() || !document.startViewTransition) {
    updateFn();
    return;
  }
  document.startViewTransition(() => updateFn());
}

function showNotification(message, isError = false) {
  clearTimeout(notificationTimer);
  notification.classList.remove("toast--out", "toast--in");
  notification.textContent = message;
  notification.classList.toggle("is-error", isError);
  notification.hidden = false;
  playAnimation(notification, "toast--in", 320);

  notificationTimer = setTimeout(() => {
    if (!motionEnabled()) {
      notification.hidden = true;
      return;
    }
    notification.classList.add("toast--out");
    const hide = () => {
      notification.hidden = true;
      notification.classList.remove("toast--out", "toast--in");
    };
    notification.addEventListener("animationend", hide, { once: true });
    window.setTimeout(hide, 220);
  }, 4500);
}

function setBusy(busy) {
  state.busy = busy;
  goalSubmit.disabled = busy;
  destinationSubmit.disabled = busy;
  $("#btn-new-goal").disabled = busy;
  $("#btn-edit-goal").disabled = busy;
  $("#btn-delete-goal").disabled = busy;
  $("#btn-new-destination").disabled = busy;
}

function setGoalsLoading(loading) {
  goalsLoading.classList.toggle("is-active", loading);
}

function setDetailLoading(loading) {
  detailLoading.classList.toggle("is-active", loading);
}

function confirmAction(message) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    confirmMessage.textContent = message;
    confirmModal.showModal();
  });
}

async function api(path, options = {}) {
  const { signal: externalSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  if (externalSignal?.aborted) {
    clearTimeout(timeout);
    throw new DOMException("Aborted", "AbortError");
  }

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);

  progressStart();

  try {
    const res = await fetch(`${API}${path}`, {
      ...fetchOptions,
      headers: { "Content-Type": "application/json", ...fetchOptions.headers },
      signal: controller.signal,
    });

    if (res.status === 204) return null;

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || "Operace se nezdařila.");
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      if (externalSignal?.aborted) throw err;
      throw new Error("Server neodpovídá. Spusťte aplikaci příkazem npm start.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onExternalAbort);
    progressEnd();
  }
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

async function loadGoals() {
  const requestId = ++goalsRequestId;
  setGoalsLoading(true);
  try {
    const search = $("#filter-search").value.trim();
    const difficulty = $("#filter-difficulty").value;
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (difficulty) params.set("difficulty", difficulty);

    const qs = params.toString();
    const goals = await api(`/trip-goals${qs ? `?${qs}` : ""}`);
    if (requestId !== goalsRequestId) return;

    state.goals = goals;
    renderGoalsList();

    if (state.selectedId && !goals.some((g) => g.id === state.selectedId)) {
      state.selectedId = null;
      state.selectedGoal = null;
      showDetailPlaceholder();
    }
  } catch (err) {
    if (requestId === goalsRequestId) {
      showNotification(err.message, true);
    }
  } finally {
    if (requestId === goalsRequestId) {
      setGoalsLoading(false);
    }
  }
}

function renderGoalsList() {
  goalsList.innerHTML = "";
  const countText = String(state.goals.length);
  if (goalsCount.textContent !== countText) {
    goalsCount.textContent = countText;
    playAnimation(goalsCount, "count-pop", 360);
  } else {
    goalsCount.textContent = countText;
  }

  if (!state.goals.length) {
    goalsTable.hidden = true;
    goalsEmpty.hidden = false;
    playAnimation(goalsEmpty, "animate-fade-in", 300);
    return;
  }

  goalsTable.hidden = false;
  goalsEmpty.hidden = true;
  playAnimation(goalsTable, "animate-fade-in", 300);

  state.goals.forEach((goal, index) => {
    const tr = document.createElement("tr");
    tr.setAttribute("role", "button");
    tr.tabIndex = 0;
    if (goal.id === state.selectedId) {
      tr.classList.add("is-selected");
      tr.setAttribute("aria-selected", "true");
    }
    tr.innerHTML = `
      <td>
        ${escapeHtml(goal.name)}
        <span class="cell-sub">${escapeHtml(goal.focus)}</span>
      </td>
      <td class="col-fit">${formatDifficulty(goal.difficulty)}</td>
    `;
    const activate = () => selectGoal(goal.id);
    tr.addEventListener("click", activate);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
    animateRow(tr, index);
    goalsList.appendChild(tr);
  });
}

async function selectGoal(id) {
  if (state.busy) return;
  state.selectedId = id;
  renderGoalsList();
  updateEmptySteps(2);
  try {
    await loadGoalDetail(id);
  } catch {
    /* chyba je zobrazena v loadGoalDetail */
  }
}

async function loadGoalDetail(id, { silent = false } = {}) {
  if (detailAbortController) {
    detailAbortController.abort();
  }
  detailAbortController = new AbortController();
  const { signal } = detailAbortController;

  if (!silent) {
    detailPlaceholder.classList.add("hidden");
    detailPanel.classList.remove("hidden");
    playAnimation(detailPanel, "animate-detail-in", 420);
    setDetailLoading(true);
  }

  try {
    const goal = await api(`/trip-goals/${id}`, { signal });
    state.selectedGoal = goal;
    showDetailPanel(goal);
    setDetailLoading(false);
  } catch (err) {
    if (err.name === "AbortError") return;
    if (!silent) {
      setDetailLoading(false);
      showNotification(err.message, true);
      showDetailPlaceholder();
      state.selectedId = null;
      state.selectedGoal = null;
      renderGoalsList();
    }
    throw err;
  }
}

function showDetailPlaceholder() {
  detailPanel.classList.add("hidden");
  detailPlaceholder.classList.remove("hidden");
  updateEmptySteps(1);
  playAnimation(detailPlaceholder, "animate-fade-in", 350);
}

function summarizeDestinations(destinations) {
  return destinations.reduce(
    (acc, d) => {
      acc.count += 1;
      acc.days += d.estimatedDurationDays;
      acc.budget += d.estimatedDurationDays * d.dailyBudget;
      return acc;
    },
    { count: 0, days: 0, budget: 0 }
  );
}

function showDetailPanel(goal) {
  const render = () => {
    detailPlaceholder.classList.add("hidden");
    detailPanel.classList.remove("hidden");
    updateEmptySteps(3);

    breadcrumbName.textContent = goal.name;
    detailHeading.textContent = goal.name;
    playAnimation(detailHeading, "animate-section-in", 380);

    detailMeta.innerHTML = `
    <dt>Zaměření</dt><dd>${escapeHtml(goal.focus)}</dd>
    <dt>Obtížnost</dt><dd>${formatDifficulty(goal.difficulty)}</dd>
    <dt>Identifikátor</dt><dd>#${goal.id}</dd>
  `;
    playAnimation(detailMeta, "animate-section-in", 400);

    const destinations = goal.destinations || [];
    const summary = summarizeDestinations(destinations);

    setStatValue(metricCount, String(summary.count), summary.count);
    setStatValue(metricDays, formatDays(summary.days), summary.days, (n) => formatDays(n));
    setStatValue(metricBudget, formatCurrency(summary.budget), summary.budget, formatCurrency);
    playAnimation(detailPanel, "animate-detail-in", 420);

  destinationsList.innerHTML = "";

  if (!destinations.length) {
    destinationsTable.hidden = true;
    destinationsFoot.hidden = true;
    destinationsEmpty.hidden = false;
    playAnimation(destinationsEmpty, "animate-fade-in", 320);
    return;
  }

  destinationsTable.hidden = false;
  destinationsFoot.hidden = false;
  destinationsEmpty.hidden = true;
  destinationsTotal.textContent = formatCurrency(summary.budget);
  playAnimation(destinationsTable, "animate-fade-in", 340);

  destinations.forEach((dest, index) => {
    const total = dest.estimatedDurationDays * dest.dailyBudget;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(dest.name)}</td>
      <td class="col--num">${formatDays(dest.estimatedDurationDays)}</td>
      <td class="col--num">${formatCurrency(dest.dailyBudget)}</td>
      <td class="col--num">${formatCurrency(total)}</td>
      <td class="col-fit">
        <div class="cell-actions">
          <button type="button" class="btn btn--sm" data-edit-dest="${dest.id}">Upravit</button>
          <button type="button" class="btn btn--sm btn--danger" data-delete-dest="${dest.id}">Odstranit</button>
        </div>
      </td>
    `;
    animateRow(tr, index);
    destinationsList.appendChild(tr);
  });

  destinationsList.querySelectorAll("[data-edit-dest]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openDestinationModal(Number(btn.dataset.editDest));
    });
  });
  destinationsList.querySelectorAll("[data-delete-dest]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteDestination(Number(btn.dataset.deleteDest));
    });
  });
  };

  transitionDetail(render);
}

function openGoalModal(goal = null) {
  state.editingGoalId = goal?.id ?? null;
  goalModalTitle.textContent = goal ? "Upravit cíl výletu" : "Nový cíl výletu";
  goalForm.name.value = goal?.name ?? "";
  goalForm.focus.value = goal?.focus ?? "";
  goalForm.difficulty.value = goal ? goal.difficulty.toLowerCase() : "";
  goalModal.showModal();
  goalForm.name.focus();
}

function openDestinationModal(destinationId = null) {
  const dest = destinationId
    ? state.selectedGoal?.destinations?.find((d) => d.id === destinationId)
    : null;
  state.editingDestinationId = destinationId;
  destinationModalTitle.textContent = dest ? "Upravit destinaci" : "Nová destinace";
  destinationForm.name.value = dest?.name ?? "";
  destinationForm.estimatedDurationDays.value = dest?.estimatedDurationDays ?? "";
  destinationForm.dailyBudget.value = dest?.dailyBudget ?? "";
  updateBudgetHint();
  destinationModal.showModal();
  destinationForm.name.focus();
}

function updateBudgetHint() {
  const days = Number(destinationForm.estimatedDurationDays.value);
  const daily = Number(destinationForm.dailyBudget.value);
  if (days > 0 && daily > 0) {
    budgetHint.hidden = false;
    budgetHint.textContent = `Odhadovaný celkový rozpočet: ${formatCurrency(days * daily)}`;
    budgetHint.classList.add("is-revealed");
    playAnimation(budgetHint, "animate-fade-in", 280);
  } else {
    budgetHint.hidden = true;
    budgetHint.classList.remove("is-revealed");
  }
}

function closeModals() {
  goalModal.close();
  destinationModal.close();
}

async function saveGoal(e) {
  e.preventDefault();
  if (state.busy) return;

  const body = {
    name: goalForm.name.value.trim(),
    focus: goalForm.focus.value.trim(),
    difficulty: goalForm.difficulty.value,
  };

  setBusy(true);
  try {
    if (state.editingGoalId) {
      await api(`/trip-goals/${state.editingGoalId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      showNotification("Záznam byl úspěšně uložen.");
    } else {
      const created = await api("/trip-goals", {
        method: "POST",
        body: JSON.stringify(body),
      });
      state.selectedId = created.id;
      showNotification("Záznam byl úspěšně vytvořen.");
    }
    closeModals();
    await loadGoals();
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    setBusy(false);
  }
}

async function deleteGoal() {
  if (!state.selectedId || state.busy) return;

  const confirmed = await confirmAction(
    "Opravdu chcete odstranit tento cíl výletu? Současně budou odstraněny všechny navázané destinace."
  );
  if (!confirmed) return;

  setBusy(true);
  try {
    await api(`/trip-goals/${state.selectedId}`, { method: "DELETE" });
    state.selectedId = null;
    state.selectedGoal = null;
    showDetailPlaceholder();
    showNotification("Záznam byl odstraněn.");
    await loadGoals();
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    setBusy(false);
  }
}

async function saveDestination(e) {
  e.preventDefault();
  if (state.busy) return;

  const body = {
    name: destinationForm.name.value.trim(),
    estimatedDurationDays: Number(destinationForm.estimatedDurationDays.value),
    dailyBudget: Number(destinationForm.dailyBudget.value),
  };

  setBusy(true);
  try {
    if (state.editingDestinationId) {
      await api(`/destinations/${state.editingDestinationId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      showNotification("Destinace byla úspěšně uložena.");
    } else {
      await api(`/trip-goals/${state.selectedId}/destinations`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      showNotification("Destinace byla úspěšně přidána.");
    }
    closeModals();
    await loadGoalDetail(state.selectedId);
    await loadGoals();
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    setBusy(false);
  }
}

async function deleteDestination(id) {
  if (state.busy) return;

  const confirmed = await confirmAction("Opravdu chcete odstranit tuto destinaci?");
  if (!confirmed) return;

  setBusy(true);
  try {
    await api(`/destinations/${id}`, { method: "DELETE" });
    showNotification("Destinace byla odstraněna.");
    await loadGoalDetail(state.selectedId);
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    setBusy(false);
  }
}

confirmForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = e.submitter?.value || "confirm";
  confirmModal.close();
  if (confirmResolver) {
    confirmResolver(value === "confirm");
    confirmResolver = null;
  }
});

confirmForm.addEventListener("cancel", (e) => {
  e.preventDefault();
  confirmModal.close();
  if (confirmResolver) {
    confirmResolver(false);
    confirmResolver = null;
  }
});

document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", closeModals);
});

document.querySelectorAll("[data-close-confirm]").forEach((btn) => {
  btn.addEventListener("click", () => {
    confirmModal.close();
    if (confirmResolver) {
      confirmResolver(false);
      confirmResolver = null;
    }
  });
});

$("#btn-new-goal").addEventListener("click", () => openGoalModal());
$("#btn-edit-goal").addEventListener("click", () => {
  if (state.selectedGoal) openGoalModal(state.selectedGoal);
});
$("#btn-delete-goal").addEventListener("click", deleteGoal);
$("#btn-new-destination").addEventListener("click", () => openDestinationModal());

goalForm.addEventListener("submit", saveGoal);
destinationForm.addEventListener("submit", saveDestination);
destinationForm.estimatedDurationDays.addEventListener("input", updateBudgetHint);
destinationForm.dailyBudget.addEventListener("input", updateBudgetHint);

const debouncedLoad = debounce(() => loadGoals().catch((err) => showNotification(err.message, true)), 300);
$("#filter-search").addEventListener("input", debouncedLoad);
$("#filter-difficulty").addEventListener("change", () =>
  loadGoals().catch((err) => showNotification(err.message, true))
);

updateEmptySteps(1);
loadGoals().catch((err) => showNotification(err.message, true));
