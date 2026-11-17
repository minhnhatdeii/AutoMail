# 🌸 VINH CUU STONE - AUTO EMAIL OUTREACH DISPATCHER
> **Phiên bản:** 2.0 (Retro Pink Edition)  
> **Người dùng:** Calista (Sales Manager)  
> **Sản phẩm chào hàng:** Đá Tự Nhiên Basalt & Granite xuất khẩu  

Ứng dụng web tự động gửi email chào hàng B2B hàng loạt từ tài khoản Gmail của bạn, hỗ trợ bóc tách thông minh tên doanh nghiệp từ domain đối tác, đính kèm file catalogue/hình ảnh chung (<20MB), và có cơ chế giãn cách an toàn chống bị Google đánh cờ Spam.

---

## 🚀 HƯỚNG DẪN KHỞI ĐỘNG NHANH (LOCAL)

### Cách 1 (Nhanh nhất - Click chuột):
- Nhấp đúp chuột vào file **`start_app.bat`**. 
- Ứng dụng sẽ tự động bật server và mở ngay trình duyệt tại địa chỉ `http://localhost:3000`.

### Cách 2 (Dùng lệnh Terminal / PowerShell):
```bash
npm start
```
Sau đó mở trình duyệt và truy cập: `http://localhost:3000`

---

## 🛠️ HƯỚNG DẪN SỬ DỤNG CHI TIẾT

### Bước 1: Cấu hình tài khoản Gmail gửi (Tab 1: ⚙️)
1. Nhập **Email công ty** của bạn.
2. Nhập **Mật khẩu ứng dụng Google (Google App Password 16 ký tự)**:
   - Truy cập: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - Đặt tên app (ví dụ: `VinhCuuMailer`) $\rightarrow$ Bấm **Tạo** $\rightarrow$ Copy 16 chữ cái dán vào app.
3. Bấm **"Kiểm Tra Kết Nối Gmail"** để kiểm tra đăng nhập.

### Bước 2: Tải lên Catalogue 2026 & Ảnh mẫu (Tab 2: ✍️)
- Kéo thả file PDF Catalogue 2026 và các hình ảnh mẫu đá Basalt/Granite vào ô upload.
- Thanh dung lượng sẽ tự động tính toán đảm bảo **dưới 20.0 MB**.
- Nội dung thư mẫu đã được điền sẵn với biến `{{company_name}}`. Bạn có thể chỉnh sửa tùy thích và bấm **"Lưu Mẫu Thư"**.

### Bước 3: Nhập danh sách Email Target (Tab 3: 🎯)
- Copy và dán toàn bộ danh sách email vào ô text (mỗi dòng một email):
  ```text
  info@nord-stein.de
  info@nord-stein2.de
  contact@naturalstone-gmbh.com
  ```
- Bấm **"⚡ BÓC TÁCH & XEM TRƯỚC DANH SÁCH"**. Hệ thống sẽ tự động lấy tên doanh nghiệp sau ký tự `@` đến dấu chấm đầu tiên (ví dụ `info@nord-stein.de` $\rightarrow$ `Nord-Stein` $\rightarrow$ Thể hiện: `Dear Nord-Stein team,`).

### Bước 4: Khởi động gửi & Giám sát (Tab 4: ⚡)
- Cài đặt thời gian giãn cách ngẫu nhiên (mặc định: `20` đến `45` giây/email để an toàn tuyệt đối).
- Bấm **"🚀 BẮT ĐẦU GỬI (START)"**.
- Bạn có thể **Tạm dừng (Pause)**, **Tiếp tục (Resume)** hoặc **Dừng hẳn (Stop)** bất kỳ lúc nào.
- Sau khi gửi xong, bấm **"📥 Xuất Báo Cáo CSV"** để tải file Excel báo cáo kết quả gửi.

---

## 🛡️ CẨM NANG BẢO VỆ TÀI KHOẢN (TRÁNH "ĂN GẬY" GOOGLE)
Xem chi tiết tại **Tab 5: Cẩm Nang Chống "Ăn Gậy"** ngay trên giao diện web để nắm rõ các hạn mức gửi (khuyến nghị 50 - 150 email/ngày) và cách giữ độ uy tín hòm thư luôn ở mức cao nhất.

