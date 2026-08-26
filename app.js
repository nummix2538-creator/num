const STORAGE_KEY = "incomeExpenseTransactionsV1";
const $ = (id) => document.getElementById(id);

let transactions = loadTransactions();

const form = $("transactionForm");
const body = $("transactionBody");
const emptyState = $("emptyState");
const searchInput = $("searchInput");
const typeFilter = $("typeFilter");
const monthFilter = $("monthFilter");

$("date").value = new Date().toISOString().slice(0, 10);

function loadTransactions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

function money(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2
  }).format(value);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function getFiltered() {
  const q = searchInput.value.trim().toLowerCase();
  const type = typeFilter.value;
  const month = monthFilter.value;

  return transactions
    .filter(t => type === "all" || t.type === type)
    .filter(t => !month || t.date.startsWith(month))
    .filter(t => {
      if (!q) return true;
      return [t.category, t.branch, t.description, t.date]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function render() {
  const filtered = getFiltered();
  body.innerHTML = "";

  filtered.forEach(t => {
    const tr = document.createElement("tr");
    const isIncome = t.type === "income";
    tr.innerHTML = `
      <td>${escapeHtml(t.date)}</td>
      <td><span class="badge ${isIncome ? "badge-income" : "badge-expense"}">${isIncome ? "รายรับ" : "รายจ่าย"}</span></td>
      <td>${escapeHtml(t.category)}</td>
      <td>${escapeHtml(t.branch)}</td>
      <td>${escapeHtml(t.description)}</td>
      <td class="right ${isIncome ? "amount-income" : "amount-expense"}">${isIncome ? "+" : "-"}${money(t.amount)}</td>
      <td class="right"><button class="delete-btn" data-id="${t.id}" title="ลบรายการ">×</button></td>
    `;
    body.appendChild(tr);
  });

  emptyState.style.display = filtered.length ? "none" : "block";
  updateSummary(filtered);
  updateCategoryReport(filtered);
}

function updateSummary(items) {
  const income = items.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = items.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  $("totalIncome").textContent = money(income);
  $("totalExpense").textContent = money(expense);
  $("netBalance").textContent = money(income - expense);
  $("transactionCount").textContent = items.length.toLocaleString("th-TH");
}

function updateCategoryReport(items) {
  const grouped = {};
  items.forEach(t => {
    const key = `${t.type}|||${t.category}`;
    grouped[key] = (grouped[key] || 0) + t.amount;
  });

  const rows = Object.entries(grouped)
    .sort((a, b) => b[1] - a[1])
    .map(([key, total]) => {
      const [type, category] = key.split("|||");
      return `<div class="report-item">
        <div class="row">
          <strong>${escapeHtml(category)}</strong>
          <span class="${type === "income" ? "amount-income" : "amount-expense"}">${money(total)}</span>
        </div>
        <small>${type === "income" ? "รายรับ" : "รายจ่าย"}</small>
      </div>`;
    });

  $("categoryReport").innerHTML = rows.join("") || `<div class="empty-state"><p>ยังไม่มีข้อมูลสำหรับสรุป</p></div>`;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const amount = Number(data.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return;

  transactions.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    date: data.get("date"),
    type: data.get("type"),
    category: String(data.get("category")).trim(),
    branch: String(data.get("branch")).trim(),
    description: String(data.get("description")).trim(),
    amount,
    createdAt: Date.now()
  });

  saveTransactions();
  form.reset();
  $("date").value = new Date().toISOString().slice(0, 10);
  $("branch").value = "สาขาหลัก";
  render();
});

body.addEventListener("click", (e) => {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;
  if (!confirm("ยืนยันการลบรายการนี้?")) return;
  transactions = transactions.filter(t => t.id !== btn.dataset.id);
  saveTransactions();
  render();
});

[searchInput, typeFilter, monthFilter].forEach(el => el.addEventListener("input", render));

$("resetFiltersBtn").addEventListener("click", () => {
  searchInput.value = "";
  typeFilter.value = "all";
  monthFilter.value = "";
  render();
});

$("clearAllBtn").addEventListener("click", () => {
  if (!transactions.length) return;
  if (!confirm("ต้องการลบข้อมูลทั้งหมดจริงหรือไม่? การทำรายการนี้ย้อนกลับไม่ได้")) return;
  transactions = [];
  saveTransactions();
  render();
});

$("exportCsvBtn").addEventListener("click", () => {
  const rows = [["วันที่","ประเภท","หมวดหมู่","สาขา","รายละเอียด","จำนวนเงิน"]];
  getFiltered().forEach(t => rows.push([
    t.date,
    t.type === "income" ? "รายรับ" : "รายจ่าย",
    t.category,
    t.branch,
    t.description,
    t.amount.toFixed(2)
  ]));
  const csv = "\uFEFF" + rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  downloadBlob(csv, "transactions.csv", "text/csv;charset=utf-8");
});

$("backupBtn").addEventListener("click", () => {
  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), transactions }, null, 2);
  downloadBlob(payload, "income-expense-backup.json", "application/json");
});

$("restoreInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = Array.isArray(parsed) ? parsed : parsed.transactions;
    if (!Array.isArray(incoming)) throw new Error("Invalid format");
    if (!confirm(`พบ ${incoming.length} รายการ ต้องการแทนที่ข้อมูลปัจจุบันหรือไม่?`)) return;
    transactions = incoming;
    saveTransactions();
    render();
  } catch {
    alert("ไฟล์สำรองไม่ถูกต้อง");
  } finally {
    e.target.value = "";
  }
});

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

render();
