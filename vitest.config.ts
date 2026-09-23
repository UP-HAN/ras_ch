import { defineConfig } from 'vitest/config';

// 루트에서 `npm test` 한 번으로 client·server 테스트를 모두 돌린다.
export default defineConfig({
  test: {
    projects: ['client', 'server'],
  },
});
