/**
 * 远程图片 CORS 回退加载：
 * - loadImageResilient：CORS 失败时去掉 crossOrigin 重试（保显示）
 * - 按 origin 记忆失败结果，避免重复无效 CORS 请求
 * - strict（关闭回退）时不回退，直接失败
 * - 包装 fabric.util.loadImage，使 loadJSON 全管线具备同样能力
 */
import { fabric } from 'fabric';
import {
  loadImageResilient,
  installImageCorsFallback,
  uninstallImageCorsFallback,
  setCorsFallbackEnabled,
  resetImageCorsFallbackForTest,
  getCorsBlockedOrigins,
  addCorsFallbackListener,
  normalizeCrossOrigin,
  isStrictCrossOrigin,
} from '../../src/core/imageLoader';

// 受控 Image 假实现：corsFails=true 时带 crossOrigin 的请求失败、不带则成功
function mockImageEnv({ corsFails = false } = {}) {
  const calls = [];
  const Orig = global.Image;
  global.Image = class MockImage {
    constructor() {
      this.crossOrigin = null;
      this.onload = null;
      this.onerror = null;
      this._src = '';
      this.naturalWidth = 100;
      this.naturalHeight = 100;
    }
    set src(v) {
      this._src = v;
      calls.push({ src: v, crossOrigin: this.crossOrigin });
      const fails = !!this.crossOrigin && corsFails;
      setTimeout(() => {
        if (fails) this.onerror && this.onerror();
        else this.onload && this.onload();
      }, 0);
    }
    get src() {
      return this._src;
    }
  };
  return {
    calls,
    restore: () => {
      global.Image = Orig;
    },
  };
}

afterEach(() => {
  resetImageCorsFallbackForTest();
});

describe('normalizeCrossOrigin / isStrictCrossOrigin', () => {
  it("undefined → 'anonymous'，'strict' → 'anonymous'，null 保持 null", () => {
    expect(normalizeCrossOrigin(undefined)).toBe('anonymous');
    expect(normalizeCrossOrigin('strict')).toBe('anonymous');
    expect(normalizeCrossOrigin(null)).toBeNull();
    expect(normalizeCrossOrigin('anonymous')).toBe('anonymous');
    expect(isStrictCrossOrigin('strict')).toBe(true);
    expect(isStrictCrossOrigin('anonymous')).toBe(false);
  });
});

describe('loadImageResilient', () => {
  it('CORS 失败时回退为无 crossOrigin 加载并成功', async () => {
    const env = mockImageEnv({ corsFails: true });
    try {
      const img = await loadImageResilient('https://cdn.example.com/a.png');
      expect(img).toBeTruthy();
      // 第一次带 CORS（失败）→ 第二次去掉 crossOrigin（成功）
      expect(env.calls).toHaveLength(2);
      expect(env.calls[0].crossOrigin).toBe('anonymous');
      expect(env.calls[1].crossOrigin).toBeNull();
      expect(getCorsBlockedOrigins()).toContain('https://cdn.example.com');
    } finally {
      env.restore();
    }
  });

  it('CORS 可用时只请求一次，不产生回退', async () => {
    const env = mockImageEnv({ corsFails: false });
    try {
      await loadImageResilient('https://cdn.example.com/ok.png');
      expect(env.calls).toHaveLength(1);
      expect(env.calls[0].crossOrigin).toBe('anonymous');
      expect(getCorsBlockedOrigins()).toHaveLength(0);
    } finally {
      env.restore();
    }
  });

  it('同一 origin 首次失败后，后续直接无 crossOrigin（不重复试 CORS）', async () => {
    const env = mockImageEnv({ corsFails: true });
    try {
      await loadImageResilient('https://cdn.example.com/a.png');
      env.calls.length = 0;
      await loadImageResilient('https://cdn.example.com/b.png');
      expect(env.calls).toHaveLength(1);
      expect(env.calls[0].crossOrigin).toBeNull();
    } finally {
      env.restore();
    }
  });

  it('strict（关闭回退）时 CORS 失败直接 reject，不回退', async () => {
    const env = mockImageEnv({ corsFails: true });
    setCorsFallbackEnabled(false);
    try {
      await expect(loadImageResilient('https://cdn.example.com/s.png')).rejects.toThrow();
      expect(env.calls).toHaveLength(1);
      expect(env.calls[0].crossOrigin).toBe('anonymous');
    } finally {
      env.restore();
    }
  });

  it('crossOrigin = null 时不做 CORS 请求', async () => {
    const env = mockImageEnv({ corsFails: true });
    try {
      const img = await loadImageResilient('https://cdn.example.com/n.png', { crossOrigin: null });
      expect(img).toBeTruthy();
      expect(env.calls).toHaveLength(1);
      expect(env.calls[0].crossOrigin).toBeNull();
    } finally {
      env.restore();
    }
  });
});

describe('addCorsFallbackListener', () => {
  it('回退发生时回调一次（同 origin 不重复），取消订阅后不再回调', async () => {
    const env = mockImageEnv({ corsFails: true });
    const events = [];
    const off = addCorsFallbackListener((info) => events.push(info));
    try {
      await loadImageResilient('https://cdn.notify.com/a.png');
      expect(events).toHaveLength(1);
      expect(events[0].origin).toBe('https://cdn.notify.com');
      // 同一 origin 已记忆，不再回调
      await loadImageResilient('https://cdn.notify.com/b.png');
      expect(events).toHaveLength(1);
      off();
      await loadImageResilient('https://cdn.other.com/a.png');
      expect(events).toHaveLength(1);
    } finally {
      env.restore();
    }
  });
});

describe('installImageCorsFallback（fabric.util.loadImage 包装）', () => {
  it('CORS 失败时回退无 crossOrigin 并成功回调', (done) => {
    const env = mockImageEnv({ corsFails: true });
    uninstallImageCorsFallback();
    const createImageSpy = jest
      .spyOn(fabric.util, 'createImage')
      .mockImplementation(() => new global.Image());
    installImageCorsFallback();
    const cleanup = () => {
      uninstallImageCorsFallback();
      createImageSpy.mockRestore();
      env.restore();
    };
    fabric.util.loadImage(
      'https://cdn.example.com/c.png',
      (img, isError) => {
        try {
          expect(isError).toBe(false);
          expect(img).toBeTruthy();
          expect(env.calls.map((c) => c.crossOrigin)).toEqual(['anonymous', null]);
          cleanup();
          done();
        } catch (e) {
          cleanup();
          done(e);
        }
      },
      null,
      'anonymous'
    );
  });

  it('未指定 crossOrigin 时保持原行为（不做 CORS）', async () => {
    const env = mockImageEnv({ corsFails: true });
    uninstallImageCorsFallback();
    const createImageSpy = jest
      .spyOn(fabric.util, 'createImage')
      .mockImplementation(() => new global.Image());
    installImageCorsFallback();
    const img = await new Promise((resolve) => {
      fabric.util.loadImage('https://cdn.example.com/plain.png', (el) => resolve(el));
    });
    expect(img).toBeTruthy();
    expect(env.calls).toHaveLength(1);
    expect(env.calls[0].crossOrigin).toBeNull();
    uninstallImageCorsFallback();
    createImageSpy.mockRestore();
    env.restore();
  });
});
