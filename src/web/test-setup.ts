import { vi } from 'vitest';

vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}));

Element.prototype.scrollIntoView = vi.fn();
