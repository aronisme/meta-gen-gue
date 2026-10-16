import '@testing-library/jest-dom';

// Mock crypto.subtle for tests
Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      digest: async (_algorithm: string, data: BufferSource) => {
        const bytes =
          data instanceof Uint8Array
            ? data
            : ArrayBuffer.isView(data)
              ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
              : new Uint8Array(data);
        const result = new Uint8Array(32);
        let sum = 0;
        for (let i = 0; i < bytes.length; i++) {
          sum = (sum + bytes[i]) % 65536;
        }
        for (let i = 0; i < 32; i++) {
          result[i] = (bytes.length + sum + i) % 256;
        }
        return result.buffer;
      },
    },
    getRandomValues: (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
  },
});

// Mock localStorage
let storageStore = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storageStore.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storageStore.set(key, String(value));
  }),
  removeItem: vi.fn((key: string) => {
    storageStore.delete(key);
  }),
  clear: vi.fn(() => {
    storageStore.clear();
  }),
  get length() {
    return storageStore.size;
  },
  key: vi.fn((i: number) => Array.from(storageStore.keys())[i] ?? null),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
});

// Mock URL.createObjectURL and URL.revokeObjectURL for media tests
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn();
}

// Mock HTMLMediaElement.prototype.load for jsdom tests
if (typeof window !== 'undefined' && window.HTMLMediaElement) {
  window.HTMLMediaElement.prototype.load = vi.fn();
}

