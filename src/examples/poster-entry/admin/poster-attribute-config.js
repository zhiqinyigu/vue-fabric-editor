import Vue from 'vue';
import { find } from 'lodash';
import UploadImgBoxPro from '@@widgets/upload-img-box-pro.vue';

const ElInput = Vue.component('ElInput');
const ElButton = Vue.component('ElButton');
const ElSelect = Vue.component('ElSelect');
const ElOption = Vue.component('ElOption');

const commaReg = /\s*,\s*/;

const uploadParams = {
  businessName: 'course',
  cdnVisit: 1,
};
const sizeStyle = { width: '70px', marginRight: '10px' };
const longSizeStyle = { width: '100px', marginRight: '10px' };
const requiredDirectives = [
  {
    name: 'validate',
    value: 'required',
  },
];
const numberDirectives = [
  {
    name: 'validate',
    value: 'required;integer',
  },
];
const pureNumberDirectives = [
  {
    name: 'validate',
    value: 'integer',
  },
];
const pureDigitFloatDirectives = [
  {
    name: 'validate',
    value: 'digit',
  },
];

const colorDirectives = [
  {
    name: 'validate',
    value: 'color',
  },
];

export function createCustomAttributeUpdateHandler(customAttribute) {
  function getController(role) {
    switch (role) {
      case 'avatar':
        return find(customAttribute, { field: 'avatarPosition' });

      case 'qrcode':
        return find(customAttribute, { field: 'qrCodePosition' });

      case 'nickname':
        return find(customAttribute, { field: 'nickNamePosition' });

      case 'background':
        return find(customAttribute, { field: 'background' });

      case 'texts':
        return find(customAttribute, { field: 'text' });
      case 'imgs':
        return find(customAttribute, { field: 'img' });
      case 'jsonList':
        return find(customAttribute, { field: 'jsonList' });
    }
  }

  return function updateCustomAttribute(target) {
    const isFabricObj = typeof target.canvas === 'object';

    if (!isFabricObj) {
      Object.keys(target).forEach((key) => {
        getController(key).value = key === 'background' ? [{ src: target[key] }] : target[key];
      });
      return;
    }

    const { role } = target;
    let controller = getController(role);
    const x = Math.round(target.left);
    const y = Math.round(target.top);

    if (!controller) {
      if (typeof role === 'number') {
        controller = find(customAttribute, { field: target.type === 'image' ? 'img' : 'text' })
          .value[role];
      } else {
        const match = /^jsonList-(\d+)$/.exec(role);
        if (match) {
          controller = find(customAttribute, { field: 'jsonList' }).value[+match[1]];
          controller.json = controller.json
            .replace(/\s*"left"\s*:\s*(-?\d+)/, `"left":${x}`)
            .replace(/\s*"top"\s*:\s*(-?\d+)/, `"top":${y}`);
        }
      }
    }

    if (controller) {
      if (controller.xHandler) {
        controller.xHandler(x);
        controller.yHandler(y);
      } else {
        controller.x = x;
        controller.y = y;
      }
    }
  };
}

export default function (config = {}, variableDescription) {
  return [
    {
      name: '海报底图',
      document: '海报底图',
      type: 'img',
      field: 'background',
      value: [],
      validate: config.backgroundValidate,
      controlAttrs: { id: config.id || 'custom-poster' },
      style: 'max-width: 200px;height: 320px;',
      ...config.background,
    },
    {
      // 保留节点，移除注释
      type: 'custom',
      key: 'line1',
      render(h) {
        return <div></div>;
      },
    },
    {
      name: '文本基线',
      field: 'canvasTextBaseline',
      type: 'static-select',
      value: 'alphabetic',
      controlParams: {
        useRadio: true,
        useButton: true,
        field: [
          { id: 'alphabetic', name: 'alphabetic' },
          { id: 'hanging', name: 'hanging' },
        ],
        size: 'mini',
      },
    },
    {
      name: '头像坐标与尺寸',
      field: 'avatarPosition',
      value: '50,1016',
      x: '',
      y: '',
      size: '',
      syncValue() {
        this.value = this.x + ',' + this.y + ',' + this.size;
      },
      xHandler(e) {
        this.x = e;
        this.syncValue();
      },
      yHandler(e) {
        this.y = e;
        this.syncValue();
      },
      sizeHandler(e) {
        this.size = e;
        this.syncValue();
      },

      render(h) {
        const [x, y, size] = this.value.split(commaReg);
        const directives = numberDirectives;
        const directives2 = pureNumberDirectives;
        this.x = x || '';
        this.y = y || '';
        this.size = size || '';

        return (
          <div>
            <ElInput
              value={x}
              {...{ directives }}
              onInput={(e) => this.xHandler(e)}
              placeholder="x"
              style={sizeStyle}
              title="头像坐标"
            />
            <ElInput
              value={y}
              {...{ directives }}
              onInput={(e) => this.yHandler(e)}
              placeholder="y"
              style={sizeStyle}
              title="头像坐标"
            />
            <ElInput
              value={size}
              {...{ directives2 }}
              onInput={(e) => this.sizeHandler(e)}
              placeholder="尺寸"
              style={sizeStyle}
              title="头像尺寸(宽度，单位 px)"
            />
          </div>
        );
      },
      ...(config.avatarPosition || {}),
    },
    {
      name: '昵称坐标与颜色',
      field: 'nickNamePosition',
      value: '164,1020,#000000',
      x: '',
      y: '',
      color: '',
      syncValue() {
        this.value = this.x + ',' + this.y + ',' + this.color;
      },
      xHandler(e) {
        this.x = e;
        this.syncValue();
      },
      yHandler(e) {
        this.y = e;
        this.syncValue();
      },
      colorHandler(e) {
        this.color = e;
        this.syncValue();
      },

      render(h) {
        const [x, y, color] = this.value.split(commaReg);
        const directives = numberDirectives;
        const directives2 = colorDirectives;
        this.x = x || '';
        this.y = y || '';
        this.color = color || '';

        return (
          <div>
            <ElInput
              value={x}
              {...{ directives }}
              onInput={(e) => this.xHandler(e)}
              placeholder="x"
              style={sizeStyle}
              title="昵称坐标"
            />
            <ElInput
              value={y}
              {...{ directives }}
              onInput={(e) => this.yHandler(e)}
              placeholder="y"
              style={sizeStyle}
              title="昵称坐标"
            />
            <ElInput
              value={color}
              {...{ directives: directives2 }}
              onInput={(e) => this.colorHandler(e)}
              placeholder="颜色"
              style={sizeStyle}
              title="昵称颜色"
            />
          </div>
        );
      },
      ...(config.nickNamePosition || {}),
    },
    {
      name: '二维码坐标与尺寸',
      field: 'qrCodePosition',
      value: '586,996,130',
      x: '',
      y: '',
      size: '',
      syncValue() {
        this.value = this.x + ',' + this.y + ',' + this.size;
      },
      xHandler(e) {
        this.x = e;
        this.syncValue();
      },
      yHandler(e) {
        this.y = e;
        this.syncValue();
      },
      sizeHandler(e) {
        this.size = e;
        this.syncValue();
      },

      render(h) {
        const [x, y, size] = this.value.split(commaReg);
        const directives = numberDirectives;
        this.x = x || '';
        this.y = y || '';
        this.size = size || '';

        return (
          <div>
            <ElInput
              value={x}
              {...{ directives }}
              onInput={(e) => this.xHandler(e)}
              placeholder="x"
              style={sizeStyle}
              title="二维码坐标"
            />
            <ElInput
              value={y}
              {...{ directives }}
              onInput={(e) => this.yHandler(e)}
              placeholder="y"
              style={sizeStyle}
              title="二维码坐标"
            />
            <ElInput
              value={size}
              {...{ directives }}
              onInput={(e) => this.sizeHandler(e)}
              placeholder="尺寸"
              style={sizeStyle}
              title="二维码尺寸(宽度，单位 px)"
            />
          </div>
        );
      },
      ...(config.qrCodePosition || {}), // 覆盖默认值，'qrCodePosition'与'field'字段值保持一致
    },
    {
      type: 'custom',
      key: 'tips',
      render(h) {
        return (
          <div>
            <details class="tips lh1-6" style={{ marginLeft: '6em', marginBottom: '20px' }}>
              <summary>
                <b>功能使用介绍</b>
              </summary>
              <p class="fz12" style={{ paddingTop: '8px' }}>
                - 文本字段可以使用变量语法，语法格式像其它地方一样使用：
                <code class="code">{'{nickname}'}为你献上了一臂之力</code>。
              </p>
              <p class="fz12">
                - 不同业务模块的变量集不一样，但通常都包含<code class="code">name</code>(课程名称),{' '}
                <code class="code">title</code>(课时名称), <code class="code">nickname</code>等。
              </p>
              <p class="fz12">- 如果你想详细了解所在业务模块的变量集，可以联系开发人员获得。</p>
              {config.isOld ? (
                <div>
                  <p class="fz12 color-red">- 当前是旧版海报，相比新版，以下功能不支持：</p>
                  <p class="fz12 color-red">
                    1. 不支持自动换行，需要自行人工拆分多个文本达到换行效果。
                  </p>
                  <p class="fz12 color-red">2. 文本无法体现在旧版的预览界面。</p>
                  <p class="fz12">
                    - 关于对齐方式。
                    <br />
                    <b>左对齐</b>指将那行文本的左边贴紧x值。
                    <br />
                    <b>右对齐</b>指将那行文本的右边贴紧x值。
                    <br />
                    <b>居中</b>指将那行文本水平方向的中间位置贴紧x指。
                  </p>
                </div>
              ) : (
                <div>
                  <p class="fz12">
                    - 关于对齐方式。
                    <br />
                    如果选择<code class="code">左对齐</code>以外的方式，则必须设置成
                    <code class="code">自动换行</code>
                    和填写<code class="code">宽度</code>才生效
                  </p>
                </div>
              )}
            </details>

            {variableDescription ? (
              <details class="tips" style={{ marginLeft: '6em', marginBottom: '20px' }}>
                <summary>
                  <b>海报/证书图片支持显示的信息</b>
                </summary>
                <div class="fz12" style={{ paddingTop: '8px' }}>
                  {variableDescription.map((item) => (
                    <p>
                      <b>{item.name}</b>：{item.content}
                    </p>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        );
      },
    },
    {
      name: '文本',
      field: 'text',
      value: [],

      buildItem(val) {
        return {
          text: '',
          x: '',
          y: '',
          color: '',
          size: '',
          align: '',
          lineHeight: '',
          fontWeight: '',
          splitByGrapheme: false,
          width: '',
          height: '',
          ...val,
        };
      },

      addItem() {
        this.value.push(this.buildItem());
      },

      delItem(i) {
        this.value.splice(i, 1);
      },

      toModel(list) {
        return (list || []).map((item) => this.buildItem(item));
      },

      render(h) {
        const directives = numberDirectives;
        const directives2 = colorDirectives;
        const textStyle = { 'padding-right': '60px' };

        return (
          <div>
            {this.value.map((item, i) => {
              return (
                <div class="border-box custom-text-box">
                  <div style={textStyle}>
                    <ElInput
                      value={item.text}
                      {...{ directives: requiredDirectives }}
                      onInput={(e) => (item.text = e)}
                      placeholder="文本"
                      title="文本内容"
                    />
                  </div>
                  <div>
                    <ElInput
                      value={item.x}
                      {...{ directives }}
                      onInput={(e) => (item.x = e)}
                      placeholder="x"
                      style={sizeStyle}
                      title="文本坐标"
                    />
                    <ElInput
                      value={item.y}
                      {...{ directives }}
                      onInput={(e) => (item.y = e)}
                      placeholder="y"
                      style={sizeStyle}
                      title="文本坐标"
                    />
                    <ElInput
                      value={item.color}
                      {...{ directives: directives2 }}
                      onInput={(e) => (item.color = e)}
                      placeholder="字体颜色"
                      style={sizeStyle}
                      title="字体颜色"
                    />
                    <ElInput
                      value={item.size}
                      {...{ directives }}
                      onInput={(e) => (item.size = e)}
                      placeholder="字体大小"
                      style={sizeStyle}
                      title="字体大小"
                    />
                    <ElSelect
                      value={item.align}
                      onInput={(e) => (item.align = e)}
                      placeholder="对齐方式"
                      style={longSizeStyle}
                      title="对齐方式"
                    >
                      <ElOption key="0" value="" label="自动" />
                      <ElOption key="1" value="left" label="左对齐" />
                      <ElOption key="2" value="center" label="居中" />
                      <ElOption key="3" value="right" label="右对齐" />
                      <ElOption key="4" value="justify" label="justify" />
                      <ElOption key="5" value="justify-left" label="justify-left" />
                      <ElOption key="6" value="justify-center" label="justify-center" />
                      <ElOption key="7" value="justify-right" label="justify-right" />
                    </ElSelect>
                    <ElSelect
                      value={item.splitByGrapheme}
                      onInput={(e) => (item.splitByGrapheme = e)}
                      placeholder="自动换行"
                      style={longSizeStyle}
                      title="自动换行"
                    >
                      <ElOption key="0" value={false} label="不换行" />
                      <ElOption key="1" value={true} label="自动换行" />
                    </ElSelect>
                    <ElInput
                      value={item.lineHeight}
                      {...{ directives: pureDigitFloatDirectives }}
                      onInput={(e) => (item.lineHeight = e)}
                      placeholder="行高"
                      style={sizeStyle}
                      title="行高"
                    />
                    <ElSelect
                      value={item.fontWeight}
                      onInput={(e) => (item.fontWeight = e)}
                      placeholder="字体样式"
                      style={longSizeStyle}
                      title="字体样式"
                    >
                      <ElOption value="" label="不加粗" />
                      <ElOption value="bold" label="加粗" />
                    </ElSelect>
                    <ElInput
                      value={item.width}
                      {...{ directives: pureNumberDirectives }}
                      onInput={(e) => (item.width = e)}
                      placeholder="宽度"
                      style={sizeStyle}
                      title="宽度"
                    />
                    <ElInput
                      value={item.height}
                      {...{ directives: pureNumberDirectives }}
                      onInput={(e) => (item.height = e)}
                      placeholder="高度"
                      style={sizeStyle}
                      title="高度"
                    />
                    <ElButton type="danger" icon="el-icon-delete" onClick={() => this.delItem(i)}>
                      删除
                    </ElButton>
                  </div>
                </div>
              );
            })}
            <ElButton type="primary" onClick={() => this.addItem()}>
              新增
            </ElButton>
          </div>
        );
      },
    },
    {
      name: '图片',
      field: 'img',
      value: [],

      buildItem(val) {
        return {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          src: '',
          crossOrigin: 'anonymous',
          ...val,
        };
      },

      addItem() {
        this.value.push(this.buildItem());
      },

      delItem(i) {
        this.value.splice(i, 1);
      },

      toModel(list) {
        return (list || []).map((item) => this.buildItem(item));
      },

      render(h) {
        const directives = numberDirectives;
        const textStyle = { 'padding-right': '60px' };

        return (
          <div>
            {this.value.map((item, i) => {
              return (
                <div class="border-box custom-text-box">
                  <div style={textStyle}>
                    <ElInput
                      value={item.src}
                      onInput={(e) => (item.src = e)}
                      {...{ directives: requiredDirectives }}
                      placeholder="图片地址"
                      title="图片地址"
                    />
                  </div>
                  <div style="line-height: 1">
                    <UploadImgBoxPro
                      value={item.src}
                      onInput={(e) => (item.src = e)}
                      {...{ directives: requiredDirectives }}
                      params={uploadParams}
                      max-quantity={1}
                      is-single
                      title="图片"
                      style="width: 100px;height: 100px;display: inline-block;vertical-align: middle;margin-right: 12px;"
                    />
                    <ElInput
                      value={item.x}
                      {...{ directives }}
                      onInput={(e) => (item.x = e)}
                      placeholder="x"
                      style={sizeStyle}
                      title="文本坐标"
                    />
                    <ElInput
                      value={item.y}
                      {...{ directives }}
                      onInput={(e) => (item.y = e)}
                      placeholder="y"
                      style={sizeStyle}
                      title="文本坐标"
                    />
                    <ElInput
                      value={item.width}
                      {...{ directives: pureNumberDirectives }}
                      onInput={(e) => (item.width = e)}
                      placeholder="宽度"
                      style={sizeStyle}
                      title="宽度"
                    />
                    <ElInput
                      value={item.height}
                      {...{ directives: pureNumberDirectives }}
                      onInput={(e) => (item.height = e)}
                      placeholder="高度"
                      style={sizeStyle}
                      title="高度"
                    />
                    <ElButton type="danger" icon="el-icon-delete" onClick={() => this.delItem(i)}>
                      删除
                    </ElButton>
                  </div>
                </div>
              );
            })}
            <ElButton type="primary" onClick={() => this.addItem()}>
              新增
            </ElButton>
          </div>
        );
      },
    },

    {
      name: '高级元素',
      field: 'jsonList',
      value: [],

      addItem() {
        this.value.push({
          json: '',
          moveTo: '', // 层级
        });
      },

      delItem(i) {
        this.value.splice(i, 1);
      },

      render(h) {
        const directives2 = pureNumberDirectives;
        const textStyle = { 'padding-right': '60px' };

        return (
          <div>
            {this.value.map((item, i) => {
              return (
                <div class="border-box custom-text-box">
                  <div style={textStyle}>
                    <ElInput
                      value={item.json}
                      {...{ directives: requiredDirectives }}
                      onInput={(e) => (item.json = e)}
                      placeholder="json表示"
                      title="json内容"
                    />
                  </div>
                  <div>
                    <ElInput
                      value={item.moveTo}
                      {...{ directives: directives2 }}
                      onInput={(e) => (item.moveTo = e)}
                      placeholder="z-index"
                      style={{ width: '8em', marginRight: '1em' }}
                      title="元素位于的层级"
                    />
                    <ElButton type="danger" icon="el-icon-delete" onClick={() => this.delItem(i)}>
                      删除
                    </ElButton>
                  </div>
                </div>
              );
            })}
            <ElButton type="primary" onClick={() => this.addItem()}>
              新增
            </ElButton>
          </div>
        );
      },
    },
    {
      name: '海报版本',
      field: 'mode',
      type: 'static-select',
      value: config.isOld ? 'old' : 'new',
      controlAttrs: {
        size: 'mini',
      },
      controlParams: {
        useRadio: true,
        useButton: true,
        useText: config.isSupportSwitchMode ? false : true,
        field: [
          { id: 'old', name: '旧版' },
          { id: 'new', name: '新版' },
        ],
      },
    },
  ];
}
