# Thư ký Tài chính AI cá nhân

Telegram bot chat-first tiếng Việt, Cloudflare Workers + D1, ưu tiên free tier. Bản 0.1 triển khai sổ cái, xác nhận giao dịch, công nợ đơn giản, khoản lặp, thẻ tín dụng, báo cáo PNG và sao lưu JSON. Chạy kiểm thử không cần tài khoản hoặc token.

**Đặc tả nguồn:** API cuộc trò chuyện “Trợ lý tài chính AI” chỉ trả câu hỏi và mã tham chiếu; không truy xuất được nội dung POP v1.1/PRD. Vì vậy `docs/PRD.md` ghi đặc tả tái dựng từ yêu cầu người dùng cùng những giả định cần đối chiếu khi có bản gốc. Không khẳng định bản này khớp từng chi tiết POP chưa đọc được.

## 1. Chạy và kiểm thử ngay, không cần credentials

Cài Node.js 24 LTS và Git. Mở terminal trong thư mục repository:

```sh
npm ci
npm run check
npm test
npm run build
npm run test:d1
```

`build` dùng `wrangler deploy --dry-run`: chỉ tạo bundle local, không triển khai. `test:d1` dùng runtime Workers/D1 local và Telegram mock local; không gửi tin nhắn ra Telegram. Dùng `npm ci` để giữ phiên bản toolchain trong lockfile. Miniflare hiện đi cùng Wrangler dưới phiên bản alpha; đã khóa cụ thể và có test runtime, không tự cập nhật ngoài CI.

CI trên GitHub chạy đúng chuỗi này, không chứa bước deploy hay secret production. Toàn bộ runtime là JavaScript ESM dùng API Workers có sẵn; npm dependencies chỉ phục vụ phát triển.

## 2. Thử Worker local

```sh
cp .env.example .dev.vars
npm run db:local
npm run dev
```

Trên PowerShell, thay `cp` bằng `Copy-Item .env.example .dev.vars`. `GET http://localhost:8787/health` kiểm tra Worker sống; không kiểm tra credentials hay khả năng gửi Telegram. Nếu thử webhook local bằng token giả, gửi Telegram sẽ thất bại và vào hàng đợi; dùng `test:d1` để kiểm thử đầy đủ với mock.

Điền `.dev.vars` khi đã có bot thử nghiệm; `.dev.vars` bị Git bỏ qua. Các trường bắt buộc: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (16–256 chữ/số/gạch ngang/gạch dưới), `OWNER_TELEGRAM_ID` (ID số của bạn). Bot chỉ nhận chat riêng có sender ID và chat ID đều khớp owner. ID chủ sở hữu không được lấy từ username.

Tạo secret ngẫu nhiên tại máy:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## 3. Dùng bot

Gửi `/start` hoặc `/help`. Bắt đầu bằng:

```text
/taikhoan | ngân hàng | bank
/doisoat | ngân hàng | 3000000
thu 12tr lương vào ngân hàng #lương
chi 50k ăn trưa bằng ngân hàng #ăn uống
/chuyen | 1tr | ngân hàng | tiền mặt | rút ATM
/sodu
/baocao tháng
```

Mọi thay đổi sổ cái hiển thị bản nháp và nút **Xác nhận/Bỏ qua**, hết hạn sau 15 phút. Tài khoản mới là **0 đ • CHƯA ĐỐI SOÁT**, không đồng nghĩa bạn thực sự có 0 đ. `/doisoat` nhập số dư thực tế và tạo điều chỉnh riêng, không tăng thu nhập. Dữ liệu ghi theo thời điểm xác nhận, chưa hỗ trợ ghi lùi ngày.

```text
/vay | 2tr | An | ngân hàng | 2026-11-01
/chovay | 1tr | Bình | tiền mặt | -
/congno
/trano | debt-d-123 | 500k | ngân hàng
/thuno | debt-d-124 | 200k | tiền mặt
/the | visa | 20tr | 10 | 25
/chi | 500k | visa | mua sắm | mua đồ
/chuyen | 500k | ngân hàng | visa | trả thẻ
/laplai | thuê trọ | 3tr | ngân hàng | nhà ở | 5
/dinhky
/tralap | rec-125:2026-11-05
/bolap | rec-125:2026-11-05
/dunglap | rec-125
/lichsu
/huy | tx-d-126
/backup
/xuat
/trangthai
```

Mã ví dụ cần thay bằng mã bot trả về. Vay/cho vay mở khoản nợ riêng; trả từng phần không thể vượt số còn nợ. `-` nghĩa không hạn trả. Thẻ dùng số dư âm để thể hiện nợ; trả thẻ dùng chuyển nội bộ, không ghi chi lần hai. Ngày chốt/hạn trả/khoản lặp hỗ trợ 1–28. Thẻ là sổ theo dõi đơn giản: chốt dư nợ, nhắc ngày trả, không mô phỏng lãi, phí, trả góp hay số tiền tối thiểu của ngân hàng.

Khoản lặp chỉ nhắc. `/tralap` tạo nháp chi, xác nhận mới ghi; hai nháp của cùng kỳ chỉ có một nháp ghi được. `/huy` đảo thu/chi/chuyển tiền bằng bút toán mới, giữ lịch sử; chưa đảo công nợ, đối soát hoặc chi từ kỳ lặp.

## 4. Báo cáo và sao lưu

Cron chạy mỗi giờ. Từ **08:00 UTC+7**, báo cáo tuần gửi thứ Hai cho tuần vừa kết thúc, tháng gửi ngày 1 cho tháng trước, năm gửi 1/1 cho năm trước. Gửi sau khi kỳ đã đóng để đủ dữ liệu cuối kỳ. Mỗi kỳ có bảng Telegram, biểu đồ PNG hai cột thu/chi và diễn giải theo quy tắc. Số dư trong báo cáo được ghi rõ là hiện tại; chưa có bảng số dư lịch sử cuối kỳ. Không gửi số liệu báo cáo tới dịch vụ biểu đồ hoặc AI bên ngoài.

Nhắc công nợ có hạn, khoản lặp và thẻ từ 3 ngày trước hạn, nhắc mỗi ngày nếu chưa trả. Sao lưu JSON tự động thứ Hai (tắt bằng `AUTO_BACKUP=false`), hoặc `/backup`; `/xuat` xuất CSV. Sao lưu gửi vào chat riêng, không được mã hóa đầu cuối bởi bot; nếu không muốn tệp tài chính trên Telegram, tắt AUTO_BACKUP và dùng export D1 local theo `docs/OPERATIONS.md`.

```sh
npm run backup:verify -- backups/finance-2026-10-12.json
npm run backup:verify -- backups/finance-2026-10-12.json --sql backups/restore.sql
```

Lệnh kiểm tra khôi phục vào SQLite tạm trong bộ nhớ, đối chiếu tất cả bảng, số dư công nợ và tính toàn vẹn. File SQL chỉ dùng cho **database trống mới**. Hướng dẫn khôi phục D1, retry và lỗi nằm trong `docs/OPERATIONS.md`.

## 5. Bật AI tùy chọn

Mặc định `AI_ENABLED=false`, mọi chức năng tài chính vẫn dùng được bằng parser và lệnh. Bật AI chỉ để hiểu cách viết thu/chi/chuyển tiền khác; AI không được ghi SQL, gọi công cụ hay quyết định giao dịch. Kết quả cũng cần xác nhận. AI không xử lý ảnh, voice hoặc tư vấn đầu tư.

Đặt `AI_ENABLED=true`, `AI_DAILY_LIMIT=20`, khóa và model của một hay nhiều provider trong `.dev.vars` hoặc Cloudflare secrets. Các adapter:

| Adapter | Cấu hình | Kết nối |
| --- | --- | --- |
| Gemma | GEMMA_API_KEY, GEMMA_MODEL | Google generateContent với model Gemma bạn được cấp |
| Gemini | GEMINI_API_KEY, GEMINI_MODEL | Google generateContent |
| Cloudflare | binding AI, CLOUDFLARE_AI_MODEL | Workers AI; có thể chọn Gemma nếu catalog tài khoản có |
| Groq | GROQ_API_KEY, GROQ_MODEL | endpoint chat completions của Groq |
| OpenRouter | OPENROUTER_API_KEY, OPENROUTER_MODEL | endpoint chat completions của OpenRouter |

Không đóng đinh tên model vì catalog/quota thay đổi. `AI_ORDER=rules,cloudflare,gemma,gemini,groq,openrouter` thể hiện thứ tự; rules luôn chạy trước dù đổi thứ tự. Một tin nhắn thử tối đa hai provider **đã được cấu hình**, mỗi lần gọi trừ quota nguyên tử. Hết quota, lỗi mạng, JSON sai hoặc không hiểu sẽ yêu cầu lệnh rõ hơn. Muốn thử provider thứ ba, đưa nó lên trước trong cấu hình. Provider ngoài nhận nội dung tin nhắn cần parse; chỉ bật khi bạn chấp nhận chính sách dữ liệu/quota của họ.

## 6. Thiết lập Cloudflare/Telegram sau khi cho phép triển khai

**Các bước dưới đây có thao tác bên ngoài. Repository chưa thực hiện chúng.**

1. Tạo bot bằng [BotFather](https://t.me/BotFather), lưu token riêng. Lấy Telegram numeric user ID của chính bạn; nhập nó vào `OWNER_TELEGRAM_ID`.
2. Đăng nhập Cloudflare bằng `npx wrangler login`. Tạo database bằng `npx wrangler d1 create finance`.
3. Thay `database_id` placeholder trong `wrangler.toml` bằng ID được trả về. Chọn free plan; giữ timezone UTC+7.
4. Tạo secrets (Wrangler sẽ hỏi giá trị, không ghi vào Git):

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put OWNER_TELEGRAM_ID
```

5. Chỉ khi đã quyết định triển khai: `npx wrangler d1 migrations apply finance --remote`, rồi `npx wrangler deploy`. Thiết lập secrets trước khi đăng ký webhook. Nếu dùng Workers AI, bỏ comment `[ai]`, chọn model từ catalog và cấu hình `CLOUDFLARE_AI_MODEL`.
6. Đặt `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `WORKER_URL` trong environment terminal riêng rồi chạy `node scripts/set-webhook.js`. Không truyền token trong lệnh có thể vào shell history. Script dùng HTTPS, secret header, chỉ message/callback, không xóa pending updates. Xóa các environment secrets khỏi terminal sau khi xong.
7. Gửi `/start`, tạo tài khoản, ghi giao dịch thử, xác nhận, kiểm tra `/sodu`, `/baocao tháng`, `/backup`. Đối chiếu số tiền rồi mới dùng dữ liệu thật.

Webhook chỉ là `/telegram`, health là `/health`. Không có endpoint admin/đọc ledger công khai. Luồng: webhook xác thực → inbox D1 → parser → nháp → xác nhận nguyên tử → outbox → Telegram. Inbox và outbox có lease/retry; thông báo có thể lặp nếu crash sau khi gửi Telegram, sổ cái vẫn không ghi trùng.

## 7. Free tier và giới hạn thực tế

Với **1 người, 10–30 giao dịch/ngày, vài tài khoản và vài khoản lặp**, thiết kế không cần hosting khác, R2, queue tính phí hay dịch vụ biểu đồ. Mỗi giao dịch có tin nhắn và callback nên khoảng 20–60 webhook/ngày, cộng 24 cron/ngày. Đây là ước tính tải ứng dụng, **không phải bảo đảm miễn phí**: đọc D1 bao gồm những hàng truy vấn đã quét; báo cáo/sao lưu tăng theo kích thước sổ. Kiểm tra usage và CPU trên tài khoản thật sau khi chạy, nhất là báo cáo PNG trên Workers Free.

Mặc định AI tối đa 20 lần gọi/ngày tính cả fallback; 20 câu khó có thể dùng hết quota trước nếu provider đầu lỗi. Parser không gọi AI. Không tự chuyển paid plan, không chọn model trả phí mặc định; bạn tự chọn model free khả dụng và kiểm tra quota/provider khi cấu hình. Adapter không thể ngăn provider trừ phí nếu bạn chọn model trả phí.

Nguồn chính thức để kiểm tra trước khi dùng: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Gemini API](https://ai.google.dev/api), [Groq compatibility](https://console.groq.com/docs/openai), [OpenRouter API](https://openrouter.ai/docs/api_reference/overview). API D1 dùng [batch nguyên tử](https://developers.cloudflare.com/d1/worker-api/d1-database/); webhook dùng [Telegram Bot API](https://core.telegram.org/bots/api#setwebhook).

## 8. Đưa lên GitHub và tái sử dụng

Repository Git local đã được khởi tạo trên nhánh `main`, chưa có remote. Đọc `.gitignore`, giữ token/.dev.vars/backups/database khỏi commit. Trước khi commit, xem `git status` và diff; chỉ đưa mã/tài liệu vào Git. Sau khi bạn cho phép đẩy, tạo repository GitHub (private nếu muốn), rồi:

```sh
git add .
git commit -m "Build Vietnamese personal finance Telegram bot"
git remote add origin <URL_REPOSITORY_CUA_BAN>
git push -u origin main
```

Không cần chia sẻ credentials để người khác tái sử dụng: họ tạo bot/database riêng và cấu hình owner riêng. Chưa gắn license pháp lý mặc định; chọn license phù hợp trước khi phát hành công khai.

`AGENTS.md` và hai skill trong `.agents/skills/` hướng dẫn agent sửa đúng nghiệp vụ, kiểm thử D1 và giữ ranh giới deploy/push. Không cài skill toàn cục hoặc plugin ngoài. Xem `docs/PRD.md` cho mapping yêu cầu và phạm vi; `docs/TESTING.md` cho kiểm thử và giới hạn xác minh.
