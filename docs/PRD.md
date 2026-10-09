# Đặc tả sản phẩm và quy tắc nghiệp vụ

Tài liệu mô tả hành vi của Thư ký Tài chính AI phiên bản 0.1. Dùng làm cơ sở phát triển tính năng, kiểm tra tính đúng đắn của sổ cái và đánh giá thay đổi.

Để cài đặt và sử dụng bot, bắt đầu tại [README](../README.md). Để vận hành hoặc khôi phục dữ liệu, xem [OPERATIONS](OPERATIONS.md).

## 1. Mục tiêu và phạm vi

Bot giúp một người quản lý thu chi, số dư và nghĩa vụ thanh toán trong chat riêng Telegram bằng tiếng Việt. Người dùng có thể ghi chép bằng câu ngắn hoặc lệnh có cấu trúc; mọi bút toán cần được xem lại và xác nhận.

| Trong phạm vi | Ngoài phạm vi phiên bản 0.1 |
| --- | --- |
| Một chủ sở hữu, nhiều tài khoản | Nhiều người dùng hoặc chia sẻ sổ |
| VND nguyên, múi giờ UTC+7 | Đa tiền tệ hoặc múi giờ có DST |
| Thu chi, chuyển tiền, đối soát | Đồng bộ giao dịch ngân hàng |
| Vay, cho vay, thanh toán từng phần | Lãi vay, xóa nợ, chuyển giao công nợ |
| Khoản định kỳ hằng tháng | Lịch lặp tùy ý hoặc tự động trừ tiền |
| Theo dõi thẻ, chốt dư nợ, nhắc trả | Phí, lãi, trả góp, thanh toán tối thiểu |
| Báo cáo và xuất dữ liệu | Tư vấn đầu tư, OCR hoặc voice |

Thời điểm hạch toán là thời điểm xác nhận. Chưa hỗ trợ nhập lùi ngày. Giới hạn mỗi giao dịch và số dư tuyệt đối mỗi tài khoản là 1.000.000.000.000 VND.

## 2. Luồng người dùng

### 2.1. Khởi tạo

1. Chủ sở hữu cấu hình bot, database, webhook và Telegram user ID.
2. Gửi `/start` hoặc `/help` trong chat riêng.
3. Tạo tài khoản ngân hàng hoặc thẻ nếu cần. Tài khoản `tiền mặt` đã có sẵn.
4. Đối soát từng tài khoản với số dư thực tế.

Tài khoản mới bắt đầu ở 0 và có `reconciled_at=null`. Bot hiển thị **CHƯA ĐỐI SOÁT** cho đến khi người dùng xác nhận đối soát. Số dư này chỉ là số dư theo sổ, không được diễn giải thành tiền thực tế đang có.

### 2.2. Ghi giao dịch

1. Người dùng nhập thu, chi, chuyển tiền hoặc nghiệp vụ công nợ.
2. Parser xác định nghiệp vụ; AI được thử khi parser theo quy tắc không hiểu và AI đã bật.
3. Bot kiểm tra dữ liệu và lưu bản nháp có hạn 15 phút.
4. Bot hiển thị nghiệp vụ, số tiền, tài khoản, danh mục và ghi chú.
5. Người dùng chọn **Xác nhận** hoặc **Bỏ qua**.
6. Khi xác nhận hợp lệ, bot ghi sổ và trả mã giao dịch.

Tạo tài khoản, quản lý lịch lặp và xuất dữ liệu là lệnh quản lý; không tạo bút toán tài chính. Tạo khoản lặp không tự ghi chi.

### 2.3. Sửa sai

Thu, chi và chuyển tiền có thể được đảo bằng `/huy`. Bút toán gốc vẫn được giữ; bot tạo bản nháp bút toán đảo để xác nhận. Một giao dịch chỉ được đảo một lần.

Phiên bản 0.1 chưa cho đảo công nợ, đối soát hoặc giao dịch thanh toán qua kỳ lặp. Không chỉnh trực tiếp database để sửa các nghiệp vụ này.

## 3. Quy tắc sổ cái

### 3.1. Quy ước số dư

Số dư tài khoản là tổng các posting thuộc transaction đã `sealed=1`:

- Tiền mặt, ngân hàng và khoản phải thu thường có số dư dương.
- Thẻ tín dụng và khoản phải trả có số dư âm.
- Tiền mặt và ngân hàng có thể âm khi sổ chưa phản ánh đủ số dư hoặc giao dịch; bot không áp dụng kiểm tra khả năng chi thực tế.
- Thẻ phải có số dư từ `-credit_limit` đến 0.

Mỗi transaction có đúng hai posting, tổng bằng 0 và trị tuyệt đối của mỗi posting bằng `transaction.amount`. Trigger kiểm tra các điều kiện này trước khi seal.

Transaction đã seal, posting, audit và debt event được giữ bất biến. Chuyển trạng thái transaction từ chưa seal sang đã seal diễn ra trong cùng batch ghi sổ.

### 3.2. Bút toán theo nghiệp vụ

Trong bảng sau, `A` là số tiền giao dịch và `delta = số dư thực tế − số dư theo sổ`.

| Nghiệp vụ | Bút toán | Tác động báo cáo thu chi |
| --- | --- | --- |
| Thu | Tài khoản +A; `@thu` −A | Thu +A |
| Chi | Tài khoản −A; `@chi` +A | Chi +A |
| Chuyển nội bộ, rút ATM, trả thẻ | Nguồn −A; đích +A | Không tính thu chi |
| Vay | Tiền +A; tài khoản phải trả riêng −A | Không tính thu chi |
| Cho vay | Tiền −A; tài khoản phải thu riêng +A | Không tính thu chi |
| Trả nợ | Tiền −A; tài khoản phải trả +A | Không tính thu chi |
| Thu nợ | Tiền +A; tài khoản phải thu −A | Không tính thu chi |
| Đối soát | Tài khoản +delta; `@đối soát` −delta | Không tính thu chi |
| Đảo giao dịch | Đảo dấu hai posting gốc | Điều chỉnh tại kỳ đảo, giữ danh mục gốc |

Ví dụ: mua đồ 500.000 đ bằng thẻ ghi chi 500.000 đ. Chuyển 500.000 đ từ ngân hàng để trả thẻ không ghi thêm chi tiêu.

### 3.3. Đối soát

Bản nháp giữ số dư tại thời điểm lập nháp. Nếu số dư đã thay đổi trước khi xác nhận, giao dịch đối soát bị từ chối; người dùng cần nhập lại để xem chênh lệch mới.

Khi `delta=0`, bot chỉ cập nhật thời điểm đối soát và audit, không tạo transaction có số tiền 0. Thời điểm đối soát là một dấu mốc lịch sử, không bảo đảm sổ luôn khớp ngân hàng sau đó.

## 4. Công nợ

Mỗi khoản nợ có mã riêng, người liên quan, chiều vay/cho vay, số tiền gốc, số tiền còn lại và hạn trả tùy chọn.

- Cùng một người có thể có nhiều khoản nợ độc lập.
- Hạn trả dùng `YYYY-MM-DD`; `-` trong lệnh tương ứng với không hạn.
- Mỗi lần thanh toán phải chỉ rõ mã nợ và đúng chiều trả/thu.
- Thanh toán từng phần giảm `remaining`, không thay đổi `principal`.
- Không được thanh toán vượt số còn lại, kể cả khi hai nháp được xác nhận gần như đồng thời.
- Khoản nợ có `remaining=0` đã tất toán; lịch sử vẫn được giữ.
- Khoản không hạn không nhận lời nhắc theo ngày trả.

Số dư tài khoản công nợ phải bằng `remaining` đối với phải thu và `-remaining` đối với phải trả. Mở khoản nợ và thanh toán đi qua tài khoản tiền mặt/ngân hàng, không dùng thẻ tín dụng.

## 5. Khoản định kỳ

Mỗi recurring lưu tên, số tiền, tài khoản, danh mục, ngày trong tháng và thời điểm tạo. Ngày hỗ trợ từ 1 đến 28.

Mỗi kỳ thanh toán có mã duy nhất theo khoản lặp và ngày đến hạn:

| Trạng thái | Ý nghĩa |
| --- | --- |
| `due` | Chưa trả, còn nhận lời nhắc |
| `paid` | Đã ghi một giao dịch chi qua `/tralap` |
| `skipped` | Người dùng đã bỏ kỳ qua `/bolap` |

Kỳ đầu là ngày lặp đầu tiên không sớm hơn ngày đăng ký. Cron tạo kỳ khi còn tối đa ba ngày tới hạn. Sau gián đoạn, cron tạo bù tối đa 12 tháng mỗi lần chạy, rồi tiếp tục ở lần sau nếu cần.

`/tralap` lập nháp chi gắn với kỳ. Kiểm tra trong cùng batch đảm bảo một kỳ chỉ trả được một lần. `/dunglap` ngừng tạo kỳ mới nhưng giữ các kỳ cũ chưa xử lý.

Ghi chi thuê trọ bằng `/chi` không tự đánh dấu kỳ tương ứng đã trả. Muốn quản lý lời nhắc chính xác, dùng `/tralap` cho các kỳ đã đăng ký.

## 6. Thẻ tín dụng

Thẻ có hạn mức, ngày chốt và ngày trả từ 1 đến 28. Bot chặn chi vượt hạn mức, trả thẻ vượt dư nợ và chuyển/rút tiền từ thẻ.

Sao kê được tạo từ số dư lịch sử tại 00:00 UTC+7 ngày sau ngày chốt. Hạn trả nằm trong cùng tháng nếu ngày trả lớn hơn ngày chốt; nếu không, hạn trả nằm ở tháng tiếp theo.

Ví dụ: chốt ngày 10, trả ngày 25 thì giao dịch sau hết ngày 10 không làm tăng sao kê vừa chốt. Thanh toán sau chốt giảm số còn cần trả; đảo thanh toán làm tăng lại số đó.

Sao kê mới chứa cả nợ mang sang từ kỳ trước. Không cộng các sao kê với nhau để tính tổng dư nợ. Đối soát sau chốt không viết lại sao kê đã tạo. Thông tin phí, lãi và số tiền tối thiểu phải đối chiếu với sao kê ngân hàng.

## 7. Báo cáo

### 7.1. Kỳ dữ liệu

| Loại | Lệnh thủ công | Lịch tự động từ 08:00 UTC+7 |
| --- | --- | --- |
| Tuần | Tuần hiện tại, thứ Hai đến Chủ nhật | Thứ Hai, báo cáo tuần trước |
| Tháng | Tháng hiện tại | Ngày 1, báo cáo tháng trước |
| Năm | Năm hiện tại | Ngày 1/1, báo cáo năm trước |

Kỳ dùng mốc đầu bao gồm và mốc cuối không bao gồm. Báo cáo tự động chỉ được tạo trong ngày gửi tương ứng; chưa tạo bù nếu dịch vụ dừng trọn ngày đó.

### 7.2. Nội dung

- Tổng thu, tổng chi và chênh lệch trong kỳ.
- Bảng tối đa 15 nhóm thu chi.
- PNG hai cột tổng thu/chi; phần âm bị chặn ở 0 trên biểu đồ và vẫn được trình bày bằng số trong bảng.
- Diễn giải theo quy tắc về chênh lệch và tỷ lệ chi/thu.
- Số dư hiện tại của tối đa 20 tài khoản và trạng thái đối soát.
- Tổng công nợ còn lại theo chiều phải thu/phải trả.

Các tổng thu chi được tính từ posting tài khoản hệ thống, gồm cả bút toán đảo. Chuyển tiền, công nợ, trả thẻ và đối soát không làm tăng tổng thu chi. Chưa có báo cáo số dư cuối kỳ lịch sử hoặc báo cáo dòng tiền đầy đủ.

## 8. AI và quyền truy cập

AI mặc định tắt. Parser theo quy tắc luôn chạy trước; lệnh slash không hiểu không được gửi tới provider. AI chỉ đề xuất thu, chi hoặc chuyển tiền, không thực thi SQL hay công cụ.

Một tin nhắn thử tối đa hai provider đã cấu hình. Mỗi request có timeout và tiêu thụ ngân sách gọi theo ngày UTC trước khi gửi. Kết quả phải có JSON hợp lệ, số tiền nguyên, nghiệp vụ được hỗ trợ và tài khoản tồn tại. Mọi đề xuất vẫn cần chủ sở hữu xác nhận.

Webhook kiểm tra secret trước khi đọc body. Tin nhắn và callback chỉ được chấp nhận khi sender và private chat đều thuộc owner. Giới hạn body là 16 KiB, văn bản là 1.000 ký tự và số update hợp lệ mới là 500/ngày UTC. Update trùng ID không tiêu thụ thêm quota.

Không ghi token, raw update, prompt hay dữ liệu sổ cái vào log ứng dụng. Khi AI bật, provider được chọn nhận nội dung tin nhắn cần phân tích. Báo cáo và biểu đồ không gửi dữ liệu tới AI.

## 9. Mô hình dữ liệu

| Bảng hoặc view | Vai trò |
| --- | --- |
| `accounts` | Tài khoản người dùng và tài khoản hệ thống |
| `transactions`, `postings` | Giao dịch và bút toán bất biến |
| `balances` | View số dư của các transaction đã seal |
| `debts`, `debt_events` | Khoản nợ và sự kiện mở/thanh toán |
| `recurring`, `recurring_occurrences` | Lịch lặp và từng kỳ thanh toán |
| `credit_statements` | Dư nợ tại mốc chốt và hạn trả |
| `audit` | Dấu vết thao tác nghiệp vụ |
| `drafts`, `guards` | Nháp và điều kiện xác nhận nguyên tử |
| `inbox`, `outbox` | Hàng đợi nhận/xử lý và gửi Telegram |
| `request_usage`, `ai_usage` | Ngân sách update và request AI |

Schema chi tiết nằm trong [migration 0001](../migrations/0001_ledger.sql).

## 10. Tính toàn vẹn và lưu trữ

Inbox được lưu trước HTTP 200. Xác nhận thực hiện điều kiện nháp, posting, cập nhật công nợ/kỳ lặp, seal, audit và thông báo ghi nhận trong cùng D1 batch. Nếu một bước thất bại, batch rollback.

Khóa update ID, source key và điều kiện SQL chống ghi sổ trùng. Gửi Telegram không nằm trong transaction database nên thông báo có thể lặp khi retry sau sự cố. Inbox tối đa 5 lần thử, outbox tối đa 8 lần thử; tác vụ lỗi được giữ để xử lý.

Body vận hành đã xử lý được dọn sau 30 ngày. Ledger, audit và guards được giữ lâu dài. JSON backup v1 gồm chín bảng nghiệp vụ, không có secrets, quota, inbox, outbox, drafts hoặc guards. Sau khôi phục JSON, cần lập lại các nháp chưa xác nhận.

## 11. Tiêu chí nghiệm thu

| Nhóm | Kết quả cần đạt |
| --- | --- |
| Ghi sổ | Hai posting cân bằng, số dư đúng, transaction cũ không bị sửa |
| Chống trùng | Callback hoặc update lặp không tạo thêm bút toán |
| Đối soát | Số dư zero vẫn chưa đối soát; nháp có số dư cũ bị từ chối |
| Công nợ | Trả từng phần giảm đúng remaining; thanh toán vượt bị rollback |
| Thẻ | Chi vào thẻ tính chi một lần; trả thẻ không tính chi; hạn mức được bảo vệ |
| Khoản lặp | Không tự ghi chi; một kỳ chỉ có một lần thanh toán |
| Báo cáo | Đúng ranh giới UTC+7 và loại trừ chuyển/nợ/đối soát |
| AI | Có giới hạn, fallback, validation và xác nhận người dùng |
| Khôi phục | JSON phục hồi được số dư, công nợ, các bảng nghiệp vụ và audit |
| Quyền truy cập | Người khác hoặc group chat không đọc/ghi được sổ |

Cách kiểm tra từng nhóm và phạm vi của môi trường giả lập được mô tả trong [TESTING](TESTING.md).
