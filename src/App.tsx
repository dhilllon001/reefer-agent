import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  CUSTOMER_PROFILES,
  CUSTOMERS,
  getCustomerProfile,
  getCustomerSensitivity,
} from './data/customers'
import { activeEntities, ENTITIES } from './data/entities'
import { answerAskAi } from './lib/askAi'
import { formatAbsolute, formatRelative } from './lib/format'
import {
  ALERT_TYPE_LABEL,
  entitySeverity,
  SENSITIVITY_HINT,
  SENSITIVITY_LABEL,
  SEVERITY_LABEL,
  TEMP_RANGE_CONFIG,
} from './lib/severity'
import type {
  Alert,
  ChatMessage,
  ChatMode,
  Entity,
  ReeferSensitivity,
  Severity,
} from './types'
import './App.css'

function latestAlert(entity: Entity): Alert | undefined {
  return [...entity.alerts].sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
  )[0]
}

function entitySentAt(entity: Entity): number {
  const alert = latestAlert(entity)
  return alert ? new Date(alert.sentAt).getTime() : 0
}

export default function App() {
  const queue = useMemo(() => activeEntities(ENTITIES), [])
  const [search, setSearch] = useState('')
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([])
  const [selectedSeverities, setSelectedSeverities] = useState<Severity[]>([])
  const [selectedSensitivities, setSelectedSensitivities] = useState<
    ReeferSensitivity[]
  >([])
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false)
  /** Matches original product: workbench + dark Chat bar; expand for conversation */
  const [chatMode, setChatMode] = useState<ChatMode>('bar')
  const [draft, setDraft] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm0',
      role: 'assistant',
      content:
        'Ask AI is ready. Filter by alert severity or customer reefer sensitivity, or ask for a full pro bill list — counts always match the full result set.',
      timestamp: new Date().toISOString(),
    },
  ])

  const insightBase = useMemo(() => {
    return selectedCustomers.length
      ? queue.filter((e) => selectedCustomers.includes(e.customer))
      : queue
  }, [queue, selectedCustomers])

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 }
    for (const e of insightBase) {
      if (
        selectedSensitivities.length &&
        !selectedSensitivities.includes(getCustomerSensitivity(e.customer))
      ) {
        continue
      }
      const sev = entitySeverity(e.alerts.map((a) => a.severity))
      if (sev) counts[sev] += 1
    }
    return counts
  }, [insightBase, selectedSensitivities])

  const sensitivityCounts = useMemo(() => {
    const counts: Record<ReeferSensitivity, number> = {
      high: 0,
      medium: 0,
      low: 0,
    }
    for (const e of insightBase) {
      if (
        selectedSeverities.length &&
        !e.alerts.some((a) => selectedSeverities.includes(a.severity))
      ) {
        continue
      }
      counts[getCustomerSensitivity(e.customer)] += 1
    }
    return counts
  }, [insightBase, selectedSeverities])

  const filtered = useMemo(() => {
    return queue
      .filter((e) => {
        if (selectedCustomers.length && !selectedCustomers.includes(e.customer)) {
          return false
        }
        if (
          selectedSeverities.length &&
          !e.alerts.some((a) => selectedSeverities.includes(a.severity))
        ) {
          return false
        }
        if (
          selectedSensitivities.length &&
          !selectedSensitivities.includes(getCustomerSensitivity(e.customer))
        ) {
          return false
        }
        if (search.trim()) {
          const q = search.trim().toLowerCase()
          const alert = latestAlert(e)
          const profile = getCustomerProfile(e.customer)
          const hay = [
            e.proBill,
            e.customer,
            e.trailer,
            profile.segment,
            alert ? ALERT_TYPE_LABEL[alert.type] : '',
          ]
            .join(' ')
            .toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => entitySentAt(b) - entitySentAt(a))
  }, [
    queue,
    selectedCustomers,
    selectedSeverities,
    selectedSensitivities,
    search,
  ])

  const [selectedId, setSelectedId] = useState<string>(() => filtered[0]?.id ?? '')
  const selected =
    filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null

  function toggleCustomer(name: string) {
    setSelectedCustomers((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    )
  }

  function toggleSeverity(sev: Severity) {
    setSelectedSeverities((prev) =>
      prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev],
    )
  }

  function toggleSensitivity(level: ReeferSensitivity) {
    setSelectedSensitivities((prev) =>
      prev.includes(level) ? prev.filter((s) => s !== level) : [...prev, level],
    )
  }

  function sendChat(text?: string) {
    const content = (text ?? draft).trim()
    if (!content) return
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    const reply = answerAskAi(content, filtered.length ? filtered : queue)
    const assistantMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      ...reply,
      timestamp: new Date().toISOString(),
    }
    setMessages((m) => [...m, userMsg, assistantMsg])
    setDraft('')
    setChatMode('expanded')
  }

  const chatBadge = Math.max(0, messages.length - 1)

  const askAiProps = {
    messages,
    draft,
    setDraft,
    sendChat,
    onSelectProBill: (proBill: string) => {
      const found = queue.find((e) => e.proBill === proBill)
      if (found) setSelectedId(found.id)
    },
    prompts: [
      'List high sensitivity customers',
      'List all high severity pro bills',
      'How many temp deviations?',
      'Show mode mismatch alerts',
    ],
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-brand">
          <div className="brand-mark" aria-hidden>
            <BulbIcon />
          </div>
          <div>
            <h1>Reefer Agent</h1>
            <p>
              {filtered.length} of {queue.length} active
              <span className="muted"> · {ENTITIES.length - queue.length} hidden</span>
            </p>
          </div>
        </header>

        <div className="search-wrap">
          <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" fill="none" />
            <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search probill, customer, type…"
            aria-label="Search entities"
          />
        </div>

        <ul className="entity-list" role="listbox" aria-label="Pro bills">
          {filtered.map((entity) => {
            const alert = latestAlert(entity)
            const active = (selected?.id ?? '') === entity.id
            const sev = entitySeverity(entity.alerts.map((a) => a.severity))
            const sensitivity = getCustomerSensitivity(entity.customer)
            const profile = getCustomerProfile(entity.customer)
            return (
              <li key={entity.id}>
                <button
                  type="button"
                  className={`entity-row ${active ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(entity.id)}
                  role="option"
                  aria-selected={active}
                >
                  <div className="entity-main">
                    <div className="entity-top">
                      <span className="pro-bill">{entity.proBill}</span>
                      {sev && (
                        <span
                          className={`sev-pill sev-${sev}`}
                          title={`Alert severity: ${SEVERITY_LABEL[sev]}`}
                        >
                          {sev[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="entity-customer">{entity.customer}</div>
                    <div className="entity-meta">
                      {alert ? ALERT_TYPE_LABEL[alert.type] : 'No alert'}
                      <span className="dot">·</span>
                      <span
                        className={`sens-inline sens-${sensitivity}`}
                        title={SENSITIVITY_HINT[sensitivity]}
                      >
                        {SENSITIVITY_LABEL[sensitivity]} sens.
                      </span>
                      <span className="dot">·</span>
                      {alert ? formatRelative(alert.sentAt) : '—'}
                    </div>
                    <div className="entity-segment">{profile.segment}</div>
                  </div>
                  <span className="alert-count" title="Active alerts">
                    {entity.alerts.length}
                  </span>
                </button>
              </li>
            )
          })}
          {!filtered.length && (
            <li className="empty-list">No pro bills match the current filters.</li>
          )}
        </ul>

        <footer className="sidebar-foot">
          <span className="pulse" />
          Sorted by alert sent time · newest first
        </footer>
      </aside>

      <main className="main">
        <header className="top-bar">
          <div className="top-bar-left">
            <div className="customer-picker">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setCustomerMenuOpen((o) => !o)}
                aria-expanded={customerMenuOpen}
              >
                Customers
                {selectedCustomers.length > 0 && (
                  <span className="chip-count">{selectedCustomers.length}</span>
                )}
                <span className="chev" aria-hidden>
                  ▾
                </span>
              </button>
              {customerMenuOpen && (
                <div className="dropdown" role="menu">
                  <div className="dropdown-head">
                    <span>Select customers</span>
                    {selectedCustomers.length > 0 && (
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => setSelectedCustomers([])}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {CUSTOMERS.map((c) => {
                    const profile = getCustomerProfile(c)
                    return (
                      <label key={c} className="check-row">
                        <input
                          type="checkbox"
                          checked={selectedCustomers.includes(c)}
                          onChange={() => toggleCustomer(c)}
                        />
                        <span className="check-copy">
                          <span>{c}</span>
                          <small>
                            {profile.segment} · {SENSITIVITY_LABEL[profile.reeferSensitivity]}{' '}
                            sensitivity
                          </small>
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn ghost collapse-btn"
              onClick={() => setChatMode(chatMode === 'expanded' ? 'bar' : 'expanded')}
              title={
                chatMode === 'expanded'
                  ? 'Collapse chat to bottom bar'
                  : 'Expand chat panel'
              }
            >
              <ChatIcon small />
              {chatMode === 'expanded' ? 'Collapse chat' : 'Expand chat'}
            </button>
          </div>

          <div className="pipeline-hint" title="Confirm batch vs live frequency with ops">
            <span className="pipeline-dot" />
            Detection cadence: every 5 min (batch)
          </div>
        </header>

        <section className="insights-strip" aria-label="Queue insights">
          <div className="insight-block">
            <div className="insight-label">
              <span>Alert severity</span>
              <small>From the alert itself</small>
            </div>
            <div className="severity-filters" role="group" aria-label="Severity filters">
              {(['high', 'medium', 'low'] as Severity[]).map((sev) => {
                const on = selectedSeverities.includes(sev)
                return (
                  <button
                    key={sev}
                    type="button"
                    className={`sev-filter sev-${sev} ${on ? 'is-on' : ''}`}
                    onClick={() => toggleSeverity(sev)}
                    aria-pressed={on}
                  >
                    <span className="sev-filter-label">{SEVERITY_LABEL[sev]}</span>
                    <span className="sev-filter-count">{severityCounts[sev]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="insight-divider" aria-hidden />

          <div className="insight-block">
            <div className="insight-label">
              <span>Customer reefer sensitivity</span>
              <small>From customer profile (fleet-configured)</small>
            </div>
            <div
              className="severity-filters"
              role="group"
              aria-label="Customer sensitivity filters"
            >
              {(['high', 'medium', 'low'] as ReeferSensitivity[]).map((level) => {
                const on = selectedSensitivities.includes(level)
                return (
                  <button
                    key={level}
                    type="button"
                    className={`sev-filter sens-filter sens-${level} ${on ? 'is-on' : ''}`}
                    onClick={() => toggleSensitivity(level)}
                    aria-pressed={on}
                    title={SENSITIVITY_HINT[level]}
                  >
                    <span className="sev-filter-label">{SENSITIVITY_LABEL[level]}</span>
                    <span className="sev-filter-count">{sensitivityCounts[level]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {(selectedCustomers.length > 0 ||
          selectedSeverities.length > 0 ||
          selectedSensitivities.length > 0) && (
          <div className="selected-customers" aria-live="polite">
            <span className="label">Active filters</span>
            <div className="chip-row">
              {selectedCustomers.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="customer-chip"
                  onClick={() => toggleCustomer(c)}
                  title="Remove filter"
                >
                  {c}
                  <span aria-hidden>×</span>
                </button>
              ))}
              {selectedSeverities.map((s) => (
                <button
                  key={`sev-${s}`}
                  type="button"
                  className={`customer-chip chip-sev-${s}`}
                  onClick={() => toggleSeverity(s)}
                >
                  Severity: {SEVERITY_LABEL[s]}
                  <span aria-hidden>×</span>
                </button>
              ))}
              {selectedSensitivities.map((s) => (
                <button
                  key={`sens-${s}`}
                  type="button"
                  className={`customer-chip chip-sens-${s}`}
                  onClick={() => toggleSensitivity(s)}
                >
                  Sensitivity: {SENSITIVITY_LABEL[s]}
                  <span aria-hidden>×</span>
                </button>
              ))}
              <button
                type="button"
                className="linkish clear-all"
                onClick={() => {
                  setSelectedCustomers([])
                  setSelectedSeverities([])
                  setSelectedSensitivities([])
                }}
              >
                Clear all
              </button>
            </div>
          </div>
        )}

        <div
          className={`workspace chat-mode-${chatMode} ${
            chatMode === 'expanded' ? 'chat-open' : ''
          }`}
        >
          <section className="detail-pane">
            {selected ? (
              <DetailPane
                selected={selected}
                rejectingId={rejectingId}
                setRejectingId={setRejectingId}
              />
            ) : (
              <div className="empty-detail">
                <h2>No shipment selected</h2>
                <p>Adjust filters or clear search to see active pro bills.</p>
              </div>
            )}
          </section>

          {/* Classic product chat chrome — bar like the original Reefer Agent */}
          {chatMode !== 'fab' && (
            <section
              className={`chat-dock ${chatMode === 'expanded' ? 'is-expanded' : 'is-collapsed'}`}
            >
              <button
                type="button"
                className="chat-dock-bar"
                onClick={() =>
                  setChatMode((m) => (m === 'expanded' ? 'bar' : 'expanded'))
                }
                aria-expanded={chatMode === 'expanded'}
              >
                <span className="chat-dock-left">
                  <span className="chat-dock-icon" aria-hidden>
                    <ChatIcon />
                  </span>
                  <strong>Chat</strong>
                </span>
                <span className="chat-dock-right">
                  {chatBadge > 0 && (
                    <span className="chat-dock-badge">{chatBadge}</span>
                  )}
                  <span className="chat-dock-chevron" aria-hidden>
                    {chatMode === 'expanded' ? '▾' : '▴'}
                  </span>
                </span>
              </button>

              {chatMode === 'expanded' && (
                <div className="chat-dock-panel">
                  <AskAiPanel
                    {...askAiProps}
                    embedded
                    headerActions={
                      <>
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => setChatMode('bar')}
                        >
                          Collapse
                        </button>
                        <button
                          type="button"
                          className="text-action muted-action"
                          onClick={() => setChatMode('fab')}
                          title="Minimize to floating icon"
                        >
                          Minimize
                        </button>
                      </>
                    }
                  />
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {chatMode === 'fab' && (
        <button
          type="button"
          className="fab-chat"
          onClick={() => setChatMode('expanded')}
          aria-label="Open Chat"
        >
          <ChatIcon />
          {chatBadge > 0 && <span className="fab-badge">{chatBadge}</span>}
        </button>
      )}
    </div>
  )
}

function DetailPane({
  selected,
  rejectingId,
  setRejectingId,
}: {
  selected: Entity
  rejectingId: string | null
  setRejectingId: (id: string | null) => void
}) {
  const profile = getCustomerProfile(selected.customer)
  const sensitivity = profile.reeferSensitivity

  return (
    <>
      <div className="detail-header">
        <div>
          <div className="detail-title">
            <span className="pro-badge">P</span>
            <h2>{selected.proBill}</h2>
            <a className="ext-link" href={`#${selected.proBill}`} title="Open in TMS">
              ↗
            </a>
          </div>
          <p className="detail-sub">
            {selected.alerts.length} alerts ·{' '}
            {selected.alerts.filter((a) => a.status === 'active' || a.status === 'pending').length}{' '}
            active · Last sent:{' '}
            {latestAlert(selected)
              ? formatAbsolute(latestAlert(selected)!.sentAt)
              : '—'}
          </p>
          <p className="detail-customer">
            {selected.customer}
            <span className="dot">·</span>
            <span className={`sens-inline sens-${sensitivity}`}>
              {SENSITIVITY_LABEL[sensitivity]} reefer sensitivity
            </span>
            <span className="dot">·</span>
            {profile.segment}
            <span className="dot">·</span>
            {selected.trailer}
            <span className="dot">·</span>
            {selected.origin} → {selected.destination}
          </p>
        </div>
        <div className="detail-badges">
          <span className={`sens-badge sens-${sensitivity}`} title={SENSITIVITY_HINT[sensitivity]}>
            Cust. {SENSITIVITY_LABEL[sensitivity]}
          </span>
          <span className="pending-badge">
            {selected.alerts.filter((a) => a.status === 'pending').length} pending
          </span>
        </div>
      </div>

      <div className="alert-stack">
        {[...selected.alerts]
          .sort(
            (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
          )
          .map((alert) => (
            <article key={alert.id} className={`alert-card sev-border-${alert.severity}`}>
              <div className="alert-card-head">
                <div className="alert-status">
                  <span className="status-dot" />
                  <strong>ACTIVE</strong>
                  <span className="agent-name">{alert.agent}</span>
                  <span className="type-tag">{ALERT_TYPE_LABEL[alert.type]}</span>
                  <span className={`sev-pill sev-${alert.severity}`}>
                    {SEVERITY_LABEL[alert.severity]}
                  </span>
                  <span className="pending-tag">Pending</span>
                </div>
                <time dateTime={alert.sentAt}>{formatRelative(alert.sentAt)}</time>
              </div>

              <p className="alert-message">{alert.message}</p>

              <dl className="entity-grid">
                <div>
                  <dt>Trailer #</dt>
                  <dd>{selected.trailer}</dd>
                </div>
                <div>
                  <dt>Probill temp</dt>
                  <dd>{selected.requiredTemp.toFixed(1)}°F</dd>
                </div>
                <div>
                  <dt>Reefer status</dt>
                  <dd>{selected.reeferStatus}</dd>
                </div>
                <div>
                  <dt>Set temp</dt>
                  <dd>{selected.setTemp.toFixed(1)}°F</dd>
                </div>
                {selected.reeferMode && (
                  <div>
                    <dt>Mode</dt>
                    <dd>
                      {selected.reeferMode}
                      {selected.requiredMode &&
                        selected.requiredMode !== selected.reeferMode && (
                          <span className="warn-inline">
                            {' '}
                            (needs {selected.requiredMode})
                          </span>
                        )}
                    </dd>
                  </div>
                )}
                {selected.returnAirTemp != null && (
                  <div>
                    <dt>Return air</dt>
                    <dd>{selected.returnAirTemp.toFixed(1)}°F</dd>
                  </div>
                )}
              </dl>

              <div className="alert-actions">
                {rejectingId === alert.id ? (
                  <div className="reject-panel">
                    <p>Please select a reason for rejecting this alert:</p>
                    <div className="radio-list">
                      {[
                        'CF not updated',
                        'Readings are old',
                        'Probill data incorrect',
                        'Defrost mode',
                        'Other',
                      ].map((r, i) => (
                        <label key={r}>
                          <input
                            type="radio"
                            name={`reject-${alert.id}`}
                            defaultChecked={i === 0}
                          />
                          {r}
                        </label>
                      ))}
                    </div>
                    <label className="notes-label">
                      Notes *
                      <textarea placeholder="Add notes explaining this rejection" rows={3} />
                    </label>
                    <div className="action-row">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setRejectingId(null)}
                      >
                        Cancel
                      </button>
                      <button type="button" className="btn danger">
                        Reject alert
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="action-row">
                    <button type="button" className="btn success">
                      ✓ Approve
                    </button>
                    <button
                      type="button"
                      className="btn outline-danger"
                      onClick={() => setRejectingId(alert.id)}
                    >
                      ✕ Reject
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
      </div>

      <p className="loaded-note">
        All {selected.alerts.length} alerts loaded · sorted by alert sent time
      </p>

      <details className="config-panel">
        <summary>Customer sensitivity & temperature bands</summary>
        <p className="config-note" style={{ marginTop: 12 }}>
          Reefer sensitivity is set on the <strong>customer profile</strong> by the Charger
          fleet team. Example: PharmaCare Logistics → High.
        </p>
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Segment</th>
              <th>Sensitivity</th>
            </tr>
          </thead>
          <tbody>
            {CUSTOMER_PROFILES.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.segment}</td>
                <td>
                  <span className={`sev-pill sev-${c.reeferSensitivity}`}>
                    {SENSITIVITY_LABEL[c.reeferSensitivity]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Temp band</th>
              <th>Range</th>
              <th>Normal deviation</th>
            </tr>
          </thead>
          <tbody>
            {TEMP_RANGE_CONFIG.map((band) => (
              <tr key={band.id}>
                <td>{band.label}</td>
                <td>
                  {band.minF}°F – {band.maxF}°F
                </td>
                <td>±{band.normalDeviationF}°F (no alert)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  )
}

function AskAiPanel({
  messages,
  draft,
  setDraft,
  sendChat,
  onSelectProBill,
  prompts,
  headerActions,
  embedded = false,
}: {
  messages: ChatMessage[]
  draft: string
  setDraft: (v: string) => void
  sendChat: (text?: string) => void
  onSelectProBill: (proBill: string) => void
  prompts: string[]
  headerActions?: ReactNode
  /** When true, hide duplicate title — chat dock bar already shows Chat */
  embedded?: boolean
}) {
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    sendChat()
  }

  return (
    <>
      {!embedded && (
        <div className="ask-ai-toggle static-head">
          <span className="ask-ai-toggle-left">
            <span className="chat-icon" aria-hidden>
              <ChatIcon />
            </span>
            <strong>Chat</strong>
            {messages.length > 1 && (
              <span className="chat-badge">{messages.length - 1}</span>
            )}
          </span>
          <span className="ask-ai-toggle-right">{headerActions}</span>
        </div>
      )}

      {embedded && headerActions && (
        <div className="chat-panel-tools">{headerActions}</div>
      )}

      <div className="ask-ai-body">
        <div className="ask-ai-prompts">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="prompt-chip"
              onClick={() => sendChat(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="message-list" role="log" aria-live="polite">
          {messages.map((msg) => (
            <div key={msg.id} className={`message message-${msg.role}`}>
              <div className="message-bubble">
                {msg.content.split('\n').map((line, i) => (
                  <p key={i}>{renderInline(line)}</p>
                ))}
                {msg.listResult && (
                  <div className="list-result">
                    <div className="list-result-head">
                      Showing {msg.listResult.shown} of{' '}
                      <strong>{msg.listResult.total}</strong> results
                    </div>
                    <ul>
                      {msg.listResult.items.slice(0, 25).map((item) => (
                        <li key={item.proBill}>
                          <button type="button" onClick={() => onSelectProBill(item.proBill)}>
                            <span className="mono">{item.proBill}</span>
                            <span>{item.customer}</span>
                            <span>{item.alertType}</span>
                            <span className={`sev-pill sev-${item.severity}`}>
                              {item.severity}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <time>{formatAbsolute(msg.timestamp)}</time>
            </div>
          ))}
        </div>

        <form className="ask-ai-composer" onSubmit={onSubmit}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message…"
            aria-label="Chat message"
          />
          <button type="submit" className="send-btn" aria-label="Send">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path
                d="M5 12h12M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      </div>
    </>
  )
}

function BulbIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path
        d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4.5 9.8c-.7.7-1.1 1.5-1.3 2.2H8.8c-.2-.7-.6-1.5-1.3-2.2A6 6 0 0 1 12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChatIcon({ small = false }: { small?: boolean }) {
  const size = small ? 16 : 18
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <path
        d="M5 18.5V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9l-4 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function renderInline(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}
