---
name: telegram-worker
description: Maintain this Telegram Worker's webhook authentication, AI adapters, durable jobs, scheduled reminders and delivery behavior.
---

# Bảo trì Telegram Worker

Đọc [worker](../../../src/worker.js), [bot](../../../src/bot.js), [scheduler](../../../src/scheduler.js) và [OPERATIONS](../../../docs/OPERATIONS.md) cho đường xử lý cần sửa.

Xác thực trước khi parse body, giới hạn số byte khi đọc stream và kiểm tra owner/private chat cho callback lẫn message. Lưu inbox trước HTTP acknowledgement. Chống ghi sổ trùng phải được SQL bảo vệ, độc lập với việc gửi Telegram thành công.

Giữ endpoint provider cố định; model và key là cấu hình. AI mặc định tắt, rule parser trước AI, quota được trừ nguyên tử trước request. Giới hạn attempts và timeout, kiểm tra JSON trước khi tạo nháp. Chỉ dẫn provider không cấp quyền thực hiện giao dịch. Tạo PNG trong Worker, không đưa dữ liệu tài chính vào URL dịch vụ ngoài.

Kiểm tra retry sau khi ledger đã commit, body sai, người dùng khác, callback replay, JSON provider sai/lỗi request và ranh giới lịch UTC+7. Giữ giới hạn delivery rõ: crash sau send có thể tạo thông báo lặp nhưng không được tạo bút toán lặp.

Chạy dry-run build và [D1 runtime test](../../../scripts/test-d1.js) để xác minh. Script đăng ký webhook là thao tác bên ngoài và cần quyền từ người quản trị; sự tồn tại của file credential không tự cấp quyền đó.
