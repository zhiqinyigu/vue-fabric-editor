<template>
  <AttrSection v-if="isClipShell" :title="$t('clipInfo')">
    <div>
      <!-- modelEvent=input：键入/步进即生效，拖动手柄回填经 object:moving 等 canvas 事件实时跟随 -->
      <AttrMultiField :gutter="10" no-background>
        <AttrField>
          <InputNumber
            v-model="baseAttr.x"
            :append="$t('attributes.left')"
            model-event="input"
            @on-input="(value) => applyBox('x', value)"
          ></InputNumber>
        </AttrField>
        <AttrField>
          <InputNumber
            v-model="baseAttr.y"
            :append="$t('attributes.top')"
            model-event="input"
            @on-input="(value) => applyBox('y', value)"
          ></InputNumber>
        </AttrField>
      </AttrMultiField>
      <AttrMultiField :gutter="10" no-background>
        <AttrField>
          <InputNumber
            v-model="baseAttr.width"
            :append="$t('sizeSetting.width')"
            :min="1"
            model-event="input"
            @on-input="(value) => applyBox('width', value)"
          ></InputNumber>
        </AttrField>
        <AttrField>
          <InputNumber
            v-model="baseAttr.height"
            :append="$t('sizeSetting.height')"
            :min="1"
            model-event="input"
            @on-input="(value) => applyBox('height', value)"
          ></InputNumber>
        </AttrField>
      </AttrMultiField>
      <!-- 角度用滑杆（拖拽连续可逆，精度依赖 shell 角度归一化） -->
      <AttrField :label="$t('attributes.angle')" :label-width="40">
        <Slider v-model="baseAttr.angle" :min="0" :max="360" @on-input="changeAngle"></Slider>
      </AttrField>
      <!-- 退出裁切编辑（不等于移除裁切）：落盘相对化、shell 移除，图片本体（含旋转）不动 -->
      <Button class="exit-clip-btn" long type="warning" ghost @click="exitClipEdit">
        {{ $t('exitClip') }}
      </Button>
    </div>
  </AttrSection>
</template>

<script>
import { reactive, ref, onMounted, onBeforeUnmount } from '@vue/composition-api';
import { get } from 'lodash-es';
import useSelect from '@/hooks/select';
import InputNumber from '@/components/inputNumber';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';
import AttrMultiField from '@/components/attrPanel/AttrMultiField.vue';
import { clipBoxFromShell, applyClipBoxToShell } from '@/core/plugin/SimpleClipImagePlugin';

export default {
  name: 'AttrClip',
  components: {
    InputNumber,
    AttrSection,
    AttrField,
    AttrMultiField,
  },
  setup() {
    // 裁切精准控制面板：仅当选中对象为裁切 shell（clip 标记 + 目标为图片）时展示。
    // 自主判定（不依赖 useSelect 的 mSelectMode === 'one' 容器，也不依赖其它面板的事件流）：
    // 裁切会话里裁切 shell 会被 useSelectListen 判空，常规面板容器整体隐藏，
    // 因此本面板挂载在容器外、并直接监听画布 selection 事件维持自身可见性
    const { canvasEditor } = useSelect();
    const isClipShell = ref(false);

    // X/Y = 裁切块左上角相对图片包围盒左上角（零点=图片左上角，渲染像素；图旋转/缩放时跟随图片）
    const baseAttr = reactive({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      angle: 0,
    });

    // 选中对象为裁切 shell 时解析其宿主图片：优先插件绑定的直引用（targetImage），
    // 兜底 targetId 查找；二者皆无（图片未设 id 且插件未绑定）则不展示
    const getShellAndImage = () => {
      const shell = canvasEditor.canvas.getActiveObjects()[0];
      if (!shell || get(shell, 'clip') !== true || get(shell, 'targetType') !== 'image')
        return null;
      const img =
        shell.targetImage ||
        canvasEditor.canvas.getObjects().find((obj) => obj.id === shell.targetId);
      return img ? { shell, img } : null;
    };

    const refresh = () => {
      try {
        const found = getShellAndImage();
        isClipShell.value = !!found;
        if (!found) return;
        const box = clipBoxFromShell(found.shell, found.img);
        baseAttr.x = Math.round(box.x * 100) / 100;
        baseAttr.y = Math.round(box.y * 100) / 100;
        baseAttr.width = Math.round(box.width * 100) / 100;
        baseAttr.height = Math.round(box.height * 100) / 100;
        // 角度归一化到 [0, 360)
        baseAttr.angle = Math.round((((box.angle || 0) % 360) + 360) % 360);
      } catch (e) {
        // 换算异常（图片/几何异常）静默退化为隐藏面板，不阻断 selection 事件流
        isClipShell.value = false;
      }
    };

    // 数值修改：整体应用（未输入的字段沿用当前 shell 值），随后回填 shell 真实几何；
    // apply 内 setPositionByOrigin + rotate 保持中心/锚点不动，不重名不递归（refresh 只回填数值）
    const applyBox = (key, value) => {
      const found = getShellAndImage();
      if (!found || value == null) return;
      baseAttr[key] = value;
      applyClipBoxToShell(found.shell, found.img, { ...baseAttr }, canvasEditor.canvas);
      refresh();
    };

    // 角度滑杆：沿用 AttributeDisplay 的 changeAngle 语义（rotate 保持中心不变）
    const changeAngle = () => {
      const found = getShellAndImage();
      if (!found) return;
      applyClipBoxToShell(found.shell, found.img, { ...baseAttr }, canvasEditor.canvas);
      refresh();
    };

    // 退出裁切编辑（非移除裁切）：drop 选择 → deselected 落盘相对化并移除 shell；
    // 图片本体（含旋转/缩放）不动，后续经 ClipImage 下拉「编辑裁切」可重新进入
    const exitClipEdit = () => {
      const found = getShellAndImage();
      if (!found) return;
      // discard 触发 shell 'deselected' 落盘（同步内部处理）后，重新选中宿主图片：
      // 退出裁切 ≠ 取消选择，图片（含旋转/缩放）保持选中态，常规面板随即接管
      canvasEditor.canvas.discardActiveObject();
      canvasEditor.canvas.setActiveObject(found.img);
      canvasEditor.canvas.requestRenderAll();
    };

    const selectCancel = () => {
      isClipShell.value = false;
    };

    onMounted(() => {
      refresh();
      canvasEditor.on('selectOne', refresh);
      canvasEditor.on('selectCancel', selectCancel);
      const canvas = canvasEditor.canvas;
      // 画布 selection 事件直连（editor 级 selectOne 走 ServersPlugin 派发，双保险）
      canvas.on('selection:created', refresh);
      canvas.on('selection:updated', refresh);
      canvas.on('selection:cleared', selectCancel);
      // 拖动/旋转/缩放过程中实时回填裁切数值
      // （角拖缩放的 fabric 事件为 object:scaling；object:resizing 并非 fabric 事件，保留仅为兼容）
      canvas.on('object:moving', refresh);
      canvas.on('object:rotating', refresh);
      canvas.on('object:resizing', refresh);
      canvas.on('object:scaling', refresh);
    });

    onBeforeUnmount(() => {
      canvasEditor.off('selectOne', refresh);
      canvasEditor.off('selectCancel', selectCancel);
      const canvas = canvasEditor.canvas;
      canvas.off('selection:created', refresh);
      canvas.off('selection:updated', refresh);
      canvas.off('selection:cleared', selectCancel);
      canvas.off('object:moving', refresh);
      canvas.off('object:rotating', refresh);
      canvas.off('object:resizing', refresh);
      canvas.off('object:scaling', refresh);
    });

    return {
      isClipShell,
      baseAttr,
      applyBox,
      changeAngle,
      exitClipEdit,
    };
  },
};
</script>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';

// 退出裁切按钮：占满面板宽度（Button long 依赖父级 flex 布局）
.exit-clip-btn {
  margin-top: 6px;
}
</style>
