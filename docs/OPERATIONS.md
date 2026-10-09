# Vận hành và khôi phục

## Sao lưu

`/backup` hoặc auto thứ Hai gửi JSON sổ cái vào chat riêng. Lưu tệp vào `backups/` local (Git bỏ qua), copy bản thứ hai ra ổ cá nhân được mã hóa. Bot không mã hóa tệp; Telegram và tài khoản Cloudflare là nơi giữ dữ liệu. Đặt `AUTO_BACKUP=false` nếu không muốn bản sao trên Telegram. `/xuat` là CSV để phân tích, không đủ khôi phục dữ liệu. Giữ `schemaVersion=1` và dùng đúng code/migrations đi cùng export.

Kiểm thử khôi phục định kỳ:

```sh
npm run backup:verify -- backups/finance.json
npm run backup:verify -- backups/finance.json --sql backups/restore.sql
```

Script không gọi mạng, không sửa database có sẵn. Nó chạy toàn bộ restore vào SQLite in-memory và kiểm tra số hàng/bảng/công nợ/integrity; nếu sai sẽ không xuất SQL. Tệp restore.sql chứa dữ liệu riêng tư, bị Git bỏ qua cùng backups. File đích phải chưa tồn tại.

Để thử import vào một D1 local mới: dùng file cấu hình riêng trỏ `database_name=finance-restore`, `database_id` placeholder mới, `--persist-to .wrangler/restore-check`. Không apply migration trước, vì restore.sql có schema:

```sh
npx wrangler d1 execute finance-restore --local --config wrangler.restore.toml --persist-to .wrangler/restore-check --file backups/restore.sql
```

Kiểm tra bảng balances, count transactions và debts. Chỉ khi đã cho phép phục hồi remote: tạo D1 **mới/trống**, import restore.sql bằng `wrangler d1 execute <new-db> --remote --file backups/restore.sql`, kiểm tra số dư, sau đó đổi binding Worker sang DB mới và deploy khi được cho phép. Không import vào DB đang dùng. Giữ DB cũ làm rollback, không xóa trong cùng thao tác. SQL restore tự tạo baseline `d1_migrations` cho `0001_ledger.sql`, đúng schema đã đóng gói, nên migration tiếp theo không tạo lại bảng. Không apply migration trước restore. Bản 0.1 hỗ trợ riêng schema v1; khi thêm migration mới, cập nhật version/export/restore và kiểm thử baseline tương ứng.

Bản sao toàn D1 SQL, bao gồm operational state và metadata:

```sh
npx wrangler d1 export finance --local --output backups/full-local.sql
```

Khi bạn cho phép export dữ liệu remote, thay `--local` bằng `--remote`. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) là lựa chọn bổ sung của nền tảng; kiểm tra retention/plan thực tế trước khi phụ thuộc. Không coi Time Travel là bản sao ngoại tuyến.

## Delivery và retry

- Inbox tối đa 5 lần; outbox tối đa 8 lần, backoff tăng đến 1 giờ. Fetch khởi động xử lý sau khi inbox commit; cron mỗi giờ là đường phục hồi. `/trangthai` báo số tác vụ failed.
- Ledger exactly-once theo source key. Telegram notification at-least-once: khi Telegram đã nhận nhưng worker chưa ghi sent, retry có thể gửi lặp. Không bấm xác nhận thêm để sửa notification lặp; `/lichsu` kiểm tra sổ.
- Một inbox thất bại không giữ khóa vĩnh viễn, lease hết hạn sẽ thử lại. Nháp quá 15 phút không ghi sổ; nhập lệnh mới. Các lỗi nghiệp vụ rõ (vượt nợ/limit/stale) trả thông báo và không retry để ghi bằng mọi giá.
- Inbox/outbox/drafts đã xong dọn sau 30 ngày. Records failed và ledger/audit/guards giữ lại. Khi dữ liệu lớn, chia report/backup theo kỳ hoặc dùng SQL export; snapshot hiện tại đọc toàn bộ lịch sử vào bộ nhớ và chưa phù hợp hàng triệu giao dịch.

Tra cứu job local bằng `wrangler d1 execute finance --local --command "SELECT id,state,attempts FROM inbox WHERE state='failed'"` (tương tự outbox); không in payload/secrets ra log dùng chung. Với remote, thao tác cần được người sở hữu cho phép. Sửa nguyên nhân (credentials, format/API, network/quota) trước khi retry.

Sau khi xác định không phải lỗi nghiệp vụ và muốn thử lại, giữ nguyên ID:

```sql
UPDATE inbox SET state='pending',attempts=0,lease_until=NULL WHERE id=<ID_CU_THE> AND state='failed';
UPDATE outbox SET state='pending',attempts=0,lease_until=NULL WHERE id='<ID_CU_THE>' AND state='failed';
```

Không retry hàng loạt thiếu xem xét, không sửa transactions/postings/audit để “giải quyết” lỗi. Quota webhook 500 update mới/ngày UTC là giới hạn cố định; không reset để tránh bot loop mà chưa hiểu nguyên nhân.

## Cron và thẻ

Timezone chỉ UTC+7. Cron hourly, từ 08:00 tạo báo cáo/nhắc; có thể chậm bởi backlog/API. Recurring catch-up từ lần tạo kỳ cuối, tối đa 12 tháng mỗi cron. Báo cáo tuần/tháng/năm tự động chỉ kích hoạt trong ngày đầu kỳ; nếu Worker dừng toàn bộ ngày đó, dùng `/baocao` cho kỳ hiện tại và export để tổng hợp kỳ bỏ lỡ; bản 0.1 chưa có catch-up report cho kỳ đã bỏ lỡ. Sao kê thẻ tái dựng kỳ chốt gần nhất từ posting lịch sử, không thay đổi statement đã tạo.

Đối soát số dư thẻ dùng số âm. Đối soát sau chốt không điều chỉnh sao kê đã chốt; đối chiếu ngân hàng thủ công. Chưa hỗ trợ hoàn tiền trực tiếp, phí/lãi, tối thiểu, trả góp, rút tiền thẻ hoặc payment allocation nhiều sao kê. Không cộng tất cả statement.amount vì nợ cũ được mang sang kỳ mới.

## Credential và chia sẻ GitHub

Giữ owner allowlist, webhook secret và token riêng. Nếu lộ: thu hồi token qua BotFather, đổi secret trên Cloudflare, đăng ký lại webhook sau khi được cho phép. Đổi khóa provider tương ứng. Không lưu các giá trị vào source hoặc issue. Sau khi token lọt Git, chỉ xóa file hiện tại không xóa được lịch sử; cần rotate trước rồi xử lý history riêng.

AI opt-in có thể gửi raw text đến provider. Báo cáo và chart không gửi AI; không log raw body. Tắt observability payload logging mặc định. CI không có production secrets/deploy jobs. GitHub Actions chỉ chạy sau khi bạn chủ động push; nhiệm vụ hiện tại chưa có remote.
