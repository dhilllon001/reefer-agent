import type { CustomerProfile, ReeferSensitivity } from '../types'

/**
 * Customer-level reefer sensitivity — configured on the customer profile
 * by the Charger fleet team (not per-shipment).
 *
 * High  → e.g. pharmaceutical: even small deviations need attention
 * Medium → typical refrigerated / food temp-sensitive loads
 * Low   → more tolerant loads
 */
export const CUSTOMER_PROFILES: CustomerProfile[] = [
  {
    name: 'PharmaCare Logistics',
    reeferSensitivity: 'high',
    segment: 'Pharmaceutical',
  },
  {
    name: 'Arctic Foods Co.',
    reeferSensitivity: 'high',
    segment: 'Frozen foods',
  },
  {
    name: 'Summit Dairy',
    reeferSensitivity: 'medium',
    segment: 'Dairy',
  },
  {
    name: 'Metro Cold Chain',
    reeferSensitivity: 'medium',
    segment: 'Cold chain retail',
  },
  {
    name: 'FreshFields Produce',
    reeferSensitivity: 'medium',
    segment: 'Produce',
  },
  {
    name: 'Test_12Sept',
    reeferSensitivity: 'medium',
    segment: 'Test account',
  },
  {
    name: 'GreenLeaf Grocers',
    reeferSensitivity: 'low',
    segment: 'Grocery',
  },
]

export const CUSTOMERS = CUSTOMER_PROFILES.map((c) => c.name)

const byName = new Map(CUSTOMER_PROFILES.map((c) => [c.name, c]))

export function getCustomerProfile(name: string): CustomerProfile {
  return (
    byName.get(name) ?? {
      name,
      reeferSensitivity: 'medium',
      segment: 'Unassigned',
    }
  )
}

export function getCustomerSensitivity(name: string): ReeferSensitivity {
  return getCustomerProfile(name).reeferSensitivity
}
