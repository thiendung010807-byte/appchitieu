# Chi Tiêu QR v1.1.4

- Sửa nút **Chọn ảnh QR** không hiển thị khi camera đã được cấp quyền.
- Nguyên nhân: component đã render nút nhưng thiếu style `galleryQrButton`, khiến nó nằm phía sau CameraView.
- Nút nay được cố định ở đáy màn quét, có nền tối, chữ trắng và z-index cao hơn camera/overlay.
- Giữ nguyên chọn ảnh QR từ thư viện bằng `expo-image-picker` + `Camera.scanFromURLAsync()`.
- Phiên bản: 1.1.4, iOS buildNumber: 6.
