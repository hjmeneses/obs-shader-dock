// Cliente mínimo de obs-websocket 5 (protocolo JSON), sin dependencias.
// Solo lo que necesita el dock: conectar con o sin contraseña, hacer peticiones y recibir eventos.
(function () {
  'use strict';

  // Eventos que pedimos: Config (2) | Scenes (4) | Inputs (8) | Filters (32) | SceneItems (128) | Ui (1024)
  // SceneItems: se agregó o quitó una fuente de una escena. Ui: se activó o desactivó el modo estudio.
  // Ninguno es de alto volumen (los cambios de posición de las fuentes van en otra categoría).
  const EVENTS = 2 | 4 | 8 | 32 | 128 | 1024;

  async function sha256b64(text) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
  }

  async function authString(password, salt, challenge) {
    const secret = await sha256b64(password + salt);
    return sha256b64(secret + challenge);
  }

  class ObsWs extends EventTarget {
    constructor() {
      super();
      this.ws = null;
      this.pending = new Map();
      this.nextId = 1;
      this.identified = false;
    }

    get connected() { return this.identified; }

    connect(url, password) {
      this.close();
      return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (err) => { if (!settled) { settled = true; reject(err); } };
        let ws;
        try {
          ws = new WebSocket(url, 'obswebsocket.json');
        } catch (e) {
          fail(new Error('bad_url'));
          return;
        }
        this.ws = ws;

        ws.onmessage = async (ev) => {
          let msg;
          try { msg = JSON.parse(ev.data); } catch { return; }
          const d = msg.d || {};
          if (msg.op === 0) {                       // Hello
            const identify = { rpcVersion: 1, eventSubscriptions: EVENTS };
            if (d.authentication) {
              if (!password) { fail(new Error('auth_required')); ws.close(); return; }
              if (!window.crypto || !crypto.subtle) { fail(new Error('no_crypto')); ws.close(); return; }
              identify.authentication = await authString(password, d.authentication.salt, d.authentication.challenge);
            }
            ws.send(JSON.stringify({ op: 1, d: identify }));
          } else if (msg.op === 2) {                // Identified
            this.identified = true;
            settled = true;
            resolve(d);
          } else if (msg.op === 5) {                // Event
            this.dispatchEvent(new CustomEvent('obs-event', { detail: d }));
          } else if (msg.op === 7) {                // RequestResponse
            const p = this.pending.get(d.requestId);
            if (!p) return;
            this.pending.delete(d.requestId);
            if (d.requestStatus && d.requestStatus.result) p.resolve(d.responseData || {});
            else {
              const err = new Error((d.requestStatus && d.requestStatus.comment) || 'request_failed');
              err.code = d.requestStatus && d.requestStatus.code;
              p.reject(err);
            }
          }
        };

        ws.onclose = (ev) => {
          if (this.ws === ws) this.ws = null;
          const wasIdentified = this.identified;
          this.identified = false;
          for (const p of this.pending.values()) p.reject(new Error('closed'));
          this.pending.clear();
          // 4009 = contraseña incorrecta
          fail(new Error(ev.code === 4009 ? 'auth_failed' : 'unreachable'));
          if (wasIdentified) this.dispatchEvent(new CustomEvent('closed', { detail: ev.code }));
        };
        ws.onerror = () => { /* siempre le sigue onclose */ };
      });
    }

    call(requestType, requestData = {}) {
      if (!this.identified || !this.ws) return Promise.reject(new Error('not_connected'));
      const requestId = String(this.nextId++);
      return new Promise((resolve, reject) => {
        this.pending.set(requestId, { resolve, reject });
        this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      });
    }

    close() {
      if (!this.ws) return;
      const ws = this.ws;
      this.ws = null;
      this.identified = false;
      ws.onclose = null;
      ws.onmessage = null;
      try { ws.close(); } catch { /* ya cerrado */ }
      for (const p of this.pending.values()) p.reject(new Error('closed'));
      this.pending.clear();
    }
  }

  window.ObsWs = ObsWs;
})();
