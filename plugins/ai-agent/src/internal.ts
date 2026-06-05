/**
 * ai-agent 内部聚合出口：把 core 保留的通用契约与本插件自有的领域契约 / 运行时类型
 * 汇总到一处，供插件内部模块统一引用，避免散落的深路径 import。
 */
export * from '@packages/core';
export * from './interfaces';
export * from './runtime/modelProviderRuntime.types';
