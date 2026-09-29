# Chi Tiêu QR iOS v1.1.0

Ứng dụng quản lý thu/chi local-first cho iPhone, viết bằng Expo + React Native + TypeScript + SQLite.

## Tính năng chính

- Quét VietQR/NAPAS và MoMo để ghi nhận khoản chi.
- Nhập khoản chi thủ công.
- Số dư hiện tại: đặt một mốc số dư, sau đó giao dịch hoàn tất tự cộng/trừ.
- Nhận tiền:
  - Tạo VietQR nhận tiền theo ngân hàng + số tài khoản + số tiền + nội dung.
  - App nhớ ngân hàng, số tài khoản và nội dung cho lần tạo QR sau; không nhớ số tiền.
  - Xác nhận `Đã nhận tiền` / `Chưa nhận tiền`; chỉ `Đã nhận tiền` mới cộng vào số dư.
  - Có thể thêm tiền nhận thủ công.
- Ngân sách tháng và hạn mức có thể tiêu trong ngày.
- Lịch sử thu/chi, sửa/xóa giao dịch, trạng thái riêng cho khoản nhận.
- Thống kê tổng thu, tổng chi, chênh lệch và chi theo danh mục.
- Bộ lọc thời gian tự cuộn mục đang chọn vào giữa.
- Dark mode / light mode / theo hệ thống.
- Tổng kết cuối ngày bằng local notification, giờ và phút tùy chỉnh.
- Có nút gửi thông báo thử sau 5 giây để kiểm tra quyền iOS.
- Khi lưu giới hạn tháng sẽ hiện popup xác nhận.

## Dữ liệu

Dữ liệu giao dịch, số dư, ngân sách và cài đặt được lưu trong SQLite trên thiết bị.

Ảnh QR nhận tiền được tạo bằng Quick Link ảnh của VietQR nên cần kết nối mạng khi tạo/hiển thị QR. Thông tin ngân hàng nhận được lưu local để dùng cho lần sau.

## Chạy thử

```bash
npm install
npx expo start
```

Trên Windows có thể chạy `START_WINDOWS.bat` hoặc `START_TUNNEL_WINDOWS.bat`.

## Build IPA unsigned miễn phí

Workflow `.github/workflows/build-unsigned-ipa.yml` dùng GitHub Actions macOS + Xcode 26.6 để tạo `ChiTieuQR-unsigned.ipa`.

Sau khi workflow thành công, tải artifact `ChiTieuQR-unsigned-ipa`, giải nén và ký/cài bằng Sideloadly hoặc AltStore.

Xem thêm `BUILD_IPA_FREE.md`.

## Lưu ý về thông báo

1. Bật `Tổng kết cuối ngày` trong Cài đặt.
2. Cho phép thông báo khi iOS hỏi quyền.
3. Chọn giờ/phút và bấm `Lưu giờ tổng kết`.
4. Bấm `Gửi thông báo thử sau 5 giây` để kiểm tra ngay.
5. Nếu không thấy, vào `Cài đặt iPhone > Thông báo > Chi Tiêu QR` và bật Cho phép thông báo, Âm thanh và Biểu ngữ.

Local notification không cần server và được iOS lên lịch trên thiết bị.
