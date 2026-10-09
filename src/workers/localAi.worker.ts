import { pipeline, env } from '@huggingface/transformers';
import { buildAnalysisPrompt } from '../prompts';
import { emptyAnalysis, parseModelJson } from '../lib/analysisSchema';
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

const MODEL_ID = 'Xenova/flan-t5-small';
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
      detail: 'Downloading model weights from Hugging Face. Your chat stays in this browser.'
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
  const generator = await getGenerator();
  const chunks = chunkMessages(messages);
  const results: AnalysisResult[] = [];
  const invalidOutputs: string[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    post({
      type: 'status',
      status: 'analyzing',
      detail: `Analyzing chunk ${index + 1} of ${chunks.length}`,
      progress: (index / chunks.length) * 100
    });

    const transcript = messagesToTranscript(chunks[index], 7000);
    const prompt = buildAnalysisPrompt(transcript, chunks.length > 1 ? `chunk ${index + 1} of ${chunks.length}` : 'conversation');
    const output = await generator(prompt, {
      max_new_tokens: 1100,
      temperature: 0,
      repetition_penalty: 1.12,
      return_full_text: false
    });
    const text = Array.isArray(output) ? output[0]?.generated_text : output?.generated_text;
    if (!text || typeof text !== 'string') {
      throw new Error('The local model returned an empty response.');
    }

    post({ type: 'status', status: 'validating', detail: 'Validating structured JSON' });
    try {
      results.push(parseModelJson(text));
    } catch (error) {
      invalidOutputs.push(error instanceof Error ? error.message : 'The model returned invalid JSON.');
    }
  }

  if (results.length === 0) {
    return buildFallbackAnalysis(messages, invalidOutputs[0] ?? 'The local model did not return usable JSON.');
  }

  post({ type: 'status', status: 'validating', detail: 'Merging local results' });
  const merged = mergeAnalyses(results);
  if (invalidOutputs.length > 0) {
    merged.limitations = [
      ...merged.limitations,
      `${invalidOutputs.length} chunk${invalidOutputs.length === 1 ? '' : 's'} could not be parsed as model JSON and were omitted.`
    ];
  }
  return merged;
}

function buildFallbackAnalysis(messages: ChatMessage[], reason: string): AnalysisResult {
  const userMessages = messages.filter((message) => !message.isSystem && message.text.trim());
  const recentMessages = userMessages.slice(-5);
  const summaryParts = [
    `Imported ${messages.length.toLocaleString()} messages`,
    userMessages.length > 0 ? `including ${userMessages.length.toLocaleString()} participant messages` : ''
  ].filter(Boolean);
  const fallback = emptyAnalysis(
    `The local browser model could not produce valid structured JSON (${reason}). Showing a cautious basic report from parsed messages instead.`
  );

  fallback.quickSummary = `${summaryParts.join(', ')}. Review the conversation preview or try again with a smaller export for a richer AI report.`;
  fallback.importantMessages = recentMessages.map((message, index) => ({
    id: `fallback-${message.index}`,
    title: `Recent message ${index + 1}`,
    summary: truncate(message.text, 240),
    priority: 'fyi',
    confidence: 'low',
    evidence: [
      {
        messageIndex: message.index,
        timestamp: message.timestamp ?? 'unknown',
        sender: message.sender ?? 'unknown',
        snippet: truncate(message.text, 180)
      }
    ]
  }));

  return fallback;
}

function truncate(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
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
