import { isAdmin } from '../../constants/auth'
import { isOpsCenterEnabled } from './opsCenterFeatureFlag'

/**
 * V1: Admin only + feature flag.
 * Does not add permission keys; does not change the permission matrix.
 */
export function canAccessOpsCenter() {
  return isAdmin() && isOpsCenterEnabled()
}
