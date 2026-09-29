# Thay đổi v1.1.0

- Sửa lịch tổng kết cuối ngày sang trigger hằng ngày của iOS/Expo.
- Cho phép chọn giờ và phút bất kỳ (00:00–23:59).
- Thêm nút thông báo thử sau 5 giây.
- Nội dung thông báo gồm: chi hôm nay, nhận hôm nay, hạn mức còn lại/vượt, tổng chi tháng và số dư.
- Thêm số dư hiện tại với cơ chế mốc số dư; giao dịch hoàn tất tự cộng/trừ.
- Thêm luồng Nhận tiền:
  - Tạo VietQR nhận tiền.
  - Chọn ngân hàng, số tài khoản, số tiền, tên giao dịch và nội dung.
  - Nhớ ngân hàng/số tài khoản/nội dung cho lần sau, không nhớ số tiền.
  - Xác nhận Đã nhận tiền / Chưa nhận tiền.
  - Nhập tiền nhận thủ công.
- Lịch sử hiển thị + cho khoản nhận và - cho khoản chi.
- Thống kê có tổng nhận, tổng chi, chênh lệch; ngân sách chỉ tính khoản chi.
- Bộ lọc Lịch sử/Thống kê tự cuộn mục đang chọn về giữa.
- Lưu giới hạn tháng có popup xác nhận.
- SQLite tự migrate dữ liệu cũ, mặc định giao dịch cũ là khoản chi.
- Workflow IPA chuyển sang macOS 26 + Xcode 26.6 / Swift 6.2+.
