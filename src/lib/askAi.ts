import { getCustomerSensitivity } from '../data/customers'
import type { ChatMessage, Entity, ReeferSensitivity, Severity } from '../types'
import { ALERT_TYPE_LABEL } from './severity'
import { formatAbsolute } from './format'

function primaryAlert(entity: Entity) {
  return [...entity.alerts].sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
  )[0]
}

/**
 * Mock Ask AI handler. List queries return the FULL matching set + accurate count
 * so operators know how many results to expect.
 */
export function answerAskAi(
  question: string,
  entities: Entity[],
): Omit<ChatMessage, 'id' | 'timestamp'> {
  const q = question.toLowerCase().trim()

  const wantsList =
    /\b(list|show|all|give me|find|how many|count)\b/.test(q) ||
    /\bpro\s?bills?\b/.test(q)

  const severityMatch = (['high', 'medium', 'low'] as Severity[]).filter((s) =>
    q.includes(`${s} severity`) || (q.includes(s) && q.includes('severity')),
  )

  const sensitivityMatch = (
    ['high', 'medium', 'low'] as ReeferSensitivity[]
  ).filter(
    (s) =>
      q.includes(`${s} sensitivity`) ||
      (q.includes('sensitivity') && q.includes(s)) ||
      (q.includes('sensitive') && q.includes(s)),
  )

  let filtered = entities

  if (severityMatch.length) {
    filtered = filtered.filter((e) =>
      e.alerts.some((a) => severityMatch.includes(a.severity)),
    )
  } else if (
    !q.includes('sensitivity') &&
    !q.includes('sensitive') &&
    (['high', 'medium', 'low'] as const).some((s) => q.includes(s))
  ) {
    const loose = (['high', 'medium', 'low'] as Severity[]).filter((s) =>
      q.includes(s),
    )
    if (loose.length) {
      filtered = filtered.filter((e) =>
        e.alerts.some((a) => loose.includes(a.severity)),
      )
    }
  }

  if (sensitivityMatch.length) {
    filtered = filtered.filter((e) =>
      sensitivityMatch.includes(getCustomerSensitivity(e.customer)),
    )
  }

  if (/\breefer\s*off\b/.test(q)) {
    filtered = filtered.filter((e) => e.alerts.some((a) => a.type === 'reefer_off'))
  } else if (/\bmode\b/.test(q)) {
    filtered = filtered.filter((e) =>
      e.alerts.some((a) => a.type === 'mode_mismatch'),
    )
  } else if (
    /\btemp|temperature|deviation\b/.test(q) &&
    !severityMatch.length &&
    !sensitivityMatch.length
  ) {
    filtered = filtered.filter((e) =>
      e.alerts.some((a) => a.type === 'temp_deviation'),
    )
  }

  if (/\bpharma/.test(q)) {
    filtered = filtered.filter((e) =>
      e.customer.toLowerCase().includes('pharma'),
    )
  }

  const customerHint = entities.find((e) =>
    q.includes(e.customer.toLowerCase()),
  )?.customer
  if (customerHint) {
    filtered = filtered.filter((e) => e.customer === customerHint)
  }

  if (wantsList || severityMatch.length || sensitivityMatch.length || customerHint) {
    const items = filtered.map((e) => {
      const alert = primaryAlert(e)
      const sensitivity = getCustomerSensitivity(e.customer)
      return {
        proBill: e.proBill,
        customer: e.customer,
        alertType: alert ? ALERT_TYPE_LABEL[alert.type] : '—',
        severity: (alert?.severity ?? 'low') as Severity,
        sensitivity,
      }
    })

    const lines = items
      .slice(0, 25)
      .map(
        (i, idx) =>
          `${idx + 1}. ${i.proBill} · ${i.customer} · ${i.alertType} · sev ${i.severity.toUpperCase()} · cust ${i.sensitivity.toUpperCase()}`,
      )
      .join('\n')

    const more =
      items.length > 25
        ? `\n…and ${items.length - 25} more (full count included above).`
        : ''

    return {
      role: 'assistant',
      content: `Found **${items.length}** matching pro bills${
        severityMatch.length ? ` (alert severity: ${severityMatch.join(', ')})` : ''
      }${
        sensitivityMatch.length
          ? ` (customer sensitivity: ${sensitivityMatch.join(', ')})`
          : ''
      }${customerHint ? ` for ${customerHint}` : ''}.\n\n${
        items.length ? lines + more : 'No matching shipments in the active queue.'
      }`,
      listResult: {
        total: items.length,
        shown: Math.min(items.length, 25),
        items,
      },
    }
  }

  const proMatch = q.match(/p?\d{7,}/)
  if (proMatch) {
    const needle = proMatch[0].replace(/^p/i, '')
    const entity = entities.find((e) => e.proBill.replace(/^P/i, '') === needle)
    if (entity) {
      const alert = primaryAlert(entity)
      const sensitivity = getCustomerSensitivity(entity.customer)
      return {
        role: 'assistant',
        content: [
          `**${entity.proBill}** — ${entity.customer}`,
          `Customer reefer sensitivity: **${sensitivity.toUpperCase()}**`,
          `Trailer ${entity.trailer} · ${entity.origin} → ${entity.destination}`,
          `Required ${entity.requiredTemp}°F · Set ${entity.setTemp}°F · Reefer ${entity.reeferStatus}`,
          entity.reeferMode
            ? `Mode: ${entity.reeferMode} (required ${entity.requiredMode ?? '—'})`
            : null,
          alert
            ? `Latest alert (${ALERT_TYPE_LABEL[alert.type]}, ${alert.severity}): sent ${formatAbsolute(alert.sentAt)}\n${alert.message}`
            : 'No active alerts.',
        ]
          .filter(Boolean)
          .join('\n'),
      }
    }
  }

  return {
    role: 'assistant',
    content:
      'I can list pro bills by alert severity, customer reefer sensitivity, or customer name — and always return the full count.\n\nTry: “List high sensitivity customers” or “How many high severity pro bills?”',
  }
}
