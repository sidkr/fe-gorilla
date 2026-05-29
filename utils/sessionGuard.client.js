import Parse from "parse";

// Client-only — Parse session tokens live in localStorage.

let invalidated = false;
let validationInFlight = null;

export function markSessionInvalid() {
  invalidated = true;
}

export function isSessionInvalidated() {
  return invalidated;
}

export function validateSession() {
  if (invalidated) return Promise.resolve();
  if (validationInFlight) return validationInFlight;
  const user = Parse.User.current();
  if (!user) return Promise.resolve();
  validationInFlight = user
    .fetch()
    .catch((err) => {
      if (err && err.code === Parse.Error.INVALID_SESSION_TOKEN) {
        invalidated = true;
      }
    })
    .finally(() => {
      validationInFlight = null;
    });
  return validationInFlight;
}

const LOGOUT_TIMEOUT_MS = 500;

export async function purgeSession() {
  invalidated = false;
  await Promise.race([
    Parse.User.logOut().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, LOGOUT_TIMEOUT_MS)),
  ]);
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("Parse/")) localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable
  }
  try {
    sessionStorage.clear();
  } catch {
    // storage unavailable
  }
}
