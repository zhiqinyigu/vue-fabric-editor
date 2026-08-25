<template>
  <div v-if="!isSelect">
    <AttrSection :title="$t('bgSeting.color')">
      <div class="bg-item">
        <Tooltip class="color-control" placement="top" theme="light">
          <div class="color-bar" :style="{ background: color }"></div>
          <template #content>
            <ColorPicker
              :value="color"
              :modes="['渐变', '纯色']"
              @update:value="(val) => (color = val)"
              @change="colorChange"
              @native-pick="dropColor"
            ></ColorPicker>
          </template>
        </Tooltip>
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
        <!-- 空态：点击或拖拽上传 -->
        <div
          v-if="!bgImageUrl"
          class="bg-image-empty"
          :class="{ 'is-dragover': bgDragging }"
          @click="uploadBgImage"
          @dragover.prevent="bgDragging = true"
          @dragleave.prevent="bgDragging = false"
          @drop.prevent="dropBgImage"
        >
          <Icon type="ios-cloud-upload-outline" size="34" />
          <span>{{ $t('bgSeting.uploadImage') }}</span>
          <em>{{ $t('bgSeting.uploadTip') }}</em>
        </div>

        <!-- 已设置：预览(左) + 操作列(右) -->
        <div v-else class="bg-image-body">
          <div
            class="bg-image-preview"
            :class="{ 'is-dragover': bgDragging }"
            title="点击更换"
            @click="uploadBgImage"
            @dragover.prevent="bgDragging = true"
            @dragleave.prevent="bgDragging = false"
            @drop.prevent="dropBgImage"
          >
            <img :src="bgImageUrl" alt="background" />
          </div>
          <div class="bg-image-actions">
            <Button size="small" icon="ios-refresh" @click="uploadBgImage">
              {{ $t('bgSeting.reUpload') }}
            </Button>
            <Button size="small" icon="ios-expand" @click="fitCanvasToBg">
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
import { ref, toRaw, onMounted, onUnmounted } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import { Utils } from '@/core/index';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import ColorPicker from './color-picker';
import { RGBA2HexA } from './color-picker/utils/color.js';

export default {
  name: 'BgBar',
  components: {
    AttrSection,
    ColorPicker,
  },
  setup() {
    const { isSelect, canvasEditor, fabric } = useSelect();
    const { selectFiles, getImgStr } = Utils;
    const angleKey = 'gradientAngle';

    // ===== 背景图片 =====
    const bgImageUrl = ref('');
    const bgMode = ref('cover');
    const bgOpacity = ref(100);
    const bgDragging = ref(false);

    // 统一的背景图设置入口（上传/拖拽共用）
    const setBgImage = (file) => {
      if (!file) return;
      getImgStr(file).then((dataUrl) => {
        bgImageUrl.value = dataUrl;
        canvasEditor.setBackgroundImage(dataUrl, bgMode.value);
        canvasEditor.setBackgroundOpacity(bgOpacity.value);
      });
    };

    const uploadBgImage = () => {
      selectFiles({ accept: 'image/*' }).then((files) => {
        if (files && files[0]) {
          setBgImage(files[0]);
        }
      });
    };

    const dropBgImage = (e) => {
      bgDragging.value = false;
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) {
        setBgImage(files[0]);
      }
    };

    const removeBgImage = () => {
      bgImageUrl.value = '';
      canvasEditor.removeBackgroundImage();
    };

    // 画布尺寸同步为背景图原始尺寸
    const fitCanvasToBg = () => {
      canvasEditor.fitCanvasToBackground();
    };

    const changeBgMode = (mode) => {
      if (bgImageUrl.value) {
        canvasEditor.setBackgroundImage(bgImageUrl.value, mode);
      }
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
    // 背景颜色设置（color-picker：纯色/渐变）
    const colorChange = (value) => {
      const workspace = getWorkspace();
      if (!workspace) return;
      const colorStr = String(value.color).replace('NaN', '');
      if (value.mode === '纯色') {
        workspace.set('fill', colorStr);
      } else if (value.mode === '渐变') {
        const currentGradient = cssToFabricGradient(
          toRaw(value.stops),
          workspace.width,
          workspace.height,
          value.angle
        );
        workspace.set('fill', currentGradient);
        workspace.set(angleKey, value.angle);
      }
      canvasEditor.canvas.renderAll();
    };
    // 取色器（纯色模式下生效）
    const dropColor = (value) => {
      const workspace = getWorkspace();
      if (!workspace || typeof value !== 'string') return;
      if (String(color.value).startsWith('linear-gradient')) return;
      workspace.set('fill', value);
      color.value = value;
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
      }
      // 背景图回显
      const bgInfo = canvasEditor.getBackgroundImage();
      if (bgInfo && bgInfo.src) {
        bgImageUrl.value = bgInfo.src;
        bgMode.value = bgInfo.mode || 'cover';
        bgOpacity.value = Math.round((bgInfo.opacity != null ? bgInfo.opacity : 1) * 100);
      } else {
        bgImageUrl.value = '';
      }
    };

    // 清空画布后重置背景图状态
    const handleClear = () => {
      bgImageUrl.value = '';
      bgMode.value = 'cover';
      bgOpacity.value = 100;
    };

    onMounted(() => {
      canvasEditor.on('loadJson', handleChangeColor);
      canvasEditor.on('clear', handleClear);
    });

    onUnmounted(() => {
      canvasEditor.off('loadJson', handleChangeColor);
      canvasEditor.off('clear', handleClear);
    });

    return {
      isSelect,
      color,
      colorList,
      setColor,
      colorChange,
      dropColor,
      bgImageUrl,
      bgMode,
      bgOpacity,
      bgDragging,
      uploadBgImage,
      dropBgImage,
      removeBgImage,
      changeBgMode,
      changeBgOpacity,
      fitCanvasToBg,
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
// 空态：虚线占位（点击或拖拽上传）
.bg-image-empty {
  height: 110px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #808695;
  cursor: pointer;
  border: 1px dashed #dcdee2;
  border-radius: 4px;
  background: #fff;
  transition: all 0.2s;
  .ivu-icon {
    color: #c5c8ce;
    transition: color 0.2s;
  }
  em {
    font-style: normal;
    font-size: 12px;
    color: #c5c8ce;
  }
  &:hover,
  &.is-dragover {
    border-color: #2d8cf0;
    color: #2d8cf0;
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
  &.is-dragover {
    border-color: #2d8cf0;
  }
  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
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
