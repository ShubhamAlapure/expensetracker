const state = {
  transactions: [],
  settings: {
    currency: "INR",
    monthlyBudget: 0,
    categoryBudgets: {}
  },
  editingId: null,
  filters: {
    search: "",
    type: "all",
    category: "all",
    month: ""
  }
};

const categoryPalette = [
  "#167a72",
  "#d95f44",
  "#d89b27",
  "#7260bf",
  "#2d6f9f",
  "#2f8f5b",
  "#a75c30",
  "#985f99",
  "#69774f",
  "#c34a36"
];

const defaultCategories = [
  "Food",
  "Housing",
  "Transport",
  "Utilities",
  "Health",
  "Shopping",
  "Entertainment",
  "Travel",
  "Salary",
  "Freelance",
  "Other"
];

const els = {
  monthFilter: document.querySelector("#monthFilter"),
  refreshButton: document.querySelector("#refreshButton"),
  balanceValue: document.querySelector("#balanceValue"),
  savingsRate: document.querySelector("#savingsRate"),
  incomeValue: document.querySelector("#incomeValue"),
  incomeCount: document.querySelector("#incomeCount"),
  expenseValue: document.querySelector("#expenseValue"),
  expenseCount: document.querySelector("#expenseCount"),
  budgetLeftValue: document.querySelector("#budgetLeftValue"),
  budgetProgress: document.querySelector("#budgetProgress"),
  form: document.querySelector("#transactionForm"),
  formTitle: document.querySelector("#formTitle"),
  submitLabel: document.querySelector("#submitLabel"),
  transactionId: document.querySelector("#transactionId"),
  titleInput: document.querySelector("#titleInput"),
  amountInput: document.querySelector("#amountInput"),
  dateInput: document.querySelector("#dateInput"),
  categoryInput: document.querySelector("#categoryInput"),
  accountInput: document.querySelector("#accountInput"),
  notesInput: document.querySelector("#notesInput"),
  categoryList: document.querySelector("#categoryList"),
  accountList: document.querySelector("#accountList"),
  clearEditButton: document.querySelector("#clearEditButton"),
  resetButton: document.querySelector("#resetButton"),
  currencyInput: document.querySelector("#currencyInput"),
  monthlyBudgetInput: document.querySelector("#monthlyBudgetInput"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  categoryBudgetList: document.querySelector("#categoryBudgetList"),
  monthLabel: document.querySelector("#monthLabel"),
  donutChart: document.querySelector("#donutChart"),
  donutTotal: document.querySelector("#donutTotal"),
  categoryBreakdown: document.querySelector("#categoryBreakdown"),
  trendPeak: document.querySelector("#trendPeak"),
  trendChart: document.querySelector("#trendChart"),
  exportButton: document.querySelector("#exportButton"),
  searchInput: document.querySelector("#searchInput"),
  typeFilter: document.querySelector("#typeFilter"),
  categoryFilter: document.querySelector("#categoryFilter"),
  transactionList: document.querySelector("#transactionList"),
  toast: document.querySelector("#toast")
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  els.monthFilter.value = currentMonth;
  els.dateInput.value = new Date().toISOString().slice(0, 10);
  state.filters.month = currentMonth;

  bindEvents();
  loadData();
}

function bindEvents() {
  els.form.addEventListener("submit", handleTransactionSubmit);
  els.form.addEventListener("reset", () => window.setTimeout(() => resetForm(false), 0));
  els.clearEditButton.addEventListener("click", resetForm);
  els.refreshButton.addEventListener("click", loadData);
  els.saveSettingsButton.addEventListener("click", saveSettings);
  els.exportButton.addEventListener("click", exportCsv);

  els.monthFilter.addEventListener("change", () => {
    state.filters.month = els.monthFilter.value;
    render();
  });

  els.searchInput.addEventListener("input", () => {
    state.filters.search = els.searchInput.value.trim().toLowerCase();
    renderTransactions();
  });

  els.typeFilter.addEventListener("change", () => {
    state.filters.type = els.typeFilter.value;
    renderTransactions();
  });

  els.categoryFilter.addEventListener("change", () => {
    state.filters.category = els.categoryFilter.value;
    renderTransactions();
  });

  els.transactionList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === "edit") {
      startEdit(id);
    }
    if (button.dataset.action === "delete") {
      deleteTransaction(id);
    }
  });
}

async function loadData() {
  try {
    const [transactionsResponse, settingsResponse] = await Promise.all([
      api("/api/transactions"),
      api("/api/settings")
    ]);
    state.transactions = transactionsResponse.transactions || [];
    state.settings = settingsResponse.settings || state.settings;
    render();
    showToast("Data refreshed");
  } catch (error) {
    showToast(error.message || "Could not load data");
  }
}

async function handleTransactionSubmit(event) {
  event.preventDefault();
  const formData = new FormData(els.form);
  const payload = {
    type: formData.get("type"),
    title: els.titleInput.value,
    amount: Number(els.amountInput.value),
    date: els.dateInput.value,
    category: els.categoryInput.value,
    account: els.accountInput.value || "Wallet",
    notes: els.notesInput.value
  };

  try {
    if (state.editingId) {
      const response = await api(`/api/transactions/${encodeURIComponent(state.editingId)}`, {
        method: "PUT",
        body: payload
      });
      state.transactions = state.transactions.map((item) =>
        item.id === state.editingId ? response.transaction : item
      );
      showToast("Transaction updated");
    } else {
      const response = await api("/api/transactions", {
        method: "POST",
        body: payload
      });
      state.transactions.unshift(response.transaction);
      showToast("Transaction added");
    }

    resetForm();
    render();
  } catch (error) {
    showToast(error.message || "Could not save transaction");
  }
}

async function deleteTransaction(id) {
  const item = state.transactions.find((transaction) => transaction.id === id);
  if (!item) return;
  const confirmed = window.confirm(`Delete "${item.title}"?`);
  if (!confirmed) return;

  try {
    await api(`/api/transactions/${encodeURIComponent(id)}`, { method: "DELETE" });
    state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
    if (state.editingId === id) resetForm();
    render();
    showToast("Transaction deleted");
  } catch (error) {
    showToast(error.message || "Could not delete transaction");
  }
}

async function saveSettings() {
  const categoryBudgets = {};
  for (const input of els.categoryBudgetList.querySelectorAll("input[data-category]")) {
    categoryBudgets[input.dataset.category] = Number(input.value || 0);
  }

  const payload = {
    currency: els.currencyInput.value || "INR",
    monthlyBudget: Number(els.monthlyBudgetInput.value || 0),
    categoryBudgets
  };

  try {
    const response = await api("/api/settings", {
      method: "PUT",
      body: payload
    });
    state.settings = response.settings;
    render();
    showToast("Budget saved");
  } catch (error) {
    showToast(error.message || "Could not save budget");
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data.errors && data.errors.join(", ")) || data.error || "Request failed");
  }
  return data;
}

function render() {
  renderFormData();
  renderSummary();
  renderBudgetEditor();
  renderCharts();
  renderFilters();
  renderTransactions();
}

function renderFormData() {
  els.currencyInput.value = state.settings.currency;
  els.monthlyBudgetInput.value = state.settings.monthlyBudget;

  const categories = getCategories();
  els.categoryList.innerHTML = categories.map((category) => `<option value="${escapeHtml(category)}"></option>`).join("");

  const accounts = unique(state.transactions.map((item) => item.account).filter(Boolean));
  els.accountList.innerHTML = accounts.map((account) => `<option value="${escapeHtml(account)}"></option>`).join("");
}

function renderSummary() {
  const monthTransactions = getMonthTransactions();
  const incomeItems = monthTransactions.filter((item) => item.type === "income");
  const expenseItems = monthTransactions.filter((item) => item.type === "expense");
  const income = sum(incomeItems);
  const expenses = sum(expenseItems);
  const balance = income - expenses;
  const budget = Number(state.settings.monthlyBudget || 0);
  const budgetLeft = budget - expenses;
  const usedPct = budget > 0 ? Math.min((expenses / budget) * 100, 100) : 0;
  const savedPct = income > 0 ? Math.max((balance / income) * 100, 0) : 0;

  els.balanceValue.textContent = money(balance);
  els.savingsRate.textContent = `${Math.round(savedPct)}% saved`;
  els.incomeValue.textContent = money(income);
  els.incomeCount.textContent = plural(incomeItems.length, "entry", "entries");
  els.expenseValue.textContent = money(expenses);
  els.expenseCount.textContent = plural(expenseItems.length, "entry", "entries");
  els.budgetLeftValue.textContent = money(budgetLeft);
  els.budgetProgress.style.width = `${usedPct}%`;
  els.monthLabel.textContent = monthName(state.filters.month);
}

function renderBudgetEditor() {
  const expenseCategories = getCategories().filter((category) => !["Salary", "Freelance"].includes(category));
  els.categoryBudgetList.innerHTML = expenseCategories
    .slice(0, 9)
    .map((category) => {
      const value = state.settings.categoryBudgets?.[category] ?? 0;
      return `
        <div class="budget-row">
          <label for="budget-${slug(category)}">${escapeHtml(category)}</label>
          <input id="budget-${slug(category)}" data-category="${escapeHtml(category)}" type="number" min="0" step="1" value="${value}">
        </div>
      `;
    })
    .join("");
}

function renderCharts() {
  const monthTransactions = getMonthTransactions();
  const categoryTotals = getCategoryTotals(monthTransactions);
  const total = Object.values(categoryTotals).reduce((acc, value) => acc + value, 0);

  els.donutTotal.textContent = compactMoney(total);

  if (total <= 0) {
    els.donutChart.style.background = "conic-gradient(var(--line) 0 100%)";
    els.categoryBreakdown.innerHTML = `<div class="empty-state">No expenses for ${escapeHtml(monthName(state.filters.month))}</div>`;
  } else {
    let cursor = 0;
    const segments = Object.entries(categoryTotals).map(([category, amount], index) => {
      const start = cursor;
      const pct = (amount / total) * 100;
      cursor += pct;
      return `${categoryColor(category, index)} ${start}% ${cursor}%`;
    });
    els.donutChart.style.background = `conic-gradient(${segments.join(", ")})`;
    els.categoryBreakdown.innerHTML = Object.entries(categoryTotals)
      .map(([category, amount], index) => {
        const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
        return `
          <div class="category-row">
            <span class="swatch" style="background:${categoryColor(category, index)}"></span>
            <div class="category-copy">
              <strong>${escapeHtml(category)}</strong>
              <span>${pct}% of spending</span>
            </div>
            <strong>${money(amount)}</strong>
          </div>
        `;
      })
      .join("");
  }

  renderTrend(monthTransactions);
}

function renderTrend(monthTransactions) {
  const dailyTotals = {};
  for (const item of monthTransactions) {
    if (item.type !== "expense") continue;
    dailyTotals[item.date] = (dailyTotals[item.date] || 0) + Number(item.amount);
  }

  const days = daysInSelectedMonth();
  const values = days.map((date) => dailyTotals[date] || 0);
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = days.length === 1 ? 0 : (index / (days.length - 1)) * 620 + 10;
    const y = 112 - (value / max) * 94;
    return [x, y, value];
  });

  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${path} L 630 118 L 10 118 Z`;
  const bars = points
    .filter((point) => point[2] > 0)
    .map(([x, y, value]) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${value === max ? 5 : 3.5}" />`)
    .join("");

  els.trendPeak.textContent = `${money(max)} peak`;
  els.trendChart.innerHTML = `
    <path d="${area}" class="trend-area"></path>
    <path d="${path}" class="trend-line"></path>
    ${bars}
  `;
}

function renderFilters() {
  const categories = getCategories();
  const selected = state.filters.category;
  els.categoryFilter.innerHTML = [
    `<option value="all">All</option>`,
    ...categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
  ].join("");
  els.categoryFilter.value = categories.includes(selected) ? selected : "all";
  state.filters.category = els.categoryFilter.value;
}

function renderTransactions() {
  const transactions = getFilteredTransactions();

  if (!transactions.length) {
    els.transactionList.innerHTML = `<div class="empty-state">No matching transactions</div>`;
    return;
  }

  els.transactionList.innerHTML = transactions.map((item) => {
    const amountPrefix = item.type === "income" ? "+" : "-";
    return `
      <article class="transaction-item">
        <div class="transaction-main">
          <div class="transaction-title-row">
            <span class="type-chip ${item.type}">${item.type}</span>
            <strong>${escapeHtml(item.title)}</strong>
          </div>
          <div class="transaction-meta">${escapeHtml(item.category)} | ${formatDate(item.date)} | ${escapeHtml(item.account || "Wallet")}</div>
        </div>
        <div class="transaction-amount ${item.type}">${amountPrefix}${money(item.amount)}</div>
        <div class="row-actions">
          <button class="icon-button ghost" data-action="edit" data-id="${escapeHtml(item.id)}" type="button" title="Edit" aria-label="Edit ${escapeHtml(item.title)}">
            <svg><use href="#icon-edit"></use></svg>
          </button>
          <button class="icon-button ghost" data-action="delete" data-id="${escapeHtml(item.id)}" type="button" title="Delete" aria-label="Delete ${escapeHtml(item.title)}">
            <svg><use href="#icon-trash"></use></svg>
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function startEdit(id) {
  const item = state.transactions.find((transaction) => transaction.id === id);
  if (!item) return;

  state.editingId = id;
  els.transactionId.value = id;
  els.form.querySelector(`[name="type"][value="${item.type}"]`).checked = true;
  els.titleInput.value = item.title;
  els.amountInput.value = item.amount;
  els.dateInput.value = item.date;
  els.categoryInput.value = item.category;
  els.accountInput.value = item.account || "";
  els.notesInput.value = item.notes || "";
  els.formTitle.textContent = "Edit Transaction";
  els.submitLabel.textContent = "Update";
  els.clearEditButton.classList.remove("hidden");
  els.titleInput.focus();
}

function resetForm(resetFields = true) {
  state.editingId = null;
  if (resetFields) {
    els.form.reset();
  }
  els.form.querySelector(`[name="type"][value="expense"]`).checked = true;
  els.dateInput.value = new Date().toISOString().slice(0, 10);
  els.transactionId.value = "";
  els.formTitle.textContent = "Add Transaction";
  els.submitLabel.textContent = "Save";
  els.clearEditButton.classList.add("hidden");
}

function exportCsv() {
  const rows = getFilteredTransactions();
  const headers = ["date", "type", "title", "category", "amount", "account", "notes"];
  const csv = [
    headers.join(","),
    ...rows.map((item) => headers.map((key) => csvCell(item[key])).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ledgerly-${state.filters.month || "transactions"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV exported");
}

function getFilteredTransactions() {
  return getMonthTransactions()
    .filter((item) => state.filters.type === "all" || item.type === state.filters.type)
    .filter((item) => state.filters.category === "all" || item.category === state.filters.category)
    .filter((item) => {
      if (!state.filters.search) return true;
      const haystack = `${item.title} ${item.category} ${item.account} ${item.notes}`.toLowerCase();
      return haystack.includes(state.filters.search);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function getMonthTransactions() {
  if (!state.filters.month) return state.transactions;
  return state.transactions.filter((item) => item.date.slice(0, 7) === state.filters.month);
}

function getCategoryTotals(transactions) {
  const totals = {};
  for (const item of transactions) {
    if (item.type !== "expense") continue;
    totals[item.category] = (totals[item.category] || 0) + Number(item.amount);
  }
  return Object.fromEntries(Object.entries(totals).sort((a, b) => b[1] - a[1]));
}

function getCategories() {
  return unique([
    ...defaultCategories,
    ...Object.keys(state.settings.categoryBudgets || {}),
    ...state.transactions.map((item) => item.category).filter(Boolean)
  ]).sort((a, b) => a.localeCompare(b));
}

function unique(items) {
  return [...new Set(items)];
}

function daysInSelectedMonth() {
  const [year, month] = (state.filters.month || new Date().toISOString().slice(0, 7)).split("-").map(Number);
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, index) => `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`);
}

function sum(items) {
  return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

function money(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: state.settings.currency || "INR",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function compactMoney(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: state.settings.currency || "INR",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function monthName(month) {
  if (!month) return "All months";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric"
  }).format(new Date(`${month}-01T00:00:00`));
}

function plural(count, singular, pluralLabel) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function categoryColor(category, index = 0) {
  const hash = Array.from(category).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return categoryPalette[(hash + index) % categoryPalette.length];
}

function slug(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}
