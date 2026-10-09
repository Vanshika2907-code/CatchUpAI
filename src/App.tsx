import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  Clipboard,
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
  LoaderCircle,
  Lock,
  Paperclip,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react';
import type { AnalysisResult, AnalyzerStatus, ChatMessage, ImportedChat, Priority } from './types';
import { getBackendHealth, type HealthResponse } from './lib/backend';
import { analyzeLocally, type AnalyzerUpdate } from './lib/localAnalyzer';
import { formatAnalysisForCopy, copyText } from './lib/copy';
import { importChatFile, messagesToTranscript } from './lib/whatsappParser';
import {
  sanitizeConversation,
  sanitizeAnalysisResult,
  type PrivacyReport,
  type SensitiveDetection
} from './lib/privacyShield';

const priorityOrder: Priority[] = ['urgent', 'important', 'fyi'];

function formatCategoryLabel(cat: string): string {
  switch (cat) {
    case 'pin':
      return 'PIN / Passcode';
    case 'otp':
      return 'OTP / Code';
    case 'password':
      return 'Password';
    case 'api_key':
      return 'API Key';
    case 'email':
      return 'Email Address';
    case 'phone':
      return 'Phone Number';
    case 'financial':
      return 'Financial / Card';
    case 'gov_id':
      return 'Gov ID / SSN';
    case 'address':
      return 'Physical Address';
    case 'custom':
      return 'User Private Term';
    default:
      return cat;
  }
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [chat, setChat] = useState<ImportedChat | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<AnalyzerStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [progress, setProgress] = useState<number | undefined>();
  const [error, setError] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [customTerms, setCustomTerms] = useState<string[]>([]);
  const [customTermInput, setCustomTermInput] = useState('');
  const [showRawPreview, setShowRawPreview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBackendHealth().then(setHealth);
  }, []);

  // Run privacy filter on raw messages locally before any AI step
  const { sanitizedMessages, privacyReport } = useMemo(() => {
    if (!chat) {
      return {
        sanitizedMessages: [] as ChatMessage[],
        privacyReport: {
          totalDetections: 0,
          categoryCounts: {
            pin: 0,
            otp: 0,
            password: 0,
            api_key: 0,
            email: 0,
            phone: 0,
            financial: 0,
            gov_id: 0,
            address: 0,
            custom: 0
          },
          detections: [] as SensitiveDetection[]
        } as PrivacyReport
      };
    }
    return sanitizeConversation(chat.messages, customTerms);
  }, [chat, customTerms]);

  async function handleFile(file: File) {
    setError('');
    setAnalysis(null);
    setCompleted(new Set());
    try {
      const imported = await importChatFile(file);
      setChat(imported);
    } catch (err) {
      setChat(null);
      setError(err instanceof Error ? err.message : 'Could not import this chat.');
    }
  }

  function handleLoadSample() {
    const sampleText = `09/10/2026, 10:00 AM - Alex: Team, let's sync on the cloud invoice and launch deployment.
09/10/2026, 10:02 AM - Alex: My PIN is 1234. Please complete the payment before 5 PM today.
09/10/2026, 10:05 AM - Sam: Payment scheduled for 5 PM. The OTP is 582941. Contact me at sam.lead@acme.org or +1 (555) 123-4567 if anything fails.
09/10/2026, 10:08 AM - Taylor: Staging credentials: password is stagingSecret2026. The API key is sk-prod998877665544332211.
09/10/2026, 10:12 AM - Alex: Documentation delivery address is 742 Evergreen Terrace, Suite 100.
09/10/2026, 10:15 AM - Sam: Should we schedule the user smoke test for 3 PM?
09/10/2026, 10:20 AM - Taylor: Agreed, let's lock in the smoke test for 3 PM.`;
    const sampleFile = new File([sampleText], 'WhatsApp Chat - Cloud Team.txt', { type: 'text/plain' });
    handleFile(sampleFile);
  }

  function handleAddCustomTerm(term: string) {
    const trimmed = term.trim();
    if (!trimmed || customTerms.includes(trimmed)) return;
    setCustomTerms((prev) => [...prev, trimmed]);
    setCustomTermInput('');
  }

  function handleRemoveCustomTerm(term: string) {
    setCustomTerms((prev) => prev.filter((t) => t !== term));
  }

  async function startAnalysis() {
    if (!chat || sanitizedMessages.length === 0) return;
    setError('');
    setAnalysis(null);
    setStatus('analyzing');
    setStatusDetail('Privacy Shield active · Reading sanitized messages...');
    setProgress(15);
    try {
      fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'local-browser',
          messageCount: chat.stats.totalMessages,
          textLength: chat.stats.textLength
        })
      }).catch(() => {});

      // Privacy Shield Pipeline Step:
      // Send ONLY sanitized conversation content (never original unmasked messages)
      const rawResult = await analyzeLocally(sanitizedMessages, (update: AnalyzerUpdate) => {
        setStatus(update.status);
        setStatusDetail(update.detail ?? '');
        setProgress(update.progress);
      });

      // Privacy Shield Secondary Validation:
      // Ensure AI results never reintroduced or leaked unmasked sensitive items
      const validatedResult = sanitizeAnalysisResult(rawResult, customTerms);
      setAnalysis(validatedResult);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    }
  }

  function clearSession() {
    setChat(null);
    setAnalysis(null);
    setError('');
    setStatus('idle');
    setStatusDetail('');
    setProgress(undefined);
    setCompleted(new Set());
    setShowRawPreview(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  const attentionItems = useMemo(() => {
    if (!analysis) return [];
    const items = [
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
          <UploadPanel
            inputRef={inputRef}
            chat={chat}
            error={error}
            onFile={handleFile}
            onClear={clearSession}
            onLoadSample={handleLoadSample}
          />
          <PrivacyPanel
            health={health}
            onClear={clearSession}
            hasSession={Boolean(chat || analysis)}
            privacyReport={privacyReport}
            customTerms={customTerms}
            customTermInput={customTermInput}
            onCustomTermInputChange={setCustomTermInput}
            onAddCustomTerm={handleAddCustomTerm}
            onRemoveCustomTerm={handleRemoveCustomTerm}
          />
        </div>
        <PreviewPanel
          chat={chat}
          sanitizedMessages={sanitizedMessages}
          privacyReport={privacyReport}
          showRawPreview={showRawPreview}
          onToggleRawPreview={() => setShowRawPreview((prev) => !prev)}
          onAnalyze={startAnalysis}
          status={status}
          statusDetail={statusDetail}
          progress={progress}
        />
      </section>

      {analysis && (
        <section className="results">
          <div className="doodle-flower" aria-hidden="true">✿</div>
          <div className="doodle-sparkle" aria-hidden="true">♡</div>

          {/* Privacy Shield Indicator in Report */}
          <div className="privacy-shield-indicator">
            <div className="privacy-shield-indicator-row">
              <span className="privacy-badge">
                🔒 {privacyReport.totalDetections} sensitive {privacyReport.totalDetections === 1 ? 'item' : 'items'} protected
              </span>
              <p>Masked prior to AI synthesis. Output verified to prevent reproduction of secrets.</p>
            </div>
            {privacyReport.totalDetections > 0 && (
              <>
                <div className="privacy-tags">
                  {Object.entries(privacyReport.categoryCounts)
                    .filter(([_, count]) => count > 0)
                    .map(([cat, count]) => (
                      <span key={cat} className="privacy-tag">
                        {formatCategoryLabel(cat)}: {count}
                      </span>
                    ))}
                </div>
                <details className="privacy-inspection">
                  <summary>Inspect sanitized items &amp; detection reasons</summary>
                  <div className="privacy-detections-list">
                    {privacyReport.detections.map((det, idx) => (
                      <div key={idx} className="privacy-detection-item">
                        <span>
                          <strong>{formatCategoryLabel(det.category)}</strong> ({det.reason})
                        </span>
                        <code>{det.masked}</code>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
          </div>

          <div className="section-heading">
            <Sparkles size={24} />
            <div>
              <h2>Your catch-up report</h2>
              <p>Generated locally from sanitized conversation content.</p>
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

          <TodoList
            items={analysis.actionItems}
            completed={completed}
            onToggle={(id) =>
              setCompleted((current) => {
                const next = new Set(current);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              })
            }
          />

          <div className="result-grid wide">
            <ResultColumn title="Decisions" empty="No explicit decisions found." items={analysis.decisions} field="decision" icon="stamp" />
            <ResultColumn title="Important messages" empty="No important messages found." items={analysis.importantMessages} field="summary" icon="note" />
          </div>

          <div className="question-panel">
            <div className="panel-title">
              <HelpCircle size={18} />
              <h3>Unanswered questions</h3>
            </div>
            {analysis.unansweredQuestions.length === 0 ? (
              <p className="empty-line">No unanswered questions were identified in the analyzed messages.</p>
            ) : (
              <div className="question-list">
                {analysis.unansweredQuestions.map((item) => (
                  <details key={item.id} className="mini-card">
                    <summary>
                      <span className={`chip ${item.priority}`}>{item.priority}</span>
                      <strong>{item.question}</strong>
                    </summary>
                    <p>Asked by: {item.askedBy}</p>
                    <EvidenceList evidence={item.evidence} />
                  </details>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function PrivacyPanel({
  health,
  onClear,
  hasSession,
  privacyReport,
  customTerms,
  customTermInput,
  onCustomTermInputChange,
  onAddCustomTerm,
  onRemoveCustomTerm
}: {
  health: HealthResponse | null;
  onClear: () => void;
  hasSession: boolean;
  privacyReport: PrivacyReport;
  customTerms: string[];
  customTermInput: string;
  onCustomTermInputChange: (val: string) => void;
  onAddCustomTerm: (term: string) => void;
  onRemoveCustomTerm: (term: string) => void;
}) {
  return (
    <aside className="privacy-card">
      <div className="privacy-status">
        <Lock size={20} />
        <div>
          <strong>Privacy Shield Active</strong>
          <span>
            {health?.ok ? 'Backend validates connectivity only. Chat stays on device.' : 'Processing runs entirely on-device.'}
          </span>
        </div>
      </div>
      <ul>
        <li>Parsing and sensitive detection happen in your browser.</li>
        <li>PINs, passwords, OTPs, API keys, emails &amp; phones masked before AI.</li>
        <li>Chat content never leaves your browser unmasked.</li>
      </ul>

      {/* User Custom Sensitive Terms Input */}
      <div className="custom-terms-box">
        <h4>
          <ShieldAlert size={15} /> Custom Private Terms
        </h4>
        <p>Specify sensitive keywords or codenames to automatically mask.</p>
        <div className="custom-term-input-row">
          <input
            type="text"
            placeholder="e.g. Project Apollo, Acme Corp"
            value={customTermInput}
            onChange={(e) => onCustomTermInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAddCustomTerm(customTermInput);
              }
            }}
          />
          <button type="button" onClick={() => onAddCustomTerm(customTermInput)}>
            <Plus size={14} /> Add
          </button>
        </div>
        {customTerms.length > 0 && (
          <div className="custom-term-chips">
            {customTerms.map((term) => (
              <span key={term} className="custom-term-chip">
                {term}
                <button type="button" aria-label={`Remove ${term}`} onClick={() => onRemoveCustomTerm(term)}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <button className="danger-button" onClick={onClear} disabled={!hasSession} style={{ marginTop: '16px' }}>
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
  onClear,
  onLoadSample
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  chat: ImportedChat | null;
  error: string;
  onFile: (file: File) => void;
  onClear: () => void;
  onLoadSample: () => void;
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

      <button type="button" className="sample-button" onClick={onLoadSample}>
        <Sparkles size={15} /> Try sample chat with secrets
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
  sanitizedMessages,
  privacyReport,
  showRawPreview,
  onToggleRawPreview,
  onAnalyze,
  status,
  statusDetail,
  progress
}: {
  chat: ImportedChat | null;
  sanitizedMessages: ChatMessage[];
  privacyReport: PrivacyReport;
  showRawPreview: boolean;
  onToggleRawPreview: () => void;
  onAnalyze: () => void;
  status: AnalyzerStatus;
  statusDetail: string;
  progress?: number;
}) {
  const busy = status === 'loading-model' || status === 'analyzing' || status === 'validating';

  const previewText = useMemo(() => {
    if (!chat) return '';
    const msgsToPreview = showRawPreview ? chat.messages.slice(0, 8) : sanitizedMessages.slice(0, 8);
    return messagesToTranscript(msgsToPreview, 2800);
  }, [chat, sanitizedMessages, showRawPreview]);

  return (
    <section className="preview-card">
      <h2>Conversation preview</h2>
      {chat ? (
        <>
          <div className="stats-grid">
            <Stat label="Messages" value={chat.stats.totalMessages.toLocaleString()} />
            <Stat label="People" value={chat.stats.participantCount.toString()} />
            <Stat label="Protected" value={privacyReport.totalDetections.toString()} />
            <Stat label="Range" value={chat.stats.firstTimestamp ? `${chat.stats.firstTimestamp} to ${chat.stats.lastTimestamp}` : 'Unknown'} />
          </div>

          {/* Privacy Shield Status Banner in Preview */}
          <div className="privacy-shield-indicator" style={{ marginBottom: '12px' }}>
            <div className="privacy-shield-indicator-row">
              <span className="privacy-badge">
                🔒 {privacyReport.totalDetections} sensitive items detected &amp; masked
              </span>
              <button
                type="button"
                className="preview-toggle-button"
                onClick={onToggleRawPreview}
                title={showRawPreview ? 'Switch to sanitized view' : 'Switch to raw view'}
              >
                {showRawPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                {showRawPreview ? 'View Sanitized (Default)' : 'Inspect Raw (Private)'}
              </button>
            </div>
            {privacyReport.totalDetections > 0 && (
              <div className="privacy-tags">
                {Object.entries(privacyReport.categoryCounts)
                  .filter(([_, count]) => count > 0)
                  .map(([cat, count]) => (
                    <span key={cat} className="privacy-tag">
                      {formatCategoryLabel(cat)}: {count}
                    </span>
                  ))}
              </div>
            )}
          </div>

          <pre className="chat-preview">{previewText}</pre>

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
          <p>Your preview, message stats, and Privacy Shield protection will appear here after import.</p>
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

function TodoList({
  items,
  completed,
  onToggle
}: {
  items: AnalysisResult['actionItems'];
  completed: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="todo-panel">
      <div className="panel-title">
        <Check size={18} />
        <h3>Your little to-do list</h3>
      </div>
      {items.length === 0 ? (
        <p className="empty-line">No supported tasks were found in this conversation.</p>
      ) : (
        <div className="todo-list">
          {items
            .slice()
            .sort((a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority))
            .map((item) => (
              <details key={item.id} className={completed.has(item.id) ? 'done todo-item' : 'todo-item'}>
                <summary>
                  <button
                    aria-label={completed.has(item.id) ? 'Mark incomplete' : 'Mark complete'}
                    onClick={(event) => {
                      event.preventDefault();
                      onToggle(item.id);
                    }}
                  >
                    {completed.has(item.id) ? <Check size={15} /> : null}
                  </button>
                  <span className={`chip ${item.priority}`}>{item.priority}</span>
                  <strong>{item.task}</strong>
                  <small>{item.commitmentType}</small>
                </summary>
                <div className="detail-body">
                  <div className="todo-meta">
                    <span>Owner: {item.owner}</span>
                    <span>
                      <Clock size={14} /> {item.deadline}
                    </span>
                    <span>Confidence: {item.confidence}</span>
                  </div>
                  <EvidenceList evidence={item.evidence} />
                </div>
              </details>
            ))}
        </div>
      )}
    </section>
  );
}

function ResultColumn({
  title,
  empty,
  items,
  field,
  icon
}: {
  title: string;
  empty: string;
  items: any[];
  field: string;
  icon: 'stamp' | 'note';
}) {
  return (
    <section className="result-column">
      <div className="panel-title">
        <span className={`tiny-doodle ${icon}`} aria-hidden="true" />
        <h3>{title}</h3>
      </div>
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
