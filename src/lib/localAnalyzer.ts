import type { AnalysisResult, AnalyzerStatus, ChatMessage } from '../types';

export interface AnalyzerUpdate {
  status: AnalyzerStatus;
  detail?: string;
  progress?: number;
}

export function analyzeLocally(
  messages: ChatMessage[],
  onUpdate: (update: AnalyzerUpdate) => void
): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') {
      reject(new Error('This browser does not support Web Workers, which CatchUp AI needs for local analysis.'));
      return;
    }

    const worker = new Worker(new URL('../workers/localAi.worker.ts', import.meta.url), { type: 'module' });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('Local analysis timed out. Try a smaller export or a browser with WebGPU support.'));
    }, 8 * 60 * 1000);

    worker.onmessage = (event: MessageEvent<any>) => {
      const data = event.data;
      if (data.type === 'status') {
        onUpdate({ status: data.status, detail: data.detail, progress: data.progress });
      }
      if (data.type === 'result') {
        window.clearTimeout(timeout);
        worker.terminate();
        onUpdate({ status: 'complete', detail: 'Analysis complete', progress: 100 });
        resolve(data.result);
      }
      if (data.type === 'error') {
        window.clearTimeout(timeout);
        worker.terminate();
        onUpdate({ status: 'error', detail: data.error });
        reject(new Error(data.error));
      }
    };

    worker.onerror = (error) => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error(error.message || 'The local AI worker failed.'));
    };

    onUpdate({ status: 'loading-model', detail: 'Preparing local model' });
    worker.postMessage({ type: 'analyze', messages });
  });
}
