// Hằng số & Tiện ích dùng chung cho toàn bộ hệ thống

export const DEFAULT_ACCOUNT_PASSWORD = "Nsg@2026";

// Danh sách 4 chức vụ chính thức trong Phòng HSSV
export const POSITION_OPTIONS = [
  "Nhân Viên",
  "Chuyên Viên",
  "Phó Trưởng Phòng",
  "Trưởng Phòng"
];

export const LEADER_POSITIONS = ["Trưởng Phòng", "Phó Trưởng Phòng"];

/**
 * Suy ra role hệ thống ("admin" | "user") từ chức vụ
 */
export function getRoleForPosition(position) {
  return LEADER_POSITIONS.includes(position) ? "admin" : "user";
}

/**
 * Chuẩn hóa chức vụ hiển thị từ document users/{uid} (hỗ trợ cả dữ liệu cũ chỉ có role)
 */
export function resolveUserPosition(profile) {
  if (profile?.position && POSITION_OPTIONS.includes(profile.position)) {
    return profile.position;
  }
  return profile?.role === "admin" ? "Trưởng Phòng" : "Nhân Viên";
}

/**
 * Kiểm tra tài khoản có quyền Lãnh đạo (Trưởng Phòng / Phó Trưởng Phòng / admin) hay không
 */
export function isLeaderProfile(profile) {
  if (!profile) return false;
  return profile.role === "admin" || LEADER_POSITIONS.includes(profile.position);
}

// Danh sách 12 tài khoản mặc định (giữ chính xác tuyệt đối từng khoảng trắng trong sheetName)
export const STAFF_ACCOUNTS = [
  { email: "admin.hssv@namsaigon.edu.vn", fullName: "Lãnh đạo Phòng HSSV", sheetName: "", position: "Trưởng Phòng", role: "admin" },
  { email: "phuc.hssv@namsaigon.edu.vn", fullName: "Thầy Phúc", sheetName: "Thầy Phúc ", position: "Nhân Viên", role: "user" },
  { email: "thieu.hssv@namsaigon.edu.vn", fullName: "Thầy Thiệu", sheetName: "Thầy Thiệu ", position: "Nhân Viên", role: "user" },
  { email: "chuong.hssv@namsaigon.edu.vn", fullName: "Thầy Chương", sheetName: "Thầy Chương ", position: "Nhân Viên", role: "user" },
  { email: "thao.hssv@namsaigon.edu.vn", fullName: "Thầy Thảo", sheetName: "Thầy Thảo", position: "Nhân Viên", role: "user" },
  { email: "huy.hssv@namsaigon.edu.vn", fullName: "Thầy Huy", sheetName: "Thầy Huy ", position: "Nhân Viên", role: "user" },
  { email: "chanh.hssv@namsaigon.edu.vn", fullName: "Thầy Chánh", sheetName: "Thầy Chánh ", position: "Nhân Viên", role: "user" },
  { email: "an.hssv@namsaigon.edu.vn", fullName: "Cô An", sheetName: "C An ", position: "Nhân Viên", role: "user" },
  { email: "thom.hssv@namsaigon.edu.vn", fullName: "Cô Thơm", sheetName: "C Thơm ", position: "Nhân Viên", role: "user" },
  { email: "quyen.hssv@namsaigon.edu.vn", fullName: "Cô Quyên", sheetName: "Cô Quyên ", position: "Nhân Viên", role: "user" },
  { email: "lien.hssv@namsaigon.edu.vn", fullName: "Cô Liên", sheetName: "Cô Liên ", position: "Nhân Viên", role: "user" },
  { email: "huyen.hssv@namsaigon.edu.vn", fullName: "Cô Huyền", sheetName: " Cô Huyền ", position: "Nhân Viên", role: "user" }
];

// Danh sách 11 nhân sự Phòng HSSV theo đúng thứ tự sheet Excel
export const STAFF_LIST = STAFF_ACCOUNTS.filter((acc) => acc.role === "user");

export const CAMPUS_OPTIONS = [
  { value: "CS 01", label: "CS 01 (Trường chính)" },
  { value: "CS 2", label: "CS 2 (89-91 Bùi Minh Trực)" },
  { value: "CS 3", label: "CS 3 (1022 Tạ Quang Bửu)" },
  { value: "CS 4", label: "CS 4 (CMT)" },
  { value: "CS 6", label: "CS 6 (PVT)" }
];

export const CAMPUS_VALUES = CAMPUS_OPTIONS.map((c) => c.value);

/**
 * Lấy ngày hôm nay theo giờ địa phương định dạng YYYY-MM-DD
 */
export function getTodayLocalISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Lấy ngày đầu tháng hiện tại định dạng YYYY-MM-DD
 */
export function getFirstDayOfMonthISO(refDateStr = getTodayLocalISO()) {
  const [y, m] = refDateStr.split("-");
  return `${y}-${m}-01`;
}

/**
 * Cộng/trừ số ngày từ chuỗi YYYY-MM-DD
 */
export function addDaysISO(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Tính Thứ trong tuần ("2", "3", "4", "5", "6", "7", "CN") từ YYYY-MM-DD
 */
export function getDayOfWeekCode(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0 = CN, 1 = Thứ 2 ... 6 = Thứ 7
  return day === 0 ? "CN" : String(day + 1);
}

/**
 * Hiển thị nhãn Thứ dễ đọc cho giao diện
 */
export function getDayOfWeekLabel(dayCode) {
  if (!dayCode) return "";
  return dayCode === "CN" ? "Chủ nhật" : `Thứ ${dayCode}`;
}

/**
 * Định dạng YYYY-MM-DD -> DD/MM/YYYY
 */
export function formatDateVN(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Tạo mảng ngày liên tục từ fromDate đến toDate (YYYY-MM-DD)
 */
export function getDateRangeArray(fromDate, toDate) {
  if (!fromDate || !toDate || fromDate > toDate) return [];
  const dates = [];
  let current = fromDate;
  // Bảo vệ tránh vòng lặp vô hạn nếu dải ngày quá lớn (> 400 ngày)
  let guard = 0;
  while (current <= toDate && guard < 400) {
    dates.push(current);
    current = addDaysISO(current, 1);
    guard += 1;
  }
  return dates;
}

/**
 * Tạo chuỗi mẫu kết quả quản sinh từ 4 ô số lớp / HSSV
 */
export function buildAttendancePrefix(cpStr, ctStr, spStr, stStr) {
  const parts = [];
  if (cpStr !== "" || ctStr !== "") parts.push(`${cpStr || 0}/${ctStr || 0} lớp`);
  if (spStr !== "" || stStr !== "") parts.push(`${spStr || 0}/${stStr || 0} HSSV`);
  return parts.length ? `Sáng có ${parts.join(", ")}` : "";
}

/**
 * Escape HTML để chống XSS khi render dữ liệu người dùng nhập
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Hiển thị thông báo Toast góc màn hình
 */
export function showToast(message, type = "info", duration = 3500) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const styles = {
    success: "bg-emerald-600 text-white border-emerald-700",
    error: "bg-rose-600 text-white border-rose-700",
    warning: "bg-amber-500 text-white border-amber-600",
    info: "bg-nsg-blue text-white border-blue-900"
  };

  const icons = {
    success: `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
    error: `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    warning: `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
    info: `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
  };

  const toast = document.createElement("div");
  toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 translate-y-2 opacity-0 max-w-sm ${styles[type] || styles.info}`;
  toast.innerHTML = `${icons[type] || icons.info}<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  });

  setTimeout(() => {
    toast.classList.add("translate-y-2", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
