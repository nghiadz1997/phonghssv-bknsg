// Entry point điều phối Xác thực, Phân quyền & Các Modal dùng chung

import {
  subscribeAuthState,
  loginWithEmail,
  logoutUser,
  changeCurrentUserPassword,
  fetchUserProfile,
  mapAuthError
} from "./auth.js";
import { initUserView } from "./user-view.js";
import { initAdminView } from "./admin-view.js";
import { showToast, escapeHtml, isLeaderProfile, resolveUserPosition } from "./constants.js";

let activeExportCallback = null;

function showScreen(screenId) {
  const screens = ["loading-screen", "login-screen", "app-shell"];
  screens.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === screenId) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
}

function showRoleView(role) {
  const userView = document.getElementById("user-view");
  const adminView = document.getElementById("admin-view");
  if (role === "admin") {
    adminView.classList.remove("hidden");
    userView.classList.add("hidden");
  } else {
    userView.classList.remove("hidden");
    adminView.classList.add("hidden");
  }
}

/**
 * Mở Modal chọn khoảng ngày Xuất Excel (dùng chung cho cả Admin và User)
 */
window.openExportExcelModal = function ({ mode, defaultFrom, defaultTo, onConfirm }) {
  activeExportCallback = onConfirm;
  const modal = document.getElementById("export-excel-modal");
  const subtitle = document.getElementById("export-modal-subtitle");
  const fromInput = document.getElementById("export-from-date");
  const toInput = document.getElementById("export-to-date");

  subtitle.textContent =
    mode === "admin"
      ? "Xuất đầy đủ 11 sheet nhân sự Phòng HSSV chuẩn phôi hành chính (A4 ngang)."
      : "Xuất báo cáo cá nhân đúng tên sheet và chuẩn phôi hành chính của trường.";

  fromInput.value = defaultFrom;
  toInput.value = defaultTo;
  modal.classList.remove("hidden");
};

function setupModalsAndAuthEvents() {
  // Form Đăng nhập
  const loginForm = document.getElementById("login-form");
  const loginErrorBox = document.getElementById("login-error-box");

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginErrorBox.classList.add("hidden");
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const submitBtn = document.getElementById("btn-login-submit");

    const oldHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Đang đăng nhập...`;

    try {
      await loginWithEmail(email, password);
      loginForm.reset();
    } catch (err) {
      loginErrorBox.textContent = mapAuthError(err);
      loginErrorBox.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = oldHtml;
    }
  });

  // Hiện/ẩn mật khẩu ở form đăng nhập
  document.getElementById("btn-toggle-login-pwd")?.addEventListener("click", () => {
    const input = document.getElementById("login-password");
    const isPwd = input.type === "password";
    input.type = isPwd ? "text" : "password";
  });

  // Nút Đăng xuất
  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    try {
      await logoutUser();
      showToast("Đã đăng xuất.", "info", 2000);
    } catch (err) {
      showToast("Lỗi đăng xuất: " + err.message, "error");
    }
  });

  // Modal Đổi mật khẩu trên Header
  const pwdModal = document.getElementById("change-password-modal");
  const pwdForm = document.getElementById("change-password-form");
  const pwdErr = document.getElementById("change-password-error");

  document.getElementById("btn-open-change-password")?.addEventListener("click", () => {
    pwdErr.classList.add("hidden");
    pwdForm.reset();
    pwdModal.classList.remove("hidden");
  });

  document.getElementById("btn-close-change-password")?.addEventListener("click", () => {
    pwdModal.classList.add("hidden");
  });

  pwdForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    pwdErr.classList.add("hidden");

    const currentPwd = document.getElementById("cp-current-password").value;
    const newPwd = document.getElementById("cp-new-password").value;
    const confirmPwd = document.getElementById("cp-confirm-password").value;

    if (newPwd.length < 6) {
      pwdErr.textContent = "Mật khẩu mới phải có ít nhất 6 ký tự.";
      pwdErr.classList.remove("hidden");
      return;
    }
    if (newPwd !== confirmPwd) {
      pwdErr.textContent = "Xác nhận mật khẩu mới không khớp.";
      pwdErr.classList.remove("hidden");
      return;
    }

    const btn = document.getElementById("btn-submit-change-password");
    const oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Đang cập nhật...`;

    try {
      await changeCurrentUserPassword(currentPwd, newPwd);
      pwdModal.classList.add("hidden");
      pwdForm.reset();
      showToast("Đổi mật khẩu thành công!", "success");
    } catch (err) {
      pwdErr.textContent = mapAuthError(err);
      pwdErr.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  });

  // Modal Xuất Excel
  const exportModal = document.getElementById("export-excel-modal");
  document.getElementById("btn-close-export-modal")?.addEventListener("click", () => {
    exportModal.classList.add("hidden");
  });

  document.getElementById("export-excel-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fromDate = document.getElementById("export-from-date").value;
    const toDate = document.getElementById("export-to-date").value;
    if (!fromDate || !toDate || fromDate > toDate) {
      showToast("Khoảng ngày không hợp lệ (Từ ngày phải <= Đến ngày).", "warning");
      return;
    }
    if (!activeExportCallback) return;

    const btn = document.getElementById("btn-confirm-export-excel");
    const oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Đang tạo file Excel...`;

    try {
      await activeExportCallback(fromDate, toDate);
      exportModal.classList.add("hidden");
      showToast("Đã tải xuống file BC_CV_HANG_NGAY_P_HSSV.xlsx!", "success");
    } catch (err) {
      console.error("Lỗi xuất Excel:", err);
      showToast("Xuất Excel thất bại: " + err.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  });
}

// Khởi chạy ứng dụng
setupModalsAndAuthEvents();

function showLoginErrorHtml(htmlMsg) {
  const box = document.getElementById("login-error-box");
  if (!box) return;
  box.innerHTML = htmlMsg;
  box.classList.remove("hidden");
}

subscribeAuthState(async (user) => {
  if (!user) {
    showScreen("login-screen");
    return;
  }

  showScreen("loading-screen");

  try {
    const profile = await fetchUserProfile(user);
    if (!profile) {
      const msg = `Tài khoản <strong>${escapeHtml(user.email || "")}</strong> (UID: <code>${escapeHtml(user.uid)}</code>) chưa có hồ sơ phân quyền trong Firestore (<code>users/${escapeHtml(user.uid)}</code>). Vui lòng liên hệ Lãnh đạo Phòng.`;
      showLoginErrorHtml(msg);
      showToast("Tài khoản chưa được cấp hồ sơ phân quyền trong Firestore.", "error", 6000);
      await logoutUser();
      showScreen("login-screen");
      return;
    }

    // Cập nhật thông tin người dùng & chức vụ trên Header
    const position = resolveUserPosition(profile);
    const isLeader = isLeaderProfile(profile);
    document.getElementById("header-user-name").textContent = profile.fullName || user.email;
    const roleBadge = document.getElementById("header-user-role");
    if (isLeader) {
      roleBadge.textContent = position;
      roleBadge.className =
        "px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-900";
    } else {
      roleBadge.textContent = position;
      roleBadge.className =
        "px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/20 text-white";
    }

    showRoleView(isLeader ? "admin" : "user");
    showScreen("app-shell");

    if (isLeader) {
      await initAdminView();
    } else {
      await initUserView(user, profile);
    }
  } catch (err) {
    console.error("Lỗi xác thực hồ sơ:", err);
    const code = err?.code || "";
    let hint = "";
    if (code === "permission-denied" || (err?.message || "").toLowerCase().includes("permissions")) {
      hint = "Nguyên nhân: <strong>Firestore Security Rules</strong> chưa cho phép đọc/ghi collection <code>users</code>. Hãy vào Firebase Console → Firestore Database → Rules và dán nội dung file <code>firestore.rules</code> rồi nhấn Publish.";
    } else if (code === "unavailable" || (err?.message || "").toLowerCase().includes("offline")) {
      hint = "Nguyên nhân: Chưa khởi tạo <strong>Cloud Firestore Database</strong> trên Firebase Console (project <code>phonghssv-b35d8</code>) hoặc mất kết nối mạng.";
    } else {
      hint = "Vui lòng kiểm tra cấu hình Firestore Database và Rules trên Firebase Console.";
    }

    showLoginErrorHtml(
      `<div><strong>Không thể đọc thông tin tài khoản</strong> (${escapeHtml(user.email || "")})</div>` +
      `<div class="mt-1">${hint}</div>` +
      `<div class="mt-1 text-[11px] opacity-80">Mã lỗi: <code>${escapeHtml(code || "unknown")}</code> — ${escapeHtml(err?.message || "")}</div>`
    );
    showToast("Không thể đọc thông tin tài khoản: " + (err?.message || code), "error", 6000);
    await logoutUser();
    showScreen("login-screen");
  }
});
