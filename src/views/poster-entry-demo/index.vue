<template>
  <div class="poster-entry-demo">
    <div class="ped-toolbar">
      <div class="ped-desc">
        悬停浮层交互：已配置 hover
        显示「查看」，未配置空态引导「配置海报」；编辑器新标签页打开，保存后自动关闭并回传应用
      </div>
      <div class="ped-ops">
        <Button size="small" @click="fillSamples">填充示例海报</Button>
        <Button size="small" @click="posterMap = {}">清空全部</Button>
      </div>
    </div>

    <PosterEntries
      v-model="posterMap"
      :fields="fields"
      :adapters="adapters"
      :sample-data="sampleData"
      editor-route="/poster-editor-demo"
    />

    <Card dis-hover class="ped-legacy">
      <p slot="title">旧数据兼容（marketConfig.courseXxxPosterConfig 旧格式，对象直传）</p>
      <Row :gutter="16">
        <Col :span="12">
          <LegacyPosterEntry
            :value="legacyValue"
            :field="legacyField"
            :sample-data="legacySampleData"
            :scope-keys="legacyScopeKeys"
            :adapters="adapters"
            :variable-context="legacyVariableContext"
            @input="(v) => (legacyValue = v)"
          />
        </Col>
        <Col :span="12">
          <Input
            v-model="legacyText"
            type="textarea"
            :rows="12"
            placeholder="粘贴旧版 posterConfig 或标准海报 JSON，实时解析渲染"
            style="height: calc(100% - 26px)"
          />
          <div v-if="legacyError" class="ped-legacy-error">{{ legacyError }}</div>
        </Col>
      </Row>
    </Card>

    <Card dis-hover class="ped-result">
      <p slot="title">最终保存值（v-model 结果，业务可直接入库）</p>
      <Input :value="resultText" type="textarea" readonly :rows="8" />
    </Card>
  </div>
</template>

<script>
import { Button, Card, Input, Message, Row, Col } from 'view-design';
import { PosterEntries } from '@/examples/poster-entry';
import LegacyPosterEntry from '@/examples/poster-entry/admin/LegacyPosterEntry.vue';
// 真实旧数据样例（course-detail 的讨论区分享海报，带背景图；尺寸由背景图决定 1080x1440）
import legacySharePoster from '@/examples/smart-poster/legacy/old_json.json';

// 演示用示例海报：workspace + 标题变量文本 + 点缀矩形（可直接被 FabricRenderer 渲染）
function makeSamplePoster(width, height, title) {
  return {
    version: '5.3.0',
    objects: [
      {
        type: 'rect',
        id: 'workspace',
        left: 0,
        top: 0,
        width,
        height,
        fill: '#ffffff',
        selectable: false,
        hasControls: false,
      },
      {
        type: 'textbox',
        id: 't1',
        left: 40,
        top: 80,
        width: width - 80,
        height: 48,
        text: `{{title}}`,
        fontSize: 40,
        fontFamily: 'arial',
        fill: '#333333',
      },
      {
        type: 'rect',
        id: 'r1',
        left: 40,
        top: 150,
        width: 120,
        height: 8,
        fill: '#ff6600',
      },
    ],
    variableMeta: {
      version: 1,
      delimiter: { start: '{{', end: '}}' },
      schema: [{ path: 'title', label: '标题', type: 'text', example: title }],
    },
  };
}

export default {
  name: 'PosterEntryDemo',
  components: { Button, Card, Input, Row, Col, PosterEntries, LegacyPosterEntry },
  data() {
    return {
      // v-model：{ [fieldKey]: jsonString }
      posterMap: {},
      // 多海报字段定义（商品海报场景示例）
      fields: [
        {
          key: 'intro',
          title: '介绍海报',
          description: '商品详情页顶部介绍图',
          required: true,
          expectedSize: { width: 750, height: 1000 },
        },
        {
          key: 'feature',
          title: '功能海报',
          description: '核心功能卖点图',
          expectedSize: { width: 750, height: 1000 },
        },
        {
          key: 'promo',
          title: '宣传海报',
          description: '营销活动宣传图',
          expectedSize: { width: 750, height: 1000 },
        },
        {
          key: 'anatomy',
          title: '剖析海报',
          description: '产品结构剖析图',
          expectedSize: { width: 750, height: 1300 },
        },
      ],
      // 变量示例数据（预览渲染用）
      sampleData: { title: '示例商品标题' },
      // 旧数据兼容：marketConfig.courseSharePosterConfig 旧格式（对象直传，与 parseModel 后一致）；
      // 海报尺寸由背景图自然尺寸决定（1080x1300），元素超出画布直接裁掉
      legacyValue: legacySharePoster,
      // 右侧 JSON 文本（可编辑，防抖解析后驱动左侧实时渲染）
      legacyText: JSON.stringify(legacySharePoster, null, 2),
      legacyError: '',
      legacyField: { key: 'courseSharePosterConfig', title: '讨论区分享海报' },
      // 变量表存储键（demo）：经交接 query 传编辑器页注入 KV 适配器（localStorage 模拟），
      // 并驱动卡片预览示例值拉取（后台变量表 example 覆盖内嵌快照）
      legacyVariableContext: { pagePath: 'poster-entry-demo', keyStr: 'courseSharePosterConfig' },
      // 变量名列表（旧格式转换时保留 {{key}} 语义；真实业务取 variableDescription 的 name 集合）
      legacyScopeKeys: [
        'nickname',
        'posterAction',
        'textAuthor',
        'text',
        'courseName',
        'periodName',
        'bookshelfImage',
      ],
      // 变量示例数据（预览渲染用；avatar 为内联 SVG，避免外链依赖）
      legacySampleData: {
        nickname: '王小明',
        posterAction: '发布了学习心得',
        textAuthor: '李老师',
        text: '这是一段分享的文本内容，用于预览尺寸锁与省略号效果。',
        courseName: '示例课程',
        avatar:
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#4c6ef5"/><text x="100" y="115" font-size="60" fill="#fff" text-anchor="middle">A</text></svg>'
          ),
        bookshelfImage:
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="141" height="200"><rect width="141" height="200" rx="8" fill="#f0a020"/><text x="70" y="110" font-size="24" fill="#fff" text-anchor="middle">书架</text></svg>'
          ),
        $posterShareUrl: 'https://example.com/course/1',
      },
      // 演示用字体适配器（无真实字体文件，仅字体名）
      adapters: {
        font: {
          list: () =>
            Promise.resolve([
              { name: 'Arial', file: '', img: '' },
              { name: '微软雅黑', file: '', img: '' },
            ]),
        },
      },
    };
  },
  computed: {
    resultText() {
      return JSON.stringify(this.posterMap, null, 2);
    },
  },
  watch: {
    // 文本编辑 → 防抖解析 → 驱动左侧实时渲染
    legacyText: 'scheduleLegacyParse',
    // 组件回传（应用/删除/编辑器保存）→ 同步回文本；内容等价时跳过，避免打断输入
    legacyValue: {
      handler(v) {
        const text = !v ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2);
        if (text === this.legacyText) return;
        try {
          const current = JSON.parse(this.legacyText);
          const incoming = typeof v === 'string' ? JSON.parse(v) : v;
          if (v && JSON.stringify(current) === JSON.stringify(incoming)) return;
        } catch (e) {
          // 当前文本不是合法 JSON，直接覆盖
        }
        this.legacyText = text;
        this.legacyError = '';
      },
    },
  },
  beforeDestroy() {
    clearTimeout(this._legacyTimer);
  },
  methods: {
    scheduleLegacyParse() {
      clearTimeout(this._legacyTimer);
      this._legacyTimer = setTimeout(() => this.parseLegacyText(), 400);
    },
    parseLegacyText() {
      const text = this.legacyText.trim();
      // 直传原文：合法性校验/转换在 LegacyPosterEntry 内部完成，
      // 解析或转换失败经 previewError 直接渲染到预览卡片空态
      this.legacyValue = text;
      this.legacyError = '';
    },
    fillSamples() {
      const sizeOf = {
        intro: [750, 1000],
        feature: [750, 1000],
        promo: [750, 1000],
        anatomy: [750, 1300],
      };
      const next = {};
      this.fields.forEach((f) => {
        const [w, h] = sizeOf[f.key];
        next[f.key] = JSON.stringify(makeSamplePoster(w, h, f.title));
      });
      this.posterMap = next;
      Message.success('已填充 4 张示例海报');
    },
  },
};
</script>

<style lang="less" scoped>
.poster-entry-demo {
  min-height: 100vh;
  padding: 16px;
  box-sizing: border-box;
  background: #fff;
}
.ped-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;

  .ped-desc {
    font-size: 13px;
    color: #515a6e;
  }

  .ped-ops {
    display: flex;
    gap: 8px;
  }
}
.ped-legacy {
  margin-top: 16px;
}
.ped-legacy-error {
  margin-top: 8px;
  font-size: 12px;
  color: #ed4014;
}
.ped-result {
  margin-top: 16px;
}
</style>
