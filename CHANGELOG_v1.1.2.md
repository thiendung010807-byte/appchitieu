# ChiTieuQR v1.1.2

- Khôi phục luồng VietQR -> Safari -> MBBank autofill như bản Expo Go.
- Không truyền custom scheme `chitieuqr://payment-return` vào tham số `url` của VietQR cho giao dịch ngân hàng.
- Dùng callback HTTPS `https://vietqr.io` để tương thích tốt hơn với MBBank autofill.
- App vẫn phát hiện khi người dùng quay lại bằng `AppState` và hiện hỏi Đã thanh toán/Chưa thanh toán, nên không phụ thuộc callback deeplink để hoàn tất giao dịch nội bộ.
- Version 1.1.2, iOS buildNumber 4.
