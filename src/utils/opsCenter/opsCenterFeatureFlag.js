import { loadSystemSettings } from '../systemSettingsStorage'

/**
 * Feature flag Operations Center V1.
 * Stored in system settings JSON payload — no DB migration.
 * Default: true
 */
export function isOpsCenterEnabled(settings = loadSystemSettings()) {
  return settings?.opsCenterEnabled === true
}
