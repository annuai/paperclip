/**
 * The element mouse handlers attach to: the stable #character host, never the SVG inside it.
 * Renderer.setStyle() replaces the SVG, which would silently drop listeners bound to it
 * (drag, click, double-click, context menu and hover-to-wake all stopped after a style switch).
 * Events from the SVG bubble up to the host, so binding here survives every swap.
 */
export function characterHitTarget(host: HTMLElement): HTMLElement {
  return host;
}
