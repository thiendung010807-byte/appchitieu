# ChiTieuQR v1.1.3

- Thêm cầu nối VietQR nội bộ bằng `react-native-webview` cho thanh toán ngân hàng.
  - App tải URL `https://dl.vietqr.io/pay?...` trong WebView ẩn.
  - Khi VietQR chuyển sang custom scheme của app ngân hàng, Chi Tiêu QR chặn URL đó và gọi `Linking.openURL()` native để chuyển app-to-app, tránh mở Safari trong trường hợp bridge lấy được deeplink.
  - Nếu sau 3 giây không lấy được deeplink, app fallback sang URL VietQR bình thường để không làm hỏng khả năng thanh toán.
  - Luồng quay lại Chi Tiêu QR vẫn dùng `AppState` và hỏi `Đã thanh toán / Chưa thanh toán`.
- Thêm `Chọn ảnh QR` trong màn quét.
  - Chọn ảnh từ thư viện bằng `expo-image-picker`.
  - Đọc QR tĩnh trong ảnh bằng `Camera.scanFromURLAsync()`.
  - Không cần cấp quyền camera nếu chỉ muốn chọn ảnh QR.
- Mã QR nhận tiền chuyển sang template VietQR `qr_only` (480×480), chỉ hiển thị phần QR.
- Cài đặt có thêm mục `Thông tin ứng dụng`: tên app, phiên bản/build, nhà phát hành, Bundle ID, nền tảng và kiểu lưu trữ.
- Version `1.1.3`, iOS buildNumber `5`.
