import '@testing-library/jest-dom/vitest';

// jsdom has no matchMedia; tests default to the wide layout and stub it where layout matters.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }),
});

// The app persists its session; each test starts with an empty one.
afterEach(() => {
  sessionStorage.clear();
});
