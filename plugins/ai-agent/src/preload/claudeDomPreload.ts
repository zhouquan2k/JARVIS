/**
 * Claude DOM preload — injected into the hidden claude.ai BrowserWindow.
 * Exposes `window.__jarvisInjectPrompt(prompt, requestId)` to the main world.
 *
 * 仅做 electron 桥接：注入/提取/结束检测的实际逻辑在共享纯模块 domChat/* 中，
 * 与独立实时探针、jsdom 回归单测共用同一份实现。
 *
 * claude.ai DOM 选择器已经浏览器实探验证（2026-06）。
 */
import { contextBridge, ipcRenderer } from 'electron';
import { installClaudeDomBridge } from './bridges/installClaudeDomBridge';

installClaudeDomBridge({ contextBridge, ipcRenderer });
