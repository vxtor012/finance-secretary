# Hướng dẫn vận hành và khôi phục

Dành cho người quản trị bot đã triển khai hoặc đang kiểm tra local. Tài liệu bao gồm kiểm tra dịch vụ, xử lý hàng đợi, sao lưu, khôi phục và thay đổi cấu hình.

Cài đặt lần đầu theo [README](../README.md). Quy tắc nghiệp vụ nằm trong [PRD](PRD.md); kiểm thử trước khi phát hành nằm trong [TESTING](TESTING.md).

## 1. Quy ước môi trường

Chạy các lệnh từ thư mục gốc repository với Node.js 24 trở lên và dependencies đã cài bằng `npm ci`.

| Tùy chọn | Môi trường |
| --- | --- |
| `--local` | Database phát triển trên máy, thường nằm trong `.wrangler/` |
| `--remote` | Database trên tài khoản Cloudflare |
| `--persist-to <thư_mục>` | Thư mục dữ liệu local riêng để kiểm tra phục hồi |

Các ví dụ chẩn đoán dùng `--local`. Khi vận hành production, kiểm tra đúng tên database và cấu hình trước khi chuyển sang `--remote`. Đối với script hoặc coding agent, thao tác remote phải nằm trong phạm vi được người quản trị cho phép.

## 2. Kiểm tra dịch vụ

### Worker và Telegram

1. Truy cập `https://<worker-host>/health`; kết quả mong đợi có `ok: true`.
2. Gửi `/start` trong chat riêng của owner; bot trả hướng dẫn.
3. Gửi `/sodu` và `/trangthai`; xác nhận bot phản hồi và xem số job lỗi.
4. Khi cần kiểm tra ghi sổ, dùng bot staging với một giao dịch mẫu rồi xác nhận và xem `/lichsu`.

`/health` chỉ kiểm tra Worker trả lời HTTP. Nó không chứng minh database, token hoặc đường gửi Telegram đang hoạt động.

### Database và hàng đợi

```sh
npx wrangler d1 execute finance --local --command "SELECT kind,count(*) AS total FROM accounts GROUP BY kind"
npx wrangler d1 execute finance --local --command "SELECT state,count(*) AS total FROM inbox GROUP BY state"
npx wrangler d1 execute finance --local --command "SELECT state,count(*) AS total FROM outbox GROUP BY state"
```

Đọc trạng thái và số lượng trước. Không xuất payload, prompt hoặc token vào log dùng chung.

## 3. Lịch tự động

Cron chạy mỗi giờ, tạo báo cáo và lời nhắc từ 08:00 UTC+7:

- Thứ Hai: báo cáo tuần trước và JSON backup nếu `AUTO_BACKUP=true`.
- Ngày 1: báo cáo tháng trước.
- Ngày 1/1: báo cáo năm trước.
- Hằng ngày: nhắc khoản định kỳ, công nợ có hạn và thẻ từ ba ngày trước hạn; tiếp tục nhắc nếu chưa trả.

Khoản định kỳ có thể tạo bù tối đa 12 tháng mỗi lần chạy. Báo cáo tuần/tháng/năm chưa có cơ chế tạo bù nếu dịch vụ dừng cả ngày gửi. Lệnh `/baocao` báo cáo kỳ hiện tại; dùng CSV để tổng hợp kỳ đã bỏ lỡ.

Ngừng khoản lặp bằng `/dunglap` không xóa các kỳ cũ đang chờ. Nếu một khoản đã được ghi bằng `/chi` thay vì `/tralap`, kỳ lặp vẫn chưa trả; kiểm tra sổ trước khi quyết định `/bolap` để tránh ghi chi lần hai.

## 4. Sao lưu

### 4.1. Chọn loại bản sao

| Loại | Cách tạo | Mục đích |
| --- | --- | --- |
| JSON nghiệp vụ | `/backup` hoặc auto thứ Hai | Khôi phục sổ cái và các bảng nghiệp vụ |
| CSV giao dịch | `/xuat` | Phân tích hoặc tổng hợp; không đủ để khôi phục |
| SQL D1 | `wrangler d1 export` | Sao chép database, gồm dữ liệu vận hành và metadata |

JSON không chứa token, inbox, outbox hoặc nháp chưa xác nhận. Tệp được tạo từ dữ liệu tại thời điểm gửi, kể cả khi job sao lưu đã chờ trong hàng đợi.

### 4.2. Lưu bản sao JSON

1. Gửi `/backup` trong chat owner.
2. Tải file `finance-YYYY-MM-DD.json` về máy.
3. Tạo thư mục `backups/` và lưu file tại đó; thư mục này bị Git bỏ qua.
4. Chạy kiểm tra phục hồi:

```sh
npm run backup:verify -- backups/finance.json
```

Thay `finance.json` bằng tên file đã tải. Kết quả thành công bắt đầu bằng `Backup verified:` và có số transaction/account. Nếu lệnh thất bại, giữ bản sao cũ và xem mục xử lý lỗi bên dưới.

Bot không mã hóa tệp JSON; nội dung được gửi qua Telegram. Có thể tắt `AUTO_BACKUP` trong `wrangler.toml` và dùng SQL export nếu không muốn bản sao tự động trên Telegram. Lưu bản sao thứ hai ở nơi riêng tư phù hợp với dữ liệu tài chính.

### 4.3. Xuất SQL D1

Tạo thư mục `backups/` trước khi chạy:

```sh
npx wrangler d1 export finance --local --output backups/full-local.sql
```

Để xuất production, dùng `--remote` và một tên file mới. Không commit SQL vào Git. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) là lựa chọn phục hồi bổ sung; kiểm tra chính sách retention của tài khoản trước khi sử dụng.

## 5. Khôi phục từ JSON

### 5.1. Kiểm tra và sinh SQL

```sh
npm run backup:verify -- backups/finance.json --sql backups/restore.sql
```

Công cụ thực hiện các bước sau trong SQLite tạm trên bộ nhớ:

1. Kiểm tra định dạng `schemaVersion=1` và các bảng bắt buộc.
2. Phục hồi schema và dữ liệu, chạy các trigger sổ cái.
3. Kiểm tra integrity, khóa ngoại và số dư công nợ.
4. Đối chiếu dữ liệu từng bảng với JSON gốc.
5. Chỉ xuất SQL khi các bước trên đạt.

File đích phải chưa tồn tại. SQL có schema và baseline `d1_migrations` cho `0001_ledger.sql`; **không apply migration trước khi import**. Bản sao v1 cần công cụ phục hồi tương thích schema v1.

### 5.2. Thử khôi phục vào D1 local mới

Tạo file `wrangler.restore.toml` ở thư mục gốc với nội dung:

```toml
name = "finance-restore-check"
main = "src/worker.js"
compatibility_date = "2026-10-01"

[[d1_databases]]
binding = "DB"
database_name = "finance-restore"
database_id = "11111111-1111-1111-1111-111111111111"
migrations_dir = "migrations"
```

ID trên chỉ là placeholder cho local. Dùng một thư mục lưu trạng thái mới, chưa có dữ liệu:

```sh
npx wrangler d1 execute finance-restore --local --config wrangler.restore.toml --persist-to .wrangler/restore-check --file backups/restore.sql
```

Kiểm tra kết quả:

```sh
npx wrangler d1 execute finance-restore --local --config wrangler.restore.toml --persist-to .wrangler/restore-check --command "SELECT name,kind,balance FROM balances ORDER BY name"
npx wrangler d1 execute finance-restore --local --config wrangler.restore.toml --persist-to .wrangler/restore-check --command "SELECT count(*) AS transactions FROM transactions WHERE sealed=1"
npx wrangler d1 execute finance-restore --local --config wrangler.restore.toml --persist-to .wrangler/restore-check --command "SELECT id,principal,remaining FROM debts ORDER BY id"
```

Đối chiếu số lượng với output của `backup:verify` và số dư với bản sao nguồn. Nếu muốn thử lại, dùng tên thư mục local mới; không chạy import lần hai vào database đã có schema.

### 5.3. Phục hồi production

Thực hiện trong cửa sổ bảo trì để tránh ghi giao dịch vào hai database khác nhau:

1. Thông báo hoặc chủ động ngừng nhập giao dịch; chờ các xác nhận đang xử lý kết thúc.
2. Giữ bản sao của database hiện tại để rollback.
3. Tạo một D1 mới, ví dụ `npx wrangler d1 create finance-restored`.
4. Tạo cấu hình phục hồi riêng với tên `finance-restored` và **ID thật** vừa nhận.
5. Import SQL vào database mới:

```sh
npx wrangler d1 execute finance-restored --remote --config wrangler.restore.toml --file backups/restore.sql
```

6. Chạy các truy vấn kiểm tra ở mục 5.2 với `--remote` và tên database mới.
7. Cập nhật binding `DB` trong `wrangler.toml` sang tên/ID mới, rồi deploy Worker.
8. Kiểm tra `/sodu`, `/congno` và `/lichsu` bằng bot. Lập lại nháp chưa xác nhận vì JSON không giữ drafts.
9. Tiếp tục nhập giao dịch sau khi kiểm tra hoàn tất; giữ database cũ để rollback.

Không import vào database đang dùng. Nếu import bị ngắt giữa chừng, tạo database mới để thử lại thay vì tiếp tục trên bản phục hồi chưa hoàn chỉnh. Nếu cần rollback binding, xem xét các giao dịch đã ghi vào database mới trước khi đổi lại; đổi binding đơn thuần không chuyển dữ liệu mới về database cũ.

## 6. Hàng đợi và retry

### Trạng thái

| Hàng đợi | Trạng thái |
| --- | --- |
| Inbox | `pending` → `processing` → `done` hoặc `failed` |
| Outbox | `pending` → `sending` → `sent` hoặc `failed` |

Một job đang xử lý có lease để tránh hai Worker cùng nhận. Lease hết hạn cho phép retry. Inbox tối đa 5 lần thử; outbox tối đa 8 lần, backoff tăng tới một giờ. Job hết lượt và lease được chuyển sang `failed`.

Giao dịch không ghi trùng theo source key. Thông báo Telegram có thể gửi lặp nếu Worker dừng sau khi Telegram nhận nhưng trước khi đánh dấu `sent`. Kiểm tra `/lichsu` thay vì tạo thêm giao dịch để xử lý tin nhắn lặp.

### Chẩn đoán job lỗi

```sh
npx wrangler d1 execute finance --local --command "SELECT id,state,attempts FROM inbox WHERE state='failed'"
npx wrangler d1 execute finance --local --command "SELECT id,method,state,attempts FROM outbox WHERE state='failed'"
```

Xác định nguyên nhân trước khi thử lại: token, quyền chat, kết nối mạng, quota, định dạng response hoặc lỗi code. Với một bản nháp quá 15 phút, nhập lệnh mới; retry job không gia hạn bản nháp.

### Retry một job đã xác định

Thay ID mẫu bằng ID thực tế, chỉ chọn một job:

```sh
npx wrangler d1 execute finance --local --command "UPDATE inbox SET state='pending',attempts=0,lease_until=NULL WHERE id=123 AND state='failed'"
npx wrangler d1 execute finance --local --command "UPDATE outbox SET state='pending',attempts=0,lease_until=NULL WHERE id='reply:123' AND state='failed'"
```

Cron hoặc update tiếp theo sẽ xử lý lại. Theo dõi trạng thái sau đó. Không reset toàn bộ hàng đợi hoặc sửa transactions/postings/audit để bỏ qua lỗi nghiệp vụ.

## 7. Xử lý sự cố thường gặp

| Hiện tượng | Kiểm tra | Hướng xử lý |
| --- | --- | --- |
| `/health` thành công nhưng bot im lặng | Webhook, owner ID, token, inbox/outbox | Kiểm tra cấu hình và job lỗi; health không kiểm tra Telegram |
| Webhook trả 401 | Secret header | Cập nhật cùng secret ở Worker và webhook |
| Webhook trả 503 | Biến bắt buộc, binding D1, quota update | Sửa cấu hình hoặc xem quota ngày UTC; không reset quota khi chưa hiểu nguyên nhân |
| Nháp hết hạn | Thời điểm tạo nháp | Nhập lại giao dịch, kiểm tra rồi xác nhận |
| Đối soát báo dữ liệu thay đổi | Số dư đã thay đổi sau khi lập nháp | Lập lại nháp dựa trên số dư mới |
| Trả nợ/thẻ bị từ chối | Remaining, dư nợ và hạn mức | Dùng số tiền hợp lệ, kiểm tra sổ trước khi ghi |
| Kỳ lặp đã trả vẫn nhắc | Khoản được ghi qua `/chi` hay `/tralap` | Đối chiếu sổ; không xác nhận thêm chi nếu đã ghi |
| AI không hiểu hoặc ngừng phản hồi | AI_ENABLED, model/key, ai_usage | Dùng lệnh rõ; sửa provider hoặc chờ quota reset |
| Restore báo table already exists | Database đích không trống | Chọn database và thư mục trạng thái mới |
| Backup không qua verify | Schema/version hoặc dữ liệu hỏng | Dùng code tương thích, bản sao khác; không sửa số liệu để ép verify đạt |

## 8. Cấu hình và credentials

Thay đổi biến thông thường trong `wrangler.toml`, kiểm thử rồi deploy. Đổi secret bằng `wrangler secret put`. Khi đổi webhook secret hoặc token Telegram, cập nhật environment của script và chạy lại `scripts/set-webhook.js` theo [README](../README.md#4-đăng-ký-webhook).

Nếu lộ token hoặc khóa: thu hồi/đổi tại provider, cập nhật secret trên Cloudflare và kiểm tra bot. Không gửi giá trị cũ hoặc mới vào issue, log hay commit. Xóa file khỏi commit hiện tại không loại bỏ giá trị đã nằm trong Git history.

AI mặc định tắt. Khi bật, tin nhắn cần parse có thể ra ngoài Cloudflare tới provider. Reports và chart không dùng AI. CI chỉ kiểm tra và build, không giữ secrets production hoặc tự triển khai.

## 9. Lưu trữ và theo dõi tải

Inbox/outbox/drafts đã xử lý được dọn sau 30 ngày; job failed, ledger, audit và guards được giữ. Kiểm tra định kỳ kích thước D1, CPU Worker, số request, rows read/write và quota AI trên dashboard.

Báo cáo và sao lưu tăng chi phí đọc theo lịch sử sổ. JSON backup hiện đọc toàn bộ bảng nghiệp vụ vào bộ nhớ; với dữ liệu lớn cần ưu tiên SQL export hoặc phát triển cơ chế sao lưu theo phần. Không tự chuyển sang gói tính phí để xử lý một sự cố quota.
