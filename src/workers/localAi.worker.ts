import { pipeline, env } from '@huggingface/transformers';
import { buildAnalysisPrompt } from '../prompts';
import { parseModelJson } from '../lib/analysisSchema';
import { buildExtractiveAnalysis } from '../lib/extractiveAnalysis';
import { chunkMessages, messagesToTranscript } from '../lib/whatsappParser';
import { mergeAnalyses } from '../lib/analysisMerge';
import type { AnalysisResult, ChatMessage } from '../types';

type WorkerRequest = {
  type: 'analyze';
  messages: ChatMessage[];
};

type WorkerResponse =
  | { type: 'status'; status: string; detail?: string; progress?: number }
  | { type: 'result'; result: AnalysisResult }
  | { type: 'error'; error: string };

const MODEL_ID = 'Xenova/LaMini-Flan-T5-248M';
const CHUNK_MAX_CHARS = 2200;
const MODEL_LOAD_TIMEOUT_MS = 20000;
const CHUNK_GENERATION_TIMEOUT_MS = 25000;
let generatorPromise: Promise<any> | null = null;

env.allowLocalModels = false;
env.allowRemoteModels = true;

function post(message: WorkerResponse) {
  self.postMessage(message);
}

async function getGenerator() {
  if (!generatorPromise) {
    post({
      type: 'status',
      status: 'loading-model',
      detail: 'Downloading the local analysis model. Your chat stays in this browser.'
    });

    const device = 'gpu' in navigator ? 'webgpu' : 'wasm';
    generatorPromise = pipeline('text2text-generation', MODEL_ID, {
      device,
      dtype: device === 'webgpu' ? 'fp32' : 'q8',
      progress_callback: (progress: { status?: string; progress?: number; file?: string }) => {
        post({
          type: 'status',
          status: 'loading-model',
          detail: progress.file ? `Loading ${progress.file}` : progress.status,
          progress: typeof progress.progress === 'number' ? progress.progress : undefined
        });
      }
    });
  }
  return generatorPromise;
}

async function analyze(messages: ChatMessage[]) {
  const chunks = chunkMessages(messages, CHUNK_MAX_CHARS);
  const results: AnalysisResult[] = [];
  let generator: any;

  try {
    generator = await withTimeout(getGenerator(), MODEL_LOAD_TIMEOUT_MS, 'The local model took too long to load.');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The local model was not ready.';
    post({
      type: 'status',
      status: 'validating',
      detail: 'Using fast local analysis because the model is still loading'
    });
    return mergeAnalyses(chunks.map((chunk, index) => buildExtractiveAnalysis(chunk, `Chunk ${index + 1}: ${reason}`)));
  }

  for (let index = 0; index < chunks.length; index += 1) {
    post({
      type: 'status',
      status: 'analyzing',
      detail: `Analyzing chunk ${index + 1} of ${chunks.length}`,
      progress: (index / chunks.length) * 100
    });

    const transcript = messagesToTranscript(chunks[index], CHUNK_MAX_CHARS);
    const prompt = buildAnalysisPrompt(transcript, chunks.length > 1 ? `chunk ${index + 1} of ${chunks.length}` : 'conversation');
    post({ type: 'status', status: 'validating', detail: 'Generating structured local report' });
    results.push(await generateStructuredAnalysis(generator, prompt, chunks[index], transcript, index + 1));
  }

  post({ type: 'status', status: 'validating', detail: 'Merging local results' });
  return mergeAnalyses(results);
}

async function generateStructuredAnalysis(
  generator: any,
  prompt: string,
  messages: ChatMessage[],
  transcript: string,
  chunkNumber: number
): Promise<AnalysisResult> {
  let lastText = '';
  let lastError = 'The local model did not return valid JSON.';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const text = await generateText(generator, attempt === 1 ? prompt : buildRepairPrompt(lastText, transcript));
      lastText = text;

      return parseModelJson(text);
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  post({
    type: 'status',
    status: 'validating',
    detail: `Using conservative local fallback for chunk ${chunkNumber}`
  });
  return buildExtractiveAnalysis(messages, `Model JSON parsing failed on chunk ${chunkNumber}: ${lastError}`);
}

async function generateText(generator: any, prompt: string): Promise<string> {
  const output: any = await withTimeout(
    generator(prompt, {
      max_new_tokens: 700,
      temperature: 0,
      repetition_penalty: 1.08,
      no_repeat_ngram_size: 4,
      return_full_text: false
    }),
    CHUNK_GENERATION_TIMEOUT_MS,
    'The local model took too long to generate a structured answer.'
  );
  const text = Array.isArray(output) ? output[0]?.generated_text : output?.generated_text;
  if (!text || typeof text !== 'string') {
    throw new Error('The local model returned an empty response.');
  }
  return text.trim();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function buildRepairPrompt(modelOutput: string, transcript: string): string {
  return `Fix the previous answer so it is one valid JSON object only.
Use only facts supported by these messages. Do not add fake tasks, deadlines, owners, decisions, or summaries.

Required top-level keys:
quickSummary, importantMessages, decisions, actionItems, unansweredQuestions, limitations

Previous answer:
${modelOutput.slice(0, 3000)}

Messages:
${transcript}

JSON only:`;
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== 'analyze') return;
  analyze(event.data.messages)
    .then((result) => post({ type: 'result', result }))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Local AI failed unexpectedly.';
      post({ type: 'error', error: message });
    });
});
