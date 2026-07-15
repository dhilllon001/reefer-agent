export type AlertType = 'mode_mismatch' | 'temp_deviation' | 'reefer_off'
export type Severity = 'high' | 'medium' | 'low'
/** Customer-profile setting configured by Charger fleet team */
export type ReeferSensitivity = 'high' | 'medium' | 'low'
export type ShipmentStatus = 'in_transit' | 'delivered' | 'canceled'
/** Operational transit stage for an active ProBill */
export type TransitStatus =
  | 'on_route_pickup'
  | 'on_route_delivery'
  | 'at_delivery'
  | 'at_pickup'
export type AlertStatus = 'active' | 'pending' | 'approved' | 'rejected'
/** Floating icon → half-screen panel → full workbench */
export type AppViewMode = 'launcher' | 'panel' | 'full'
/** In compact panel: toggle between alerts and chat */
export type ChatbotTab = 'alerts' | 'chat'

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
  /** Lifecycle status (active queue vs delivered/canceled) */
  status: ShipmentStatus
  /** Where the load is in transit right now */
  transitStatus: TransitStatus
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
