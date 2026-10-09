# Tài liệu dự án

Thư ký Tài chính AI là bot Telegram tiếng Việt để quản lý thu chi, tài khoản và công nợ cá nhân. Chọn tài liệu theo công việc cần thực hiện:

| Bạn muốn | Bắt đầu tại |
| --- | --- |
| Hiểu tính năng, cài đặt và dùng bot | [README](../README.md) |
| Hiểu cách ghi sổ và phạm vi nghiệp vụ | [Đặc tả sản phẩm](PRD.md) |
| Kiểm tra bot, sao lưu, phục hồi hoặc xử lý lỗi | [Hướng dẫn vận hành](OPERATIONS.md) |
| Chạy tests, thêm test hoặc kiểm tra staging | [Hướng dẫn kiểm thử](TESTING.md) |
| Dùng coding agent để bảo trì dự án | [AGENTS.md](../AGENTS.md) |

## Lộ trình cho người mới

1. Đọc README để hiểu tính năng và giới hạn, cài Node/dependencies và chạy kiểm thử local.
2. Thiết lập bot/database theo phần triển khai khi muốn dùng dịch vụ thật.
3. Tạo tài khoản và đối soát trước khi sử dụng số dư để theo dõi tài chính.
4. Thử thu, chi, chuyển tiền và báo cáo với dữ liệu mẫu.
5. Tải một JSON backup, chạy verify và thử khôi phục vào D1 local mới.

## Lộ trình cho người đóng góp

1. Đọc PRD cho nghiệp vụ định sửa và AGENTS.md cho quy tắc repository.
2. Tìm thành phần tương ứng trong `src/`, migration và test liên quan.
3. Thực hiện thay đổi, thêm kiểm thử bảo vệ hành vi mới hoặc lỗi được sửa.
4. Chạy chuỗi kiểm tra trong TESTING trước khi gửi pull request.
5. Cập nhật tài liệu và quy trình phục hồi nếu schema hoặc hành vi thay đổi.

Tài liệu mô tả phiên bản hiện tại. Mỗi thay đổi sản phẩm cần cập nhật phần liên quan để cú pháp lệnh, ví dụ và quy tắc vẫn khớp mã nguồn.
