# Đặc tả triển khai 0.1

Nguồn: yêu cầu triển khai ngày 2026-10-09, tham chiếu chat “Trợ lý tài chính AI”, ID `6ac89235-7338-83ec-bf73-c1ca0a08cdfb`. Nội dung assistant của chat không truy xuất được, chỉ có content-reference. Đây là đặc tả tái dựng; cần đối chiếu POP v1.1/PRD gốc khi có nội dung. Các yêu cầu rõ trong lời nhắn đã được triển khai; các giả định bên dưới không phải trích dẫn POP.

## Người dùng và cách ghi nhận

Một chủ sở hữu, một Telegram bot, một database. Chat tiếng Việt; tài khoản và danh mục do người dùng đặt tên. Đơn vị VND nguyên; giới hạn một giao dịch và số dư tuyệt đối mỗi tài khoản là 1.000 tỷ để đảm bảo số nguyên an toàn. Có thể theo dõi thiếu/âm số dư tiền mặt hoặc ngân hàng: bot không coi số dư chưa đối soát là tiền khả dụng thực tế. Tài khoản cash mặc định tên “tiền mặt”; tài khoản mới bằng zero và reconciled_at=null.

Không có đăng ký nhiều người, app web, desktop hoặc mobile riêng. Telegram làm giao diện. Tin nhắn phi văn bản không parse. UTC+7 (Asia/Ho_Chi_Minh hoặc Asia/Bangkok), không đổi sang timezone DST. Ngày hạch toán là thời điểm xác nhận; chưa backdate, đa tiền tệ, lãi, đầu tư hoặc nhập OCR.

## Quy tắc sổ cái

Quy ước: số dư là tổng posting đã sealed. Cộng vào tài sản/receivable là tăng số dư; payable/credit mang số dư âm. Hai posting mỗi transaction, tổng bằng 0, độ lớn mỗi posting bằng transaction.amount. Trigger từ chối seal sai, vượt hạn mức thẻ, trả thẻ quá nợ hoặc số dư ngoài giới hạn. Transactions/postings/audit/debt_events đã ghi không được update/delete, ngoại trừ chuyển sealed 0→1 trong cùng batch.

| Nghiệp vụ | Bút toán | Tác động báo cáo |
| --- | --- | --- |
| Thu | tài khoản +A, @thu −A | thu +A |
| Chi tiền/thẻ | tài khoản −A, @chi +A | chi +A |
| Chuyển/rút ATM/trả thẻ | nguồn −A, đích +A | không thu/chi |
| Vay | tiền +A, payable riêng −A | không thu/chi |
| Cho vay | tiền −A, receivable riêng +A | không thu/chi |
| Trả nợ | tiền −A, payable +A; remaining giảm A | không thu/chi |
| Thu nợ | tiền +A, receivable −A; remaining giảm A | không thu/chi |
| Đối soát | tài khoản +delta, @đối soát −delta | không thu/chi |
| Đảo thu/chi/chuyển | đảo dấu hai posting gốc | điều chỉnh theo danh mục gốc ở kỳ đảo |

Đối soát chênh lệch 0 chỉ đánh dấu đã đối soát, thêm audit, không tạo transaction 0. Nháp đối soát giữ expected balance; xác nhận khi số dư đã khác sẽ thất bại, tránh ghi đè hoạt động mới. Không sửa bút toán gốc; reversal_of unique chỉ cho đảo một lần. Nháp đảo công nợ/đối soát/kỳ lặp bị từ chối để tránh lệch nghiệp vụ phụ thuộc.

Mỗi khoản nợ một counterparty, principal, remaining, direction và due_date nullable. Cùng người vẫn có nhiều khoản riêng, mã nợ chỉ định rõ. Không hạn thì không gửi nhắc ngày trả. Thanh toán >remaining bị chặn bởi trigger, kể cả hai yêu cầu cùng lúc. Không ghi gộp vay mới với trả nợ cũ, không lãi/xóa nợ/chuyển công nợ.

Thẻ có credit_limit, statement_day và due_day 1–28; số dư từ -limit tới 0. Không cho rút tiền từ thẻ hoặc tạo thu/vay/thu nợ trực tiếp vào thẻ. Sao kê ghi dư nợ lịch sử tại 00:00 ngày sau ngày chốt, nhắc hạn trả trong cùng tháng nếu due_day>statement_day, ngược lại tháng sau. Số còn cần trả sao kê giảm bởi thanh toán sau chốt (đảo thanh toán tăng lại). Mua mới sau chốt không tăng sao kê đã đóng. Sao kê mới chứa dư nợ kỳ trước nên không cộng tất cả sao kê với nhau. Thông báo chỉ đại diện bản sao theo sổ cá nhân; phí/lãi/tối thiểu cần đối chiếu ngân hàng. Điều chỉnh/đối soát thẻ sau chốt không viết lại sao kê cũ.

## Khoản lặp

Recurring lưu tên, amount, account, category, day và thời điểm tạo. Occurrence unique theo recurring_id+due_date, state due/paid/skipped. Ngày đầu tiên là ngày lặp đầu tiên >=ngày tạo; không tự tạo kỳ trước lúc đăng ký. Cron tạo tới 3 ngày trước hạn, catch-up tối đa 12 tháng mỗi lần chạy nếu dịch vụ dừng lâu; lần sau tiếp tục. `/tralap` tạo draft expense gắn occurrence; guard atomic chỉ trả một lần. `/bolap` đánh dấu skipped, `/dunglap` ngừng sinh kỳ mới, giữ kỳ cũ đang chờ. Ghi chi thuê trọ tự do ngoài `/tralap` không tự đánh dấu kỳ đã trả; người dùng cần dùng lệnh đúng để tránh nhắc tiếp.

## Bot, AI và an toàn

Header secret được so sánh qua SHA-256 và vòng so sánh cố định, trước khi đọc body. Body tối đa 16 KiB; câu nhập tối đa 1.000 ký tự. Chỉ owner trong private chat; callback cũng kiểm tra owner và chat. Inbox unique update_id; draft source_key unique; guard/state nằm trong batch ledger. Giới hạn 500 update hợp lệ mới/ngày UTC bằng trigger inbox_quota; duplicate cùng update_id không tốn thêm. Vượt giới hạn khiến webhook trả 503, Telegram có thể retry; không đổi sang dịch vụ tính phí.

AI mặc định tắt. Rules trước AI; lệnh slash không hiểu không gửi provider. Adapter cố định endpoint, timeout; hai provider configured tối đa/lần, ngân sách ngày nguyên tử, không bypass xác nhận. AI chỉ income/expense/transfer và phải qua validation; account do model đề xuất vẫn cần tồn tại. Model có thể hiểu sai số tiền/mục đích: bản nháp được hiển thị để owner kiểm tra. Không cấp model quyền SQL, secrets, cloud deploy hoặc external tools. Báo cáo diễn giải deterministic để tiết kiệm và bảo vệ dữ liệu.

Inbox được lưu trước HTTP 200. Fetch background xử lý một inbox và hai outbox để giới hạn thời gian; cron xử lý backlog có giới hạn. Lease/retry chống hai worker cùng claim. Ledger+audit+outgoing acknowledgement atomic; gửi Telegram không atomic với database nên thông báo có thể lặp khi crash. Failed jobs giữ lại để kiểm tra, không xóa. Không log prompt/update/token/dữ liệu ledger. Xóa body vận hành đã xong sau 30 ngày; ledger, audit và guards giữ lâu dài. Credential không vào export.

## Báo cáo và backup

Manual tuần/tháng/năm hiện tại; auto kỳ đã đóng tại sáng đầu kỳ tiếp theo. Bảng nhóm thu/chi (tối đa 15 nhóm), PNG hai cột tổng và nhận xét về chênh lệch/tỷ lệ chi/thu. Số dư hiện tại và tổng công nợ được ghi rõ; tối đa 20 tài khoản trong báo cáo. Đảo chi ảnh hưởng kỳ đảo, không thay lịch sử kỳ cũ. Không có báo cáo dòng tiền đầy đủ hay biểu đồ phân loại nhiều tháng ở bản 0.1.

Snapshot JSON v1: accounts, transactions, postings, debts, debt_events, audit, recurring, occurrences, credit_statements. D1 batch đọc nhất quán; loại inbox/outbox/drafts/guards/quota/secrets. Restore từ JSON vào database trống, chạy triggers và đối chiếu từng bảng. Backup không có dữ liệu chờ xác nhận; sau restore yêu cầu nhập lại draft. D1 SQL export là bản sao đầy đủ khác, nên có operational records và cần lưu riêng.

## Mapping yêu cầu và kiểm chứng

| Yêu cầu | Thành phần | Kiểm chứng |
| --- | --- | --- |
| Telegram tiếng Việt/chat-first | bot/domain/worker | handler và runtime D1 |
| Cloudflare + D1 | wrangler.toml, migration | dry-run và local workerd |
| Thu/chi/nhiều tài khoản/chuyển | ledger/postings | conservation/report totals |
| Zero nhưng chưa đối soát | balances/reconciled_at | zero/stale/0-delta tests |
| Công nợ simple/partial/no due | debts/debt_events | remaining/overpay rollback |
| Recurring thuê/subscription | scheduler/occurrence guard | idempotent reminders/paid once |
| Credit card | credit trigger/statements | limit/overpay/closing cutoff/reversed repayment |
| Báo cáo tuần/tháng/năm | reports/chart/scheduler | UTC+7 boundaries/PNG inflate |
| Gemma/CF/Gemini/Groq/OpenRouter | ai adapters | mocked endpoint/fallback/quota |
| Chống trùng/audit/backup | unique keys/triggers/snapshot | duplicate callback/restore/corruption |
| GitHub/README/CI/agents | package lock/workflow/skills | syntax/metadata/build |

Kết nối thật Telegram, provider, dashboard quota, CPU production và GitHub Actions chưa kiểm chứng khi chưa có token/repository remote. Không triển khai production hoặc push GitHub trong nhiệm vụ này.
