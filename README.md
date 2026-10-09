# Thư ký Tài chính AI

Bot Telegram giúp quản lý tài chính cá nhân bằng tiếng Việt: ghi thu chi, theo dõi tài khoản và công nợ, nhắc thanh toán, nhận báo cáo ngay trong cuộc trò chuyện.

Dự án chạy trên **Cloudflare Workers + D1**, hướng tới nhu cầu của một người dùng và chi phí vận hành thấp. AI là thành phần tùy chọn; các lệnh tài chính vẫn hoạt động khi không cấu hình AI.

```text
Bạn: chi 50k ăn trưa bằng ngân hàng #ăn uống
Bot: Chi: 50.000 đ
     ngân hàng
     ăn uống • ăn trưa
     [Xác nhận] [Bỏ qua]
```

## Tính năng

- **Thu chi và tài khoản:** tiền mặt, ngân hàng, thẻ tín dụng; chuyển tiền nội bộ và đối soát số dư.
- **Công nợ:** vay, cho vay, trả hoặc thu nợ từng phần, có hạn trả hoặc không hạn.
- **Khoản định kỳ:** nhắc tiền thuê trọ, subscription và các khoản thanh toán hằng tháng.
- **Thẻ tín dụng:** theo dõi dư nợ, hạn mức, ngày chốt sao kê và hạn thanh toán.
- **Báo cáo:** bảng thu chi, biểu đồ PNG và diễn giải; gửi tự động theo tuần, tháng, năm.
- **AI tùy chọn:** adapter cho Gemma, Gemini, Cloudflare Workers AI, Groq và OpenRouter, có fallback và giới hạn lượt gọi.
- **Tính toàn vẹn dữ liệu:** xác nhận trước khi ghi sổ, chống ghi trùng, bút toán cân bằng và lịch sử audit.
- **Xuất dữ liệu:** CSV để phân tích, JSON để sao lưu và công cụ kiểm tra khôi phục.

## Nguyên tắc ghi sổ

Tất cả số tiền được lưu bằng **số nguyên VND**. Mỗi giao dịch có hai bút toán cân bằng và cần được xác nhận trước khi ghi vào sổ.

| Nghiệp vụ | Cách ghi nhận |
| --- | --- |
| Thu nhập, chi tiêu | Tính vào thu hoặc chi của kỳ báo cáo |
| Chuyển nội bộ, trả nợ, thu hồi nợ, trả thẻ | Thay đổi số dư hoặc công nợ, không tính lại vào thu chi |
| Đối soát | Điều chỉnh số dư theo thực tế, không coi là thu nhập hoặc chi tiêu |
| Hủy giao dịch | Thêm bút toán đảo, giữ nguyên lịch sử gốc |

Tài khoản mới có số dư **0 đ • CHƯA ĐỐI SOÁT**. Trạng thái này có nghĩa chưa biết số dư thực tế, không khẳng định tài khoản đang hết tiền. Dùng `/doisoat` để nhập số dư thực tế.

## Kiến trúc

```text
Telegram
   │ webhook có xác thực
   ▼
Cloudflare Worker ──► Inbox D1
   │
   ├─ Parser theo quy tắc
   └─ AI adapter tùy chọn
   │
   ▼
Bản nháp ──► Xác nhận ──► Sổ cái + Audit + Outbox D1
                                              │
                                              ▼
                                           Telegram

Cron ──► Nhắc thanh toán / Báo cáo / Sao lưu
```

Worker sử dụng JavaScript ESM và API có sẵn của Cloudflare, không có dependency npm cho runtime. Wrangler và Miniflare phục vụ phát triển, đóng gói và kiểm thử. Biểu đồ được tạo trong Worker, không gửi dữ liệu tài chính tới dịch vụ vẽ biểu đồ bên ngoài.

## Bắt đầu nhanh

### Yêu cầu

- Node.js 24 trở lên và npm.
- Git để tải và quản lý mã nguồn.
- Tài khoản Cloudflare và bot Telegram nếu muốn vận hành bot thật.

### Cài đặt và kiểm thử

Tải repository, mở terminal trong thư mục dự án rồi chạy:

```sh
npm ci
npm run check
npm test
npm run build
npm run test:d1
```

Các bước này không cần token Telegram hoặc khóa AI. `npm run build` chỉ tạo bundle bằng chế độ dry-run. `npm run test:d1` chạy Workers/D1 local với Telegram giả lập, không gửi tin nhắn ra ngoài.

### Chạy local

Tạo file cấu hình:

```sh
cp .env.example .dev.vars
```

Trên PowerShell:

```powershell
Copy-Item .env.example .dev.vars
```

Điền các biến bắt buộc vào `.dev.vars`, sau đó chạy:

```sh
npm run db:local
npm run dev
```

Worker local cung cấp:

- `GET /health`: kiểm tra dịch vụ đang chạy.
- `POST /telegram`: nhận webhook Telegram có secret header.

`/health` không kiểm tra token hoặc kết nối Telegram. Với token giả, việc gửi tin nhắn sẽ thất bại; dùng `npm run test:d1` để kiểm thử toàn bộ luồng bằng mock.

## Cấu hình

Xem toàn bộ biến mẫu trong [`.env.example`](.env.example). Cấu hình local nằm trong `.dev.vars`; token và khóa API trên Cloudflare được lưu bằng Wrangler secrets.

| Biến | Ý nghĩa | Mặc định / yêu cầu |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token bot từ BotFather | Bắt buộc |
| `TELEGRAM_WEBHOOK_SECRET` | Secret xác thực webhook | Bắt buộc; 16–256 ký tự chữ, số, `_` hoặc `-` |
| `OWNER_TELEGRAM_ID` | Numeric Telegram user ID của chủ sở hữu | Bắt buộc; không dùng username |
| `TIMEZONE` | Múi giờ cho báo cáo và lời nhắc | `Asia/Ho_Chi_Minh`; hỗ trợ thêm `Asia/Bangkok` |
| `AI_ENABLED` | Bật parser AI | `false` |
| `AI_ORDER` | Thứ tự ưu tiên provider | `rules,cloudflare,gemma,gemini,groq,openrouter` |
| `AI_DAILY_LIMIT` | Số lượt gọi AI tối đa mỗi ngày UTC, gồm fallback | `20` |
| `AUTO_BACKUP` | Gửi sao lưu JSON tự động vào Telegram | `true` |

`TIMEZONE` và `AUTO_BACKUP` được cấu hình mặc định trong [`wrangler.toml`](wrangler.toml). Bot chỉ phục vụ chủ sở hữu trong chat riêng; sender ID và chat ID phải khớp `OWNER_TELEGRAM_ID`.

Tạo webhook secret ngẫu nhiên:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Không commit `.dev.vars`, token, khóa API, database hoặc bản sao lưu. Các đường dẫn này đã được khai báo trong `.gitignore`.

## Triển khai lên Cloudflare

### 1. Tạo bot và database

Tạo bot qua [BotFather](https://t.me/BotFather), lưu token và xác định numeric Telegram user ID của bạn.

```sh
npx wrangler login
npx wrangler d1 create finance
```

Thay `database_id` trong `wrangler.toml` bằng ID được trả về. Kiểm tra tên Worker và cấu hình trước khi triển khai.

Giữ `binding = "DB"` vì Worker truy cập `env.DB`. Có thể đổi `database_name` theo tên database của bạn; dùng đúng tên đó trong các lệnh D1 bên dưới.

### 2. Thiết lập secrets

Wrangler sẽ hỏi giá trị của từng secret:

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put OWNER_TELEGRAM_ID
```

### 3. Áp dụng migration và deploy

```sh
npx wrangler d1 migrations apply finance --remote
npx wrangler deploy
```

Lưu URL HTTPS của Worker được trả về. Các lệnh trong phần này tạo hoặc cập nhật tài nguyên trên tài khoản Cloudflare.

### 4. Đăng ký webhook

Đặt ba biến sau trong environment của terminal:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `WORKER_URL`, ví dụ `https://your-worker.workers.dev`

Sau đó chạy:

```sh
node scripts/set-webhook.js
```

Script đăng ký endpoint `/telegram`, bật cập nhật tin nhắn và callback, giữ lại pending updates. Tránh nhập token trực tiếp vào lệnh có thể được lưu trong shell history.

Mở chat riêng với bot, gửi `/start`, ghi một giao dịch thử và kiểm tra `/sodu`, `/baocao tháng`, `/backup`.

## Sử dụng

Gửi `/help` để xem cú pháp. Số tiền có thể viết dưới dạng `50000`, `50k`, `1,5tr` hoặc `1.500.000`.

### Thu chi và tài khoản

```text
/taikhoan | ngân hàng | bank
/doisoat | ngân hàng | 3000000
thu 12tr lương vào ngân hàng #lương
chi 50k ăn trưa bằng ngân hàng #ăn uống
/thu | 12tr | ngân hàng | lương | tháng này
/chi | 50k | tiền mặt | ăn uống | ăn trưa
/chuyen | 1tr | ngân hàng | tiền mặt | rút ATM
/sodu
/lichsu
```

`cash` là tài khoản tiền mặt, `bank` là tài khoản ngân hàng. Tài khoản mặc định tên `tiền mặt`. Dùng `#tên nhóm` để chỉ định danh mục trong câu thu chi.

Bản nháp có nút **Xác nhận** và **Bỏ qua**, hết hạn sau 15 phút. Giao dịch được ghi theo thời điểm xác nhận.

### Công nợ

```text
/vay | 2tr | An | ngân hàng | 2026-11-01
/chovay | 1tr | Bình | tiền mặt | -
/congno
/trano | debt-d-123 | 500k | ngân hàng
/thuno | debt-d-124 | 200k | tiền mặt
```

Thay mã nợ ví dụ bằng mã bot trả về. Ngày dùng định dạng `YYYY-MM-DD`; `-` nghĩa không có hạn trả. Mỗi khoản vay hoặc cho vay có mã riêng. Thanh toán từng phần không được vượt số nợ còn lại.

### Thẻ tín dụng

```text
/the | visa | 20tr | 10 | 25
/chi | 500k | visa | mua sắm | mua đồ
/chuyen | 500k | ngân hàng | visa | trả thẻ
/doisoat | visa | -500000
```

Lệnh `/the` lần lượt nhận tên thẻ, hạn mức, ngày chốt và ngày trả. Số dư âm thể hiện dư nợ; trả thẻ dùng chuyển tiền nội bộ. Sao kê theo dõi dư nợ tại ngày chốt và khoản thanh toán sau chốt.

### Khoản định kỳ

```text
/laplai | thuê trọ | 3tr | ngân hàng | nhà ở | 5
/dinhky
/tralap | rec-125:2026-11-05
/bolap | rec-125:2026-11-05
/dunglap | rec-125
```

Thay mã khoản lặp và mã kỳ bằng giá trị bot trả về. Khoản định kỳ **chỉ gửi lời nhắc**, không tự trừ tiền. `/tralap` tạo bản nháp chi để xác nhận; `/bolap` bỏ qua một kỳ; `/dunglap` ngừng sinh kỳ mới.

### Báo cáo, hủy giao dịch và xuất dữ liệu

| Lệnh | Chức năng |
| --- | --- |
| `/baocao tuần` | Báo cáo tuần hiện tại |
| `/baocao tháng` | Báo cáo tháng hiện tại |
| `/baocao năm` | Báo cáo năm hiện tại |
| `/huy \| mã_giao_dịch` | Tạo bản nháp đảo giao dịch thu, chi hoặc chuyển tiền |
| `/backup` | Gửi bản sao lưu JSON |
| `/xuat` | Xuất sổ giao dịch CSV |
| `/trangthai` | Xem số tác vụ xử lý hoặc gửi tin bị lỗi |

## Báo cáo và lời nhắc tự động

Cron chạy mỗi giờ. Từ **08:00 UTC+7**, bot gửi báo cáo theo lịch:

| Báo cáo | Thời điểm | Kỳ dữ liệu |
| --- | --- | --- |
| Tuần | Thứ Hai | Tuần vừa kết thúc |
| Tháng | Ngày 1 hằng tháng | Tháng trước |
| Năm | Ngày 1/1 | Năm trước |

Báo cáo gồm bảng nhóm thu chi, biểu đồ hai cột và diễn giải theo quy tắc. Số dư tài khoản trong báo cáo là **số dư hiện tại**, không phải số dư cuối kỳ lịch sử.

Công nợ có hạn, khoản định kỳ và dư nợ thẻ được nhắc từ ba ngày trước hạn, sau đó nhắc mỗi ngày nếu chưa thanh toán. Thời gian nhận có thể chậm hơn lịch khi hàng đợi tồn đọng hoặc Telegram gặp lỗi.

## AI tùy chọn

Parser theo quy tắc luôn chạy trước. Khi không hiểu một tin nhắn thông thường và `AI_ENABLED=true`, bot thử các provider đã cấu hình theo thứ tự ưu tiên.

| Provider | Biến cần thiết |
| --- | --- |
| Gemma qua Google API | `GEMMA_API_KEY`, `GEMMA_MODEL` |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Cloudflare Workers AI | Binding `AI`, `CLOUDFLARE_AI_MODEL` |
| Groq | `GROQ_API_KEY`, `GROQ_MODEL` |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |

Để dùng Workers AI, bỏ comment cấu hình `[ai]` trong `wrangler.toml`. Chọn model khả dụng từ catalog của provider; dự án không đặt tên model mặc định.

Một tin nhắn thử tối đa **hai provider đã cấu hình**. Mỗi lần gọi, kể cả fallback, đều tính vào ngân sách ngày. Khi hết quota hoặc provider lỗi, bot hướng dẫn nhập lệnh rõ ràng hơn.

AI chỉ đề xuất giao dịch thu, chi hoặc chuyển tiền. Kết quả được kiểm tra và hiển thị để chủ sở hữu xác nhận; AI không có quyền ghi database hay thực thi công cụ. Nội dung tin nhắn cần phân tích sẽ được gửi tới provider đã chọn. Báo cáo sử dụng diễn giải theo quy tắc, không gửi số liệu báo cáo cho AI.

## Sao lưu và khôi phục

Bot gửi sao lưu JSON tự động vào thứ Hai khi `AUTO_BACKUP=true`. Có thể tạo bản sao bất cứ lúc nào bằng `/backup`.

Lưu tệp vào thư mục `backups/`, rồi kiểm tra khả năng khôi phục:

```sh
npm run backup:verify -- backups/finance.json
```

Tạo SQL phục hồi:

```sh
npm run backup:verify -- backups/finance.json --sql backups/restore.sql
```

Công cụ phục hồi vào SQLite tạm để kiểm tra tính toàn vẹn, công nợ và dữ liệu các bảng trước khi xuất SQL. `restore.sql` chỉ dùng cho **database mới, trống**. CSV là dữ liệu để phân tích, không thay thế bản sao lưu JSON.

Tệp sao lưu chứa dữ liệu tài chính riêng tư và được gửi qua Telegram; bot không mã hóa tệp. Có thể tắt `AUTO_BACKUP` và sử dụng D1 export. Xem [hướng dẫn vận hành và khôi phục](docs/OPERATIONS.md) để biết chi tiết.

## Bảo mật và độ tin cậy

- Xác thực secret webhook trước khi xử lý nội dung; chỉ chấp nhận chủ sở hữu trong chat riêng.
- Tin nhắn và callback đều kiểm tra quyền truy cập.
- Inbox, khóa nguồn giao dịch và kiểm tra nguyên tử trong D1 ngăn ghi sổ trùng khi retry hoặc xác nhận đồng thời.
- Ledger và audit giữ lịch sử; điều chỉnh giao dịch bằng bút toán mới.
- Inbox/outbox có cơ chế giữ quyền xử lý tạm thời và retry; tác vụ lỗi được giữ lại để kiểm tra.
- Không ghi raw update, prompt AI, token hoặc dữ liệu tài chính vào log ứng dụng.
- Giới hạn 500 update hợp lệ mới mỗi ngày UTC; tin nhắn tối đa 1.000 ký tự.

Thông báo Telegram có thể gửi lặp nếu Worker dừng sau khi Telegram nhận tin nhưng trước khi cập nhật trạng thái gửi. Trường hợp này không tạo thêm bút toán trong sổ cái.

## Chi phí vận hành

Thiết kế hướng tới một người dùng với khoảng 10–30 giao dịch/ngày, vài tài khoản và một số khoản định kỳ. Không cần máy chủ riêng, R2 hoặc dịch vụ biểu đồ bên ngoài.

Chi phí thực tế phụ thuộc gói Cloudflare, lượng dữ liệu và model AI được chọn. Dự án không tự nâng gói; giới hạn lượt gọi AI giúp kiểm soát mức sử dụng nhưng không ngăn provider tính phí nếu cấu hình model trả phí. Theo dõi CPU, D1 rows read/write và quota AI sau khi triển khai.

Tham khảo chính sách hiện hành tại [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/), [D1](https://developers.cloudflare.com/d1/platform/pricing/) và [Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/).

## Giới hạn hiện tại

- Một chủ sở hữu, một đơn vị tiền tệ VND, múi giờ UTC+7.
- Chỉ xử lý tin nhắn văn bản; chưa hỗ trợ ảnh, OCR hoặc voice.
- Chưa hỗ trợ giao dịch lùi ngày, công nợ có lãi hoặc xóa nợ.
- Ngày thanh toán định kỳ, chốt thẻ và trả thẻ hỗ trợ từ 1 đến 28.
- Thẻ tín dụng chưa tính phí, lãi, trả góp hoặc số tiền thanh toán tối thiểu; cần đối chiếu sao kê ngân hàng.
- Chưa hỗ trợ đảo công nợ, đối soát hoặc giao dịch đã thanh toán qua kỳ lặp.
- Báo cáo tự động chưa bù kỳ bị bỏ lỡ nếu dịch vụ dừng cả ngày gửi báo cáo.
- Sao lưu đọc toàn bộ lịch sử vào bộ nhớ; chưa phù hợp với dữ liệu ở quy mô hàng triệu giao dịch.

## Phát triển và đóng góp

```text
src/                 Worker, bot, ledger, AI, báo cáo và lịch nhắc
migrations/          Schema và migration D1
test/                Kiểm thử parser, nghiệp vụ và luồng bot
scripts/             Công cụ kiểm thử D1, webhook và khôi phục
.github/workflows/   CI kiểm tra mã và build
.agents/skills/      Skill dành cho coding agent
AGENTS.md            Quy tắc phát triển và bảo toàn nghiệp vụ
```

Trước khi gửi pull request, chạy:

```sh
npm run check
npm test
npm run build
npm run test:d1
```

CI chạy các kiểm tra này, không tự deploy. Thay đổi nghiệp vụ cần có kiểm thử cho số dư, báo cáo và các tình huống retry liên quan. Thay đổi schema cần migration mới và cập nhật định dạng sao lưu/khôi phục tương ứng.

Tài liệu bổ sung:

- [Mục lục tài liệu và lộ trình bắt đầu](docs/README.md)
- [Đặc tả và quy tắc nghiệp vụ](docs/PRD.md)
- [Vận hành, retry và khôi phục](docs/OPERATIONS.md)
- [Kiểm thử](docs/TESTING.md)
- [Hướng dẫn coding agent](AGENTS.md)

## License

Dự án chưa chỉ định giấy phép. Thông tin giấy phép sẽ được bổ sung trong file `LICENSE`.
