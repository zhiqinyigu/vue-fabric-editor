import { onBeforeUnmount, onMounted, watch } from '@vue/composition-api';
import { isClient } from '../utils';

function resolveTargets(target) {
  const value = typeof target === 'function' ? target() : target;
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

export function useMutationObserver(target, callback, options = {}) {
  if (!isClient()) return { stop: () => {} };

  let observer = null;

  function start() {
    stop();
    const nodes = resolveTargets(target).filter((node) => node && node.nodeType);
    if (!nodes.length || typeof MutationObserver === 'undefined') return;

    observer = new MutationObserver((mutationList) => callback(mutationList));
    for (const node of nodes) observer.observe(node, options);
  }

  function stop() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  onMounted(start);
  watch(resolveTargets, start);

  onBeforeUnmount(stop);

  return { stop };
}
