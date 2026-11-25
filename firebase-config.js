// Cấu hình Firebase cho Hệ thống Quản lý & Thống kê Báo cáo Công việc Hàng ngày
// Phòng Học sinh Sinh viên - Trường Cao đẳng Bách khoa Nam Sài Gòn
// Sử dụng Firebase JS SDK v10+ (ES Modules)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Thay thế thông tin project Firebase của bạn tại đây nếu cần
export const firebaseConfig = {
  apiKey: "AIzaSyDzI0eDn7V8L98Pq4W1pJw6Cfb1xQMUWtQ",
  authDomain: "phonghssv-b35d8.firebaseapp.com",
  projectId: "phonghssv-b35d8",
  storageBucket: "phonghssv-b35d8.firebasestorage.app",
  messagingSenderId: "921124761954",
  appId: "1:921124761954:web:9159a25d8a9791d24e3c3b",
  measurementId: "G-P1Q12G3HHX"
};

// Email tài khoản Super Admin khởi tạo ban đầu
export const SUPER_ADMIN_EMAIL = "admin@nsg.edu.vn";

// Khởi tạo Firebase App chính
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
});
