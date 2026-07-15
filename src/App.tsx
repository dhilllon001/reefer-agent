import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  CUSTOMER_PROFILES,
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
} from './lib/severity'
import type {
  Alert,
  AppViewMode,
  ChatbotTab,
  ChatMessage,
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
  const [viewMode, setViewMode] = useState<AppViewMode>('full')
  const [chatbotTab, setChatbotTab] = useState<ChatbotTab>('alerts')
  const [search, setSearch] = useState('')
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([])
  const [selectedSeverities, setSelectedSeverities] = useState<Severity[]>([])
  const [selectedSensitivities, setSelectedSensitivities] = useState<
    ReeferSensitivity[]
  >([])
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [sidebarRail, setSidebarRail] = useState(false)
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
    if (viewMode === 'chatbot') setChatbotTab('chat')
  }

  const chatBadge = Math.max(0, messages.length - 1)

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return CUSTOMER_PROFILES
    return CUSTOMER_PROFILES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.segment.toLowerCase().includes(q) ||
        c.reeferSensitivity.includes(q),
    )
  }, [customerQuery])

  const chatSuggestions = useMemo(() => {
    const q = draft.trim().toLowerCase()
    const base = [
      'List high sensitivity customers',
      'List all high severity pro bills',
      'How many temp deviations?',
      'Show mode mismatch alerts',
      'List reefer off alerts',
      'Show PharmaCare Logistics pro bills',
    ]
    const fromPrompts = base
      .filter((s) => !q || s.toLowerCase().includes(q))
      .map((label) => ({ kind: 'prompt' as const, label, value: label }))

    const fromEntities = filtered
      .filter((e) => {
        if (!q) return true
        return (
          e.proBill.toLowerCase().includes(q) ||
          e.customer.toLowerCase().includes(q)
        )
      })
      .slice(0, 4)
      .map((e) => ({
        kind: 'probill' as const,
        label: `${e.proBill} · ${e.customer}`,
        value: `Tell me about ${e.proBill}`,
      }))

    return [...fromPrompts.slice(0, 4), ...fromEntities].slice(0, 6)
  }, [draft, filtered])

  const askAiProps = {
    messages,
    draft,
    setDraft,
    sendChat,
    suggestions: chatSuggestions,
    onSelectProBill: (proBill: string) => {
      const found = queue.find((e) => e.proBill === proBill)
      if (found) {
        setSelectedId(found.id)
        if (viewMode === 'chatbot') setChatbotTab('alerts')
      }
    },
  }

  function collapseToSmallView() {
    setViewMode('chatbot')
    setChatbotTab('alerts')
    setSidebarRail(false)
  }

  function clearAllFilters() {
    setSelectedCustomers([])
    setSelectedSeverities([])
    setSelectedSensitivities([])
  }

  const sidebarFiltersProps = {
    customerMenuOpen,
    setCustomerMenuOpen,
    customerQuery,
    setCustomerQuery,
    selectedCustomers,
    filteredCustomers,
    toggleCustomer,
    clearCustomers: () => setSelectedCustomers([]),
    selectedSeverities,
    toggleSeverity,
    severityCounts,
    selectedSensitivities,
    toggleSensitivity,
    sensitivityCounts,
    clearAllFilters,
  }

  /* ——— Chatbot view ——— */
  if (viewMode === 'chatbot') {
    return (
      <div className="app app-chatbot">
        <aside className="sidebar">
          <header className="sidebar-brand">
            <div className="brand-mark" aria-hidden>
              <BulbIcon />
            </div>
            <div className="brand-copy">
              <h1>Reefer Agent</h1>
              <p>
                {filtered.length} of {queue.length} active
              </p>
            </div>
          </header>

          <SidebarFilters {...sidebarFiltersProps} />

          <div className="sidebar-scroll">
            <div className="search-wrap">
            <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" fill="none" />
              <path
                d="M16.5 16.5 21 21"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by probill #..."
              aria-label="Search entities"
            />
          </div>

          <EntityList
            entities={filtered}
            selectedId={selected?.id ?? null}
            onSelect={(id) => {
              setSelectedId(id)
              setChatbotTab('alerts')
            }}
          />
          </div>

          <footer className="sidebar-foot">
            <span className="pulse" />
            Chatbot view · toggle Alerts / Chat
          </footer>
        </aside>

        <main className="main chatbot-main">
          <div className="chatbot-toolbar">
            <div className="view-toggle" role="tablist" aria-label="Chatbot panels">
              <button
                type="button"
                role="tab"
                aria-selected={chatbotTab === 'alerts'}
                className={chatbotTab === 'alerts' ? 'is-active' : ''}
                onClick={() => setChatbotTab('alerts')}
              >
                Alerts
                {selected && (
                  <span className="tab-count">{selected.alerts.length}</span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={chatbotTab === 'chat'}
                className={chatbotTab === 'chat' ? 'is-active' : ''}
                onClick={() => setChatbotTab('chat')}
              >
                Chat
                {chatBadge > 0 && <span className="tab-count">{chatBadge}</span>}
              </button>
            </div>

            <button
              type="button"
              className="btn brand enter-full"
              onClick={() => setViewMode('full')}
            >
              Enter full view
            </button>
          </div>

          {chatbotTab === 'alerts' ? (
            <section className="detail-pane chatbot-pane">
              {selected ? (
                <DetailPane
                  selected={selected}
                  rejectingId={rejectingId}
                  setRejectingId={setRejectingId}
                />
              ) : (
                <div className="empty-detail">
                  <h2>No shipment selected</h2>
                  <p>Pick a pro bill from the left to review alerts.</p>
                </div>
              )}
            </section>
          ) : (
            <section className="chat-side chatbot-chat" aria-label="Chat">
              <div className="chat-side-head">
                <span className="chat-dock-icon" aria-hidden>
                  <ChatIcon />
                </span>
                <div>
                  <strong>Chat</strong>
                  <p>Ask about pro bills, severity, or sensitivity</p>
                </div>
              </div>
              <AskAiPanel {...askAiProps} embedded />
            </section>
          )}
        </main>
      </div>
    )
  }

  /* ——— Full view: list | detail | chat (30%) ——— */
  return (
    <div className={`app app-full ${sidebarRail ? 'sidebar-rail' : ''}`}>
      {sidebarRail ? (
        <aside className="sidebar rail">
          <button
            type="button"
            className="rail-expand"
            onClick={() => setSidebarRail(false)}
            title="Expand Reefer Agent list"
          >
            <div className="brand-mark" aria-hidden>
              <BulbIcon />
            </div>
            <span>Expand</span>
          </button>
          <button
            type="button"
            className="rail-collapse-view"
            onClick={collapseToSmallView}
            title="Open small chatbot view"
          >
            <CollapseIcon />
          </button>
        </aside>
      ) : (
        <aside className="sidebar">
          <header className="sidebar-brand">
            <div className="brand-mark" aria-hidden>
              <BulbIcon />
            </div>
            <div className="brand-copy">
              <h1>Reefer Agent</h1>
              <p>
                {filtered.length} of {queue.length} active
                <span className="muted"> · {ENTITIES.length - queue.length} hidden</span>
              </p>
            </div>
            <div className="brand-actions">
              <button
                type="button"
                className="icon-btn-sidebar"
                title="Collapse list to rail"
                onClick={() => setSidebarRail(true)}
              >
                ⟨
              </button>
              <button
                type="button"
                className="icon-btn-sidebar"
                title="Collapse to small Reefer Agent view"
                onClick={collapseToSmallView}
              >
                <CollapseIcon />
              </button>
            </div>
          </header>

          <SidebarFilters {...sidebarFiltersProps} />

          <div className="sidebar-scroll">
            <div className="search-wrap">
            <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" fill="none" />
              <path
                d="M16.5 16.5 21 21"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search probill, customer, type…"
              aria-label="Search entities"
            />
          </div>

          <EntityList
            entities={filtered}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
          </div>

          <footer className="sidebar-foot">
            <span className="pulse" />
            Sorted by alert sent time · newest first
          </footer>
        </aside>
      )}

      <main className="main full-main">
        <header className="main-toolbar">
          <div className="pipeline-hint" title="Confirm batch vs live frequency with ops">
            <span className="pipeline-dot" />
            Detection cadence: every 5 min (batch)
          </div>
        </header>

        <div className="workspace-split">
          <section className="detail-pane">
            {selected ? (
              <DetailPane
                selected={selected}
                rejectingId={rejectingId}
                setRejectingId={setRejectingId}
                onExitFullView={collapseToSmallView}
              />
            ) : (
              <div className="empty-detail">
                <div className="empty-detail-top">
                  <button
                    type="button"
                    className="exit-full-btn"
                    onClick={collapseToSmallView}
                    title="Exit full view"
                  >
                    <ExitIcon />
                    Exit full view
                  </button>
                </div>
                <h2>No shipment selected</h2>
                <p>Adjust filters or clear search to see active pro bills.</p>
              </div>
            )}
          </section>

          <aside className="chat-side" aria-label="Chat">
            <div className="chat-side-head">
              <span className="chat-dock-icon" aria-hidden>
                <ChatIcon />
              </span>
              <div>
                <strong>Chat</strong>
                <p>Fixed composer + suggestions below</p>
              </div>
              {chatBadge > 0 && <span className="chat-dock-badge">{chatBadge}</span>}
            </div>
            <AskAiPanel {...askAiProps} embedded />
          </aside>
        </div>
      </main>
    </div>
  )
}

function SidebarFilters({
  customerMenuOpen,
  setCustomerMenuOpen,
  customerQuery,
  setCustomerQuery,
  selectedCustomers,
  filteredCustomers,
  toggleCustomer,
  clearCustomers,
  selectedSeverities,
  toggleSeverity,
  severityCounts,
  selectedSensitivities,
  toggleSensitivity,
  sensitivityCounts,
  clearAllFilters,
}: {
  customerMenuOpen: boolean
  setCustomerMenuOpen: (fn: (o: boolean) => boolean) => void
  customerQuery: string
  setCustomerQuery: (v: string) => void
  selectedCustomers: string[]
  filteredCustomers: typeof CUSTOMER_PROFILES
  toggleCustomer: (name: string) => void
  clearCustomers: () => void
  selectedSeverities: Severity[]
  toggleSeverity: (sev: Severity) => void
  severityCounts: Record<Severity, number>
  selectedSensitivities: ReeferSensitivity[]
  toggleSensitivity: (level: ReeferSensitivity) => void
  sensitivityCounts: Record<ReeferSensitivity, number>
  clearAllFilters: () => void
}) {
  const hasActiveFilters =
    selectedCustomers.length > 0 ||
    selectedSeverities.length > 0 ||
    selectedSensitivities.length > 0

  return (
    <section className="sidebar-filters" aria-label="Filters">
      <div className={`customer-picker sidebar-customer ${customerMenuOpen ? 'is-open' : ''}`}>
        <span className="filter-section-label">Customers</span>
        <button
          type="button"
          className="customer-trigger sidebar-trigger"
          onClick={() => setCustomerMenuOpen((o) => !o)}
          aria-expanded={customerMenuOpen}
        >
          <span className="customer-trigger-copy">
            <span className="customer-trigger-value">
              {selectedCustomers.length
                ? `${selectedCustomers.length} selected`
                : 'All customers'}
            </span>
          </span>
          <span className="chev" aria-hidden>
            ▾
          </span>
        </button>
        {customerMenuOpen && (
          <div className="dropdown sidebar-dropdown" role="menu">
            <div className="dropdown-search">
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" fill="none" />
                <path
                  d="M16.5 16.5 21 21"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <input
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Search customers…"
                aria-label="Search customers"
                autoFocus
              />
            </div>
            <div className="dropdown-head">
              <span>Select one or more</span>
              {selectedCustomers.length > 0 && (
                <button type="button" className="linkish sidebar-link" onClick={clearCustomers}>
                  Clear
                </button>
              )}
            </div>
            <div className="dropdown-scroll">
              {filteredCustomers.map((profile) => (
                <label key={profile.name} className="check-row sidebar-check">
                  <input
                    type="checkbox"
                    checked={selectedCustomers.includes(profile.name)}
                    onChange={() => toggleCustomer(profile.name)}
                  />
                  <span className="check-copy">
                    <span>{profile.name}</span>
                    <small>
                      {profile.segment} · {SENSITIVITY_LABEL[profile.reeferSensitivity]}
                    </small>
                  </span>
                </label>
              ))}
              {!filteredCustomers.length && (
                <p className="dropdown-empty">No customers match “{customerQuery}”.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="filter-group">
        <span className="filter-section-label">Alert severity</span>
        <div className="sidebar-filter-stack" role="group" aria-label="Alert severity">
          {(['high', 'medium', 'low'] as Severity[]).map((sev) => {
            const on = selectedSeverities.includes(sev)
            return (
              <button
                key={sev}
                type="button"
                className={`sidebar-filter-btn sev-${sev} ${on ? 'is-on' : ''}`}
                onClick={() => toggleSeverity(sev)}
                aria-pressed={on}
              >
                <span>{SEVERITY_LABEL[sev]}</span>
                <span className="sidebar-filter-count">{severityCounts[sev]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-section-label">Customer sensitivity</span>
        <div className="sidebar-filter-stack" role="group" aria-label="Customer sensitivity">
          {(['high', 'medium', 'low'] as ReeferSensitivity[]).map((level) => {
            const on = selectedSensitivities.includes(level)
            return (
              <button
                key={level}
                type="button"
                className={`sidebar-filter-btn sens-${level} ${on ? 'is-on' : ''}`}
                onClick={() => toggleSensitivity(level)}
                aria-pressed={on}
                title={SENSITIVITY_HINT[level]}
              >
                <span>{SENSITIVITY_LABEL[level]}</span>
                <span className="sidebar-filter-count">{sensitivityCounts[level]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {hasActiveFilters && (
        <div className="sidebar-active-filters" aria-live="polite">
          <div className="chip-row">
            {selectedCustomers.map((c) => (
              <button
                key={c}
                type="button"
                className="sidebar-chip"
                onClick={() => toggleCustomer(c)}
              >
                {c}
                <span aria-hidden>×</span>
              </button>
            ))}
            {selectedSeverities.map((s) => (
              <button
                key={`sev-${s}`}
                type="button"
                className={`sidebar-chip chip-sev-${s}`}
                onClick={() => toggleSeverity(s)}
              >
                {SEVERITY_LABEL[s]}
                <span aria-hidden>×</span>
              </button>
            ))}
            {selectedSensitivities.map((s) => (
              <button
                key={`sens-${s}`}
                type="button"
                className={`sidebar-chip chip-sens-${s}`}
                onClick={() => toggleSensitivity(s)}
              >
                {SENSITIVITY_LABEL[s]} sens.
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
          <button type="button" className="sidebar-link clear-all" onClick={clearAllFilters}>
            Clear all filters
          </button>
        </div>
      )}
    </section>
  )
}

function EntityList({
  entities,
  selectedId,
  onSelect,
}: {
  entities: Entity[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="entity-list-wrap">
      <ul className="entity-list entity-cards" role="listbox" aria-label="Pro bills">
        {entities.map((entity) => {
          const alert = latestAlert(entity)
          const active = selectedId === entity.id
          const sev = entitySeverity(entity.alerts.map((a) => a.severity))
          const sensitivity = getCustomerSensitivity(entity.customer)
          const profile = getCustomerProfile(entity.customer)
          return (
            <li key={entity.id}>
              <button
                type="button"
                className={`entity-card ${active ? 'is-active' : ''}`}
                onClick={() => onSelect(entity.id)}
                role="option"
                aria-selected={active}
              >
                <div className="entity-card-top">
                  <div className="entity-card-ids">
                    <span className="pro-bill">{entity.proBill}</span>
                    {sev && (
                      <span className={`sev-pill sev-${sev}`}>{SEVERITY_LABEL[sev]}</span>
                    )}
                  </div>
                  <span className="alert-count" title="Active alerts">
                    {entity.alerts.length}
                  </span>
                </div>

                <div className="entity-card-customer">
                  <span className={`sens-dot sens-${sensitivity}`} />
                  <span className="customer-name">{entity.customer}</span>
                </div>

                <div className="entity-card-meta">
                  <span className="meta-chip type">
                    {alert ? ALERT_TYPE_LABEL[alert.type] : 'No alert'}
                  </span>
                  <span className="meta-chip sens" title={SENSITIVITY_HINT[sensitivity]}>
                    {SENSITIVITY_LABEL[sensitivity]} sens.
                  </span>
                  <span className="meta-chip time">
                    {alert ? formatRelative(alert.sentAt) : '—'}
                  </span>
                </div>

                <div className="entity-card-foot">
                  <span>{profile.segment}</span>
                  <span>{entity.trailer}</span>
                </div>
              </button>
            </li>
          )
        })}
        {!entities.length && (
          <li className="empty-list">No pro bills match the current filters.</li>
        )}
      </ul>
    </div>
  )
}

function DetailPane({
  selected,
  rejectingId,
  setRejectingId,
  onExitFullView,
}: {
  selected: Entity
  rejectingId: string | null
  setRejectingId: (id: string | null) => void
  onExitFullView?: () => void
}) {
  const pendingCount = selected.alerts.filter((a) => a.status === 'pending').length

  return (
    <>
      <div className="detail-header detail-header-minimal">
        <div>
          <div className="detail-title">
            <span className="pro-badge">P</span>
            <h2>{selected.proBill}</h2>
            <a className="ext-link" href={`#${selected.proBill}`} title="Open in TMS">
              ↗
            </a>
          </div>
          <p className="detail-customer-only">{selected.customer}</p>
        </div>
        <div className="detail-badges">
          {onExitFullView && (
            <button
              type="button"
              className="exit-full-btn"
              onClick={onExitFullView}
              title="Exit full view — open chatbot view"
            >
              <ExitIcon />
              Exit full view
            </button>
          )}
          {pendingCount > 0 && (
            <span className="pending-badge">
              {pendingCount} pending
            </span>
          )}
        </div>
      </div>

      <div className="alert-stack alert-stack-primary">
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
                  <span className="type-tag">{ALERT_TYPE_LABEL[alert.type]}</span>
                  <span className={`sev-pill sev-${alert.severity}`}>
                    {SEVERITY_LABEL[alert.severity]}
                  </span>
                  <span className="pending-tag">Pending</span>
                </div>
                <time dateTime={alert.sentAt}>{formatRelative(alert.sentAt)}</time>
              </div>

              <p className="alert-message">{alert.message}</p>

              <div className="alert-facts">
                <span>Trailer {selected.trailer}</span>
                <span>Target {selected.requiredTemp.toFixed(1)}°F</span>
                <span>Set {selected.setTemp.toFixed(1)}°F</span>
                <span>Reefer {selected.reeferStatus}</span>
                {selected.reeferMode && (
                  <span>
                    Mode {selected.reeferMode}
                    {selected.requiredMode &&
                      selected.requiredMode !== selected.reeferMode && (
                        <em className="warn-inline"> (needs {selected.requiredMode})</em>
                      )}
                  </span>
                )}
              </div>

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

      {selected.alerts.length === 0 && (
        <p className="loaded-note">No active alerts for this pro bill.</p>
      )}
    </>
  )
}

function AskAiPanel({
  messages,
  draft,
  setDraft,
  sendChat,
  onSelectProBill,
  suggestions = [],
  headerActions,
  embedded = false,
}: {
  messages: ChatMessage[]
  draft: string
  setDraft: (v: string) => void
  sendChat: (text?: string) => void
  onSelectProBill: (proBill: string) => void
  suggestions?: { kind: 'prompt' | 'probill'; label: string; value: string }[]
  headerActions?: ReactNode
  embedded?: boolean
}) {
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    sendChat()
  }

  return (
    <div className={`ask-ai-shell ${embedded ? 'is-embedded' : ''}`}>
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
                    <ul className="result-cards">
                      {msg.listResult.items.slice(0, 25).map((item) => (
                        <li key={item.proBill}>
                          <button
                            type="button"
                            className="result-card"
                            onClick={() => onSelectProBill(item.proBill)}
                          >
                            <div className="result-card-top">
                              <span className="mono">{item.proBill}</span>
                              <span className={`sev-pill sev-${item.severity}`}>
                                {item.severity}
                              </span>
                            </div>
                            <div className="result-card-customer">{item.customer}</div>
                            <div className="result-card-meta">
                              <span>{item.alertType}</span>
                              <span className={`sens-inline sens-${item.sensitivity}`}>
                                {item.sensitivity} sens.
                              </span>
                            </div>
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

        <div className="chat-composer-dock">
          {suggestions.length > 0 && (
            <div className="chat-suggestions" aria-label="Suggestions">
              {suggestions.map((s) => (
                <button
                  key={`${s.kind}-${s.label}`}
                  type="button"
                  className={`suggestion-chip kind-${s.kind}`}
                  onClick={() => sendChat(s.value)}
                >
                  {s.kind === 'probill' ? 'Pro bill' : 'Ask'} · {s.label}
                </button>
              ))}
            </div>
          )}
          <form className="ask-ai-composer" onSubmit={onSubmit}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search or ask anything…"
              aria-label="Chat message"
              autoComplete="off"
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
      </div>
    </div>
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

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden>
      <path
        d="M4 8h6V4M14 4h6v6M20 16v4h-6M10 20H4v-6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ExitIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
      <path
        d="M9 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3M14 16l4-4-4-4M18 12H10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
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
