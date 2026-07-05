/**
 * Gemini DOM preload — injected into the hidden gemini.google.com BrowserWindow.
 * Exposes `window.__jarvisInjectPrompt(prompt, requestId)` to the main world.
 *
 * 仅做 electron 桥接：注入/提取/结束检测的实际逻辑在共享纯模块 domChat/* 中，
 * 与独立实时探针、jsdom 回归单测共用同一份实现。
 */
import { contextBridge, ipcRenderer } from 'electron';
import { installGeminiDomBridge } from './bridges/installGeminiDomBridge';

installGeminiDomBridge({ contextBridge, ipcRenderer });
