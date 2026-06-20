// Tracks the estimated offset between server clock and local clock.
// offset = serverNow - Date.now() at the time the last game_state arrived.
// Add this offset to Date.now() when comparing against server-issued timestamps
// (sowedAt, readyAt, crowAttack.startedAt, etc.) so LAN games with clock skew
// between machines display animations correctly.

let offset = 0;

export function setClockOffset(serverNow: number): void {
  offset = serverNow - Date.now();
}

export function serverTime(): number {
  return Date.now() + offset;
}
