if (typeof globalThis.localStorage === 'undefined') {
  const mem = {}
  globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v) },
    removeItem: (k) => { delete mem[k] },
    clear: () => { for (const k of Object.keys(mem)) delete mem[k] },
  }
}
