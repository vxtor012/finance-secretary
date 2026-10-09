# Hướng dẫn kiểm thử

Tài liệu hướng dẫn kiểm tra mã, nghiệp vụ và runtime của bot trước khi gửi pull request hoặc triển khai. Các kiểm thử tự động chạy local, không cần token Telegram, khóa AI hay tài khoản Cloudflare.

## 1. Chuẩn bị

Cài Node.js 24 trở lên, mở terminal trong thư mục gốc repository và chạy:

```sh
npm ci
```

Giữ phiên bản dependency từ `package-lock.json`. Node 24 cung cấp `node:sqlite` cho bộ kiểm thử sổ cái và khôi phục dữ liệu.

## 2. Chạy toàn bộ kiểm tra

```sh
npm run check
npm test
npm run build
npm run test:d1
```

Thứ tự quan trọng: `test:d1` dùng file `build/worker.js`, vì vậy luôn build lại sau khi thay đổi mã Worker.

| Lệnh | Kiểm tra | Kết quả mong đợi |
| --- | --- | --- |
| `npm run check` | Cú pháp JavaScript và metadata skill | Thông báo xác minh thành công, exit code 0 |
| `npm test` | Parser, SQL, nghiệp vụ, handler, AI mock, scheduler, backup, PNG | Không có test fail |
| `npm run build` | Đóng gói Worker bằng Wrangler dry-run | Tạo bundle trong `build/`, không deploy |
| `npm run test:d1` | Bundle chạy trên workerd và D1 local | Thông báo `PASS: real local Workers/D1 runtime...` |

`check` cần chạy tiến trình Node con; `build` và `test:d1` cần chạy các công cụ/runtime local. Trong môi trường sandbox, quyền tạo tiến trình con có thể bị hạn chế. Lỗi `spawn EPERM` là lỗi môi trường chạy, không phải kết quả nghiệm thu nghiệp vụ.

## 3. Các lớp kiểm thử

### 3.1. Parser và quy tắc dữ liệu

File: [`test/domain.test.js`](../test/domain.test.js).

Kiểm tra số nguyên VND, đơn vị `k`/`tr`, dấu phân cách, cú pháp lệnh, ngày hợp lệ và ranh giới kỳ theo UTC+7. Kiểm tra dữ liệu AI không hợp lệ bị từ chối trước khi tạo nháp.

### 3.2. Sổ cái và trigger SQL

File: [`test/ledger.test.js`](../test/ledger.test.js). Helper: [`test/d1.js`](../test/d1.js).

Bộ test nạp migration thật vào SQLite trong bộ nhớ. Adapter mô phỏng API D1, trong đó `batch` có commit/rollback nguyên tử.

Các tình huống chính:

- Tài khoản zero chưa đối soát; đối soát không tăng thu nhập.
- Hai posting cân bằng; transaction, posting và audit không bị sửa hoặc xóa.
- Xác nhận lặp chỉ ghi một lần; nháp hết hạn hoặc có số dư đối soát cũ không ghi.
- Công nợ trả từng phần; hai nháp thanh toán không thể trả vượt remaining.
- Chi bằng thẻ tính chi; trả thẻ không tính chi; vượt limit hoặc trả thẻ quá nợ rollback toàn bộ.
- Đảo giao dịch bằng bút toán mới, chỉ đảo một lần và ảnh hưởng đúng báo cáo.
- Đối soát không chênh lệch chỉ cập nhật trạng thái, không tạo transaction zero.

### 3.3. Handler, lịch và tích hợp giả lập

File: [`test/worker.test.js`](../test/worker.test.js).

Kiểm tra quyền truy cập webhook/callback, body sai hoặc quá lớn, preview/cancel, xử lý inbox, quota ngày, hàng đợi retry và job hết lượt.

Cùng bộ test này kiểm tra:

- Khoản lặp sinh một kỳ duy nhất, thanh toán một lần và tạo bù kỳ bị bỏ lỡ.
- Báo cáo tuần/tháng/năm đúng lịch UTC+7.
- Sao kê loại giao dịch mua sau ngày chốt và xử lý đảo thanh toán.
- AI fallback với JSON sai, ngân sách gọi nguyên tử và định dạng response của adapter.
- JSON backup phục hồi đúng các bảng; dữ liệu công nợ bị sửa bị phát hiện.
- PNG có cấu trúc đúng và dữ liệu ảnh giải nén được.

Provider và Telegram trong bộ test được giả lập. Các test này không đo chất lượng hiểu tiếng Việt của model thật.

### 3.4. Runtime Workers/D1 thật ở local

Script: [`scripts/test-d1.js`](../scripts/test-d1.js).

Miniflare chạy bundle Worker trên workerd với D1 local. Script nạp schema, gửi webhook, xác nhận và replay callback, kiểm tra số dư, kiểm tra rollback khi vượt hạn mức, rồi xuất JSON và phục hồi vào D1 local thứ hai.

Toàn bộ outbound fetch được chuyển sang Worker Telegram mock. Không gửi tin nhắn thật hoặc gọi model bên ngoài.

## 4. Chạy một nhóm kiểm thử

Parser:

```sh
node --test --test-isolation=none test/domain.test.js
```

Sổ cái:

```sh
node --test --test-isolation=none test/ledger.test.js
```

Các test có tên chứa `credit`:

```sh
node --test --test-isolation=none --test-name-pattern="credit" test/*.test.js
```

Sau khi test nhóm đạt, chạy lại chuỗi kiểm tra toàn bộ trước khi gửi pull request. Kiểm thử từng nhóm không thay thế kiểm thử runtime khi sửa SQL hoặc luồng Worker.

## 5. Kiểm tra bản sao lưu

Với một JSON đã tải từ `/backup`:

```sh
npm run backup:verify -- backups/finance.json
```

Lệnh phục hồi dữ liệu vào SQLite tạm và đối chiếu toàn bộ bảng nghiệp vụ. Để kiểm tra quy trình import D1 thủ công, làm theo [khôi phục local](OPERATIONS.md#52-thử-khôi-phục-vào-d1-local-mới).

Dùng một bản sao thực tế định kỳ để kiểm tra quy trình tải, lưu và phục hồi. Test fixture không thay thế việc kiểm tra bản sao lưu của môi trường vận hành.

## 6. Kiểm tra staging trước phát hành

Dùng bot và database staging riêng. Cấu hình owner và secrets theo [README](../README.md). Các bước dưới đây cần kết nối thật tới Telegram hoặc provider; người thực hiện phải có quyền dùng các tài khoản đó.

| Bước | Thao tác | Kết quả mong đợi |
| --- | --- | --- |
| 1 | Gửi `/start` và `/sodu` bằng owner | Bot trả lời; tiền mặt zero, chưa đối soát |
| 2 | Nhắn bot bằng người khác hoặc group chat | Không nhận dữ liệu sổ hoặc tạo giao dịch |
| 3 | Tạo ngân hàng, đối soát 1.000.000 đ | Sau xác nhận, số dư đúng và có dấu đối soát |
| 4 | Ghi thu 200.000 đ, chi 50.000 đ | Ngân hàng còn 1.150.000 đ; báo cáo thu 200.000, chi 50.000 |
| 5 | Chuyển 100.000 đ sang tiền mặt | Ngân hàng 1.050.000 đ, tiền mặt 100.000 đ; tổng thu chi không đổi |
| 6 | Bấm xác nhận cùng một nháp thêm lần nữa | Không thêm transaction hoặc đổi số dư |
| 7 | Vay 500.000 đ rồi trả 200.000 đ | Remaining 300.000 đ; không tăng thu chi |
| 8 | Tạo thẻ limit 1.000.000 đ, chi 300.000 đ, trả 100.000 đ | Dư nợ −200.000 đ; chỉ có 300.000 đ chi từ thẻ |
| 9 | Thử chi thẻ vượt limit hoặc trả vượt dư nợ | Bị từ chối; số dư giữ nguyên |
| 10 | Tạo kỳ lặp gần hạn, dùng `/tralap` và xác nhận | Nhắc kỳ; ghi một chi và đánh dấu paid |
| 11 | Gửi `/baocao tháng`, `/xuat`, `/backup` | Nhận bảng, PNG, CSV và JSON; tải JSON và verify đạt |
| 12 | Bật provider AI phù hợp và nhập câu thu chi khác cú pháp rule | Có nháp để kiểm tra; không tự ghi sổ |

Các thao tác ở bước 4–5 dùng tài khoản ngân hàng staging vừa tạo. Luôn chọn đúng tài khoản trong lệnh. Khi kiểm tra lịch tự động, giữ dịch vụ chạy qua thời điểm gửi tương ứng; không đổi đồng hồ hoặc sửa timestamp production để ép lịch.

Kiểm tra ảnh và bảng trên thiết bị Telegram thực tế. Theo dõi CPU Worker, D1 rows read/write, request count và quota provider trong dashboard staging.

## 7. Thêm test cho thay đổi

Chọn test theo hành vi cần bảo vệ:

| Thay đổi | Kiểm tra cần bổ sung |
| --- | --- |
| Nghiệp vụ hoặc posting | Số dư, cân bằng, báo cáo và rollback khi thất bại |
| Công nợ hoặc kỳ lặp | Remaining/trạng thái và hai xác nhận cạnh tranh |
| Parser hoặc AI | Dữ liệu hợp lệ, mơ hồ, sai định dạng và fallback |
| Webhook hoặc callback | Owner, private chat, retry/replay và body giới hạn |
| Scheduler | Ranh giới UTC+7, idempotency và gián đoạn |
| Schema hoặc backup | Restore round-trip và dữ liệu hỏng |

Ưu tiên kiểm tra kết quả nghiệp vụ thay vì chỉ so khớp câu thông báo. Giữ request mạng trong test tự động ở dạng mock. Không đưa token thật hoặc dữ liệu tài chính cá nhân vào fixture.

## 8. CI và phạm vi xác minh

Workflow nằm tại [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). CI cài dependency bằng `npm ci`, chạy kiểm tra cú pháp, tests, dry-run build và runtime D1 local. CI không deploy hoặc đăng ký webhook.

Kết quả local xác minh code, schema và luồng xử lý trong môi trường giả lập. Nó không chứng minh quota free tier, CPU production, model catalog hoặc chất lượng parse của AI thật. Kiểm thử hai promise đồng thời trong Node không tái hiện đầy đủ mạng phân tán; điều kiện SQL và batch nguyên tử vẫn là cơ chế bảo vệ giữa các Worker.

## 9. Khắc phục lỗi môi trường test

| Lỗi | Cách kiểm tra |
| --- | --- |
| Không tìm thấy `node:sqlite` | Kiểm tra `node --version`; dùng Node 24 trở lên |
| Không có `build/worker.js` hoặc bundle cũ | Chạy `npm run build` trước `npm run test:d1` |
| `spawn EPERM` | Kiểm tra quyền tạo tiến trình con trong sandbox/terminal |
| Test D1 không khởi động | Kiểm tra dependency theo lockfile và runtime workerd trên hệ điều hành |
| Cài dependency thất bại | Kiểm tra npm registry, mạng và cache; không sửa lockfile chỉ để bỏ qua lỗi mạng |
| Test nghiệp vụ fail | Đọc assertion và kiểm tra invariant liên quan trong PRD; không giảm kiểm tra để ép đạt |
