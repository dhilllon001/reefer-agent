import type {
  AlertType,
  ReeferSensitivity,
  Severity,
  TempRangeConfig,
} from '../types'

/**
 * Configurable temperature bands — deviation within `normalDeviationF`
 * should NOT generate an alert. Can be tuned per product / customer later.
 */
export const TEMP_RANGE_CONFIG: TempRangeConfig[] = [
  { id: 'frozen', label: 'Frozen', minF: -20, maxF: 10, normalDeviationF: 2 },
  { id: 'chilled', label: 'Chilled', minF: 32, maxF: 45, normalDeviationF: 3 },
  { id: 'produce', label: 'Produce / ambient', minF: 45, maxF: 70, normalDeviationF: 4 },
]

export function getNormalDeviation(requiredTemp: number): number {
  const band = TEMP_RANGE_CONFIG.find(
    (r) => requiredTemp >= r.minF && requiredTemp <= r.maxF,
  )
  return band?.normalDeviationF ?? 4
}

export function isWithinNormalDeviation(
  requiredTemp: number,
  actualTemp: number,
): boolean {
  const delta = Math.abs(actualTemp - requiredTemp)
  return delta <= getNormalDeviation(requiredTemp)
}

/**
 * Severity rules (from product discussion):
 * - High: reefer off OR temp deviation > 10°F
 * - Medium: temp deviation between 4°F and 10°F (exclusive of low band edges handled below)
 * - Low: temp deviation within ±4°F (but above normal band — so still an alert)
 * Mode mismatch defaults to medium unless paired with a worse condition.
 */
export function severityForAlert(
  type: AlertType,
  tempDeltaF?: number,
): Severity {
  if (type === 'reefer_off') return 'high'
  if (type === 'mode_mismatch') return 'medium'
  const delta = Math.abs(tempDeltaF ?? 0)
  if (delta > 10) return 'high'
  if (delta > 4) return 'medium'
  return 'low'
}

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  mode_mismatch: 'Mode Mismatch',
  temp_deviation: 'Temp Deviation',
  reefer_off: 'Reefer Off',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const SENSITIVITY_LABEL: Record<ReeferSensitivity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const SENSITIVITY_HINT: Record<ReeferSensitivity, string> = {
  high: 'Customer profile: pay close attention (e.g. pharma)',
  medium: 'Customer profile: standard temp-sensitive loads',
  low: 'Customer profile: more tolerant loads',
}

/** Highest severity among active/pending alerts on an entity */
export function entitySeverity(
  severities: Severity[],
): Severity | null {
  if (severities.includes('high')) return 'high'
  if (severities.includes('medium')) return 'medium'
  if (severities.includes('low')) return 'low'
  return null
}
