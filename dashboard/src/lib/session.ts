// Who is using this tab: just a name. The backend's auth is `Authorization: Bearer <name>`
// (demo, play money; same name, same account). Kept per tab in sessionStorage, so two tabs can be two friends.

const KEY = "vexbets.email";

export function getEmail(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setEmail(email: string | null): void {
  try {
    if (email) sessionStorage.setItem(KEY, email.trim().toLowerCase());
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: stays signed out */
  }
  window.dispatchEvent(new Event("vexbets:session"));
}
