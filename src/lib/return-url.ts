/** Return only to app pages. Never follow an external URL, encoded separator or an authentication loop. */
export function safeReturnUrl(input?: string | null) {
  if (
    !input ||
    !/^\/(profile|admin)(\/|$|\?)/.test(input) ||
    /[\\\r\n]|%2f|%5c/i.test(input)
  )
    return "/profile/security";
  const url = new URL(input, "https://harnois.invalid");
  return url.origin === "https://harnois.invalid"
    ? `${url.pathname}${url.search}`
    : "/profile/security";
}
