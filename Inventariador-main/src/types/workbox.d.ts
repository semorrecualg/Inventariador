// workbox-core's public types reference the Service Worker global
// `ExtendableEvent`, which lives in lib.webworker — not in lib.dom.
// We keep the DOM lib only; declare the minimal ambient global here.
interface ExtendableEvent extends Event {
  waitUntil(f: Promise<any>): void;
}
