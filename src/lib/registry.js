/*
 * @Author: cyc
 * @Date: 2026-08-20 10:15:11
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * 能力注册表（adapter 与 UI 组件共用）
 * - register 返回注销函数，保证"谁注册谁清理"
 * - onChange 供 UI 层监听，实现"注册即出现、注销即消失"
 */

export function createRegistry() {
  const store = new Map();
  const listeners = new Set();
  return {
    register(key, value) {
      store.set(key, value);
      listeners.forEach((cb) => cb({ type: 'register', key }));
      return () => this.unregister(key);
    },
    get(key) {
      return store.get(key);
    },
    has(key) {
      return store.has(key);
    },
    unregister(key) {
      store.delete(key);
      listeners.forEach((cb) => cb({ type: 'unregister', key }));
    },
    keys() {
      return Array.from(store.keys());
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    clear() {
      store.clear();
      listeners.clear();
    },
  };
}

export function createAdapterRegistry() {
  return createRegistry();
}

export function createUiRegistry() {
  return createRegistry();
}