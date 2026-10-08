// Web Worker for "写真に重ねる": runs the star pattern recognition (starid.js) off the main thread so the page
// never freezes. Built separately: npx esbuild src/photo-worker.js --bundle --minify --format=iife --target=es2019 --outfile=photo-worker.js
import { runJob } from './starid.js';
self.onmessage = (e) => {
  let r; try { r = runJob(e.data); } catch (err) { r = { ok: false, why: 'error' }; }
  r.job = e.data.job; self.postMessage(r);
};
