# Kiểm thử

```sh
npm ci
npm run check
npm test
npm run build
npm run test:d1
```

Node 24 được dùng cho SQLite tích hợp. Unit/integration trong `test/*.test.js` dùng schema/triggers thật trong SQLite memory và D1 adapter nhỏ để mô phỏng batch rollback. `test:d1` chạy bundle thực trên workerd/Miniflare và binding D1 local, mock toàn bộ outbound fetch sang Worker Telegram giả. Không cần credentials. CI chạy cả hai lớp; build chỉ dry-run.

Kiểm chứng: VND/đơn vị/ngày; owner/secret/body/nhóm; preview/cancel/expiry; balanced ledger/immutable/audit; đồng thời confirm/repay; credit limits/overpay; transfer/debt exclusions khỏi báo cáo; đảo bút toán; recurring paid một lần; report UTC+7/week/month/year; sao kê cutoff và đảo trả thẻ; AI quota/fallback/adapter shapes; outbox retry; JSON snapshot restore/corruption; PNG inflate.

Giới hạn: D1 local chứng minh schema và Worker flow, không chứng minh quota/performance production. Node test concurrency là việc hai promises cùng chuẩn bị/confirm, database local tuần tự tại commit; cần SQL guard/trigger để bảo vệ giữa nhiều Worker thật. Không có kiểm thử live Telegram, model catalog hoặc provider free quotas khi chưa cấp credentials. CI YAML đã tạo, nhưng chưa chạy trên GitHub vì chưa push. UI Telegram chưa kiểm tra trên điện thoại; HTML và PNG đã kiểm tra cấu trúc local.

Checklist khi được phép chạy staging thật: owner denied test bằng tài khoản khác; chat riêng; nhập/xác nhận mẫu; callback trùng; thẻ limit; công nợ partial; reminders; gửi PNG/backup và tải/verify; kiểm tra CPU, request counts, D1 rows_read/written và AI quota. Staging dùng bot/database riêng, không dùng ledger thật để thử rollback.
