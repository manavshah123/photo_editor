# Wedding Tone Studio V5

V5 keeps the existing Editor and adds a separate **AI Studio** page.

## Run
```bash
npm install
npm run dev
```

## AI features
### 1. AI Reference Match
Analyzes an original/edited pair and creates a learned starting grade. The current implementation uses global color/tone statistics in-browser; V6 can add full histogram/tone-curve matching.

### 2. Face-aware enhancement
Uses `Xenova/face-parsing` through Transformers.js to segment face/skin regions and applies a gentle enhancement only to those regions.

### 3. Real AI Super Resolution
Uses Real-ESRGAN RRDBNet ONNX models from SceneWorks. The model runs through ONNX Runtime Web with WebGPU first and WASM fallback. The model is downloaded/cached by the browser at first use.

### 4. AI Object Removal
Uses LaMa ONNX inpainting. Paint a white mask over the object and run the model. The current browser implementation uses a 512×512 working canvas; production V6 should add tiled full-resolution inpainting.

### 5. Batch Editing
Select multiple photos and export the current editor grade in one pass.

## Model sizes / expectations
AI models are intentionally **not bundled** in this ZIP. They download when the corresponding feature is first used. Super-resolution and LaMa models are large, so first-use download and inference can take time, especially on CPU.

## Sources / model licenses
- Transformers.js: https://github.com/huggingface/transformers.js
- Face parsing: Xenova/face-parsing
- Real-ESRGAN ONNX: SceneWorks/real-esrgan-onnx, BSD-3-Clause
- LaMa ONNX: sapienkit/LaMa-ONNX, Apache-2.0

For production deployment, keep the model URLs pinned to reviewed versions/hashes and add proper attribution/license files.


## V6 — Wedding AI
Added a dedicated Wedding AI page while preserving Editor and AI Studio. Features include Couple Priority, Face Enhancement, Group Face Enhancement, AI-style Dehaze, Backlight Recovery, White Clothing Protection, Skin Tone Protection, Clothing Color Protection, foreground-distraction workflow handoff, AI detail handoff, and Wedding Album Consistency batch processing. The Wedding AI layer uses adaptive local image processing plus the existing face-parsing model. Real super-resolution and LaMa object removal remain available in AI Studio.


## V6.0.1 Fix
AI Studio and Wedding AI now have their own **Select Photo / Change Photo** controls. The selected photo is shared with the AI tools, so you no longer need to visit Editor first.


## V6.0.2 Fix
Fixed the TypeScript syntax error in `weddingProcess()` that caused Vite/esbuild to report `Expected ')' but found ']'`.


## V6.0.3 Fix
Rewrote `src/main.tsx` into separate Editor, AI Studio, and Wedding AI page render blocks to eliminate the broken JSX ternary. Also fixed the object-removal mask canvas ref. TypeScript syntax was checked with `tsc`; remaining diagnostics require installed npm dependencies only.


## V6.0.4 Fix
Fixed AI Studio/Wedding AI image state. The selected photo is now stored in a global hidden image element shared by all pages, and AI actions wait for the image to finish loading. AI Studio and Wedding AI no longer depend on the Editor page's image element.
