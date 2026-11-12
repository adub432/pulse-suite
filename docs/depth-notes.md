# Depth notes — Pulse Suite v0.2.2

How the Depth family works: monocular depth estimation from a single photo,
inspired by **Gather · 聚 Lite** (gather.be-of-dao.com) by DAO, which runs
depth models entirely in the browser with ONNX Runtime Web. The technique and
the model choices come from Gather; the integration, the UI, and the way the
depth map drives the effects are Pulse Suite's own.

## The models

| Model | Author / license | Role |
| --- | --- | --- |
| **FastDepth** | Diana Wofk et al. — MIT | Main model. Predicts disparity at a fixed 224×224 input; the output is inverted (`1/max(0.05, x)`) to depth, then min-max normalised to 0..1 (near = 1). |
| **Depth Anything V2 Small** | HKU / TikTok — Apache 2.0 | Fallback. Long side 448, multiple of 14. |

Both models are MIT/Apache-2.0, so they are usable with attribution — see
`THIRD-PARTY-NOTICES.md` and the in-app credit line in the Cook depth step
("Depth models: FastDepth (MIT) + Depth Anything V2 Small (Apache 2.0) —
technique inspired by Gather · 聚 by DAO").

## Where the model files come from

The ONNX files are **not bundled in the exe** and are **not in the repo**.
They are downloaded on demand, the first time a depth feature is used, into
the app's user-data folder (`<userData>/models/` — e.g.
`~/.config/pulse-visualizer/models/` on Linux):

- FastDepth — downloaded from Gather's own deployment,
  `https://gather.be-of-dao.com/depth/fastdepth.b64.txt` (base64-wrapped ONNX,
  2,247,944 bytes b64 → 1,685,956 bytes ONNX). Gather's `depth/manifest.json`
  lists it as the FastDepth model file. The HuggingFace mirrors of FastDepth
  (`STMicroelectronics/fastdepth`, `tala-kamel1/fast-depth`) contain only
  READMEs — no model files — so Gather's deploy is the fetchable source.
- Depth Anything V2 Small (quantized) — from the onnx-community HuggingFace
  repo: `https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx`
  (27,258,801 bytes).

The download is driven by the main process (`depth-download` IPC) with
progress events, so the renderer never blocks on it. Once downloaded, the
files stay cached — later runs are offline.

## Architecture — why the main process

Inference runs in the **main process** with `onnxruntime-web` under Node
(the Node build of onnxruntime-web 1.31.1, `numThreads: 1`,
`logLevel: 'error'`), not in the renderer:

- The renderer is loaded from `file://` — fetching the `.wasm` runtime and
  the model over `file://` is unreliable, and the renderer's ONNX session
  would compete with the audio thread.
- The Node build loads from real paths. That is also why the onnxruntime-web
  dist files are listed in `asarUnpack` in `package.json`: Node's dynamic
  `import()` of `ort-wasm-simd-threaded.mjs` needs real files on disk, not
  entries inside the asar.

IPC: `depth-status` (which models are cached), `depth-download` (fetch with
progress), `depth-estimate` (RGB pixels in → normalised depth map out).
The renderer side lives in `src/depth.js`.

## Preprocessing (matches Gather's)

- **FastDepth:** resize to 224×224, ImageNet normalisation
  ((v/255−0.485)/0.229 R, (v/255−0.456)/0.224 G, (v/255−0.406)/0.225 B),
  CHW float32 tensor, input name `'0'`, output `'350'`.
- **Depth Anything V2 Small:** long side 448 (multiple of 14), same
  normalisation, input `'pixel_values'`, output `'predicted_depth'`.

Both were verified in plain Node 24 with onnxruntime-web before being wired
in: FastDepth load ~800 ms / run ~480 ms; DAV2 load ~1.2 s / run ~900 ms on
this VM. On a real PC expect roughly half that.

## What the depth map drives

- **Cook — step 05 DEPTH:** "Estimate depth" runs the chosen model on the
  loaded photo and builds near/far layer masks. While cooking, the kick
  drives a **depth parallax** (near and far layers shift in opposite
  directions) and the bass drives a **depth blur** (far layer blurs with the
  bass). A **depth-slice** switch makes the Cook style pass render near
  layers dense and far layers sparse. The depth map / heat-map view shows the
  map itself.
- **Visualize — Depth look (key 0):** the heat depth map as a backdrop with
  the photo parallaxed live over it, near/far layers moving apart with the
  kick; model label + map dimensions in the corner.
- **ASCII styles:** every style in the ASCII library takes an optional
  `depthMap` — near renders dense, far renders sparse (see `src/ascii-styles.js`
  `depthInk`).

## Heuristic fallback (always labelled)

If both models are unavailable (no network, download fails, or the user
declines the download), Cook offers **Heuristic (offline)**: a depth estimate
from luminance + vertical gradient + a 2-pass box blur, min-max normalised.
It is **always labelled "heuristic"** in the UI and in the smoke test — it is
never presented as model output. It is a usable stand-in for the parallax /
blur / slice effects, and it is honest about what it is.

## Known limits

- FastDepth's 224×224 input is coarse: the map is upscaled to photo
  resolution, so fine edges are soft. DAV2 at 448 gives noticeably better
  edges; pick it for detailed photos.
- Depth estimation is a still-photo operation: it runs once per photo, not
  per video frame (a per-frame depth pass would need the video frame path
  and a much faster model — not built).
- The first depth use needs a network connection to fetch the model(s)
  (~1.7 MB FastDepth, ~27 MB DAV2). After that it is fully offline.
