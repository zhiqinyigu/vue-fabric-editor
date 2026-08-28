<template>
  <div v-if="!isSelect">
    <AttrSection :title="$t('bgSeting.color')">
      <div class="bg-item">
        <ColorPalettePicker :value.sync="color" @change="applyBackgroundColor" />
      </div>
    </AttrSection>
    <AttrSection :title="$t('bgSeting.colorMacthing')">
      <div class="color-list">
        <span
          v-for="(item, i) in colorList"
          :key="item + i"
          :style="`background:${item}`"
          @click="setColor(item)"
        ></span>
      </div>
    </AttrSection>

    <!-- 背景图片 -->
    <AttrSection :title="$t('bgSeting.image')">
      <div class="bg-image-card">
        <!-- 空态：点击打开统一图片来源选择器 -->
        <div v-if="!bgImageUrl" class="bg-image-empty" @click="openBackgroundImage">
          <Icon type="ios-cloud-upload-outline" size="34" />
          <span>{{ $t('bgSeting.uploadImage') }}</span>
          <em>{{ $t('bgSeting.uploadTip') }}</em>
        </div>

        <!-- 已设置：预览(左) + 操作列(右) -->
        <div v-else class="bg-image-body">
          <div class="bg-image-preview" title="点击更换" @click="openBackgroundImage">
            <img v-if="!bgIsVariable" :src="bgImageUrl" alt="background" />
            <div v-else class="bg-image-var-preview">{{ bgVariableLabel }}</div>
          </div>
          <div class="bg-image-actions">
            <Button size="small" icon="ios-refresh" @click="openBackgroundImage">
              {{ $t('bgSeting.reUpload') }}
            </Button>
            <Button size="small" icon="ios-expand" :disabled="bgIsVariable" @click="fitCanvasToBg">
              {{ $t('bgSeting.fitCanvas') }}
            </Button>
            <Button size="small" icon="ios-trash-outline" @click="removeBgImage">
              {{ $t('bgSeting.removeImage') }}
            </Button>
          </div>
        </div>

        <!-- 设置区 -->
        <Form v-if="bgImageUrl" :label-width="70" class="bg-image-settings">
          <FormItem :label="$t('bgSeting.fillMode')">
            <Select v-model="bgMode" size="small" @on-change="changeBgMode">
              <Option value="cover">{{ $t('bgSeting.cover') }}</Option>
              <Option value="contain">{{ $t('bgSeting.contain') }}</Option>
              <Option value="tile">{{ $t('bgSeting.tile') }}</Option>
            </Select>
          </FormItem>
          <FormItem :label="$t('bgSeting.position')">
            <div class="bg-align-grid">
              <div
                v-for="pos in positions"
                :key="pos.x + '-' + pos.y"
                :class="[
                  'bg-align-cell',
                  {
                    active: bgPosition.x === pos.x && bgPosition.y === pos.y,
                    disabled: bgMode === 'tile',
                  },
                ]"
                @click="bgMode !== 'tile' && setBgPosition(pos.x, pos.y)"
              >
                <i class="bg-align-dot" :style="dotStyle(pos)"></i>
              </div>
            </div>
          </FormItem>
          <FormItem :label="$t('bgSeting.opacity')">
            <Slider
              v-model="bgOpacity"
              :min="0"
              :max="100"
              :step="1"
              @on-input="changeBgOpacity"
            ></Slider>
          </FormItem>
        </Form>
      </div>
    </AttrSection>

    <!-- <div>
      <Divider plain orientation="left">
        <h4>蒙版</h4>
      </Divider>

      <workspaceMask />
    </div> -->
  </div>
</template>

<script>
// import workspaceMask from './workspaceMask.vue';
import { ref, computed, onMounted, onUnmounted } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import useImagePicker from '@/hooks/useImagePicker';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import ColorPalettePicker from '@/components/ColorPalettePicker.vue';
import { parseGradient } from '@/components/vue-color-palette-vue2';
import { RGBA2HexA } from './color-picker/utils/color.js';
import { extractVariablesFromString, DEFAULT_DELIMITER } from '@/core/variableEngine';

export default {
  name: 'BgBar',
  components: {
    AttrSection,
    ColorPalettePicker,
  },
  setup() {
    const { isSelect, canvasEditor, fabric } = useSelect();
    const { openImagePicker } = useImagePicker();
    const angleKey = 'gradientAngle';

    // ===== 背景图片 =====
    const bgImageUrl = ref('');
    const bgMode = ref('cover');
    const bgPosition = ref({ x: 0.5, y: 0.5 }); // 对齐系数：0=起始 / 0.5=居中 / 1=末尾
    const bgOpacity = ref(100);

    // 对齐 3×3 网格
    const positions = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 0.5 },
      { x: 0, y: 1 },
      { x: 0.5, y: 1 },
      { x: 1, y: 1 },
    ];
    // 网格内小点随对齐位置偏移（clamp 到点半径内保证贴边不越界）
    const dotStyle = (pos) => ({
      top: `clamp(4px, ${pos.y * 100}%, calc(100% - 4px))`,
      left: `clamp(4px, ${pos.x * 100}%, calc(100% - 4px))`,
      transform: 'translate(-50%, -50%)',
    });

    // 打开统一图片来源选择器，将选中的图片设为背景
    const applyBackgroundSrc = (src) => {
      if (!src) return;
      bgImageUrl.value = src;
      canvasEditor.setBackgroundImage(src, bgMode.value, bgPosition.value);
      canvasEditor.setBackgroundOpacity(bgOpacity.value);
    };
    const openBackgroundImage = () => {
      openImagePicker({
        mode: 'background',
        onDone: applyBackgroundSrc,
      });
    };

    const removeBgImage = () => {
      bgImageUrl.value = '';
      canvasEditor.removeBackgroundImage();
    };

    // 画布尺寸同步为背景图原始尺寸
    const fitCanvasToBg = () => {
      if (bgIsVariable.value) return; // 变量背景真实尺寸未知，禁止按背景定画布
      canvasEditor.fitCanvasToBackground();
    };

    // 背景图是否为"模板变量"（真实 URL 未知，预览以占位呈现；fitCanvas 禁用）。
    // 依赖响应式的 bgImageUrl 触发重算（canvasEditor 非响应式，纯调用不追踪变化）：
    // loadJson 回显/选图设置背景时都会先更新 bgImageUrl，再读取核心层的变量标记
    const bgIsVariable = computed(() => {
      if (!bgImageUrl.value) return false;
      const info = canvasEditor.getBackgroundImage && canvasEditor.getBackgroundImage();
      return !!(info && info.variable);
    });
    // 变量背景在预览区显示的变量名（如 "user.bg"）
    const bgVariableLabel = computed(() => {
      const vars = extractVariablesFromString(bgImageUrl.value, DEFAULT_DELIMITER);
      return vars.join(', ') || 'variable';
    });

    const changeBgMode = (mode) => {
      if (bgImageUrl.value) {
        canvasEditor.setBackgroundMode(mode);
      }
    };

    // 就地更新背景对齐方式（不重载图片）
    const setBgPosition = (x, y) => {
      bgPosition.value = { x, y };
      canvasEditor.setBackgroundPosition(x, y);
    };

    const changeBgOpacity = (val) => {
      canvasEditor.setBackgroundOpacity(val / 100);
    };

    const colorList = ref([
      '#5F2B63',
      '#B23554',
      '#F27E56',
      '#FCE766',
      '#86DCCD',
      '#E7FDCB',
      '#FFDC84',
      '#F57677',
      '#5FC2C7',
      '#98DFE5',
      '#C2EFF3',
      '#DDFDFD',
      '#9EE9D3',
      '#2FC6C8',
      '#2D7A9D',
      '#48466d',
      '#61c0bf',
      '#bbded6',
      '#fae3d9',
      '#ffb6b9',
      '#ffaaa5',
      '#ffd3b6',
      '#dcedc1',
      '#a8e6cf',
    ]);

    const color = ref('#ffffffff');
    // 获取 workspace 对象
    const getWorkspace = () =>
      canvasEditor.canvas.getObjects().find((item) => item.id === 'workspace');
    // 把 workspace.fill 规整为 color-picker 可识别的 hexA（rgba/#rgb/#rrggbb → #rrggbbaa）
    const toHexA = (fill) => {
      if (typeof fill !== 'string') return fill;
      if (/^rgba?\(/i.test(fill)) {
        const m = fill.match(/rgba?\(([^)]+)\)/);
        const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
        return RGBA2HexA(parts[0], parts[1], parts[2], parts[3] != null ? parts[3] : 1);
      }
      if (fill.length === 7) return fill + 'ff';
      return fill;
    };
    // 背景颜色设置（配色列表：纯色）
    function setColor(c) {
      const workspace = getWorkspace();
      workspace.set('fill', c);
      canvasEditor.canvas.renderAll();
      color.value = toHexA(c);
    }
    // css转Fabric渐变
    const cssToFabricGradient = (stops, width, height, angle) => {
      const gradAngleToCoords = (paramsAngle) => {
        const anglePI = -parseInt(paramsAngle, 10) * (Math.PI / 180);
        return {
          x1: Math.round(50 + Math.sin(anglePI) * 50) / 100,
          y1: Math.round(50 + Math.cos(anglePI) * 50) / 100,
          x2: Math.round(50 + Math.sin(anglePI + Math.PI) * 50) / 100,
          y2: Math.round(50 + Math.cos(anglePI + Math.PI) * 50) / 100,
        };
      };
      const angleCoords = gradAngleToCoords(angle);
      return new fabric.Gradient({
        type: 'linear',
        gradientUnits: 'pencentage',
        coords: {
          x1: angleCoords.x1 * width,
          y1: angleCoords.y1 * height,
          x2: angleCoords.x2 * width,
          y2: angleCoords.y2 * height,
        },
        colorStops: [...stops],
      });
    };
    // css转Fabric径向渐变（circle at x% y%，r2取圆心到最远角的距离铺满画布）
    const cssToFabricRadialGradient = (stops, width, height, positionX, positionY) => {
      const x1 = (positionX / 100) * width;
      const y1 = (positionY / 100) * height;
      const r2 = Math.max(
        Math.hypot(x1, y1),
        Math.hypot(width - x1, y1),
        Math.hypot(x1, height - y1),
        Math.hypot(width - x1, height - y1)
      );
      return new fabric.Gradient({
        type: 'radial',
        gradientUnits: 'pencentage',
        coords: {
          x1,
          y1,
          r1: 0,
          x2: x1,
          y2: y1,
          r2,
        },
        colorStops: [...stops],
      });
    };
    // Fabric渐变转css
    const fabricGradientToCss = (val, workspace) => {
      if (!val) return '';
      const angle = workspace.get(angleKey);
      const deg = angle != null ? angle : val.degree || 0;
      const colorStops = val.colorStops.map(
        (item) => `${item.color} ${Math.round(item.offset * 100)}%`
      );
      return `linear-gradient(${deg}deg, ${colorStops.join(', ')})`;
    };
    // 背景颜色设置（新 picker 输出 css 字符串→应用到 workspace）
    const applyBackgroundColor = (value) => {
      const workspace = getWorkspace();
      if (!workspace) return;
      const gradient = parseGradient(value);
      if (gradient) {
        const stops = gradient.config.stops.map((stop) => ({
          color: stop.color.toRgbString(),
          offset: stop.percentage / 100,
        }));
        if (gradient.mode === 'radial-gradient') {
          const radialGradient = cssToFabricRadialGradient(
            stops,
            workspace.width,
            workspace.height,
            gradient.config.positionX,
            gradient.config.positionY
          );
          workspace.set('fill', radialGradient);
        } else {
          const currentGradient = cssToFabricGradient(
            stops,
            workspace.width,
            workspace.height,
            gradient.config.angle
          );
          workspace.set('fill', currentGradient);
          workspace.set(angleKey, gradient.config.angle);
        }
      } else {
        workspace.set('fill', String(value).replace('NaN', ''));
      }
      canvasEditor.canvas.renderAll();
    };

    // 加载模板时回显颜色值 + 背景图
    const handleChangeColor = () => {
      const workspace = getWorkspace();
      if (!workspace) return;
      const fill = workspace.fill;
      if (typeof fill === 'string') {
        color.value = toHexA(fill);
      } else if (fill && fill.type === 'linear') {
        color.value = fabricGradientToCss(fill, workspace);
      } else if (fill && fill.type === 'radial') {
        // 从 coords 反推圆心百分比，回显为 css 径向渐变
        const coords = fill.coords;
        const px = Math.round((coords.x1 / workspace.width) * 100);
        const py = Math.round((coords.y1 / workspace.height) * 100);
        const colorStops = fill.colorStops.map(
          (item) => `${item.color} ${Math.round(item.offset * 100)}%`
        );
        color.value = `radial-gradient(circle at ${px}% ${py}%, ${colorStops.join(', ')})`;
      }
      // 背景图回显
      const bgInfo = canvasEditor.getBackgroundImage();
      if (bgInfo && bgInfo.src) {
        bgImageUrl.value = bgInfo.src;
        bgMode.value = bgInfo.mode || 'cover';
        const p = bgInfo.position;
        bgPosition.value = p && p.x != null ? p : { x: 0.5, y: 0.5 };
        bgOpacity.value = Math.round((bgInfo.opacity != null ? bgInfo.opacity : 1) * 100);
      } else {
        bgImageUrl.value = '';
      }
    };

    // 清空画布后重置背景图状态
    const handleClear = () => {
      bgImageUrl.value = '';
      bgMode.value = 'cover';
      bgPosition.value = { x: 0.5, y: 0.5 };
      bgOpacity.value = 100;
    };

    onMounted(() => {
      canvasEditor.on('loadJson', handleChangeColor);
      canvasEditor.on('clear', handleClear);
      // 撤销/重做恢复快照后重新回显（背景图可能被撤销移除或恢复）
      canvasEditor.on('historyRestore', handleChangeColor);
    });

    onUnmounted(() => {
      canvasEditor.off('loadJson', handleChangeColor);
      canvasEditor.off('clear', handleClear);
      canvasEditor.off('historyRestore', handleChangeColor);
    });

    return {
      isSelect,
      color,
      colorList,
      setColor,
      applyBackgroundColor,
      bgImageUrl,
      bgMode,
      bgPosition,
      bgOpacity,
      positions,
      dotStyle,
      openBackgroundImage,
      applyBackgroundSrc,
      removeBgImage,
      changeBgMode,
      setBgPosition,
      changeBgOpacity,
      fitCanvasToBg,
      bgIsVariable,
      bgVariableLabel,
    };
  },
};
</script>

<style scoped lang="less">
// 背景色
.bg-item {
  display: flex;
}
.color-control {
  background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAGUlEQVQYV2M4gwH+YwCGIasIUwhT25BVBADtzYNYrHvv4gAAAABJRU5ErkJggg==);
  background-repeat: repeat;
  ::v-deep .ivu-tooltip {
    display: flex;
  }
}
.color-bar {
  height: 30px;
  cursor: pointer;
  border: 2px solid #f6f7f9;
}
// 背景图片卡片
.bg-image-card {
  border: 1px solid #e8eaec;
  border-radius: 6px;
  padding: 10px;
  background: #f8f8f9;
}
// 空态：点击选择背景图（仅点击入口）
.bg-image-empty {
  height: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #808695;
  cursor: pointer;
  border: 1px solid #e8eaec;
  border-radius: 4px;
  background: #fff;
  transition: all 0.2s;
  .ivu-icon {
    color: #9ea7b4;
    transition: color 0.2s;
  }
  em {
    font-style: normal;
    font-size: 12px;
    color: #c5c8ce;
  }
  &:hover {
    border-color: #2d8cf0;
    color: #2d8cf0;
    background: #f6faff;
    .ivu-icon {
      color: #2d8cf0;
    }
  }
}
// 已设置：预览(左) + 操作列(右)
.bg-image-body {
  display: flex;
  gap: 10px;
  align-items: stretch;
}
.bg-image-preview {
  width: 96px;
  height: 132px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
  border: 1px solid #e8eaec;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.2s;
  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}
.bg-image-var-preview {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  box-sizing: border-box;
  color: #9099a3;
  font-size: 12px;
  text-align: center;
  word-break: break-all;
}
.bg-image-actions {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /deep/ .ivu-btn {
    flex: 1;
    width: 100%;
    margin-left: 0;
  }
}
// 设置区：与上方虚线分隔
.bg-image-settings {
  margin-top: 12px;
  padding-top: 4px;
  border-top: 1px dashed #e8eaec;
  /deep/ .ivu-form-item {
    margin-bottom: 8px;
  }
  /deep/ .ivu-form-item-content .ivu-select {
    width: 100%;
  }
}
// 对齐方式：3×3 网格，小点随对齐位置偏移
.bg-align-grid {
  display: grid;
  grid-template-columns: repeat(3, 30px);
  gap: 4px;
  width: fit-content;
}
.bg-align-cell {
  position: relative;
  width: 30px;
  height: 30px;
  border: 1px solid #dcdee2;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  &:hover {
    border-color: #2d8cf0;
    background: #f6faff;
  }
  &.active {
    border-color: #2d8cf0;
    background: #eaf4ff;
  }
  &.disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
.bg-align-dot {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2d8cf0;
}
.color-list {
  display: flex;
  flex-wrap: wrap;
  span {
    height: 30px;
    width: 30px;
    border-radius: 15px;
    border: 3px solid #fff;
    vertical-align: middle;
    cursor: pointer;
  }
}
</style>
