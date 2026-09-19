export function staffToken() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* */
  }
  try {
    return localStorage.getItem("ra_admin") || "";
  } catch {
    return "";
  }
}

export function wantsEdit() {
  try {
    if (sessionStorage.getItem("ra_debug")) return true;
  } catch {
    /* */
  }
  try {
    if (!/(?:\?|&)edit=1(?:&|$)/.test(location.search)) return false;
    const t = staffToken();
    if (!t) return false;
    sessionStorage.setItem("ra_debug", t);
    return true;
  } catch {
    return false;
  }
}
