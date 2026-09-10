/*
 * handoff.js 单测（与源码同目录）
 * node 环境无 localStorage，使用内存 Map 模拟（jest setup 不注入，故本地 stub）
 */

/** 安装内存版 localStorage；overrides.onSetItem 可注入写入行为（如模拟配额超限） */
function setupStorage(overrides = {}) {
  const store = new Map();
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (overrides.onSetItem) overrides.onSetItem(k, v, store);
      store.set(k, String(v));
    },
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] || null,
  };
  return store;
}

describe('poster-entry/handoff 交接协议', () => {
  beforeEach(() => {
    // 每个用例独立的内存 localStorage
    setupStorage();
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const load = () => require('./handoff');

  it('openHandoff 返回 field/token 并写入信封', () => {
    const { openHandoff, readHandoffRequest } = load();
    const q = openHandoff('intro', '{"objects":[]}');
    expect(q.field).toBe('intro');
    expect(typeof q.token).toBe('string');
    expect(q.token.length).toBeGreaterThan(0);

    const env = readHandoffRequest('intro', q.token);
    expect(env).toBeTruthy();
    expect(env.json).toBe('{"objects":[]}');
    expect(env.result).toBeUndefined();
  });

  it('readHandoffRequest 无副作用：只读不销毁（可重复读取）', () => {
    const { openHandoff, readHandoffRequest } = load();
    const { field, token } = openHandoff('intro', '{"objects":[]}');
    readHandoffRequest(field, token);

    const env = JSON.parse(global.localStorage.getItem('fe:poster-handoff:' + field));
    expect(env.token).toBe(token);
  });

  it('readHandoffRequest：token 不匹配 / 信封不存在 / 已有结果 时返回 null', () => {
    const { openHandoff, readHandoffRequest, writeHandoffResult } = load();
    const { token } = openHandoff('intro', '{"objects":[]}');

    expect(readHandoffRequest('intro', 'wrong-token')).toBeNull();
    expect(readHandoffRequest('other-field', token)).toBeNull();

    writeHandoffResult('intro', token, '{"objects":[1]}');
    expect(readHandoffRequest('intro', token)).toBeNull();
  });

  it('writeHandoffResult：token 匹配写入成功，不匹配失败', () => {
    const { openHandoff, writeHandoffResult } = load();
    const { token } = openHandoff('intro', '');

    expect(writeHandoffResult('intro', token, '{"objects":[1]}')).toBe(true);
    expect(writeHandoffResult('intro', 'wrong', '{}')).toBe(false);
    expect(writeHandoffResult('no-such-field', token, '{}')).toBe(false);
  });

  it('consumeHandoffResult：取出即销毁（一次性）', () => {
    const { openHandoff, writeHandoffResult, consumeHandoffResult } = load();
    const { field, token } = openHandoff('intro', '');
    writeHandoffResult(field, token, '{"objects":[1,2]}');

    const first = consumeHandoffResult(field, token);
    expect(first).toBe('{"objects":[1,2]}');
    // 第二次消费为空（信封已销毁）
    expect(consumeHandoffResult(field, token)).toBeNull();
  });

  it('consumeHandoffResult：token 不匹配 / 无结果时不销毁信封（拒绝旧会话吞掉新会话信封）', () => {
    const { openHandoff, writeHandoffResult, consumeHandoffResult, readHandoffRequest } = load();
    const { field, token } = openHandoff('intro', '');
    writeHandoffResult(field, token, '{"secret":true}');

    expect(consumeHandoffResult(field, 'wrong-token')).toBeNull();
    // 信封完好：新会话仍可正常消费
    expect(consumeHandoffResult(field, token)).toBe('{"secret":true}');

    // 无结果（编辑器尚未保存）时同样不销毁
    const { field: f2, token: t2 } = openHandoff('intro2', '');
    expect(consumeHandoffResult(f2, t2)).toBeNull();
    expect(readHandoffRequest(f2, t2)).toBeTruthy();
  });

  it('信封内容被外部篡改为非法 JSON 时不抛错、返回 null', () => {
    const { openHandoff, readHandoffRequest } = load();
    const { field, token } = openHandoff('intro', '');
    global.localStorage.setItem('fe:poster-handoff:' + field, '{broken json');

    expect(readHandoffRequest(field, token)).toBeNull();
  });

  it('openHandoff 空json 落为空字符串', () => {
    const { openHandoff, readHandoffRequest } = load();
    const { field, token } = openHandoff('intro', undefined);
    const env = readHandoffRequest(field, token);
    expect(env.json).toBe('');
  });

  it('openHandoff 覆盖已有信封：新 token 生效', () => {
    const { openHandoff } = load();
    openHandoff('intro', '{"v":1}');
    const { token } = openHandoff('intro', '{"v":2}');

    const env = JSON.parse(global.localStorage.getItem('fe:poster-handoff:intro'));
    expect(env).toMatchObject({ token, json: '{"v":2}' });
  });

  describe('TTL 与清扫', () => {
    const ageEnvelope = (fieldKey, ageMs) => {
      global.localStorage.setItem(
        'fe:poster-handoff:' + fieldKey,
        JSON.stringify({ token: 't-' + fieldKey, json: '{"objects":[]}', ts: Date.now() - ageMs })
      );
    };

    it('sweepHandoff：清理超龄信封，保留新鲜信封', () => {
      const { HANDOFF_TTL, sweepHandoff } = load();
      ageEnvelope('stale', HANDOFF_TTL + 1000);
      ageEnvelope('fresh', HANDOFF_TTL - 60 * 1000);

      expect(sweepHandoff()).toBe(1);
      expect(global.localStorage.getItem('fe:poster-handoff:stale')).toBeNull();
      expect(global.localStorage.getItem('fe:poster-handoff:fresh')).toBeTruthy();
    });

    it('sweepHandoff：内容损坏无法解析的信封一并清理', () => {
      const { sweepHandoff } = load();
      global.localStorage.setItem('fe:poster-handoff:broken', '{not json');

      expect(sweepHandoff()).toBe(1);
      expect(global.localStorage.getItem('fe:poster-handoff:broken')).toBeNull();
    });

    it('sweepHandoff({maxAge: 0})：清空全部交接信封（配额兜底用）', () => {
      const { sweepHandoff } = load();
      ageEnvelope('a', 1000);
      ageEnvelope('b', 1000);

      expect(sweepHandoff({ maxAge: 0 })).toBe(2);
    });

    it('openHandoff 写入前自动清扫过期信封（不再无上界累积）', () => {
      const { HANDOFF_TTL, openHandoff } = load();
      ageEnvelope('stale', HANDOFF_TTL + 1000);
      openHandoff('other', '{"objects":[]}');

      expect(global.localStorage.getItem('fe:poster-handoff:stale')).toBeNull();
    });

    it('readHandoffRequest：超龄信封视为失效（返回 null）', () => {
      const { HANDOFF_TTL, openHandoff, readHandoffRequest } = load();
      const { field, token } = openHandoff('intro', '{"objects":[]}');
      // 人为把 ts 推到过期
      const env = JSON.parse(global.localStorage.getItem('fe:poster-handoff:' + field));
      env.ts = Date.now() - (HANDOFF_TTL + 1000);
      global.localStorage.setItem('fe:poster-handoff:' + field, JSON.stringify(env));

      expect(readHandoffRequest(field, token)).toBeNull();
    });
  });

  describe('writeHandoffResult 体积与有效期', () => {
    it('回写结果后清空待编辑 JSON（信封不再同时存两份数据）并刷新 ts', () => {
      const { openHandoff, writeHandoffResult } = load();
      const { field, token } = openHandoff('intro', '{"objects":[1,2,3]}');
      const before = JSON.parse(global.localStorage.getItem('fe:poster-handoff:' + field));

      expect(writeHandoffResult(field, token, '{"objects":[9]}')).toBe(true);
      const after = JSON.parse(global.localStorage.getItem('fe:poster-handoff:' + field));
      expect(after.json).toBe('');
      expect(after.result.json).toBe('{"objects":[9]}');
      expect(after.ts).toBeGreaterThanOrEqual(before.ts);
    });
  });

  describe('discardHandoff（结果无接收方时自清）', () => {
    it('token 匹配即销毁信封，不返回数据', () => {
      const { openHandoff, writeHandoffResult, discardHandoff } = load();
      const { field, token } = openHandoff('intro', '');
      writeHandoffResult(field, token, '{"objects":[1]}');

      expect(discardHandoff(field, token)).toBe(true);
      expect(global.localStorage.getItem('fe:poster-handoff:intro')).toBeNull();
    });

    it('token 不匹配 / 信封不存在时不销毁', () => {
      const { openHandoff, discardHandoff, readHandoffRequest } = load();
      const { field, token } = openHandoff('intro', '');

      expect(discardHandoff(field, 'wrong-token')).toBe(false);
      expect(readHandoffRequest(field, token)).toBeTruthy();
      expect(discardHandoff('no-such-field', token)).toBe(false);
    });
  });

  describe('配额容错', () => {
    it('首次写入抛配额错误时：清扫全部信封后重试成功', () => {
      // 只让目标信封的首次写入失败（种子数据写入不受影响）
      let throwNext = true;
      setupStorage({
        onSetItem: (k) => {
          if (throwNext && k === 'fe:poster-handoff:intro') {
            throwNext = false;
            const err = new Error('QuotaExceededError');
            err.name = 'QuotaExceededError';
            throw err;
          }
        },
      });
      global.localStorage.setItem(
        'fe:poster-handoff:old',
        // ts 回拨 1s：保证 maxAge:0 的全清判定不依赖毫秒推进（now - ts > 0 才视为过期）
        JSON.stringify({ token: 't', json: '{}', ts: Date.now() - 1000 })
      );

      const { openHandoff } = load();
      const { field, token } = openHandoff('intro', '{"objects":[]}');
      expect(token).toBeTruthy();
      // 清扫生效：旧信封被清掉，新信封写入成功
      expect(global.localStorage.getItem('fe:poster-handoff:old')).toBeNull();
      expect(global.localStorage.getItem('fe:poster-handoff:' + field)).toBeTruthy();
    });

    it('重试仍失败：openHandoff 抛可读错误（不再静默成 unhandled rejection）', () => {
      setupStorage({
        onSetItem: () => {
          const err = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          throw err;
        },
      });

      const { openHandoff } = load();
      expect(() => openHandoff('intro', '{"objects":[]}')).toThrow(/本地存储空间不足/);
    });
  });
});
