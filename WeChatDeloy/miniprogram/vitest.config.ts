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
  // 把 .ts 放在 .js 之前，避免 vitest 在 domain 同时存在 .ts 源和
  // tsc 编译产物 .js 时优先解析 .js（CJS+package.json type:module 会报错）
  resolve: {
    extensions: ['.ts', '.mjs', '.js', '.mts', '.jsx', '.tsx', '.json'],
  },
});