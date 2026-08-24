import { onBeforeUnmount, unref } from '@vue/composition-api';
import { isClient } from '../utils';

export function useEventListener(target, event, handler, options = {}) {
  if (!isClient()) return () => {};

  const resolveTarget = () => {
    const value = typeof target === 'function' ? target() : target;
    return unref(value);
  };

  const el = resolveTarget();
  if (!el || typeof el.addEventListener !== 'function') return () => {};

  el.addEventListener(event, handler, options);

  const stop = () => {
    if (el && typeof el.removeEventListener === 'function')
      el.removeEventListener(event, handler, options);
  };

  onBeforeUnmount(stop);

  return stop;
}
