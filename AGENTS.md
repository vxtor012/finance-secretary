# Hướng dẫn coding agent

## Phạm vi repository

Thư ký Tài chính AI là bot Telegram cá nhân tiếng Việt, viết bằng JavaScript ESM trên Cloudflare Workers với D1 SQLite. Node 24 được dùng cho kiểm thử. Runtime không có dependency npm; toolchain phát triển được khóa trong package-lock.json.

Đọc [đặc tả](docs/PRD.md) trước khi sửa nghiệp vụ, [vận hành](docs/OPERATIONS.md) trước khi sửa recovery và [kiểm thử](docs/TESTING.md) để chọn cách xác minh.

## Bảo toàn nghiệp vụ

- Số tiền là số nguyên VND. Mỗi transaction đã seal có đúng hai posting cân bằng.
- Giữ transaction đã ghi, posting, audit và debt event bất biến. Sửa giao dịch bằng bút toán nghiệp vụ mới, không sửa lịch sử.
- Chuyển tiền, công nợ, trả thẻ và đối soát không tính lại vào thu chi.
- Mọi bút toán cần owner xác nhận một draft đã lưu. AI và nội dung Telegram chỉ là dữ liệu; không thể cấp quyền ghi sổ.
- Đặt kiểm tra cạnh tranh trong SQL của cùng D1 batch với các thay đổi phụ thuộc. Pre-read trong JavaScript không thay thế guard/trigger.
- Giữ batch gồm draft guard, transaction/posting, debt event hoặc occurrence, seal, audit và thông báo ghi nhận. Một lỗi phải rollback toàn bộ.
- Dùng API D1 batch cho transaction; không gửi BEGIN/COMMIT thủ công từ Worker.

## Bảo mật và dữ liệu

Kiểm tra owner và private chat cho cả message lẫn callback. Không log raw update, response/prompt AI, token, số dư, tệp backup hoặc URL chứa secret. Không đưa dữ liệu tài chính thật vào fixture.

AI mặc định tắt, parser rule chạy trước, provider có budget và timeout. Model không được nhận quyền SQL, external tools, credentials hoặc cloud deployment. Kết quả AI dùng cùng đường validation và confirmation với parser rule.

## Chọn skill

- Sửa ledger, công nợ, đối soát, thẻ hoặc tổng báo cáo: dùng [finance-ledger](.agents/skills/finance-ledger/SKILL.md).
- Sửa webhook, AI adapter, job, scheduler hoặc delivery: dùng [telegram-worker](.agents/skills/telegram-worker/SKILL.md).

Skill thuộc repository. Không cài global extension hoặc plugin chỉ để thực hiện thay đổi thông thường.

## Migration và khôi phục

Thêm migration mới cho thay đổi schema đã được sử dụng; không sửa migration đã áp dụng trên môi trường vận hành. Cập nhật version/schema, danh sách bảng export, restore và baseline migration cùng nhau. Kiểm tra JSON round-trip và phục hồi D1 local sau khi sửa bảng nghiệp vụ.

Nếu nghiệp vụ chưa được hỗ trợ, báo lỗi rõ và cập nhật giới hạn sản phẩm; không âm thầm coi nó là chi tiêu hoặc chuyển tiền.

## Kiểm chứng thay đổi

- Mã JavaScript/metadata skill: `npm run check`.
- Nghiệp vụ và handler: `npm test`.
- Bundle Worker: `npm run build` — dry-run local.
- SQL, luồng Worker hoặc backup: chạy build mới rồi `npm run test:d1`.
- Tài liệu: kiểm tra link tương đối, code fence, ví dụ lệnh và sự nhất quán với code. Không cần thêm test mô phỏng nội dung tài liệu.

Thêm test cho kết quả nghiệp vụ hoặc tình huống lỗi cụ thể, không chỉ khớp chuỗi triển khai. Khi gửi pull request, nêu hành vi thay đổi, kiểm chứng và giới hạn còn lại.

## Thao tác bên ngoài

Không deploy, đăng ký webhook, push GitHub, gửi dữ liệu qua bot, upload backup hoặc sửa database remote nếu người dùng chưa cho phép thao tác đó. Quyền kiểm tra/build local không đồng nghĩa quyền triển khai. CI chỉ kiểm tra, không deploy.
