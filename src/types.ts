export type AlertType = 'mode_mismatch' | 'temp_deviation' | 'reefer_off'
export type Severity = 'high' | 'medium' | 'low'
/** Customer-profile setting configured by Charger fleet team */
export type ReeferSensitivity = 'high' | 'medium' | 'low'
export type ShipmentStatus = 'in_transit' | 'delivered' | 'canceled'
export type AlertStatus = 'active' | 'pending' | 'approved' | 'rejected'
/** Chat chrome: expanded panel, classic bottom bar, or floating icon */
export type ChatMode = 'expanded' | 'bar' | 'fab'

export interface TempRangeConfig {
  id: string
  label: string
  minF: number
  maxF: number
  /** Absolute deviation within this range is treated as normal — no alert */
  normalDeviationF: number
}

export interface CustomerProfile {
  name: string
  /** Reefer sensitivity on the customer profile */
  reeferSensitivity: ReeferSensitivity
  /** Short note for operators (e.g. pharma, produce) */
  segment: string
}

export interface Entity {
  id: string
  proBill: string
  customer: string
  trailer: string
  status: ShipmentStatus
  origin: string
  destination: string
  requiredTemp: number
  setTemp: number
  returnAirTemp?: number
  reeferStatus: 'On' | 'Off'
  reeferMode?: string
  requiredMode?: string
  alerts: Alert[]
}

export interface Alert {
  id: string
  type: AlertType
  severity: Severity
  status: AlertStatus
  message: string
  /** When the alert was generated / sent — used for sorting */
  sentAt: string
  agent: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  /** Structured list payload for Ask AI results */
  listResult?: {
    total: number
    shown: number
    items: {
      proBill: string
      customer: string
      alertType: string
      severity: Severity
      sensitivity: ReeferSensitivity
    }[]
  }
}
