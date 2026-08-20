/*
 * 模板管理适配器示例
 * 成员形状由本扩展自行定义（业务自持），包不约束。
 * 可替换为任意 axios/graphql/本地存储实现。
 */
const db = [
  {
    id: '1',
    name: '开业海报',
    previewSrc: 'https://picsum.photos/seed/a/140/180',
    json: {
      version: '5.3.0',
      objects: [
        {
          type: 'textbox',
          id: 'demo-text-1',
          left: 50,
          top: 50,
          width: 200,
          height: 40,
          text: '欢迎光临',
          fontSize: 32,
          fill: '#ff6600',
          fontFamily: 'Arial',
        },
      ],
    },
  },
  {
    id: '2',
    name: '活动横幅',
    previewSrc: 'https://picsum.photos/seed/b/140/180',
    json: {
      version: '5.3.0',
      objects: [
        {
          type: 'rect',
          id: 'demo-rect-1',
          left: 40,
          top: 60,
          width: 220,
          height: 120,
          fill: '#409eff',
          rx: 8,
          ry: 8,
        },
      ],
    },
  },
];

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

export const templateAdapter = {
  async list({ page = 1, pageSize = 10, keyword = '' } = {}) {
    await delay();
    const filtered = db.filter((i) => !keyword || i.name.includes(keyword));
    const start = (page - 1) * pageSize;
    return {
      list: filtered
        .slice(start, start + pageSize)
        .map(({ id, name, previewSrc }) => ({ id, name, previewSrc })),
      pagination: {
        page,
        pageCount: Math.ceil(filtered.length / pageSize),
        total: filtered.length,
      },
    };
  },
  async get(id) {
    await delay();
    const item = db.find((i) => i.id === String(id));
    if (!item) throw new Error(`template ${id} not found`);
    return { id: item.id, name: item.name, json: item.json };
  },
  async create({ name, json, preview } = {}) {
    await delay();
    const id = String(Date.now());
    db.push({ id, name: name || '未命名', json, previewSrc: preview || '' });
    return { id };
  },
  async update(id, { name, json } = {}) {
    await delay();
    const item = db.find((i) => i.id === String(id));
    if (!item) throw new Error(`template ${id} not found`);
    if (name !== undefined) item.name = name;
    if (json !== undefined) item.json = json;
  },
  async remove(id) {
    await delay();
    const idx = db.findIndex((i) => i.id === String(id));
    if (idx >= 0) db.splice(idx, 1);
  },
  async findIdByProjectId(projectId) {
    await delay();
    const item = db.find((i) => i.externalId === String(projectId));
    return item ? item.id : undefined;
  },
};

export default templateAdapter;
