# Build IPA unsigned miễn phí

Project có workflow GitHub Actions để build app iOS unsigned trên macOS rồi tải `.ipa` về Windows để ký bằng Apple ID miễn phí.

## 1. Đưa project lên GitHub

Đảm bảo repo có file:

```text
.github/workflows/build-unsigned-ipa.yml
```

Commit và push toàn bộ project.

## 2. Chạy workflow

Vào GitHub:

```text
Actions
→ Build unsigned iOS IPA
→ Run workflow
```

Workflow dùng `macos-26` và chọn Xcode 26.6 để có Swift 6.2+, tránh lỗi `package 'apple' is using Swift tools version 6.2.0 but the installed version is 6.1.0`.

## 3. Tải IPA

Khi job xanh, ở phần Artifacts tải:

```text
ChiTieuQR-unsigned-ipa
```

Giải nén để lấy:

```text
ChiTieuQR-unsigned.ipa
```

## 4. Ký và cài lên iPhone

Có thể dùng Sideloadly hoặc AltStore trên Windows để ký IPA bằng Apple ID của bạn rồi cài lên iPhone.

Với Apple ID miễn phí, chữ ký thường cần được refresh định kỳ theo giới hạn provisioning của Apple.

## Khi build lỗi

Workflow sẽ cố upload artifact:

```text
ChiTieuQR-xcode-error-log
```

Trong đó có `xcodebuild.log` và `xcode-errors.txt` để gửi lại khi cần debug.
