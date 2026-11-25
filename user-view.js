// Giao diện & Logic cho Nhân sự Phòng HSSV (role === "user")

import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase-config.js";
import {
  CAMPUS_OPTIONS,
  getTodayLocalISO,
  getFirstDayOfMonthISO,
  getDayOfWeekCode,
  getDayOfWeekLabel,
  formatDateVN,
  buildAttendancePrefix,
  escapeHtml,
  showToast
} from "./constants.js";
import { exportDailyReportsToExcel } from "./excel-export.js";

let currentUser = null;
let currentProfile = null;
let allUserReports = []; // Cache toàn bộ báo cáo của user hiện tại để lọc & sao chép nhanh không cần composite index
let lastAutoResultPrefix = "";
let initialized = false;

/**
 * Cập nhật nhãn Thứ (2 -> CN) khi ngày thay đổi
 */
function updateDayOfWeekBadge(dateStr) {
  const badge = document.getElementById("user-day-badge");
  if (!badge) return;
  const code = getDayOfWeekCode(dateStr);
  const label = getDayOfWeekLabel(code);
  badge.textContent = label ? `${label} (Thứ: ${code})` : "";
  if (code === "CN") {
    badge.className =
      "inline-flex items-center px-3 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200";
  } else {
    badge.className =
      "inline-flex items-center px-3 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-nsg-blue border border-blue-200";
  }
}

/**
 * Điền dữ liệu lên form báo cáo ngày
 */
function populateForm(data, dateStr) {
  const statusBadge = document.getElementById("user-form-mode-badge");
  const campusEl = document.getElementById("user-campus");
  const contentEl = document.getElementById("user-content");
  const cpEl = document.getElementById("user-classes-present");
  const ctEl = document.getElementById("user-classes-total");
  const spEl = document.getElementById("user-students-present");
  const stEl = document.getElementById("user-students-total");
  const resultEl = document.getElementById("user-result-text");
  const attentionEl = document.getElementById("user-attention-note");
  const proposalEl = document.getElementById("user-proposal");
  const noteEl = document.getElementById("user-note");

  updateDayOfWeekBadge(dateStr);

  if (data) {
    statusBadge.textContent = `Đã có báo cáo ngày ${formatDateVN(dateStr)} — Chế độ cập nhật`;
    statusBadge.className =
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200";

    campusEl.value = data.campus || "CS 01";
    contentEl.value = data.content || "";
    cpEl.value = data.classesPresent > 0 || data.classesTotal > 0 ? String(data.classesPresent ?? 0) : "";
    ctEl.value = data.classesTotal > 0 ? String(data.classesTotal) : "";
    spEl.value = data.studentsPresent > 0 || data.studentsTotal > 0 ? String(data.studentsPresent ?? 0) : "";
    stEl.value = data.studentsTotal > 0 ? String(data.studentsTotal) : "";

    lastAutoResultPrefix = buildAttendancePrefix(cpEl.value, ctEl.value, spEl.value, stEl.value);
    resultEl.value = data.resultText || "";
    attentionEl.value = data.attentionNote || "";
    proposalEl.value = data.proposal || "";
    noteEl.value = data.note || "";
  } else {
    statusBadge.textContent = `Chưa có báo cáo ngày ${formatDateVN(dateStr)} — Tạo mới`;
    statusBadge.className =
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200";

    campusEl.value = "CS 01";
    contentEl.value = "";
    cpEl.value = "";
    ctEl.value = "";
    spEl.value = "";
    stEl.value = "";
    lastAutoResultPrefix = "";
    resultEl.value = "";
    attentionEl.value = "";
    proposalEl.value = "";
    noteEl.value = "";
  }
}

/**
 * Tải báo cáo của 1 ngày cụ thể từ Firestore (daily_reports/${uid}_${date})
 */
async function loadReportForDate(dateStr) {
  if (!currentUser || !dateStr) return;
  const docId = `${currentUser.uid}_${dateStr}`;
  try {
    const snap = await getDoc(doc(db, "daily_reports", docId));
    populateForm(snap.exists() ? snap.data() : null, dateStr);
  } catch (err) {
    console.error("Lỗi tải báo cáo ngày:", err);
    showToast("Không thể tải dữ liệu ngày đã chọn: " + err.message, "error");
  }
}

/**
 * Tải toàn bộ lịch sử báo cáo của nhân sự đang đăng nhập
 */
async function fetchUserHistory() {
  if (!currentUser) return;
  const tbody = document.getElementById("user-history-tbody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Đang tải lịch sử báo cáo...</td></tr>`;
  }

  try {
    const q = query(
      collection(db, "daily_reports"),
      where("userId", "==", currentUser.uid)
    );
    const snap = await getDocs(q);
    allUserReports = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    renderHistoryTable();
  } catch (err) {
    console.error("Lỗi tải lịch sử:", err);
    showToast("Không thể tải lịch sử báo cáo: " + err.message, "error");
  }
}

/**
 * Lọc và render bảng lịch sử cá nhân
 */
function renderHistoryTable() {
  const fromDate = document.getElementById("user-history-from")?.value || "";
  const toDate = document.getElementById("user-history-to")?.value || "";
  const tbody = document.getElementById("user-history-tbody");
  const mobileWrap = document.getElementById("user-history-mobile-cards");
  const countBadge = document.getElementById("user-history-count");
  if (!tbody) return;

  const filtered = allUserReports.filter((r) => {
    if (fromDate && r.date < fromDate) return false;
    if (toDate && r.date > toDate) return false;
    return true;
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} báo cáo`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="px-4 py-8 text-center text-slate-500">
          Chưa có báo cáo nào trong khoảng thời gian đã chọn.
        </td>
      </tr>`;
    if (mobileWrap) {
      mobileWrap.innerHTML = `<div class="text-center py-6 text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">Chưa có báo cáo nào trong khoảng thời gian đã chọn.</div>`;
    }
    return;
  }

  tbody.innerHTML = filtered
    .map((r) => {
      const hasAttention = Boolean((r.attentionNote || "").trim());
      const hasProposal = Boolean((r.proposal || "").trim());
      return `
        <tr data-date="${escapeHtml(r.date)}" class="hover:bg-blue-50/70 cursor-pointer transition-colors border-b border-slate-100">
          <td class="px-3 py-3 whitespace-nowrap font-semibold text-nsg-blue">${escapeHtml(formatDateVN(r.date))}</td>
          <td class="px-3 py-3 whitespace-nowrap text-center">
            <span class="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">${escapeHtml(r.dayOfWeek || getDayOfWeekCode(r.date))}</span>
          </td>
          <td class="px-3 py-3 whitespace-nowrap">
            <span class="inline-block px-2 py-0.5 rounded bg-blue-50 text-nsg-blue text-xs font-medium">${escapeHtml(r.campus || "-")}</span>
          </td>
          <td class="px-3 py-3 min-w-[220px] max-w-xs text-slate-700 whitespace-pre-line">${escapeHtml(r.content || "")}</td>
          <td class="px-3 py-3 min-w-[160px] text-slate-700 whitespace-pre-line">${escapeHtml(r.resultText || "")}</td>
          <td class="px-3 py-3 min-w-[150px] whitespace-pre-line ${hasAttention ? "text-rose-700 font-medium bg-rose-50/50" : "text-slate-400"}">${escapeHtml(r.attentionNote || "—")}</td>
          <td class="px-3 py-3 min-w-[150px] whitespace-pre-line ${hasProposal ? "text-amber-800 font-medium bg-amber-50/50" : "text-slate-400"}">${escapeHtml(r.proposal || "—")}</td>
        </tr>`;
    })
    .join("");

  if (mobileWrap) {
    mobileWrap.innerHTML = filtered
      .map((r) => {
        const hasAttention = Boolean((r.attentionNote || "").trim());
        const hasProposal = Boolean((r.proposal || "").trim());
        const dayCode = r.dayOfWeek || getDayOfWeekCode(r.date);
        return `
          <div data-date="${escapeHtml(r.date)}" class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs active:bg-blue-50/70 cursor-pointer space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="font-bold text-nsg-blue text-sm">${escapeHtml(formatDateVN(r.date))}</span>
                <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">Thứ ${escapeHtml(dayCode)}</span>
              </div>
              <span class="px-2 py-0.5 rounded bg-blue-50 text-nsg-blue text-[11px] font-semibold">${escapeHtml(r.campus || "-")}</span>
            </div>
            <div class="text-xs text-slate-700 whitespace-pre-line">${escapeHtml(r.content || "")}</div>
            ${r.resultText ? `<div class="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 whitespace-pre-line"><strong>Kết quả:</strong> ${escapeHtml(r.resultText)}</div>` : ""}
            ${hasAttention ? `<div class="text-xs text-rose-700 bg-rose-50 rounded-lg px-2.5 py-1.5 whitespace-pre-line"><strong>Lưu ý:</strong> ${escapeHtml(r.attentionNote)}</div>` : ""}
            ${hasProposal ? `<div class="text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5 whitespace-pre-line"><strong>Đề xuất:</strong> ${escapeHtml(r.proposal)}</div>` : ""}
            <div class="text-[11px] font-semibold text-nsg-blue text-right">Chạm để chỉnh sửa →</div>
          </div>`;
      })
      .join("");
  }
}

/**
 * Sao chép nội dung công việc từ ngày gần nhất trước ngày đang chọn
 */
function handleCopyNearestContent() {
  const selectedDate = document.getElementById("user-report-date").value;
  if (!allUserReports.length) {
    showToast("Chưa có báo cáo trước đó để sao chép.", "warning");
    return;
  }

  // Ưu tiên báo cáo gần nhất trước ngày đang chọn; nếu không có thì lấy báo cáo mới nhất bất kỳ có nội dung
  const prior = allUserReports.find((r) => r.date < selectedDate && (r.content || "").trim());
  const fallback = allUserReports.find((r) => r.date !== selectedDate && (r.content || "").trim());
  const source = prior || fallback;

  if (!source) {
    showToast("Không tìm thấy nội dung công việc từ các ngày trước.", "warning");
    return;
  }

  document.getElementById("user-content").value = source.content || "";
  if (source.campus) {
    document.getElementById("user-campus").value = source.campus;
  }
  showToast(`Đã sao chép nội dung từ ngày ${formatDateVN(source.date)}.`, "success");
}

/**
 * Lưu báo cáo ngày lên Firestore với ID cố định ${uid}_${date} và merge: true
 */
async function handleSaveReport(e) {
  e.preventDefault();
  if (!currentUser || !currentProfile) return;

  const dateStr = document.getElementById("user-report-date").value;
  const campus = document.getElementById("user-campus").value;
  const content = document.getElementById("user-content").value.trim();
  const cpRaw = document.getElementById("user-classes-present").value;
  const ctRaw = document.getElementById("user-classes-total").value;
  const spRaw = document.getElementById("user-students-present").value;
  const stRaw = document.getElementById("user-students-total").value;
  const resultText = document.getElementById("user-result-text").value.trim();
  const attentionNote = document.getElementById("user-attention-note").value.trim();
  const proposal = document.getElementById("user-proposal").value.trim();
  const note = document.getElementById("user-note").value.trim();

  if (!dateStr) {
    showToast("Vui lòng chọn ngày báo cáo.", "warning");
    return;
  }
  if (!content) {
    showToast("Vui lòng nhập Nội dung công việc.", "warning");
    document.getElementById("user-content").focus();
    return;
  }

  const classesPresent = cpRaw === "" ? 0 : Math.max(0, Number(cpRaw));
  const classesTotal = ctRaw === "" ? 0 : Math.max(0, Number(ctRaw));
  const studentsPresent = spRaw === "" ? 0 : Math.max(0, Number(spRaw));
  const studentsTotal = stRaw === "" ? 0 : Math.max(0, Number(stRaw));

  if ((classesTotal > 0 && classesPresent > classesTotal) || (studentsTotal > 0 && studentsPresent > studentsTotal)) {
    showToast("Số lớp/HSSV đi học không được lớn hơn tổng số.", "warning");
    return;
  }

  const errBox = document.getElementById("user-report-error");
  if (errBox) errBox.classList.add("hidden");

  const submitBtn = document.getElementById("btn-save-user-report");
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Đang lưu...`;

  try {
    const docId = `${currentUser.uid}_${dateStr}`;
    const payload = {
      userId: currentUser.uid,
      fullName: currentProfile.fullName,
      sheetName: currentProfile.sheetName || "",
      date: dateStr,
      dayOfWeek: getDayOfWeekCode(dateStr),
      campus,
      content,
      classesPresent,
      classesTotal,
      studentsPresent,
      studentsTotal,
      resultText,
      attentionNote,
      proposal,
      note,
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, "daily_reports", docId), payload, { merge: true });
    showToast(`Đã lưu báo cáo ngày ${formatDateVN(dateStr)} thành công!`, "success");

    // Cập nhật trạng thái form & tải lại lịch sử
    populateForm(payload, dateStr);
    await fetchUserHistory();
  } catch (err) {
    console.error("Lỗi lưu báo cáo:", err);
    const code = err?.code || "";
    if (errBox) {
      const hint =
        code === "permission-denied" || (err?.message || "").toLowerCase().includes("permissions")
          ? " — Vui lòng kiểm tra đã Publish file firestore.rules lên Firebase Console chưa."
          : "";
      errBox.textContent = `Lưu báo cáo thất bại (${code || "lỗi"}): ${err?.message || ""}${hint}`;
      errBox.classList.remove("hidden");
    }
    showToast("Lưu báo cáo thất bại: " + err.message, "error", 5000);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

/**
 * Gắn event listeners 1 lần duy nhất cho User View
 */
function bindUserViewEvents() {
  if (initialized) return;
  initialized = true;

  // Render danh sách cơ sở
  const campusSelect = document.getElementById("user-campus");
  if (campusSelect) {
    campusSelect.innerHTML = CAMPUS_OPTIONS.map(
      (opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`
    ).join("");
  }

  // Đổi ngày báo cáo -> tự động tải dữ liệu nếu đã có
  const dateInput = document.getElementById("user-report-date");
  dateInput?.addEventListener("change", (e) => {
    loadReportForDate(e.target.value);
  });

  // 4 ô nhập số Quản sinh -> tự động ghép chuỗi chuẩn mẫu vào ô Kết quả
  const numericIds = [
    "user-classes-present",
    "user-classes-total",
    "user-students-present",
    "user-students-total"
  ];
  numericIds.forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      const cp = document.getElementById("user-classes-present").value;
      const ct = document.getElementById("user-classes-total").value;
      const sp = document.getElementById("user-students-present").value;
      const st = document.getElementById("user-students-total").value;
      const newPrefix = buildAttendancePrefix(cp, ct, sp, st);
      const resultEl = document.getElementById("user-result-text");
      const currentVal = resultEl.value;

      if (!currentVal.trim()) {
        resultEl.value = newPrefix;
      } else if (lastAutoResultPrefix && currentVal.startsWith(lastAutoResultPrefix)) {
        const suffix = currentVal.slice(lastAutoResultPrefix.length);
        resultEl.value = newPrefix + suffix;
      } else if (newPrefix) {
        // Nếu trước đó chưa có prefix tự động nhưng người dùng đã gõ text tùy ý
        resultEl.value = newPrefix + (currentVal ? ` — ${currentVal}` : "");
      }
      lastAutoResultPrefix = newPrefix;
    });
  });

  // Sao chép nội dung ngày gần nhất
  document.getElementById("btn-copy-nearest-content")?.addEventListener("click", handleCopyNearestContent);

  // Submit form lưu báo cáo
  document.getElementById("user-report-form")?.addEventListener("submit", handleSaveReport);

  // Bộ lọc tháng -> tự động đồng bộ Từ ngày / Đến ngày
  document.getElementById("user-history-month")?.addEventListener("change", (e) => {
    const val = e.target.value; // YYYY-MM
    if (!val) return;
    const [y, m] = val.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    document.getElementById("user-history-from").value = `${val}-01`;
    document.getElementById("user-history-to").value = `${val}-${String(lastDay).padStart(2, "0")}`;
    renderHistoryTable();
  });

  document.getElementById("user-history-from")?.addEventListener("change", renderHistoryTable);
  document.getElementById("user-history-to")?.addEventListener("change", renderHistoryTable);

  // Bấm vào dòng hoặc thẻ lịch sử -> nạp ngày đó lên form để sửa nhanh
  const handleSelectHistoryItem = (e) => {
    const item = e.target.closest("[data-date]");
    if (!item) return;
    const dateStr = item.dataset.date;
    const dateEl = document.getElementById("user-report-date");
    dateEl.value = dateStr;
    loadReportForDate(dateStr);
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast(`Đang mở báo cáo ngày ${formatDateVN(dateStr)} để chỉnh sửa.`, "info", 2200);
  };
  document.getElementById("user-history-tbody")?.addEventListener("click", handleSelectHistoryItem);
  document.getElementById("user-history-mobile-cards")?.addEventListener("click", handleSelectHistoryItem);

  // Mở modal xuất Excel cá nhân
  document.getElementById("btn-user-export-excel")?.addEventListener("click", () => {
    const fromVal = document.getElementById("user-history-from").value || getFirstDayOfMonthISO();
    const toVal = document.getElementById("user-history-to").value || getTodayLocalISO();
    window.openExportExcelModal({
      mode: "user",
      defaultFrom: fromVal,
      defaultTo: toVal,
      onConfirm: async (fromDate, toDate) => {
        const filtered = allUserReports.filter((r) => r.date >= fromDate && r.date <= toDate);
        await exportDailyReportsToExcel({
          mode: "user",
          userProfile: currentProfile,
          fromDate,
          toDate,
          reports: filtered
        });
      }
    });
  });
}

/**
 * Khởi tạo màn hình User sau khi đăng nhập
 */
export async function initUserView(user, profile) {
  currentUser = user;
  currentProfile = profile;
  bindUserViewEvents();

  // Tự động hiển thị Họ tên của nhân sự đang đăng nhập (chỉ đọc, không cho chọn người khác)
  const staffNameEl = document.getElementById("user-readonly-fullname");
  if (staffNameEl) {
    staffNameEl.textContent = profile.fullName || user.email;
  }

  const today = getTodayLocalISO();
  const monthPrefix = today.slice(0, 7);
  const [y, m] = monthPrefix.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();

  document.getElementById("user-report-date").value = today;
  document.getElementById("user-history-month").value = monthPrefix;
  document.getElementById("user-history-from").value = `${monthPrefix}-01`;
  document.getElementById("user-history-to").value = `${monthPrefix}-${String(lastDay).padStart(2, "0")}`;

  await Promise.all([loadReportForDate(today), fetchUserHistory()]);
}
