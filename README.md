# Hệ thống Quản lý & Thống kê Báo cáo Công việc Hàng ngày - Phòng HSSV
**Trường Cao đẳng Bách khoa Nam Sài Gòn**

## Cấu trúc thư mục
- `index.html`: Giao diện HTML5 + Tailwind CSS (Login, User Form & Lịch sử, Admin Dashboard & Modals).
- `firebase-config.js`: Cấu hình Firebase Project (`firebaseConfig`), khởi tạo và export `app`, `auth`, `db`.
- `constants.js`: Danh sách 12 tài khoản mặc định (giữ nguyên khoảng trắng `sheetName`), danh sách cơ sở, hàm xử lý ngày/thứ và thông báo Toast.
- `auth.js`: Xác thực Firebase Authentication (`signInWithEmailAndPassword`, `signOut`, `updatePassword`, `onAuthStateChanged`) và đọc phân quyền `users/{uid}`.
- `user-view.js`: Nghiệp vụ nhập báo cáo hàng ngày, tự động nạp dữ liệu ngày đã có, sao chép nội dung ngày gần nhất, ghép chuỗi sĩ số quản sinh và xem lịch sử cá nhân.
- `admin-view.js`: Dashboard tổng quan (4 KPI, 2 biểu đồ Chart.js, tab Cần lưu ý & Đề xuất, tab Toàn bộ báo cáo) và công cụ **Cấp 12 Tài khoản Mặc định** qua Secondary Firebase App.
- `excel-export.js`: Xuất file `BC_CV_HANG_NGAY_P_HSSV.xlsx` bằng ExcelJS chuẩn phôi hành chính (font Times New Roman, viền bảng đầy đủ, A4 ngang, đủ 11 sheet khi Admin xuất hoặc 1 sheet đúng `sheetName` khi User xuất).
- `firestore.rules`: Quy tắc bảo mật Cloud Firestore mẫu cho `users` và `daily_reports`.

## Hướng dẫn chạy & cấu hình nhanh
1. **Bật dịch vụ trên Firebase Console** (`phonghssv-b35d8`):
   - **Authentication**: Bật phương thức đăng nhập **Email/Password**. Tạo sẵn tài khoản Super Admin `admin@nsg.edu.vn` nếu chưa có.
   - **Cloud Firestore**: Tạo database và dán nội dung từ `firestore.rules` vào mục **Rules**.
2. **Chạy ứng dụng web** (ES Modules yêu cầu chạy qua HTTP server, không mở trực tiếp `file://`):
   - Dùng VS Code Live Server, hoặc chạy lệnh:
     ```bash
     npx serve .
     ```
     hoặc:
     ```bash
     python -m http.server 8080
     ```
3. **Cấp 12 tài khoản mặc định**:
   - Đăng nhập bằng `admin@nsg.edu.vn`.
   - Bấm nút **Cấp 12 Tài khoản Mặc định** trên Dashboard Admin để tự động tạo tài khoản với mật khẩu mặc định `Nsg@2026` và lưu vào `users/{uid}`.
