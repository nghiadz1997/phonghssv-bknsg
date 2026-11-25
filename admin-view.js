// Giao diện & Logic Dashboard Thống kê Toàn phòng & Quản lý Tài khoản (role === "admin")

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db, firebaseConfig } from "./firebase-config.js";
import {
  STAFF_ACCOUNTS,
  STAFF_LIST,
  DEFAULT_ACCOUNT_PASSWORD,
  CAMPUS_OPTIONS,
  CAMPUS_VALUES,
  getTodayLocalISO,
  getFirstDayOfMonthISO,
  addDaysISO,
  getDateRangeArray,
  formatDateVN,
  getDayOfWeekCode,
  buildAttendancePrefix,
  getRoleForPosition,
  resolveUserPosition,
  isLeaderProfile,
  escapeHtml,
  showToast
} from "./constants.js";
import { exportDailyReportsToExcel } from "./excel-export.js";

let initialized = false;
let filterMode = "single"; // "single" | "range"
let activeDetailTab = "alerts"; // "alerts" | "all"
let loadedReports = []; // Toàn bộ báo cáo trong cửa sổ truy vấn (bao gồm tối thiểu 7 ngày cho Line Chart)
let filteredReports = []; // Báo cáo sau khi lọc ngày/khoảng ngày + cơ sở + nhân sự
let cachedUsers = []; // Danh sách tài khoản từ Firestore users
let lastAdminAutoPrefix = "";
let campusChartInstance = null;
let trendChartInstance = null;

/**
 * Lấy khoảng ngày hiển thị hiện tại theo bộ lọc
 */
function getActiveDateWindow() {
  const today = getTodayLocalISO();
  if (filterMode === "single") {
    const singleDate = document.getElementById("admin-single-date")?.value || today;
    return { fromDate: singleDate, toDate: singleDate, kpiDate: singleDate };
  }
  const fromVal = document.getElementById("admin-from-date")?.value || getFirstDayOfMonthISO(today);
  const toVal = document.getElementById("admin-to-date")?.value || today;
  const safeFrom = fromVal <= toVal ? fromVal : toVal;
  const safeTo = fromVal <= toVal ? toVal : fromVal;
  return { fromDate: safeFrom, toDate: safeTo, kpiDate: safeTo };
}

/**
 * Truy vấn báo cáo từ Firestore theo khoảng ngày (chỉ lọc trên 1 trường date nên không cần composite index)
 */
async function loadAdminDashboardData() {
  const { fromDate, toDate } = getActiveDateWindow();
  // Nếu xem 1 ngày, mở rộng cửa sổ query lùi 6 ngày để biểu đồ đường hiển thị xu hướng 7 ngày
  const trendStart = filterMode === "single" ? addDaysISO(toDate, -6) : fromDate;
  const queryStart = trendStart < fromDate ? trendStart : fromDate;

  const refreshBtn = document.getElementById("btn-admin-refresh");
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    const q = query(
      collection(db, "daily_reports"),
      where("date", ">=", queryStart),
      where("date", "<=", toDate)
    );
    const snap = await getDocs(q);
    loadedReports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    applyFiltersAndRender();
  } catch (err) {
    console.error("Lỗi tải dữ liệu Admin:", err);
    showToast("Không thể tải dữ liệu báo cáo: " + err.message, "error");
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

/**
 * Lọc dữ liệu trên client theo ngày, cơ sở, nhân sự và cập nhật toàn bộ KPI, biểu đồ, bảng
 */
function applyFiltersAndRender() {
  const { fromDate, toDate, kpiDate } = getActiveDateWindow();
  const campusFilter = document.getElementById("admin-filter-campus")?.value || "ALL";
  const staffFilter = document.getElementById("admin-filter-staff")?.value || "ALL";

  const matchesStaffAndCampus = (r) => {
    if (campusFilter !== "ALL" && r.campus !== campusFilter) return false;
    if (staffFilter !== "ALL") {
      const target = STAFF_LIST.find((s) => s.fullName === staffFilter);
      const matchName = r.fullName && r.fullName.trim() === staffFilter.trim();
      const matchSheet = target && r.sheetName === target.sheetName;
      if (!matchName && !matchSheet) return false;
    }
    return true;
  };

  filteredReports = loadedReports
    .filter((r) => r.date >= fromDate && r.date <= toDate && matchesStaffAndCampus(r))
    .sort((a, b) => {
      const cmp = (b.date || "").localeCompare(a.date || "");
      if (cmp !== 0) return cmp;
      return (a.fullName || "").localeCompare(b.fullName || "", "vi");
    });

  renderKpiCards(kpiDate, campusFilter, staffFilter);
  renderCharts(fromDate, toDate, matchesStaffAndCampus);
  renderDetailTables();
}

/**
 * Hàng 1: 4 Thẻ KPI Tổng quan
 */
function renderKpiCards(kpiDate, campusFilter, staffFilter) {
  // 1. Tiến độ báo cáo ngày (tính trên kpiDate cho 11 nhân sự)
  const dayReports = loadedReports.filter((r) => r.date === kpiDate);
  const submittedNames = new Set();
  const missingStaff = [];

  STAFF_LIST.forEach((staff) => {
    const found = dayReports.some(
      (r) =>
        r.sheetName === staff.sheetName ||
        (r.fullName && r.fullName.trim() === staff.fullName.trim())
    );
    if (found) {
      submittedNames.add(staff.fullName);
    } else {
      missingStaff.push(staff.fullName);
    }
  });

  document.getElementById("kpi-progress-value").textContent = `${submittedNames.size} / ${STAFF_LIST.length}`;
  document.getElementById("kpi-progress-date").textContent = `Ngày ${formatDateVN(kpiDate)}`;
  const missingContainer = document.getElementById("kpi-missing-badges");
  if (missingStaff.length === 0) {
    missingContainer.innerHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">Đã nộp đủ 11/11</span>`;
  } else {
    missingContainer.innerHTML = missingStaff
      .map(
        (name) =>
          `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">${escapeHtml(name)}</span>`
      )
      .join("");
  }

  // 2. Tỷ lệ chuyên cần HSSV toàn trường (trên filteredReports)
  let sumStuPresent = 0;
  let sumStuTotal = 0;
  let sumClsPresent = 0;
  let sumClsTotal = 0;

  filteredReports.forEach((r) => {
    const st = Number(r.studentsTotal) || 0;
    const sp = Number(r.studentsPresent) || 0;
    const ct = Number(r.classesTotal) || 0;
    const cp = Number(r.classesPresent) || 0;
    if (st > 0) {
      sumStuTotal += st;
      sumStuPresent += sp;
    }
    if (ct > 0) {
      sumClsTotal += ct;
      sumClsPresent += cp;
    }
  });

  const stuRateEl = document.getElementById("kpi-attendance-rate");
  const stuDetailEl = document.getElementById("kpi-attendance-detail");
  if (sumStuTotal > 0) {
    const pct = ((sumStuPresent / sumStuTotal) * 100).toFixed(1);
    stuRateEl.textContent = `${pct}%`;
    const clsPart = sumClsTotal > 0 ? ` • ${sumClsPresent}/${sumClsTotal} lớp` : "";
    stuDetailEl.textContent = `${sumStuPresent}/${sumStuTotal} HSSV${clsPart}`;
  } else if (sumClsTotal > 0) {
    const clsPct = ((sumClsPresent / sumClsTotal) * 100).toFixed(1);
    stuRateEl.textContent = `${clsPct}%`;
    stuDetailEl.textContent = `${sumClsPresent}/${sumClsTotal} lớp (chưa nhập sĩ số HSSV)`;
  } else {
    stuRateEl.textContent = "—";
    stuDetailEl.textContent = "Chưa có số liệu quản sinh trong bộ lọc";
  }

  // 3. HSSV / Đầu việc cần lưu ý
  const attentionCount = filteredReports.filter((r) => Boolean((r.attentionNote || "").trim())).length;
  document.getElementById("kpi-attention-count").textContent = String(attentionCount);
  const scopeDesc =
    campusFilter !== "ALL" || staffFilter !== "ALL" ? "Theo bộ lọc hiện tại" : "Tổng số báo cáo có lưu ý";
  document.getElementById("kpi-attention-desc").textContent = scopeDesc;

  // 4. Đề xuất phát sinh
  const proposalCount = filteredReports.filter((r) => Boolean((r.proposal || "").trim())).length;
  document.getElementById("kpi-proposal-count").textContent = String(proposalCount);
  document.getElementById("kpi-proposal-desc").textContent = `${filteredReports.length} báo cáo đã ghi nhận`;
}

/**
 * Hàng 2: 2 Biểu đồ Chart.js (Bar Chart theo Cơ sở & Line Chart xu hướng chuyên cần theo ngày)
 */
function renderCharts(fromDate, toDate, matchesStaffAndCampus) {
  if (!window.Chart) return;

  // --- Biểu đồ 1: Bar Chart theo Cơ sở ---
  const campusRates = [];
  const campusCounts = [];

  CAMPUS_VALUES.forEach((campus) => {
    const list = filteredReports.filter((r) => r.campus === campus);
    campusCounts.push(list.length);
    let sp = 0;
    let st = 0;
    list.forEach((r) => {
      if ((Number(r.studentsTotal) || 0) > 0) {
        sp += Number(r.studentsPresent) || 0;
        st += Number(r.studentsTotal) || 0;
      }
    });
    campusRates.push(st > 0 ? Number(((sp / st) * 100).toFixed(1)) : 0);
  });

  const barCtx = document.getElementById("admin-campus-chart")?.getContext("2d");
  if (barCtx) {
    if (campusChartInstance) campusChartInstance.destroy();
    campusChartInstance = new window.Chart(barCtx, {
      type: "bar",
      data: {
        labels: CAMPUS_VALUES,
        datasets: [
          {
            label: "Tỷ lệ chuyên cần HSSV (%)",
            data: campusRates,
            backgroundColor: "rgba(0, 75, 141, 0.85)",
            borderColor: "#004B8D",
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: "y"
          },
          {
            label: "Số đầu việc báo cáo",
            data: campusCounts,
            backgroundColor: "rgba(245, 158, 11, 0.85)",
            borderColor: "#D97706",
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: "y1"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 12 } } }
        },
        scales: {
          y: {
            type: "linear",
            position: "left",
            min: 0,
            max: 100,
            title: { display: true, text: "Chuyên cần (%)" }
          },
          y1: {
            type: "linear",
            position: "right",
            beginAtZero: true,
            ticks: { stepSize: 1 },
            grid: { drawOnChartArea: false },
            title: { display: true, text: "Số báo cáo" }
          }
        }
      }
    });
  }

  // --- Biểu đồ 2: Line Chart xu hướng chuyên cần theo ngày ---
  const trendStart = filterMode === "single" ? addDaysISO(toDate, -6) : fromDate;
  const dateRange = getDateRangeArray(trendStart, toDate);
  const trendTitleEl = document.getElementById("admin-trend-subtitle");
  if (trendTitleEl) {
    trendTitleEl.textContent =
      filterMode === "single"
        ? `7 ngày gần nhất (${formatDateVN(trendStart)} - ${formatDateVN(toDate)})`
        : `${formatDateVN(fromDate)} - ${formatDateVN(toDate)}`;
  }

  const labels = [];
  const rateSeries = [];

  dateRange.forEach((d) => {
    labels.push(formatDateVN(d).slice(0, 5)); // DD/MM
    const dayItems = loadedReports.filter((r) => r.date === d && matchesStaffAndCampus(r));
    let sp = 0;
    let st = 0;
    dayItems.forEach((r) => {
      if ((Number(r.studentsTotal) || 0) > 0) {
        sp += Number(r.studentsPresent) || 0;
        st += Number(r.studentsTotal) || 0;
      }
    });
    rateSeries.push(st > 0 ? Number(((sp / st) * 100).toFixed(1)) : null);
  });

  const lineCtx = document.getElementById("admin-trend-chart")?.getContext("2d");
  if (lineCtx) {
    if (trendChartInstance) trendChartInstance.destroy();
    trendChartInstance = new window.Chart(lineCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Tỷ lệ chuyên cần HSSV (%)",
            data: rateSeries,
            borderColor: "#004B8D",
            backgroundColor: "rgba(0, 75, 141, 0.12)",
            pointBackgroundColor: "#F59E0B",
            pointBorderColor: "#004B8D",
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
            spanGaps: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 12 } } }
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            title: { display: true, text: "Tỷ lệ (%)" }
          }
        }
      }
    });
  }
}

/**
 * Hàng 3: Render 2 Tab dữ liệu chi tiết ("Cần lưu ý & Đề xuất" và "Toàn bộ báo cáo")
 */
function renderDetailTables() {
  const keyword = (document.getElementById("admin-search-input")?.value || "").trim().toLowerCase();

  // Tab 1: Cần lưu ý & Đề xuất
  const alertList = filteredReports.filter(
    (r) => Boolean((r.attentionNote || "").trim()) || Boolean((r.proposal || "").trim())
  );
  const alertsBadge = document.getElementById("tab-alerts-badge");
  if (alertsBadge) alertsBadge.textContent = String(alertList.length);

  const alertsContainer = document.getElementById("admin-alerts-container");
  if (alertsContainer) {
    if (alertList.length === 0) {
      alertsContainer.innerHTML = `
        <div class="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500">
          Không có trường hợp cần lưu ý hay đề xuất phát sinh trong bộ lọc hiện tại.
        </div>`;
    } else {
      alertsContainer.innerHTML = alertList
        .map((r) => {
          const hasAttention = Boolean((r.attentionNote || "").trim());
          const hasProposal = Boolean((r.proposal || "").trim());
          const borderClass = hasAttention
            ? "border-rose-200 bg-rose-50/40"
            : "border-amber-200 bg-amber-50/40";
          return `
            <div class="rounded-xl border ${borderClass} p-4 shadow-sm transition-shadow hover:shadow-md">
              <div class="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-bold text-nsg-blue text-sm">${escapeHtml(r.fullName)}</span>
                  <span class="px-2 py-0.5 rounded-md bg-blue-100 text-nsg-blue text-xs font-semibold">${escapeHtml(r.campus || "-")}</span>
                  <span class="text-xs text-slate-500">${escapeHtml(formatDateVN(r.date))} (Thứ ${escapeHtml(r.dayOfWeek || getDayOfWeekCode(r.date))})</span>
                </div>
                <div class="flex items-center gap-1.5 flex-wrap">
                  ${hasAttention ? `<span class="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-semibold">Cần lưu ý</span>` : ""}
                  ${hasProposal ? `<span class="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[11px] font-semibold">Có đề xuất</span>` : ""}
                  <button type="button" data-action="edit-report" data-id="${escapeHtml(r.id)}" class="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 text-nsg-blue border border-blue-200 text-[11px] font-semibold transition">Sửa</button>
                  <button type="button" data-action="delete-report" data-id="${escapeHtml(r.id)}" class="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-semibold transition">Xóa</button>
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                ${
                  hasAttention
                    ? `<div class="bg-white rounded-lg p-3 border border-rose-200">
                        <div class="text-xs font-bold uppercase tracking-wide text-rose-700 mb-1">HSSV / Đầu việc cần lưu ý</div>
                        <div class="text-slate-800 whitespace-pre-line">${escapeHtml(r.attentionNote)}</div>
                      </div>`
                    : ""
                }
                ${
                  hasProposal
                    ? `<div class="bg-white rounded-lg p-3 border border-amber-200">
                        <div class="text-xs font-bold uppercase tracking-wide text-amber-700 mb-1">Đề xuất từ cơ sở</div>
                        <div class="text-slate-800 whitespace-pre-line">${escapeHtml(r.proposal)}</div>
                      </div>`
                    : ""
                }
              </div>
              ${
                r.resultText || r.content
                  ? `<div class="mt-2.5 pt-2.5 border-t border-slate-200/70 text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                      ${r.content ? `<span><strong>Công việc:</strong> ${escapeHtml(r.content)}</span>` : ""}
                      ${r.resultText ? `<span><strong>Kết quả:</strong> ${escapeHtml(r.resultText)}</span>` : ""}
                    </div>`
                  : ""
              }
            </div>`;
        })
        .join("");
    }
  }

  // Tab 2: Toàn bộ báo cáo (8 cột + tìm kiếm từ khóa)
  const searchFiltered = keyword
    ? filteredReports.filter((r) => {
        const hay = [
          r.date,
          formatDateVN(r.date),
          r.fullName,
          r.content,
          r.campus,
          r.resultText,
          r.attentionNote,
          r.proposal,
          r.note
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(keyword);
      })
    : filteredReports;

  const allBadge = document.getElementById("tab-all-badge");
  if (allBadge) allBadge.textContent = String(filteredReports.length);

  const tbody = document.getElementById("admin-all-tbody");
  const mobileWrap = document.getElementById("admin-all-mobile-cards");
  if (!tbody) return;

  if (searchFiltered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="px-4 py-8 text-center text-slate-500">
          Không tìm thấy báo cáo nào phù hợp.
        </td>
      </tr>`;
    if (mobileWrap) {
      mobileWrap.innerHTML = `<div class="text-center py-6 text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">Không tìm thấy báo cáo nào phù hợp.</div>`;
    }
    return;
  }

  tbody.innerHTML = searchFiltered
    .map((r) => {
      const hasAttention = Boolean((r.attentionNote || "").trim());
      const hasProposal = Boolean((r.proposal || "").trim());
      return `
        <tr class="hover:bg-blue-50/50 border-b border-slate-100 align-top">
          <td class="px-3 py-3 whitespace-nowrap font-medium text-slate-800">${escapeHtml(formatDateVN(r.date))}</td>
          <td class="px-3 py-3 whitespace-nowrap text-center">
            <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">${escapeHtml(r.dayOfWeek || getDayOfWeekCode(r.date))}</span>
          </td>
          <td class="px-3 py-3 whitespace-nowrap font-semibold text-nsg-blue">${escapeHtml(r.fullName || "")}</td>
          <td class="px-3 py-3 min-w-[200px] whitespace-pre-line text-slate-700">${escapeHtml(r.content || "")}</td>
          <td class="px-3 py-3 whitespace-nowrap">
            <span class="px-2 py-0.5 rounded bg-blue-50 text-nsg-blue text-xs font-medium">${escapeHtml(r.campus || "-")}</span>
          </td>
          <td class="px-3 py-3 min-w-[160px] whitespace-pre-line text-slate-700">${escapeHtml(r.resultText || "")}</td>
          <td class="px-3 py-3 min-w-[150px] whitespace-pre-line ${hasAttention ? "bg-rose-50/60 text-rose-800 font-medium" : "text-slate-400"}">${escapeHtml(r.attentionNote || "—")}</td>
          <td class="px-3 py-3 min-w-[160px] whitespace-pre-line ${hasProposal ? "bg-amber-50/60 text-amber-900" : "text-slate-600"}">
            ${hasProposal ? `<div><span class="font-semibold text-amber-800">Đề xuất:</span> ${escapeHtml(r.proposal)}</div>` : ""}
            ${r.note ? `<div class="${hasProposal ? "mt-1 pt-1 border-t border-amber-200/70" : ""} text-slate-600"><span class="font-semibold">Ghi chú:</span> ${escapeHtml(r.note)}</div>` : ""}
            ${!hasProposal && !r.note ? `<span class="text-slate-400">—</span>` : ""}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-center">
            <div class="inline-flex items-center gap-1.5">
              <button type="button" data-action="edit-report" data-id="${escapeHtml(r.id)}" class="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-nsg-blue text-xs font-semibold transition">Sửa</button>
              <button type="button" data-action="delete-report" data-id="${escapeHtml(r.id)}" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition">Xóa</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  if (mobileWrap) {
    mobileWrap.innerHTML = searchFiltered
      .map((r) => {
        const hasAttention = Boolean((r.attentionNote || "").trim());
        const hasProposal = Boolean((r.proposal || "").trim());
        const dayCode = r.dayOfWeek || getDayOfWeekCode(r.date);
        return `
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div class="font-bold text-nsg-blue text-sm">${escapeHtml(r.fullName || "")}</div>
                <div class="text-[11px] text-slate-500">${escapeHtml(formatDateVN(r.date))} • Thứ ${escapeHtml(dayCode)}</div>
              </div>
              <span class="px-2 py-0.5 rounded bg-blue-50 text-nsg-blue text-[11px] font-semibold">${escapeHtml(r.campus || "-")}</span>
            </div>
            <div class="text-xs text-slate-700 whitespace-pre-line">${escapeHtml(r.content || "")}</div>
            ${r.resultText ? `<div class="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 whitespace-pre-line"><strong>Kết quả:</strong> ${escapeHtml(r.resultText)}</div>` : ""}
            ${hasAttention ? `<div class="text-xs text-rose-700 bg-rose-50 rounded-lg px-2.5 py-1.5 whitespace-pre-line"><strong>Lưu ý:</strong> ${escapeHtml(r.attentionNote)}</div>` : ""}
            ${hasProposal ? `<div class="text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5 whitespace-pre-line"><strong>Đề xuất:</strong> ${escapeHtml(r.proposal)}</div>` : ""}
            ${r.note ? `<div class="text-xs text-slate-600 whitespace-pre-line"><strong>Ghi chú:</strong> ${escapeHtml(r.note)}</div>` : ""}
            <div class="flex justify-end gap-2 pt-1.5 border-t border-slate-100">
              <button type="button" data-action="edit-report" data-id="${escapeHtml(r.id)}" class="px-3 py-1.5 rounded-lg bg-blue-50 text-nsg-blue text-xs font-semibold">Sửa</button>
              <button type="button" data-action="delete-report" data-id="${escapeHtml(r.id)}" class="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-semibold">Xóa</button>
            </div>
          </div>`;
      })
      .join("");
  }
}

/**
 * Lấy Auth instance của Secondary Firebase App (không ảnh hưởng phiên Admin đang đăng nhập)
 */
function getSecondaryAuth() {
  const existingSecondary = getApps().find((a) => a.name === "Secondary");
  const secondaryApp = existingSecondary || initializeApp(firebaseConfig, "Secondary");
  return getAuth(secondaryApp);
}

/**
 * Tải toàn bộ danh sách tài khoản từ collection users trong Firestore
 */
async function loadAllUsersFromFirestore() {
  try {
    const snap = await getDocs(collection(db, "users"));
    cachedUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return cachedUsers;
  } catch (err) {
    console.warn("Không thể đọc collection users:", err);
    return cachedUsers;
  }
}

const POSITION_BADGE_CLASSES = {
  "Trưởng Phòng": "bg-purple-100 text-purple-800 border border-purple-200",
  "Phó Trưởng Phòng": "bg-indigo-100 text-indigo-800 border border-indigo-200",
  "Chuyên Viên": "bg-teal-100 text-teal-800 border border-teal-200",
  "Nhân Viên": "bg-blue-100 text-nsg-blue border border-blue-200"
};

/**
 * Cập nhật dropdown lọc Nhân sự (gồm tất cả Nhân Viên & Chuyên Viên từ Firestore + mặc định)
 */
function refreshStaffFilterDropdown() {
  const staffEl = document.getElementById("admin-filter-staff");
  if (!staffEl) return;

  const prev = staffEl.value || "ALL";
  const staffMap = new Map();

  STAFF_LIST.forEach((s) => {
    staffMap.set(s.fullName.trim(), {
      fullName: s.fullName,
      position: s.position || "Nhân Viên"
    });
  });

  cachedUsers.forEach((u) => {
    if (!isLeaderProfile(u) && u.fullName) {
      staffMap.set(u.fullName.trim(), {
        fullName: u.fullName,
        position: resolveUserPosition(u)
      });
    }
  });

  staffEl.innerHTML =
    `<option value="ALL">Tất cả Nhân Viên &amp; Chuyên Viên</option>` +
    Array.from(staffMap.values())
      .map(
        (s) =>
          `<option value="${escapeHtml(s.fullName)}">${escapeHtml(s.fullName)} (${escapeHtml(s.position)})</option>`
      )
      .join("");

  if (Array.from(staffEl.options).some((opt) => opt.value === prev)) {
    staffEl.value = prev;
  }
}

/**
 * Hiển thị danh sách 12 tài khoản mặc định + các tài khoản đã có trong Firestore (kèm nút Sửa chức vụ & Xóa)
 */
async function refreshAccountsStatusTable(statusOverrides = new Map()) {
  const tbody = document.getElementById("provision-accounts-tbody");
  if (!tbody) return;

  await loadAllUsersFromFirestore();
  refreshStaffFilterDropdown();
  const existingByEmail = new Map();
  cachedUsers.forEach((u) => {
    if (u.email) existingByEmail.set(u.email.toLowerCase(), u);
  });

  // Hợp nhất: 12 tài khoản mặc định + tài khoản phát sinh khác trong Firestore
  const rows = [];
  const seenEmails = new Set();

  STAFF_ACCOUNTS.forEach((acc) => {
    const emailKey = acc.email.toLowerCase();
    seenEmails.add(emailKey);
    const fsUser = existingByEmail.get(emailKey);
    const position = resolveUserPosition(fsUser || acc);
    rows.push({
      uid: fsUser?.uid || fsUser?.id || "",
      fullName: fsUser?.fullName ?? acc.fullName,
      email: fsUser?.email || acc.email,
      position,
      role: fsUser?.role || getRoleForPosition(position),
      sheetName: fsUser?.sheetName ?? acc.sheetName,
      inFirestore: Boolean(fsUser)
    });
  });

  cachedUsers.forEach((u) => {
    const emailKey = (u.email || "").toLowerCase();
    if (!seenEmails.has(emailKey)) {
      const position = resolveUserPosition(u);
      rows.push({
        uid: u.uid || u.id,
        fullName: u.fullName || "",
        email: u.email || "",
        position,
        role: u.role || getRoleForPosition(position),
        sheetName: u.sheetName || "",
        inFirestore: true
      });
    }
  });

  const currentAdminUid = auth.currentUser?.uid || "";

  tbody.innerHTML = rows
    .map((acc, index) => {
      const override = statusOverrides.get(acc.email);
      let statusHtml = "";
      if (override) {
        statusHtml = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${override.badgeClass}">${escapeHtml(override.text)}</span>`;
      } else if (acc.inFirestore) {
        statusHtml = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Đã kích hoạt</span>`;
      } else {
        statusHtml = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">Chưa cấp</span>`;
      }

      const isSelf = Boolean(acc.uid && acc.uid === currentAdminUid);
      const actionsHtml = acc.inFirestore
        ? `<div class="inline-flex items-center gap-1.5">
            <button type="button" data-action="edit-user" data-uid="${escapeHtml(acc.uid)}" class="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-nsg-blue text-xs font-semibold transition">Sửa / Chức vụ</button>
            ${
              isSelf
                ? `<span class="px-2 py-1 rounded-lg bg-slate-100 text-slate-400 text-[11px] font-medium" title="Không thể tự xóa tài khoản đang đăng nhập">Đang dùng</span>`
                : `<button type="button" data-action="delete-user" data-uid="${escapeHtml(acc.uid)}" data-email="${escapeHtml(acc.email)}" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition">Xóa</button>`
            }
          </div>`
        : `<span class="text-xs text-slate-400">—</span>`;

      const badgeClass = POSITION_BADGE_CLASSES[acc.position] || POSITION_BADGE_CLASSES["Nhân Viên"];

      return `
        <tr class="border-b border-slate-100 text-sm hover:bg-slate-50/70">
          <td class="px-3 py-2.5 text-center text-slate-500">${index + 1}</td>
          <td class="px-3 py-2.5 font-medium text-slate-800">${escapeHtml(acc.fullName)}</td>
          <td class="px-3 py-2.5 font-mono text-xs text-slate-700">${escapeHtml(acc.email)}</td>
          <td class="px-3 py-2.5 whitespace-nowrap">
            <span class="px-2.5 py-0.5 rounded-md text-xs font-semibold ${badgeClass}">${escapeHtml(acc.position)}</span>
          </td>
          <td class="px-3 py-2.5 font-mono text-xs text-slate-600 whitespace-pre">${acc.sheetName ? `"${escapeHtml(acc.sheetName)}"` : "—"}</td>
          <td class="px-3 py-2.5">${statusHtml}</td>
          <td class="px-3 py-2.5 text-center whitespace-nowrap">${actionsHtml}</td>
        </tr>`;
    })
    .join("");
}

/**
 * Công cụ "Cấp 12 Tài khoản Mặc định" dùng Secondary Firebase App Instance
 * Không làm đăng xuất phiên Admin hiện tại
 */
async function handleProvision12Accounts() {
  const btn = document.getElementById("btn-run-provision-12");
  const progressText = document.getElementById("provision-progress-text");
  if (!btn) return;

  btn.disabled = true;
  const originalLabel = btn.innerHTML;
  btn.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Đang khởi tạo 12 tài khoản...`;

  const statusMap = new Map();
  let createdCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    const secondaryAuth = getSecondaryAuth();

    for (let i = 0; i < STAFF_ACCOUNTS.length; i++) {
      const acc = STAFF_ACCOUNTS[i];
      if (progressText) {
        progressText.textContent = `Đang xử lý (${i + 1}/${STAFF_ACCOUNTS.length}): ${acc.email}...`;
      }
      statusMap.set(acc.email, {
        text: "Đang xử lý...",
        badgeClass: "bg-blue-100 text-blue-800"
      });
      await refreshAccountsStatusTable(statusMap);

      try {
        const cred = await createUserWithEmailAndPassword(
          secondaryAuth,
          acc.email,
          DEFAULT_ACCOUNT_PASSWORD
        );
        const newUid = cred.user.uid;

        await setDoc(doc(db, "users", newUid), {
          uid: newUid,
          email: acc.email,
          fullName: acc.fullName,
          sheetName: acc.sheetName,
          position: acc.position,
          role: acc.role
        });

        await signOut(secondaryAuth);
        createdCount += 1;
        statusMap.set(acc.email, {
          text: "Tạo mới thành công",
          badgeClass: "bg-emerald-100 text-emerald-800"
        });
      } catch (err) {
        if (err?.code === "auth/email-already-in-use") {
          skippedCount += 1;
          statusMap.set(acc.email, {
            text: "Đã tồn tại (bỏ qua)",
            badgeClass: "bg-amber-100 text-amber-800"
          });
        } else {
          errorCount += 1;
          console.error(`Lỗi tạo tài khoản ${acc.email}:`, err);
          statusMap.set(acc.email, {
            text: `Lỗi: ${err?.code || err.message}`,
            badgeClass: "bg-rose-100 text-rose-800"
          });
        }
      }
      await refreshAccountsStatusTable(statusMap);
    }

    const summary = `Hoàn tất: Tạo mới ${createdCount}, Đã tồn tại ${skippedCount}${errorCount ? `, Lỗi ${errorCount}` : ""}.`;
    if (progressText) progressText.textContent = summary;
    showToast(summary, errorCount > 0 ? "warning" : "success", 5000);
  } catch (err) {
    console.error("Lỗi khởi tạo Secondary App:", err);
    showToast("Lỗi khi cấp tài khoản: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

/**
 * Admin thêm 1 tài khoản mới (qua Secondary App + lưu Firestore users/{uid})
 */
async function handleCreateSingleAccount(e) {
  e.preventDefault();
  const email = document.getElementById("new-acc-email").value.trim();
  const password = document.getElementById("new-acc-password").value;
  const fullName = document.getElementById("new-acc-fullname").value.trim();
  const sheetName = document.getElementById("new-acc-sheetname").value;
  const position = document.getElementById("new-acc-role").value;
  const role = getRoleForPosition(position);

  if (!email || !password || !fullName) {
    showToast("Vui lòng nhập đầy đủ Email, Mật khẩu và Họ và tên.", "warning");
    return;
  }

  const btn = document.getElementById("btn-submit-new-account");
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Đang tạo...";

  try {
    const secondaryAuth = getSecondaryAuth();
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUid = cred.user.uid;

    await setDoc(doc(db, "users", newUid), {
      uid: newUid,
      email,
      fullName,
      sheetName: role === "admin" ? sheetName : sheetName || fullName,
      position,
      role
    });
    await signOut(secondaryAuth);

    showToast(`Đã tạo tài khoản ${fullName} (${position}) thành công!`, "success");
    document.getElementById("add-account-form").reset();
    document.getElementById("new-acc-password").value = DEFAULT_ACCOUNT_PASSWORD;
    document.getElementById("add-account-form").classList.add("hidden");
    await refreshAccountsStatusTable();
  } catch (err) {
    console.error("Lỗi thêm tài khoản:", err);
    showToast("Không thể tạo tài khoản: " + (err?.code === "auth/email-already-in-use" ? "Email đã tồn tại trong Firebase Auth." : err.message), "error", 5000);
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

/**
 * Mở modal chỉnh sửa thông tin & chức vụ của tài khoản — chỉ Trưởng Phòng / Phó Trưởng Phòng
 */
function openEditUserModal(uid) {
  const userObj = cachedUsers.find((u) => (u.uid || u.id) === uid);
  if (!userObj) return;

  document.getElementById("edit-user-uid").value = uid;
  document.getElementById("edit-user-email").value = userObj.email || "";
  document.getElementById("edit-user-fullname").value = userObj.fullName || "";
  document.getElementById("edit-user-sheetname").value = userObj.sheetName || "";
  document.getElementById("edit-user-role").value = resolveUserPosition(userObj);
  document.getElementById("edit-user-modal").classList.remove("hidden");
}

async function handleSaveEditUser(e) {
  e.preventDefault();
  const uid = document.getElementById("edit-user-uid").value;
  const fullName = document.getElementById("edit-user-fullname").value.trim();
  const sheetName = document.getElementById("edit-user-sheetname").value;
  const position = document.getElementById("edit-user-role").value;
  const role = getRoleForPosition(position);

  if (!uid || !fullName) {
    showToast("Họ và tên không được để trống.", "warning");
    return;
  }
  if (uid === auth.currentUser?.uid && role !== "admin") {
    showToast("Không thể tự hạ chức vụ của chính tài khoản đang đăng nhập xuống Nhân Viên / Chuyên Viên.", "warning");
    return;
  }

  const btn = document.getElementById("btn-save-edit-user");
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Đang lưu...";

  try {
    await updateDoc(doc(db, "users", uid), {
      fullName,
      sheetName,
      position,
      role
    });
    document.getElementById("edit-user-modal").classList.add("hidden");
    showToast(`Đã cập nhật tài khoản ${fullName} (Chức vụ: ${position}).`, "success");
    await refreshAccountsStatusTable();
  } catch (err) {
    console.error("Lỗi cập nhật tài khoản:", err);
    showToast("Không thể cập nhật tài khoản: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

async function handleDeleteUser(uid, email) {
  if (!uid || uid === auth.currentUser?.uid) return;
  const ok = window.confirm(
    `Xác nhận xóa hồ sơ tài khoản ${email}?\nTài khoản này sẽ bị thu hồi quyền truy cập hệ thống ngay lập tức.`
  );
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "users", uid));
    showToast(`Đã xóa tài khoản ${email} khỏi hệ thống.`, "success");
    await refreshAccountsStatusTable();
  } catch (err) {
    console.error("Lỗi xóa tài khoản:", err);
    showToast("Không thể xóa tài khoản: " + err.message, "error");
  }
}

/**
 * Mở Modal Thêm hoặc Chỉnh sửa Báo cáo (chỉ Admin)
 */
async function openAdminReportModal(existingReport = null) {
  await loadAllUsersFromFirestore();

  const errBox = document.getElementById("admin-report-error");
  if (errBox) errBox.classList.add("hidden");

  const userSelect = document.getElementById("admin-rep-user");
  const campusSelect = document.getElementById("admin-rep-campus");

  // Hợp nhất danh sách Nhân Viên / Chuyên Viên từ Firestore users + đầy đủ 11 nhân sự mặc định
  const optionsMap = new Map();
  const seenNames = new Set();

  cachedUsers
    .filter((u) => !isLeaderProfile(u) || Boolean(u.sheetName))
    .forEach((u) => {
      const uid = u.uid || u.id;
      const name = u.fullName || u.email || uid;
      seenNames.add(name.trim());
      optionsMap.set(uid, {
        userId: uid,
        fullName: name,
        sheetName: u.sheetName || ""
      });
    });

  STAFF_LIST.forEach((s, idx) => {
    if (!seenNames.has(s.fullName.trim())) {
      const fallbackId = `staff_${idx}`;
      optionsMap.set(fallbackId, {
        userId: fallbackId,
        fullName: s.fullName,
        sheetName: s.sheetName
      });
    }
  });

  if (existingReport && existingReport.userId && !optionsMap.has(existingReport.userId)) {
    optionsMap.set(existingReport.userId, {
      userId: existingReport.userId,
      fullName: existingReport.fullName || existingReport.userId,
      sheetName: existingReport.sheetName || ""
    });
  }

  userSelect.innerHTML = Array.from(optionsMap.values())
    .map(
      (u) =>
        `<option value="${escapeHtml(u.userId)}" data-fullname="${escapeHtml(u.fullName)}" data-sheetname="${escapeHtml(u.sheetName)}">${escapeHtml(u.fullName)}</option>`
    )
    .join("");

  campusSelect.innerHTML = CAMPUS_OPTIONS.map(
    (c) => `<option value="${escapeHtml(c.value)}">${escapeHtml(c.label)}</option>`
  ).join("");

  const titleEl = document.getElementById("admin-report-modal-title");
  if (existingReport) {
    titleEl.textContent = `Chỉnh sửa Báo cáo — ${existingReport.fullName || ""}`;
    document.getElementById("admin-rep-doc-id").value = existingReport.id || "";
    userSelect.value = existingReport.userId || userSelect.options[0]?.value || "";
    document.getElementById("admin-rep-date").value = existingReport.date || getTodayLocalISO();
    campusSelect.value = existingReport.campus || "CS 01";
    document.getElementById("admin-rep-content").value = existingReport.content || "";

    const cp = existingReport.classesPresent > 0 || existingReport.classesTotal > 0 ? String(existingReport.classesPresent ?? 0) : "";
    const ct = existingReport.classesTotal > 0 ? String(existingReport.classesTotal) : "";
    const sp = existingReport.studentsPresent > 0 || existingReport.studentsTotal > 0 ? String(existingReport.studentsPresent ?? 0) : "";
    const st = existingReport.studentsTotal > 0 ? String(existingReport.studentsTotal) : "";

    document.getElementById("admin-rep-cp").value = cp;
    document.getElementById("admin-rep-ct").value = ct;
    document.getElementById("admin-rep-sp").value = sp;
    document.getElementById("admin-rep-st").value = st;
    lastAdminAutoPrefix = buildAttendancePrefix(cp, ct, sp, st);
    document.getElementById("admin-rep-result").value = existingReport.resultText || "";
    document.getElementById("admin-rep-attention").value = existingReport.attentionNote || "";
    document.getElementById("admin-rep-proposal").value = existingReport.proposal || "";
    document.getElementById("admin-rep-note").value = existingReport.note || "";
  } else {
    titleEl.textContent = "Thêm Báo cáo Mới (Admin)";
    document.getElementById("admin-rep-doc-id").value = "";
    const { kpiDate } = getActiveDateWindow();
    document.getElementById("admin-rep-date").value = kpiDate || getTodayLocalISO();
    campusSelect.value = "CS 01";
    document.getElementById("admin-rep-content").value = "";
    document.getElementById("admin-rep-cp").value = "";
    document.getElementById("admin-rep-ct").value = "";
    document.getElementById("admin-rep-sp").value = "";
    document.getElementById("admin-rep-st").value = "";
    lastAdminAutoPrefix = "";
    document.getElementById("admin-rep-result").value = "";
    document.getElementById("admin-rep-attention").value = "";
    document.getElementById("admin-rep-proposal").value = "";
    document.getElementById("admin-rep-note").value = "";
  }

  document.getElementById("admin-report-modal").classList.remove("hidden");
}

async function handleSaveAdminReport(e) {
  e.preventDefault();
  const origDocId = document.getElementById("admin-rep-doc-id").value;
  const userSelect = document.getElementById("admin-rep-user");
  const selectedOpt = userSelect.options[userSelect.selectedIndex];
  const userId = userSelect.value;
  const fullName = selectedOpt?.dataset.fullname || selectedOpt?.textContent || "";
  const sheetName = selectedOpt?.dataset.sheetname || "";
  const dateStr = document.getElementById("admin-rep-date").value;
  const campus = document.getElementById("admin-rep-campus").value;
  const content = document.getElementById("admin-rep-content").value.trim();

  if (!userId || !dateStr || !content) {
    showToast("Vui lòng chọn nhân sự, ngày và nhập nội dung công việc.", "warning");
    return;
  }

  const cpRaw = document.getElementById("admin-rep-cp").value;
  const ctRaw = document.getElementById("admin-rep-ct").value;
  const spRaw = document.getElementById("admin-rep-sp").value;
  const stRaw = document.getElementById("admin-rep-st").value;

  const classesPresent = cpRaw === "" ? 0 : Math.max(0, Number(cpRaw));
  const classesTotal = ctRaw === "" ? 0 : Math.max(0, Number(ctRaw));
  const studentsPresent = spRaw === "" ? 0 : Math.max(0, Number(spRaw));
  const studentsTotal = stRaw === "" ? 0 : Math.max(0, Number(stRaw));

  const newDocId = `${userId}_${dateStr}`;
  const payload = {
    userId,
    fullName,
    sheetName,
    date: dateStr,
    dayOfWeek: getDayOfWeekCode(dateStr),
    campus,
    content,
    classesPresent,
    classesTotal,
    studentsPresent,
    studentsTotal,
    resultText: document.getElementById("admin-rep-result").value.trim(),
    attentionNote: document.getElementById("admin-rep-attention").value.trim(),
    proposal: document.getElementById("admin-rep-proposal").value.trim(),
    note: document.getElementById("admin-rep-note").value.trim(),
    updatedAt: serverTimestamp()
  };

  const errBox = document.getElementById("admin-report-error");
  if (errBox) errBox.classList.add("hidden");

  const btn = document.getElementById("btn-save-admin-report");
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Đang lưu...";

  try {
    await setDoc(doc(db, "daily_reports", newDocId), payload, { merge: true });
    if (origDocId && origDocId !== newDocId) {
      await deleteDoc(doc(db, "daily_reports", origDocId));
    }
    document.getElementById("admin-report-modal").classList.add("hidden");
    showToast(`Đã lưu báo cáo của ${fullName} ngày ${formatDateVN(dateStr)}.`, "success");
    await loadAdminDashboardData();
  } catch (err) {
    console.error("Lỗi lưu báo cáo Admin:", err);
    const code = err?.code || "";
    if (errBox) {
      const hint =
        code === "permission-denied" || (err?.message || "").toLowerCase().includes("permissions")
          ? " — Vui lòng kiểm tra đã Publish file firestore.rules lên Firebase Console chưa."
          : "";
      errBox.textContent = `Không thể lưu báo cáo (${code || "lỗi"}): ${err?.message || ""}${hint}`;
      errBox.classList.remove("hidden");
    }
    showToast("Không thể lưu báo cáo: " + err.message, "error", 5000);
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

async function handleDeleteReport(docId) {
  const report = loadedReports.find((r) => r.id === docId);
  const label = report ? `${report.fullName} (${formatDateVN(report.date)})` : docId;
  const ok = window.confirm(`Bạn có chắc chắn muốn xóa báo cáo của ${label}? Thao tác này không thể hoàn tác.`);
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "daily_reports", docId));
    showToast(`Đã xóa báo cáo ${label}.`, "success");
    await loadAdminDashboardData();
  } catch (err) {
    console.error("Lỗi xóa báo cáo:", err);
    showToast("Không thể xóa báo cáo: " + err.message, "error");
  }
}

/**
 * Chuyển đổi qua lại giữa chế độ lọc 1 ngày / khoảng ngày
 */
function setFilterMode(mode) {
  filterMode = mode;
  const singleWrap = document.getElementById("admin-single-date-wrap");
  const rangeWrap = document.getElementById("admin-range-date-wrap");
  const btnSingle = document.getElementById("btn-mode-single");
  const btnRange = document.getElementById("btn-mode-range");

  if (mode === "single") {
    singleWrap.classList.remove("hidden");
    rangeWrap.classList.add("hidden");
    btnSingle.className = "px-3 py-1.5 rounded-md text-xs font-semibold bg-nsg-blue text-white shadow-sm";
    btnRange.className = "px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900";
  } else {
    singleWrap.classList.add("hidden");
    rangeWrap.classList.remove("hidden");
    btnRange.className = "px-3 py-1.5 rounded-md text-xs font-semibold bg-nsg-blue text-white shadow-sm";
    btnSingle.className = "px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900";
  }
}

/**
 * Chuyển đổi tab dữ liệu chi tiết
 */
function setDetailTab(tab) {
  activeDetailTab = tab;
  const alertsPanel = document.getElementById("admin-tab-panel-alerts");
  const allPanel = document.getElementById("admin-tab-panel-all");
  const btnAlerts = document.getElementById("btn-tab-alerts");
  const btnAll = document.getElementById("btn-tab-all");

  if (tab === "alerts") {
    alertsPanel.classList.remove("hidden");
    allPanel.classList.add("hidden");
    btnAlerts.className =
      "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 border-nsg-blue text-nsg-blue";
    btnAll.className =
      "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800";
  } else {
    alertsPanel.classList.add("hidden");
    allPanel.classList.remove("hidden");
    btnAll.className =
      "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 border-nsg-blue text-nsg-blue";
    btnAlerts.className =
      "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800";
  }
}

/**
 * Gắn event listeners 1 lần cho Admin View
 */
function bindAdminViewEvents() {
  if (initialized) return;
  initialized = true;

  // Populate dropdown Cơ sở & Nhân sự
  const campusEl = document.getElementById("admin-filter-campus");
  if (campusEl) {
    campusEl.innerHTML =
      `<option value="ALL">Tất cả cơ sở</option>` +
      CAMPUS_OPTIONS.map((c) => `<option value="${escapeHtml(c.value)}">${escapeHtml(c.label)}</option>`).join("");
  }

  const staffEl = document.getElementById("admin-filter-staff");
  if (staffEl) {
    staffEl.innerHTML =
      `<option value="ALL">Tất cả 11 nhân sự</option>` +
      STAFF_LIST.map((s) => `<option value="${escapeHtml(s.fullName)}">${escapeHtml(s.fullName)}</option>`).join("");
  }

  document.getElementById("btn-mode-single")?.addEventListener("click", () => {
    setFilterMode("single");
    loadAdminDashboardData();
  });
  document.getElementById("btn-mode-range")?.addEventListener("click", () => {
    setFilterMode("range");
    loadAdminDashboardData();
  });

  // Quick date presets
  document.getElementById("btn-quick-today")?.addEventListener("click", () => {
    const today = getTodayLocalISO();
    document.getElementById("admin-single-date").value = today;
    setFilterMode("single");
    loadAdminDashboardData();
  });
  document.getElementById("btn-quick-7days")?.addEventListener("click", () => {
    const today = getTodayLocalISO();
    document.getElementById("admin-from-date").value = addDaysISO(today, -6);
    document.getElementById("admin-to-date").value = today;
    setFilterMode("range");
    loadAdminDashboardData();
  });
  document.getElementById("btn-quick-month")?.addEventListener("click", () => {
    const today = getTodayLocalISO();
    document.getElementById("admin-from-date").value = getFirstDayOfMonthISO(today);
    document.getElementById("admin-to-date").value = today;
    setFilterMode("range");
    loadAdminDashboardData();
  });

  document.getElementById("admin-single-date")?.addEventListener("change", loadAdminDashboardData);
  document.getElementById("admin-from-date")?.addEventListener("change", loadAdminDashboardData);
  document.getElementById("admin-to-date")?.addEventListener("change", loadAdminDashboardData);
  document.getElementById("btn-admin-refresh")?.addEventListener("click", loadAdminDashboardData);

  campusEl?.addEventListener("change", applyFiltersAndRender);
  staffEl?.addEventListener("change", applyFiltersAndRender);
  document.getElementById("admin-search-input")?.addEventListener("input", renderDetailTables);

  document.getElementById("btn-tab-alerts")?.addEventListener("click", () => setDetailTab("alerts"));
  document.getElementById("btn-tab-all")?.addEventListener("click", () => setDetailTab("all"));

  // Xuất Excel 11 sheets (Admin)
  document.getElementById("btn-admin-export-excel")?.addEventListener("click", () => {
    const today = getTodayLocalISO();
    const { fromDate, toDate } = getActiveDateWindow();
    window.openExportExcelModal({
      mode: "admin",
      defaultFrom: filterMode === "single" ? getFirstDayOfMonthISO(fromDate) : fromDate,
      defaultTo: toDate || today,
      onConfirm: async (expFrom, expTo) => {
        const q = query(
          collection(db, "daily_reports"),
          where("date", ">=", expFrom),
          where("date", "<=", expTo)
        );
        const snap = await getDocs(q);
        const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        await exportDailyReportsToExcel({
          mode: "admin",
          fromDate: expFrom,
          toDate: expTo,
          reports
        });
      }
    });
  });

  // Modal Quản lý Tài khoản & Chức vụ (Chỉ Admin)
  const provisionModal = document.getElementById("provision-modal");
  document.getElementById("btn-open-provision-modal")?.addEventListener("click", async () => {
    provisionModal.classList.remove("hidden");
    document.getElementById("provision-progress-text").textContent =
      `Mật khẩu mặc định khi tạo mới: ${DEFAULT_ACCOUNT_PASSWORD}`;
    await refreshAccountsStatusTable();
  });
  document.getElementById("btn-close-provision-modal")?.addEventListener("click", () => {
    provisionModal.classList.add("hidden");
  });
  document.getElementById("btn-run-provision-12")?.addEventListener("click", handleProvision12Accounts);

  // Thêm tài khoản mới (Admin)
  const addAccForm = document.getElementById("add-account-form");
  document.getElementById("btn-toggle-add-account")?.addEventListener("click", () => {
    addAccForm.classList.toggle("hidden");
  });
  document.getElementById("btn-cancel-add-account")?.addEventListener("click", () => {
    addAccForm.classList.add("hidden");
  });
  addAccForm?.addEventListener("submit", handleCreateSingleAccount);

  // Sửa chức vụ / Xóa tài khoản trong bảng (Admin)
  document.getElementById("provision-accounts-tbody")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const uid = btn.dataset.uid;
    if (action === "edit-user") {
      openEditUserModal(uid);
    } else if (action === "delete-user") {
      handleDeleteUser(uid, btn.dataset.email || "");
    }
  });

  document.getElementById("btn-close-edit-user")?.addEventListener("click", () => {
    document.getElementById("edit-user-modal").classList.add("hidden");
  });
  document.getElementById("edit-user-form")?.addEventListener("submit", handleSaveEditUser);

  // Thêm / Sửa / Xóa Báo cáo (Chỉ Admin mới có quyền xóa)
  document.getElementById("btn-admin-add-report")?.addEventListener("click", () => {
    openAdminReportModal(null);
  });
  document.getElementById("btn-admin-add-report-top")?.addEventListener("click", () => {
    openAdminReportModal(null);
  });
  document.getElementById("btn-close-admin-report")?.addEventListener("click", () => {
    document.getElementById("admin-report-modal").classList.add("hidden");
  });
  document.getElementById("admin-report-form")?.addEventListener("submit", handleSaveAdminReport);

  ["admin-rep-cp", "admin-rep-ct", "admin-rep-sp", "admin-rep-st"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      const cp = document.getElementById("admin-rep-cp").value;
      const ct = document.getElementById("admin-rep-ct").value;
      const sp = document.getElementById("admin-rep-sp").value;
      const st = document.getElementById("admin-rep-st").value;
      const newPrefix = buildAttendancePrefix(cp, ct, sp, st);
      const resEl = document.getElementById("admin-rep-result");
      const curr = resEl.value;
      if (!curr.trim()) {
        resEl.value = newPrefix;
      } else if (lastAdminAutoPrefix && curr.startsWith(lastAdminAutoPrefix)) {
        resEl.value = newPrefix + curr.slice(lastAdminAutoPrefix.length);
      } else if (newPrefix) {
        resEl.value = newPrefix + (curr ? ` — ${curr}` : "");
      }
      lastAdminAutoPrefix = newPrefix;
    });
  });

  const handleReportTableAction = (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const docId = btn.dataset.id;
    if (action === "edit-report") {
      const target = loadedReports.find((r) => r.id === docId);
      if (target) openAdminReportModal(target);
    } else if (action === "delete-report") {
      handleDeleteReport(docId);
    }
  };
  document.getElementById("admin-alerts-container")?.addEventListener("click", handleReportTableAction);
  document.getElementById("admin-all-tbody")?.addEventListener("click", handleReportTableAction);
  document.getElementById("admin-all-mobile-cards")?.addEventListener("click", handleReportTableAction);
}

/**
 * Khởi tạo Admin View sau khi đăng nhập
 */
export async function initAdminView() {
  bindAdminViewEvents();
  const today = getTodayLocalISO();
  document.getElementById("admin-single-date").value = today;
  document.getElementById("admin-from-date").value = getFirstDayOfMonthISO(today);
  document.getElementById("admin-to-date").value = today;
  setFilterMode("single");
  setDetailTab("alerts");
  await loadAllUsersFromFirestore();
  refreshStaffFilterDropdown();
  await loadAdminDashboardData();
}
