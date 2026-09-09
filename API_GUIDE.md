# Veo Farm HTTP API — hướng dẫn cho agent (Codex, script...)

API này cho phép điều khiển Veo Farm (tạo/chạy workflow, xem kết quả) hoàn
toàn qua HTTP, không cần mở app hay đăng nhập trình duyệt.

## 1. Base URL

App chạy local trên máy người dùng (Electron), server web lắng nghe ở:

```
http://127.0.0.1:41234
```

**Quan trọng:** đây là địa chỉ **local**, chỉ gọi được từ agent chạy trên
**cùng máy** với app Veo Farm (ví dụ Codex CLI chạy local). Nếu agent chạy
trên máy khác/cloud, port này sẽ không reach được — cần tunnel (ngrok...)
hoặc chạy agent local. App phải đang mở (hoặc ít nhất tiến trình web/worker
đang chạy nền) thì API mới phản hồi.

## 2. Xác thực

Mọi request gửi kèm header:

```
Authorization: Bearer <api_key>
```

Lấy key tại tab **API Keys** trong app (bấm "Tạo key mới"). Key chỉ hiện
đúng 1 lần lúc tạo — lưu lại ngay. Không thể tạo/thu hồi key khác bằng
chính 1 API key (bắt buộc phải qua giao diện, đăng nhập phiên thật).

Nếu thiếu header hoặc key sai/đã bị thu hồi → `401 {"error":"unauthenticated"}`.

## 3. Endpoints

### Quản lý workflow

| Method | Path | Việc gì |
|---|---|---|
| GET | `/api/workflows` | Liệt kê workflow đã lưu (id, name, updated_at) |
| POST | `/api/workflows` | Tạo workflow mới. Body: `{ name, graph }` |
| GET | `/api/workflows/:id` | Lấy đầy đủ graph 1 workflow |
| PATCH | `/api/workflows/:id` | Sửa. Body: `{ name?, graph? }` |
| DELETE | `/api/workflows/:id` | Xoá |

### Chạy & theo dõi job

| Method | Path | Việc gì |
|---|---|---|
| POST | `/api/run-workflow-builder` | Chạy 1 workflow → trả `{ jobId }` |
| GET | `/api/runs/:id` | Trạng thái + kết quả 1 job (poll cái này) |
| GET | `/api/jobs-queue` | Job đang chờ/đang chạy của user |
| POST | `/api/workflow-builder-stop` | Huỷ job. Body: `{ jobId }` |

## 4. Chạy 1 workflow — luồng chuẩn

```bash
# 1) Tạo job
curl -s -X POST http://127.0.0.1:41234/api/run-workflow-builder \
  -H "Authorization: Bearer $VF_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"workflow": { ...WorkflowJSON... }, "workflowId": "<id nếu đã lưu, bỏ qua nếu chưa>"}'
# → {"jobId": "..."}

# 2) Poll trạng thái mỗi 10-20s cho tới khi status là completed/failed/cancelled
curl -s http://127.0.0.1:41234/api/runs/<jobId> \
  -H "Authorization: Bearer $VF_API_KEY"
```

Response của `/api/runs/:id`:
```jsonc
{
  "job": { "id": "...", "status": "pending|running|completed|failed|cancelled", "stats": {"done":N,"wait":N,"err":N}, "error": "..." },
  "sub_jobs": [
    { "node_id": "img-1", "status": "completed", "output": { "image": "<signed url>", "media": [{"url":"...","kind":"image"}] }, "error": null }
  ]
}
```

- Ảnh/video kết quả nằm trong `sub_jobs[].output.media[].url` (Supabase
  Storage signed URL, **hết hạn sau ~24h** — tải về ngay nếu cần giữ lâu).
- Muốn tạo workflow mới xuất hiện trong app (tab Workflows/Canvas) thì phải
  gọi `POST /api/workflows` để lưu graph — `run-workflow-builder` một mình
  không tự lưu, chỉ chạy 1 lần.

### Chạy lại 1 phần (không tốn quota tạo lại từ đầu)

Thêm `targetNodeIds` (chỉ node nào cần chạy lại) + `cachedOutputs` (output
có sẵn của các node upstream, để worker khỏi generate lại):

```json
{
  "workflow": { ... },
  "workflowId": "...",
  "targetNodeIds": ["vid-1"],
  "cachedOutputs": {
    "img-1": { "image": "<url ảnh đã có>", "media": [{"url":"<url>","kind":"image"}] }
  }
}
```

## 5. Cấu trúc `WorkflowJSON`

```jsonc
{
  "version": "1.0",
  "name": "Tên workflow",
  "nodes": [
    {
      "id": "id-duy-nhat",       // tự đặt, string bất kỳ, không trùng trong workflow
      "type": "prompt",          // xem bảng loại node bên dưới
      "position": { "x": 0, "y": 0 },
      "data": { "config": { /* xem defaults từng loại node */ } },
      "width": 260                // optional, mặc định lấy theo loại node
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "id-node-nguồn",
      "target": "id-node-đích",
      "sourceHandle": "output-0",   // luôn là "output-0" trừ khi node có nhiều output
      "targetHandle": "input-0"     // xem "port" của từng loại node bên dưới
    }
  ]
}
```

**Không cần set `position` chính xác** — chỉ ảnh hưởng hiển thị trên
Canvas, không ảnh hưởng lúc chạy. Đặt cách nhau ~300-400px cho dễ nhìn nếu
người dùng sẽ mở lên xem.

## 6. Các loại node (`type`) và port

Port input đếm từ `input-0`. Trừ khi ghi chú khác, **`input-0` luôn là văn
bản/prompt** (kiểu `string`), các port sau là ảnh/video tham chiếu.

| type | input ports | output | `data.config` mặc định | Ghi chú |
|---|---|---|---|---|
| `prompt` | — | `text` (string) | `{ "text": "" }` | Node văn bản tĩnh. Set thẳng `text` trong config, không cần nối gì vào. |
| `prompt_list` | `input-0` text (opt) | `textList` (string) | `{ "text": "" }` | `text` nhiều dòng (`\n`) → fan-out, chạy N lần cho node phía sau. |
| `upload_image` | — | `media` (any) | `{ "imagePath": "", "imageUrl": "" }` | Set `imageUrl` thẳng (URL public) để dùng ảnh có sẵn thay vì phải nối từ `generate_image`. |
| `generate_image` | `input-0` prompt, `input-1..` ref ảnh (opt) | `image` | `{ "ratio": "landscape", "quantity": 1, "quality": "1080p", "imageModel": "nano_banana_pro", "accountId": null }` | `ratio`: `landscape`\|`portrait`\|`square`\|`4_3`\|`3_4`. `imageModel`: `nano_banana_pro`\|`nano_banana_2`. Chỉ dùng được 1 ảnh ref (nối nhiều chỉ cái đầu có tác dụng). |
| `generate_video` | `input-0` prompt, `input-1` Start Frame, `input-2` End Frame (chế độ FRAME) hoặc `input-1..N` ref ảnh (chế độ REF) | `video` | `{ "ratio": "landscape", "quantity": 1, "quality": "1080p", "videoModel": "veo31_lite_lower", "videoMode": "FRAME", "duration": 8, "accountId": null }` | `videoMode`: `FRAME` (start[+end] frame) hoặc `REF`. `videoModel` xem bảng bên dưới. **FRAME có cả Start+End cùng lúc thì ratio 9:16 chưa xác nhận field — mặc định ra ngang.** |
| `extract_last_frame` | `input-0` video | `image` | `{}` | Cắt khung hình cuối 1 video làm ảnh — dùng để nối `generate_video` A → node này → Start Frame của `generate_video` B, giữ cảnh liền mạch. |
| `merge_video` | `input-0..N` video | `video` | `{}` | Ghép nhiều video nối tiếp thành 1. |
| `remove_logo` | `input-0` video | `video` | `{ "zoom": 1.07 }` | Crop-zoom xoá watermark Veo góc dưới-phải. |
| `download` | `input-0..N` bất kỳ | pass-through | `{}` | Gom output các node nối vào — không cần dùng khi chạy qua API (đã có sẵn `sub_jobs.output`). |
| `frame` | — | — | `{ "width": 500, "height": 400, "name": "Khung Nhóm" }` | Chỉ để nhóm hiển thị trên Canvas — không ảnh hưởng lúc chạy, có thể bỏ qua hoàn toàn khi tạo workflow qua API. |

`videoModel` hợp lệ: `veo31_lite`, `veo31_lite_lower` (ưu tiên thấp — chậm
hơn nhưng có vẻ không bị paygate-chặn), `veo31_fast`, `veo31_fast_lower`,
`veo31_quality`.

## 7. Ví dụ đầy đủ — ảnh rồi video từ chính ảnh đó

```json
{
  "workflow": {
    "version": "1.0",
    "name": "Ví dụ",
    "nodes": [
      { "id": "p1", "type": "prompt", "position": {"x":0,"y":0},
        "data": { "config": { "text": "mô tả ảnh muốn tạo" } } },
      { "id": "img1", "type": "generate_image", "position": {"x":400,"y":0},
        "data": { "config": { "ratio": "landscape", "quantity": 1, "quality": "1080p", "imageModel": "nano_banana_pro", "accountId": null } } },
      { "id": "p2", "type": "prompt", "position": {"x":0,"y":300},
        "data": { "config": { "text": "mô tả chuyển động cho video" } } },
      { "id": "vid1", "type": "generate_video", "position": {"x":800,"y":150},
        "data": { "config": { "ratio": "landscape", "quantity": 1, "quality": "1080p", "videoModel": "veo31_lite_lower", "videoMode": "FRAME", "duration": 8, "accountId": null } } }
    ],
    "edges": [
      { "id": "e1", "source": "p1", "target": "img1", "sourceHandle": "output-0", "targetHandle": "input-0" },
      { "id": "e2", "source": "img1", "target": "vid1", "sourceHandle": "output-0", "targetHandle": "input-1" },
      { "id": "e3", "source": "p2", "target": "vid1", "sourceHandle": "output-0", "targetHandle": "input-0" }
    ]
  }
}
```

## 8. Lỗi thường gặp

| Lỗi | Nghĩa là gì |
|---|---|
| `captureSession: timed out ... page.url()=...flow.google.com/about` | Cookie tài khoản Google đã hết hạn thật sự — cần vào tab Accounts trong app, dán cookie mới. |
| `RPC error, code=3` | INVALID_ARGUMENT — request bị Google từ chối (thường do config lạ/không hợp lệ). |
| `RPC error, code=7` / `PUBLIC_ERROR_MODEL_ACCESS_DENIED` | Tài khoản không có quyền dùng model đó (vd `_lower` cần tier cao hơn free). Đổi `videoModel`. |
| `RPC error, code=8` | RESOURCE_EXHAUSTED — hết quota trong ngày của tài khoản đó (dùng chung quota với web Flow thật). Đợi reset hoặc đổi tài khoản. |
| `generate_video: chế độ FRAME có cả khung cuối... chưa được hỗ trợ` | Không đúng nữa — đã hỗ trợ (rpcid riêng cho start+end frame). Nếu vẫn thấy lỗi này nghĩa là app chưa cập nhật bản mới. |
| node `error: "skipped — upstream node X failed"` | Node bị bỏ qua vì node nó phụ thuộc (X) đã lỗi — không phải lỗi của chính nó. |

1 node lỗi **không** làm dừng cả job — các nhánh độc lập khác vẫn chạy tiếp bình thường.
