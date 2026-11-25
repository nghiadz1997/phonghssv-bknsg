// Xuất file Excel chuẩn 100% phôi hành chính Trường Cao đẳng Bách khoa Nam Sài Gòn (dùng ExcelJS)

import { STAFF_LIST, getDateRangeArray, getDayOfWeekCode } from "./constants.js";

const THIN_BORDER = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } }
};

const BASE_FONT = { name: "Times New Roman", size: 11 };

/**
 * Ước lượng chiều cao dòng phù hợp cho ô wrapText khi in A4 ngang
 */
function estimateRowHeight(rowTexts, colWidths) {
  let maxLines = 1;
  rowTexts.forEach((text, idx) => {
    if (!text) return;
    const width = Math.max(colWidths[idx] - 2, 8);
    const paragraphs = String(text).split(/\r?\n/);
    let lines = 0;
    for (const p of paragraphs) {
      lines += Math.max(1, Math.ceil(p.length / width));
    }
    if (lines > maxLines) maxLines = lines;
  });
  return Math.max(22, maxLines * 15 + 6);
}

/**
 * Tạo 1 worksheet theo chuẩn phôi hành chính cho 1 nhân sự
 */
function buildStaffWorksheet(workbook, staffInfo, dateList, reportsByDate) {
  const sheetTitle = staffInfo.sheetName || staffInfo.fullName || "BaoCao";
  const ws = workbook.addWorksheet(sheetTitle, {
    views: [{ state: "frozen", ySplit: 14 }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.45,
        bottom: 0.45,
        header: 0.2,
        footer: 0.2
      }
    }
  });

  // Độ rộng 8 cột A -> H tối ưu cho A4 Landscape
  const colWidths = [13, 7, 36, 12, 28, 26, 22, 18];
  ws.columns = colWidths.map((w) => ({ width: w }));

  // --- Phần Quốc hiệu, Tiêu ngữ & Tên cơ quan ---
  ws.mergeCells("A1:D1");
  const a1 = ws.getCell("A1");
  a1.value = "TRƯỜNG CAO ĐẲNG BÁCH KHOA";
  a1.font = { ...BASE_FONT, size: 11, bold: true };
  a1.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("E1:H1");
  const e1 = ws.getCell("E1");
  e1.value = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
  e1.font = { ...BASE_FONT, size: 11, bold: true };
  e1.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("A2:D2");
  const a2 = ws.getCell("A2");
  a2.value = "NAM SÀI GÒN";
  a2.font = { ...BASE_FONT, size: 11, bold: true };
  a2.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("E2:H2");
  const e2 = ws.getCell("E2");
  e2.value = "Độc lập - Tự do - Hạnh Phúc";
  e2.font = { ...BASE_FONT, size: 11, bold: true, underline: true };
  e2.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("A3:D3");
  const a3 = ws.getCell("A3");
  a3.value = "PHÒNG HỌC SINH SINH VIÊN";
  a3.font = { ...BASE_FONT, size: 11, bold: true, underline: true };
  a3.alignment = { horizontal: "center", vertical: "middle" };

  // --- Tiêu đề báo cáo ---
  ws.mergeCells("A5:H5");
  const a5 = ws.getCell("A5");
  a5.value = "BÁO CÁO THỰC HIỆN NHIỆM VỤ";
  a5.font = { ...BASE_FONT, size: 14, bold: true };
  a5.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(5).height = 24;

  ws.mergeCells("A6:H6");
  const a6 = ws.getCell("A6");
  a6.value = "NĂM HỌC 2026-2027";
  a6.font = { ...BASE_FONT, size: 12, bold: true };
  a6.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(6).height = 20;

  // --- Họ và tên ---
  const a8 = ws.getCell("A8");
  a8.value = "Họ và tên :";
  a8.font = { ...BASE_FONT, size: 11 };
  a8.alignment = { horizontal: "left", vertical: "middle" };

  ws.mergeCells("B8:D8");
  const b8 = ws.getCell("B8");
  b8.value = staffInfo.fullName || "";
  b8.font = { ...BASE_FONT, size: 11, bold: true };
  b8.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(8).height = 20;

  // --- Lưu ý hướng dẫn ---
  const a10 = ws.getCell("A10");
  a10.value = "Lưu ý:";
  a10.font = { ...BASE_FONT, size: 11, bold: true, italic: true };
  a10.alignment = { horizontal: "left", vertical: "middle" };

  ws.mergeCells("B10:H10");
  const b10 = ws.getCell("B10");
  b10.value = "- Thầy/ Cô báo cáo hàng ngày theo nhiệm vụ được phân công và công việc phát sinh khác";
  b10.font = { ...BASE_FONT, size: 11 };
  b10.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  ws.mergeCells("B11:H11");
  const b11 = ws.getCell("B11");
  b11.value = "- Quản sinh BC cụ thể tổng số lớp, HSSV đến lớp; ví dụ : Sáng có 12/12 lớp , 120/120 HSSV";
  b11.font = { ...BASE_FONT, size: 11 };
  b11.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  ws.mergeCells("B12:H12");
  const b12 = ws.getCell("B12");
  b12.value = "- Cơ sở 01 (Trường chính); CS 2 (89-91 Bùi Minh Trực); CS3 (1022 Tạ Quang Bửu ); CS4 (CMT); CS6 ( PVT)";
  b12.font = { ...BASE_FONT, size: 11 };
  b12.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  // --- Dòng 14: Tiêu đề bảng ---
  const headers = [
    "Ngày",
    "Thứ",
    "Nội dung công việc",
    "Cơ sở",
    "Kết quả",
    "Các trường HSSV/đầu việc cần lưu ý",
    "Đề xuất (nếu có)",
    "Ghi chú"
  ];
  const headerRow = ws.getRow(14);
  headerRow.height = 30;
  headers.forEach((title, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = title;
    cell.font = { ...BASE_FONT, size: 11, bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" }
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = THIN_BORDER;
  });

  // --- Từ dòng 15 trở đi: Liệt kê liên tục các ngày từ fromDate -> toDate ---
  dateList.forEach((dateStr, index) => {
    const rowNumber = 15 + index;
    const row = ws.getRow(rowNumber);
    const report = reportsByDate.get(dateStr) || null;
    const dayCode = getDayOfWeekCode(dateStr);
    const [y, m, d] = dateStr.split("-").map(Number);
    const excelDate = new Date(Date.UTC(y, m - 1, d));

    const cVal = report ? report.content || "" : "";
    const dVal = report ? report.campus || "" : "";
    const eVal = report ? report.resultText || "" : "";
    const fVal = report ? report.attentionNote || "" : "";
    const gVal = report ? report.proposal || "" : "";
    const hVal = report ? report.note || "" : "";

    const values = [excelDate, dayCode, cVal, dVal, eVal, fVal, gVal, hVal];

    values.forEach((val, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = val;
      cell.font = { ...BASE_FONT, size: 11 };
      cell.border = THIN_BORDER;

      if (colIdx === 0) {
        cell.numFmt = "dd/mm/yyyy";
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if (colIdx === 1 || colIdx === 3) {
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      } else {
        cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      }
    });

    // Chiều cao dòng tự động theo nội dung để không bị cắt chữ khi in
    const textPreview = [
      `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`,
      dayCode,
      cVal,
      dVal,
      eVal,
      fVal,
      gVal,
      hVal
    ];
    row.height = estimateRowHeight(textPreview, colWidths);
  });
}

/**
 * Xuất file BC_CV_HANG_NGAY_P_HSSV.xlsx
 * @param {Object} params
 * @param {"admin"|"user"} params.mode
 * @param {Object} params.userProfile - Thông tin user hiện tại (cần khi mode === "user")
 * @param {string} params.fromDate - YYYY-MM-DD
 * @param {string} params.toDate - YYYY-MM-DD
 * @param {Array<Object>} params.reports - Danh sách document từ collection daily_reports
 */
export async function exportDailyReportsToExcel({ mode, userProfile, fromDate, toDate, reports }) {
  if (!window.ExcelJS) {
    throw new Error("Thư viện ExcelJS chưa được tải. Vui lòng kiểm tra kết nối mạng.");
  }
  const dateList = getDateRangeArray(fromDate, toDate);
  if (dateList.length === 0) {
    throw new Error("Khoảng thời gian xuất Excel không hợp lệ (Từ ngày phải <= Đến ngày).");
  }

  const workbook = new window.ExcelJS.Workbook();
  workbook.creator = "Phòng HSSV - Cao đẳng Bách khoa Nam Sài Gòn";
  workbook.created = new Date();

  if (mode === "admin") {
    const matchedReportIds = new Set();

    // Xuất đủ 11 sheet chuẩn theo đúng thứ tự quy định
    for (const staff of STAFF_LIST) {
      const mapByDate = new Map();
      for (const r of reports) {
        if (
          r.sheetName === staff.sheetName ||
          (r.fullName && r.fullName.trim() === staff.fullName.trim())
        ) {
          mapByDate.set(r.date, r);
          matchedReportIds.add(r.id || `${r.userId}_${r.date}`);
        }
      }
      buildStaffWorksheet(workbook, staff, dateList, mapByDate);
    }

    // Nếu có thêm Nhân Viên / Chuyên Viên mới ngoài 11 tài khoản mặc định có báo cáo, xuất bổ sung thêm sheet
    const extraStaffMap = new Map();
    for (const r of reports) {
      const key = r.id || `${r.userId}_${r.date}`;
      if (matchedReportIds.has(key)) continue;
      const staffKey = r.userId || r.fullName || r.sheetName;
      if (!staffKey) continue;
      if (!extraStaffMap.has(staffKey)) {
        extraStaffMap.set(staffKey, {
          info: {
            fullName: r.fullName || "Nhân sự",
            sheetName: (r.sheetName || r.fullName || "NhanSuMoi").slice(0, 31)
          },
          mapByDate: new Map()
        });
      }
      extraStaffMap.get(staffKey).mapByDate.set(r.date, r);
    }
    for (const extra of extraStaffMap.values()) {
      buildStaffWorksheet(workbook, extra.info, dateList, extra.mapByDate);
    }
  } else {
    // Xuất 1 sheet duy nhất mang đúng sheetName của User đó
    const mapByDate = new Map();
    for (const r of reports) {
      mapByDate.set(r.date, r);
    }
    const staffInfo = {
      fullName: userProfile.fullName,
      sheetName: userProfile.sheetName || userProfile.fullName
    };
    buildStaffWorksheet(workbook, staffInfo, dateList, mapByDate);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "BC_CV_HANG_NGAY_P_HSSV.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
