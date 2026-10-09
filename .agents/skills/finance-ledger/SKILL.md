---
name: finance-ledger
description: Implement or review ledger, debt, reconciliation, credit and report changes in this personal Vietnamese finance bot.
---

# Bảo trì nghiệp vụ sổ cái

Đọc [PRD](../../../docs/PRD.md), [ledger](../../../src/ledger.js) và [migration](../../../migrations/0001_ledger.sql) cho nghiệp vụ cần sửa.

Thu/chi dùng tài khoản hệ thống đối ứng; chuyển tiền và thanh toán công nợ không dùng các tài khoản đó. Thẻ và phải trả có số dư âm, phải thu có số dư dương. Remaining của khoản nợ phải khớp trị tuyệt đối số dư tài khoản nợ riêng.

Đặt kiểm tra cạnh tranh trong cùng D1 batch với posting: hai thanh toán không thể trả vượt nợ, đối soát có số dư cũ phải bị từ chối và xác nhận lặp không tạo thêm bút toán. Dùng số tiền nguyên, parse ngày chặt chẽ và bút toán điều chỉnh mới thay vì sửa lịch sử.

Kiểm tra kết quả bằng [ledger tests](../../../test/ledger.test.js). Với báo cáo, xác minh số tiền sau chuyển nội bộ, trả nợ và đảo giao dịch, không chỉ so khớp câu thông báo. Sửa schema cần cập nhật export/restore và kiểm tra phục hồi giữ đúng số dư, công nợ và audit.

Chạy `npm test`, `npm run build` rồi `npm run test:d1` từ repository root cho thay đổi SQL hoặc luồng ghi sổ. Dùng [TESTING](../../../docs/TESTING.md) để chọn kiểm thử bổ sung.
