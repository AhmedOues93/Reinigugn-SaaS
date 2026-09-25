/**
 * The manifest and touch-icon links, rendered as elements rather than through
 * the Metadata API.
 *
 * Next streams metadata for any page that reads a dynamic API, and both app
 * surfaces do. The `<link rel="manifest">` it produces therefore lands in the
 * body, around 13 KB into the document, long after the browser has finished
 * parsing `<head>`. The DOM ends up correct and the tab looks right, so this is
 * easy to miss — but Chrome only honours a manifest it finds while parsing the
 * head, so it reported "no-manifest" and never offered to install either app.
 *
 * React hoists these links into `<head>` as part of the initial shell, which is
 * flushed before any streamed content, so the manifest is there when the parser
 * looks for it. The Metadata API still carries the title and description, where
 * arriving late costs nothing.
 */
export function PwaHead({ manifest, icon, appleIcon }: { manifest: string; icon: string; appleIcon: string }) {
  return (
    <>
      <link rel="manifest" href={manifest} />
      <link rel="icon" href={icon} type="image/png" sizes="192x192" />
      <link rel="apple-touch-icon" href={appleIcon} sizes="180x180" />
    </>
  );
}
