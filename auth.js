// Module Xác thực & Phân quyền bằng Firebase Authentication + Firestore users/{uid}

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db, SUPER_ADMIN_EMAIL } from "./firebase-config.js";
import { STAFF_ACCOUNTS, resolveUserPosition, getRoleForPosition } from "./constants.js";

/**
 * Chuyển đổi mã lỗi Firebase Auth sang thông báo tiếng Việt dễ hiểu
 */
export function mapAuthError(error) {
  const code = error?.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "Địa chỉ email không đúng định dạng.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email hoặc mật khẩu không chính xác.";
    case "auth/too-many-requests":
      return "Bạn đã thử quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.";
    case "auth/weak-password":
      return "Mật khẩu mới quá yếu (tối thiểu 6 ký tự).";
    case "auth/requires-recent-login":
      return "Phiên đăng nhập đã cũ. Vui lòng nhập mật khẩu hiện tại hoặc đăng nhập lại để đổi mật khẩu.";
    case "auth/network-request-failed":
      return "Lỗi kết nối mạng. Vui lòng kiểm tra Internet.";
    default:
      return error?.message || "Đã xảy ra lỗi xác thực.";
  }
}

/**
 * Đăng nhập bằng Email & Mật khẩu
 */
export async function loginWithEmail(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

/**
 * Đăng xuất tài khoản hiện tại
 */
export async function logoutUser() {
  await signOut(auth);
}

/**
 * Đổi mật khẩu cho tài khoản đang đăng nhập
 * Hỗ trợ xác thực lại (reauthenticate) nếu người dùng nhập mật khẩu hiện tại
 */
export async function changeCurrentUserPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Không tìm thấy phiên đăng nhập.");

  if (currentPassword) {
    const cred = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, cred);
  }
  await updatePassword(user, newPassword);
}

/**
 * Đọc document users/{user.uid} từ Firestore.
 * Chỉ tự động khởi tạo hồ sơ nếu là Super Admin (admin@nsg.edu.vn hoặc admin.hssv@namsaigon.edu.vn).
 * Các tài khoản khác phải do Admin cấp trong collection users/{uid} (tránh tự khôi phục tài khoản đã bị Admin xóa).
 */
export async function fetchUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    const data = snap.data();
    const position = resolveUserPosition(data);
    return {
      ...data,
      position,
      role: data.role || getRoleForPosition(position)
    };
  }

  const emailLower = (user.email || "").trim().toLowerCase();

  if (emailLower === SUPER_ADMIN_EMAIL.toLowerCase()) {
    const superAdminProfile = {
      uid: user.uid,
      email: user.email,
      fullName: "Quản trị viên (Super Admin)",
      sheetName: "",
      position: "Trưởng Phòng",
      role: "admin"
    };
    await setDoc(userRef, superAdminProfile, { merge: true });
    return superAdminProfile;
  }

  if (emailLower === "admin.hssv@namsaigon.edu.vn") {
    const matchedAdmin = STAFF_ACCOUNTS.find((acc) => acc.email.toLowerCase() === emailLower);
    const adminProfile = {
      uid: user.uid,
      email: user.email,
      fullName: matchedAdmin ? matchedAdmin.fullName : "Lãnh đạo Phòng HSSV",
      sheetName: "",
      position: "Trưởng Phòng",
      role: "admin"
    };
    await setDoc(userRef, adminProfile, { merge: true });
    return adminProfile;
  }

  return null;
}

/**
 * Lắng nghe thay đổi trạng thái đăng nhập Firebase Auth
 */
export function subscribeAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
