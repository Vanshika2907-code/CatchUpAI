import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  Clipboard,
  LoaderCircle,
  Lock,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react';
import type { AnalysisResult, AnalyzerStatus, ImportedChat, Priority } from './types';
import { analyzeWithGemini, getBackendHealth, type HealthResponse } from './lib/backend';
import { analyzeLocally, type AnalyzerUpdate } from './lib/localAnalyzer';
import { formatAnalysisForCopy, copyText } from './lib/copy';
import { importChatFile, messagesToTranscript } from './lib/whatsappParser';

const priorityOrder: Priority[] = ['urgent', 'important', 'fyi'];

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [chat, setChat] = useState<ImportedChat | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisMode, setAnalysisMode] = useState<'gemini' | 'local' | null>(null);
  const [status, setStatus] = useState<AnalyzerStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [progress, setProgress] = useState<number | undefined>();
  const [error, setError] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBackendHealth().then(setHealth);
  }, []);

  async function handleFile(file: File) {
    setError('');
    setAnalysis(null);
    setAnalysisMode(null);
    setCompleted(new Set());
    try {
      const imported = await importChatFile(file);
      setChat(imported);
    } catch (err) {
      setChat(null);
      setError(err instanceof Error ? err.message : 'Could not import this chat.');
    }
  }

  async function startAnalysis() {
    if (!chat) return;
    setError('');
    setAnalysis(null);
    setAnalysisMode(null);
    setStatus('analyzing');
    try {
      if (health?.geminiConfigured) {
        try {
          setStatusDetail(`Sending transcript to ${health.geminiModel} through your backend`);
          setProgress(18);
          const result = await analyzeWithGemini({
            messageCount: chat.stats.totalMessages,
            textLength: chat.stats.textLength,
            transcript: messagesToTranscript(chat.messages, 2_000_000)
          });
          setProgress(100);
          setStatus('complete');
          setStatusDetail('Gemini analysis complete');
          setAnalysisMode('gemini');
          setAnalysis(result);
          return;
        } catch (geminiError) {
          setStatus('loading-model');
          setStatusDetail(
            `Gemini is unavailable right now (${geminiError instanceof Error ? geminiError.message : 'request failed'}). Switching to local browser analysis.`
          );
          setProgress(8);
        }
      }

      await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'local-browser',
          messageCount: chat.stats.totalMessages,
          textLength: chat.stats.textLength
        })
      });
      const result = await analyzeLocally(chat.messages, (update: AnalyzerUpdate) => {
        setStatus(update.status);
        setStatusDetail(update.detail ?? '');
        setProgress(update.progress);
      });
      setAnalysisMode('local');
      setAnalysis(result);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    }
  }

  function clearSession() {
    setChat(null);
    setAnalysis(null);
    setAnalysisMode(null);
    setError('');
    setStatus('idle');
    setStatusDetail('');
    setProgress(undefined);
    setCompleted(new Set());
    if (inputRef.current) inputRef.current.value = '';
  }

  const attentionItems = useMemo(() => {
    if (!analysis) return [];
    const items = [
      ...analysis.actionItems.map((item) => ({ type: 'Task', id: item.id, title: item.task, item })),
      ...analysis.importantMessages.map((item) => ({ type: 'Update', id: item.id, title: item.title, item })),
      ...analysis.unansweredQuestions.map((item) => ({ type: 'Question', id: item.id, title: item.question, item }))
    ];
    return items
      .filter(({ item }) => priorityFilter === 'all' || item.priority === priorityFilter)
      .sort((a, b) => priorityOrder.indexOf(a.item.priority) - priorityOrder.indexOf(b.item.priority));
  }, [analysis, priorityFilter]);

  return (
    <main className="app-shell">
      <section className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <div className="eyebrow">
              <ShieldCheck size={16} /> Local-first WhatsApp catch-ups
            </div>
            <h1>CatchUp AI</h1>
            <p>A little catch-up, a lot less chaos.</p>
          </div>
        </div>
      </section>

      <section className="workspace">
        <div className="left-column">
          <UploadPanel inputRef={inputRef} chat={chat} error={error} onFile={handleFile} onClear={clearSession} />
          <PrivacyPanel health={health} onClear={clearSession} hasSession={Boolean(chat || analysis)} />
        </div>
        <PreviewPanel chat={chat} onAnalyze={startAnalysis} status={status} statusDetail={statusDetail} progress={progress} />
      </section>

      {analysis && (
        <section className="results">
          <div className="section-heading">
            <Sparkles size={24} />
            <div>
              <h2>Your catch-up report</h2>
              <p>
                {health?.geminiConfigured
                  ? analysisMode === 'gemini'
                    ? `Generated with ${health.geminiModel} through your backend.`
                    : 'Generated locally after the server AI was unavailable.'
                  : 'Generated locally from the imported conversation.'}
              </p>
            </div>
            <button className="ghost-button" onClick={() => copyText(formatAnalysisForCopy(analysis))}>
              <Clipboard size={16} /> Copy report
            </button>
          </div>

          <div className="summary-card">
            <h3>Quick summary</h3>
            <p>{analysis.quickSummary}</p>
          </div>

          <AttentionList
            items={attentionItems}
            filter={priorityFilter}
            onFilter={setPriorityFilter}
            completed={completed}
            onToggle={(id) =>
              setCompleted((current) => {
                const next = new Set(current);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              })
            }
          />

          <div className="result-grid">
            <ResultColumn title="Decisions made" empty="No explicit decisions found." items={analysis.decisions} field="decision" />
            <ResultColumn
              title="Important messages"
              empty="No extra important messages found."
              items={analysis.importantMessages}
              field="summary"
            />
          </div>

          {analysis.limitations.length > 0 && (
            <div className="limitations">
              <h3>Notes and limitations</h3>
              {analysis.limitations.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function PrivacyPanel({ health, onClear, hasSession }: { health: HealthResponse | null; onClear: () => void; hasSession: boolean }) {
  return (
    <aside className="privacy-card">
      <div className="privacy-status">
        <Lock size={20} />
        <div>
          <strong>{health?.geminiConfigured ? 'Server Gemini Mode' : 'Local Privacy Mode'}</strong>
          <span>
            {health?.geminiConfigured
              ? 'Backend connected. Analysis tries your server-side Gemini key first.'
              : health?.ok
                ? 'Backend connected. Chat content stays client-side.'
                : 'Backend health pending.'}
          </span>
        </div>
      </div>
      <ul>
        <li>Parsing happens in your browser.</li>
        <li>{health?.geminiConfigured ? `Gemini is enabled on the backend (${health.geminiModel}).` : 'AI runs in a browser worker with Transformers.js.'}</li>
        <li>API keys stay on the server and are never exposed to the frontend bundle.</li>
      </ul>
      <button className="danger-button" onClick={onClear} disabled={!hasSession}>
        <Trash2 size={16} /> Clear Session
      </button>
    </aside>
  );
}

function UploadPanel({
  inputRef,
  chat,
  error,
  onFile,
  onClear
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  chat: ImportedChat | null;
  error: string;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <section
      className={`upload-card ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <div className="upload-icon">
        <UploadCloud size={34} />
      </div>
      <h2>Import your chat</h2>
      <p>Drop a WhatsApp `.zip` or `.txt` export here, or browse for one. It is read locally in this browser.</p>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip,.txt,text/plain"
        onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])}
      />
      <button className="primary-button" onClick={() => inputRef.current?.click()}>
        <Paperclip size={17} /> Browse files
      </button>
      {chat && (
        <div className="file-pill">
          <Archive size={16} />
          <span>{chat.fileName}</span>
          <button aria-label="Remove file" onClick={onClear}>
            <X size={14} />
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function PreviewPanel({
  chat,
  onAnalyze,
  status,
  statusDetail,
  progress
}: {
  chat: ImportedChat | null;
  onAnalyze: () => void;
  status: AnalyzerStatus;
  statusDetail: string;
  progress?: number;
}) {
  const busy = status === 'loading-model' || status === 'analyzing' || status === 'validating';
  return (
    <section className="preview-card">
      <h2>Conversation preview</h2>
      {chat ? (
        <>
          <div className="stats-grid">
            <Stat label="Messages" value={chat.stats.totalMessages.toLocaleString()} />
            <Stat label="People" value={chat.stats.participantCount.toString()} />
            <Stat label="System" value={chat.stats.systemMessages.toString()} />
            <Stat label="Range" value={chat.stats.firstTimestamp ? `${chat.stats.firstTimestamp} to ${chat.stats.lastTimestamp}` : 'Unknown'} />
          </div>
          <pre className="chat-preview">{messagesToTranscript(chat.messages.slice(0, 8), 2800)}</pre>
          <button className="primary-button analyze" onClick={onAnalyze} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
            {busy ? 'Analyzing...' : 'Start analysis'}
          </button>
          {busy && (
            <div className="progress-wrap" aria-live="polite">
              <div className="progress-bar">
                <span style={{ width: `${Math.max(8, progress ?? 18)}%` }} />
              </div>
              <p>{statusDetail || 'Working...'}</p>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <Sparkles size={28} />
          <p>Your preview and message stats will appear here after import.</p>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AttentionList({
  items,
  filter,
  onFilter,
  completed,
  onToggle
}: {
  items: Array<{ type: string; id: string; title: string; item: any }>;
  filter: Priority | 'all';
  onFilter: (value: Priority | 'all') => void;
  completed: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="attention">
      <div className="attention-head">
        <div>
          <h3>Things you shouldn't miss</h3>
          <p>Urgent items rise to the top. Completion only affects this session.</p>
        </div>
        <div className="filters" aria-label="Filter by priority">
          {(['all', 'urgent', 'important', 'fyi'] as const).map((value) => (
            <button key={value} className={filter === value ? 'active' : ''} onClick={() => onFilter(value)}>
              {value}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="empty-line">Nothing matched this filter.</p>
      ) : (
        <div className="attention-list">
          {items.map(({ type, id, title, item }) => (
            <details key={`${type}-${id}`} className={completed.has(id) ? 'done attention-item' : 'attention-item'}>
              <summary>
                <button
                  aria-label={completed.has(id) ? 'Mark incomplete' : 'Mark complete'}
                  onClick={(event) => {
                    event.preventDefault();
                    onToggle(id);
                  }}
                >
                  {completed.has(id) ? <Check size={15} /> : null}
                </button>
                <span className={`chip ${item.priority}`}>{item.priority}</span>
                <strong>{title}</strong>
                <small>{type}</small>
              </summary>
              <div className="detail-body">
                {'owner' in item && <p>Owner: {item.owner}</p>}
                {'deadline' in item && <p>Deadline: {item.deadline}</p>}
                <p>Confidence: {item.confidence}</p>
                <EvidenceList evidence={item.evidence} />
                <button className="ghost-button" onClick={() => copyText(title)}>
                  <Clipboard size={15} /> Copy item
                </button>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function ResultColumn({ title, empty, items, field }: { title: string; empty: string; items: any[]; field: string }) {
  return (
    <section className="result-column">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="empty-line">{empty}</p>
      ) : (
        items.map((item) => (
          <details key={item.id} className="mini-card">
            <summary>
              <span className={`chip ${item.priority}`}>{item.priority}</span>
              <strong>{item.title ?? item[field]}</strong>
            </summary>
            <p>{item[field]}</p>
            <EvidenceList evidence={item.evidence} />
          </details>
        ))
      )}
    </section>
  );
}

function EvidenceList({ evidence }: { evidence: Array<{ messageIndex: number; timestamp: string; sender: string; snippet: string }> }) {
  if (!evidence?.length) return <p className="empty-line">No evidence returned by the model.</p>;
  return (
    <div className="evidence">
      {evidence.map((entry) => (
        <blockquote key={`${entry.messageIndex}-${entry.snippet}`}>
          <span>
            #{entry.messageIndex} / {entry.timestamp} / {entry.sender}
          </span>
          {entry.snippet}
        </blockquote>
      ))}
    </div>
  );
}
