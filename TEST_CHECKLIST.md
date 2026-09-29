# Checklist test v1.1.3

## 1. Thanh toán app-to-app VietQR → MBBank
1. Cài MBBank trên iPhone và đặt `MB Bank` làm ngân hàng thanh toán mặc định.
2. Quét một VietQR hợp lệ, nhập số tiền/nội dung rồi nhấn `Mở MB Bank`.
3. Kỳ vọng ưu tiên: Chi Tiêu QR chuyển trực tiếp sang MBBank, không hiện Safari và không hiện popup Safari `Mở trong MBBank?`.
4. Sau Face ID/đăng nhập, kiểm tra MBBank có giữ đúng luồng autofill người nhận/số tiền/nội dung mà VietQR hỗ trợ.
5. Quay lại Chi Tiêu QR và kiểm tra popup `Bạn đã thanh toán?` xuất hiện.
6. Nếu bridge không bắt được deeplink trong khoảng 3 giây, xác nhận app fallback sang URL VietQR/Safari thay vì treo.

## 2. Quét QR từ thư viện
1. Mở Quét QR → nhấn `Chọn ảnh QR`.
2. Chọn ảnh chứa VietQR rõ nét → app phải đọc được và mở form Thanh toán.
3. Chọn ảnh không có QR → hiện thông báo inline, scanner vẫn dùng tiếp được.
4. Tắt quyền Camera nhưng vẫn mở scanner → nút `Chọn ảnh QR từ thư viện` phải hoạt động.
5. Chọn ảnh MoMo/VietQR đang được app hỗ trợ và kiểm tra dữ liệu parse đúng như khi quét camera.

## 3. QR nhận tiền `qr_only`
1. Trang chủ → Nhận tiền → Tạo mã QR.
2. Chọn ngân hàng, STK, số tiền, nội dung.
3. Tạo QR.
4. Ảnh hiển thị phải chỉ có mã QR, không có template thông tin chuyển khoản/logos kiểu `compact2`.
5. Quét QR bằng app ngân hàng khác và kiểm tra số tiền/nội dung vẫn đúng.
6. Xác nhận `Đã nhận tiền` cộng số dư; `Chưa nhận tiền` không cộng.

## 4. Thông tin ứng dụng
1. Cài đặt → `Thông tin ứng dụng`.
2. Kiểm tra: `Chi Tiêu QR`, phiên bản `1.1.3 (5)`, nhà phát hành, Bundle ID, nền tảng và lưu trữ.
3. Không có hàng nào tràn chữ hoặc làm vỡ layout ở màn hình nhỏ.

## 5. Regression
- Số dư vẫn tự cộng/trừ theo giao dịch completed.
- Nhận tiền → Chọn ngân hàng không tạo modal chồng và không khóa touch sau khi đóng.
- Bộ lọc Lịch sử/Thống kê vẫn tự cuộn mục được chọn ra giữa.
- Lưu giới hạn tháng vẫn hiện popup thành công.
- Giờ/phút thông báo cuối ngày vẫn chỉnh được 00:00–23:59.
- Gửi thông báo thử sau 5 giây vẫn hoạt động khi iOS đã cấp quyền.
