/**
 * dsh-turn-badge — host half.
 *
 * The interesting part lives in `client.js`: turn completion is a browser-side
 * fact (the client already maintains `uiSession.sessionStatus`), and the system
 * notification, app badge and title marker are browser APIs.
 *
 * This host entry exists so the package becomes an active Loader row, which is
 * what makes `dsh-client-modules` publish the client bundle. It deliberately
 * owns no services, config or timers, so it cannot fail app boot.
 */

export const name = 'dsh-turn-badge'

export function apply() {
  // Intentionally empty.
}
