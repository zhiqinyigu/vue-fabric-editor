/*
 * 海报编辑交接协议（一次性信封，纯函数，便于替换为后端草稿实现）
 *
 * 存储用 localStorage（sessionStorage 按标签页隔离，编辑器在新标签页打开时读不到）。
 *
 * 流程：
 *   配置页 openHandoff(fieldKey, json) → 携带 { field, token } 新标签页打开编辑器页
 *   编辑器页 readHandoffRequest(fieldKey, token) → 读取待编辑 JSON
 *   编辑器页保存 writeHandoffResult(fieldKey, token, json) → 自关标签页，
 *     配置页经 storage 事件消费；直接访问编辑器页（无 opener）时走回跳，
 *     query 携带 applied=token 由配置页 $route watcher 消费
 *   配置页 consumeHandoffResult(fieldKey, token) → 消费（取出并清除）编辑结果
 *
 * 安全点：token 匹配才可读写；结果消费后信封即销毁（一次性），防刷新残留重复应用。
 *
 * 生命周期：信封是「打开编辑器 → 保存回传」的短时数据，但存在「打开后未保存就关闭」
 * 之类的路径导致信封无人消费并无限累积。因此引入 TTL + 启动时清扫：
 *   - sweepHandoff()：清理超龄/损坏信封，openHandoff 写入前自动执行；
 *   - discardHandoff()：结果无接收方时由编辑器页主动销毁，避免留下没人取的信封；
 *   - 写入做配额容错：QuotaExceededError 时全清后重试一次，仍失败则不再静默抛错。
 */

export const HANDOFF_PREFIX = 'fe:poster-handoff:';

/** 信封有效期：交接是分钟级动作，24h 足够宽松，可自动清掉过夜残留 */
export const HANDOFF_TTL = 24 * 3600 * 1000;

function genToken() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isExpired(envelope, now, maxAge) {
  return (
    !envelope ||
    typeof envelope !== 'object' ||
    typeof envelope.ts !== 'number' ||
    now - envelope.ts > maxAge
  );
}

/** 读取并解析信封（非法 JSON / 不存在 均返回 null，不抛错） */
function readEnvelope(fieldKey) {
  try {
    const envelope = JSON.parse(localStorage.getItem(HANDOFF_PREFIX + fieldKey) || 'null');
    return envelope && typeof envelope === 'object' ? envelope : null;
  } catch (e) {
    return null;
  }
}

/**
 * 写入信封（带配额容错）
 * localStorage 约 5MB 上限，信封内含整份海报 JSON，累积到上限后 setItem 会抛
 * QuotaExceededError。此时交接数据属于可丢弃的短时数据，全清后重试一次；
 * 仍失败返回 false 由调用方提示，避免异常冒泡成 unhandled rejection。
 */
function writeEnvelope(fieldKey, envelope) {
  const set = () => localStorage.setItem(HANDOFF_PREFIX + fieldKey, JSON.stringify(envelope));
  try {
    set();
    return true;
  } catch (e) {
    sweepHandoff({ maxAge: 0 });
    try {
      set();
      return true;
    } catch (e2) {
      return false;
    }
  }
}

/**
 * 清扫交接信封：超龄（或内容损坏无法解析）即删除
 * @param {object} opts
 * @param {number} opts.maxAge 有效期，默认 HANDOFF_TTL；传 0 表示全部清除
 * @returns {number} 清理条数
 */
export function sweepHandoff({ maxAge = HANDOFF_TTL } = {}) {
  const now = Date.now();
  let removed = 0;
  try {
    // 先收集再删：removeItem 会改变 localStorage 的索引
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.indexOf(HANDOFF_PREFIX) === 0) keys.push(key);
    }
    keys.forEach((key) => {
      let envelope = null;
      try {
        envelope = JSON.parse(localStorage.getItem(key) || 'null');
      } catch (e) {
        envelope = null;
      }
      if (!isExpired(envelope, now, maxAge)) return;
      localStorage.removeItem(key);
      removed += 1;
    });
  } catch (e) {
    // 存储不可用（隐私模式 / 禁用 localStorage）：清扫失败不影响主流程
  }
  return removed;
}

/** 打开交接：写入待编辑信封，返回应携带到编辑器页路由的 query 参数 */
export function openHandoff(fieldKey, json) {
  const token = genToken();
  const envelope = { token, json: json || '', ts: Date.now() };
  sweepHandoff();
  if (!writeEnvelope(fieldKey, envelope)) {
    throw new Error('本地存储空间不足，无法打开编辑器，请清理浏览器存储后重试');
  }
  return { field: fieldKey, token };
}

/** 编辑器页读取待编辑信封（token 匹配且尚未有结果才有效；超龄信封视为失效） */
export function readHandoffRequest(fieldKey, token) {
  const envelope = readEnvelope(fieldKey);
  if (!envelope || envelope.token !== token || envelope.result) return null;
  if (isExpired(envelope, Date.now(), HANDOFF_TTL)) return null;
  return envelope;
}

/** 编辑器页保存时回写结果（token 匹配才写入）；写入后清空待编辑 JSON（信封体积减半） */
export function writeHandoffResult(fieldKey, token, json) {
  const envelope = readEnvelope(fieldKey);
  if (!envelope || envelope.token !== token) return false;
  const ts = Date.now();
  envelope.json = ''; // 已被编辑器消费，不再占位
  envelope.result = { json, ts };
  envelope.ts = ts; // 刷新有效期：结果从回写时刻起重新计时
  return writeEnvelope(fieldKey, envelope);
}

/**
 * 配置页消费编辑结果：token 匹配且有保存结果才取出并销毁信封
 * 先验证后删除：token 不匹配 / 无结果时不动信封——残留的旧会话标签页（pendingToken
 * 悬挂）收到新会话信封的 storage 事件后，不得吞掉别人的信封。
 */
export function consumeHandoffResult(fieldKey, token) {
  const envelope = readEnvelope(fieldKey);
  if (!envelope || envelope.token !== token || !envelope.result) return null;
  try {
    localStorage.removeItem(HANDOFF_PREFIX + fieldKey);
  } catch (e) {
    // 存储不可用时仍返回结果：取到数据比清掉垃圾更重要
  }
  return envelope.result.json;
}

/**
 * 销毁信封（token 匹配即可，不返回数据）
 * 用于「结果写入后确认没有接收方」的场景（编辑器页既无 opener 也无来源页）：
 * 此时信封永远不会有人消费，留在 localStorage 里就是纯垃圾。
 */
export function discardHandoff(fieldKey, token) {
  const envelope = readEnvelope(fieldKey);
  if (!envelope || envelope.token !== token) return false;
  try {
    localStorage.removeItem(HANDOFF_PREFIX + fieldKey);
    return true;
  } catch (e) {
    return false;
  }
}
