/** Starts a browser download from an API route that answers with
 * `Content-Disposition: attachment` -- the page itself stays where it is. */
export function startDownload(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
