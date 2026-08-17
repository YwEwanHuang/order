/**
 * Vitest 配置
 * 仅覆盖 domain 层（纯函数，无 wx/cloud 依赖）
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['domain/**/*.test.ts'],
    environment: 'node',
  },
});