/** WKWebView leaves `navigator.platform` empty; userAgent is the reliable signal. */
export function isMacUi(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const plat = navigator.platform || "";
  return /Mac|iPhone|iPad/i.test(ua) || /Mac/i.test(plat);
}
