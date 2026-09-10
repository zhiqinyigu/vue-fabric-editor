<template>
  <div class="tool-panel">
    <Divider plain orientation="left">{{ $t('insertFile.insert') }}</Divider>
    <div class="tool-box">
      <span :title="$t('insertFile.insert_picture')" @click="insertTypeHand('insertImg')">
        <InsertImgIcon width="26" height="26"></InsertImgIcon>
        <span>{{ $t('insertFile.insert_picture_label') }}</span>
      </span>
      <span :title="$t('insertFile.insert_SVG')" @click="insertTypeHand('insertSvg')">
        <InsertSvgIcon width="26" height="26"></InsertSvgIcon>
        <span>{{ $t('insertFile.insert_SVG_label') }}</span>
      </span>
      <span :title="$t('insertFile.insert_SVGStr')" @click="insertTypeHand('insertSvgStrModal')">
        <InsertSvgStrIcon width="26" height="26"></InsertSvgStrIcon>
        <span>{{ $t('insertFile.insert_SVGStr_label') }}</span>
      </span>
    </div>
    <Divider plain orientation="left">{{ $t('text_elements') }}</Divider>
    <div class="tool-box">
      <span :draggable="true" @click="() => addText()" @dragend="addText">
        <TextIcon width="26" height="26"></TextIcon>
        <span>{{ $t('textTool.text') }}</span>
      </span>
      <span :draggable="true" @click="() => addTextBox()" @dragend="addTextBox">
        <TextBoxIcon width="26" height="26"></TextBoxIcon>
        <span>{{ $t('textTool.textBox') }}</span>
      </span>
      <span
        :class="state.isDrawingLineMode && state.lineType === 'pathText' && 'bg'"
        @click="pathTextDraw"
      >
        <TextPathIcon width="26" height="26"></TextPathIcon>
        <span>{{ $t('textTool.pathText') }}</span>
      </span>
    </div>
    <Divider plain orientation="left">{{ $t('common_elements') }}</Divider>
    <div class="tool-box">
      <span :draggable="true" @click="() => addRect()" @dragend="addRect">
        <RectIcon width="26" height="26"></RectIcon>
      </span>
      <span :draggable="true" @click="() => addCircle()" @dragend="addCircle">
        <CircleIcon width="26" height="26"></CircleIcon>
      </span>
      <span :draggable="true" @click="() => addTriangle()" @dragend="addTriangle">
        <TriangleIcon width="26" height="26"></TriangleIcon>
      </span>
      <!-- 多边形按钮 -->
      <span :draggable="true" @click="() => addPolygon()" @dragend="addPolygon">
        <PolygonIcon width="26" height="26"></PolygonIcon>
      </span>
    </div>
    <Divider plain orientation="left">{{ $t('draw_elements') }}</Divider>
    <div class="tool-box">
      <span
        :class="state.isDrawingLineMode && state.lineType === 'line' && 'bg'"
        @click="drawingLineModeSwitch('line')"
      >
        <Draw1Icon width="20" height="20"></Draw1Icon>
      </span>
      <span
        :class="state.isDrawingLineMode && state.lineType === 'arrow' && 'bg'"
        @click="drawingLineModeSwitch('arrow')"
      >
        <Draw2Icon width="20" height="20"></Draw2Icon>
      </span>
      <span
        :class="state.isDrawingLineMode && state.lineType === 'thinTailArrow' && 'bg'"
        @click="drawingLineModeSwitch('thinTailArrow')"
      >
        <Draw3Icon width="20" height="20"></Draw3Icon>
      </span>
      <span
        :class="state.isDrawingLineMode && state.lineType === 'polygon' && 'bg'"
        @click="drawPolygon"
      >
        <Draw4Icon width="20" height="20"></Draw4Icon>
      </span>
      <span
        :class="state.isDrawingLineMode && state.lineType === 'freeDraw' && 'bg'"
        @click="freeDraw"
      >
        <Icon type="md-brush" :size="22" />
      </span>
    </div>
    <Divider plain orientation="left">{{ $t('code_img') }}</Divider>
    <div class="tool-box">
      <span @click="canvasEditor.addQrCode">
        <QrCodeIcon></QrCodeIcon>
      </span>
      <span @click="canvasEditor.addBarcode">
        <BarCodeIcon></BarCodeIcon>
      </span>
    </div>
    <Divider plain orientation="left">{{ $t('advance_elements') }}</Divider>
    <div class="tool-box">
      <span :title="$t('insertFile.insert_JSON')" @click="insertTypeHand('insertJsonModal')">
        <InsertJsonIcon width="26" height="26"></InsertJsonIcon>
      </span>
    </div>
    <Modal
      v-model="insertState.showModal"
      :title="$t('insertFile.modal_tittle')"
      @on-ok="insertTypeHand('insertSvgStr')"
      @on-cancel="insertState.showModal = false"
    >
      <Input
        v-model="insertState.svgStr"
        show-word-limit
        type="textarea"
        :placeholder="$t('insertFile.insert_SVGStr_placeholder')"
      />
    </Modal>
    <Modal
      v-model="insertState.showJsonModal"
      :title="$t('insertFile.insert_JSON')"
      @on-ok="insertTypeHand('insertJson')"
      @on-cancel="insertState.showJsonModal = false"
    >
      <Input
        v-model="insertState.jsonStr"
        show-word-limit
        type="textarea"
        :placeholder="$t('insertFile.insert_JSON_placeholder')"
      />
    </Modal>
  </div>
</template>

<script>
import { reactive, onDeactivated } from '@vue/composition-api';
import { v4 as uuid } from 'uuid';
import { Message } from 'view-design';
import { getPolygonVertices } from '@/utils/math';
import { Utils } from '@/core/index';
import useSelect from '@/hooks/select';
import { isFixedLayerObject } from '@/core/utils/utils';
import CircleIcon from '@/assets/icon/tools/circle.svg';
import Draw1Icon from '@/assets/icon/tools/draw1.svg';
import Draw2Icon from '@/assets/icon/tools/draw2.svg';
import Draw3Icon from '@/assets/icon/tools/draw3.svg';
import Draw4Icon from '@/assets/icon/tools/draw4.svg';

import PolygonIcon from '@/assets/icon/tools/polygon.svg';
import RectIcon from '@/assets/icon/tools/rect.svg';
import TextIcon from '@/assets/icon/tools/text.svg';
import TextBoxIcon from '@/assets/icon/tools/textBox.svg';
import TextPathIcon from '@/assets/icon/tools/textPath.svg';
import TriangleIcon from '@/assets/icon/tools/triangle.svg';

import QrCodeIcon from '@/assets/icon/tools/qrCode.svg';
import BarCodeIcon from '@/assets/icon/tools/barCode.svg';
import InsertImgIcon from '@/assets/icon/tools/insertImg.svg';
import InsertSvgIcon from '@/assets/icon/tools/insertSvg.svg';
import InsertSvgStrIcon from '@/assets/icon/tools/insertSvgStr.svg';
import InsertJsonIcon from '@/assets/icon/tools/insertJson.svg';

import { useI18n } from '@/hooks/useI18n';

/**
 * 插入文件（图片 / SVG / SVG 字符串）。
 * 原 @/hooks/useInsertFile.js 集成于此。
 */
function useInsertFile() {
  const { t } = useI18n();
  const { getImgStr, selectFiles } = Utils;
  const { fabric, canvasEditor } = useSelect();
  const state = reactive({
    showModal: false,
    svgStr: '',
    showJsonModal: false,
    jsonStr: '',
  });

  // 插入图片文件
  function insertImgFile(file) {
    if (!file) throw new Error('file is undefined');
    const imgEl = document.createElement('img');
    imgEl.src = file;
    // 插入页面
    document.body.appendChild(imgEl);
    imgEl.onload = async () => {
      const imgItem = await canvasEditor.createImgByElement(imgEl);
      canvasEditor.addBaseType(imgItem, {
        scale: true,
      });
      imgEl.remove();
    };
  }

  // 插入SVG文件元素
  function insertSvgFile(svgFile) {
    if (!svgFile) throw new Error('file is undefined');
    fabric.loadSVGFromURL(svgFile, (objects, options) => {
      const item = fabric.util.groupSVGElements(objects, {
        ...options,
        name: 'defaultSVG',
        id: uuid(),
      });
      canvasEditor.addBaseType(item, {
        scale: true,
      });
    });
  }

  const HANDLEMAP = {
    // 插入图片
    insertImg: function () {
      selectFiles({ accept: 'image/*', multiple: true }).then((fileList) => {
        Array.from(fileList).forEach((item) => {
          getImgStr(item).then((file) => {
            insertImgFile(file);
          });
        });
      });
    },
    // 插入Svg
    insertSvg: function () {
      selectFiles({ accept: '.svg', multiple: true }).then((fileList) => {
        Array.from(fileList).forEach((item) => {
          getImgStr(item).then((file) => {
            insertSvgFile(file);
          });
        });
      });
    },
    // 弹出插入SVG字符串弹窗
    insertSvgStrModal: function () {
      state.svgStr = '';
      state.showModal = true;
    },
    // 插入字符串元素
    insertSvgStr: function () {
      fabric.loadSVGFromString(state.svgStr, (objects, options) => {
        const item = fabric.util.groupSVGElements(objects, {
          ...options,
          name: 'defaultSVG',
        });
        canvasEditor.addBaseType(item, {
          scale: true,
        });
      });
    },
    // 弹出插入Fabric元素JSON代码弹窗
    insertJsonModal: function () {
      state.jsonStr = '';
      state.showJsonModal = true;
    },
    // 插入Fabric标准元素JSON代码（用于编辑器无法直接实现的元素）
    insertJson: function () {
      let parsed;
      try {
        parsed = JSON.parse(state.jsonStr);
      } catch (e) {
        Message.error(t('insertFile.insert_JSON_error'));
        return;
      }
      const list = Array.isArray(parsed) ? parsed : [parsed];
      fabric.util.enlivenObjects(list, (objects) => {
        objects.forEach((item) => {
          canvasEditor.addBaseType(item, {
            scale: true,
          });
        });
      });
    },
  };

  const insertTypeHand = (type) => {
    const cb = HANDLEMAP[type];
    cb && typeof cb === 'function' && cb();
  };

  return {
    state,
    insertTypeHand,
  };
}

export default {
  name: 'Tools',
  components: {
    CircleIcon,
    Draw1Icon,
    Draw2Icon,
    Draw3Icon,
    Draw4Icon,
    PolygonIcon,
    RectIcon,
    TextIcon,
    TextBoxIcon,
    TextPathIcon,
    TriangleIcon,
    QrCodeIcon,
    BarCodeIcon,
    InsertImgIcon,
    InsertSvgIcon,
    InsertSvgStrIcon,
    InsertJsonIcon,
  },
  props: {
    defaultText: { type: String, default: '新建文本' },
    defaultTextbox: { type: String, default: '新建文本' },
  },
  setup(props) {
    const { fabric, canvasEditor } = useSelect();
    const { state: insertState, insertTypeHand } = useInsertFile();
    const LINE_TYPE = {
      line: 'line',
      arrow: 'arrow',
      thinTailArrow: 'thinTailArrow',
      polygon: 'polygon',
      freeDraw: 'freeDraw',
      pathText: 'pathText',
    };
    const state = reactive({
      isDrawingLineMode: false,
      lineType: false,
    });

    // 默认属性
    const defaultPosition = { shadow: '', fontFamily: 'arial' };

    const addText = (event) => {
      cancelDraw();
      const text = new fabric.IText(props.defaultText, {
        ...defaultPosition,
        fontSize: 80,
        fill: '#000000FF',
      });

      canvasEditor.addBaseType(text, { center: true, event });
    };

    const addTextBox = (event) => {
      cancelDraw();
      const text = new fabric.Textbox(props.defaultTextbox, {
        ...defaultPosition,
        splitByGrapheme: true,
        width: 400,
        fontSize: 80,
        fill: '#000000FF',
      });

      canvasEditor.addBaseType(text, { center: true, event });
    };

    const addTriangle = (event) => {
      cancelDraw();
      const triangle = new fabric.Triangle({
        ...defaultPosition,
        width: 400,
        height: 400,
        fill: '#92706BFF',
        name: '三角形',
      });
      canvasEditor.addBaseType(triangle, { center: true, event });
    };

    const addPolygon = (event) => {
      cancelDraw();
      const polygon = new fabric.Polygon(getPolygonVertices(5, 200), {
        ...defaultPosition,
        fill: '#CCCCCCFF',
        name: '多边形',
      });
      polygon.set({
        // 创建完设置宽高，不然宽高会变成自动的值
        width: 400,
        height: 400,
        // 关闭偏移
        pathOffset: {
          x: 0,
          y: 0,
        },
      });
      canvasEditor.addBaseType(polygon, { center: true, event });
    };

    const addCircle = (event) => {
      cancelDraw();
      const circle = new fabric.Circle({
        ...defaultPosition,
        radius: 150,
        fill: '#57606BFF',
        // id: uuid(),
        name: '圆形',
      });
      canvasEditor.addBaseType(circle, { center: true, event });
    };

    const addRect = (event) => {
      cancelDraw();
      const rect = new fabric.Rect({
        ...defaultPosition,
        fill: '#F57274FF',
        width: 400,
        height: 400,
        name: '矩形',
      });

      canvasEditor.addBaseType(rect, { center: true, event });
    };
    const drawPolygon = () => {
      const onEnd = () => {
        state.lineType = false;
        state.isDrawingLineMode = false;
        ensureObjectSelEvStatus(!state.isDrawingLineMode, !state.isDrawingLineMode);
      };
      if (state.lineType !== LINE_TYPE.polygon) {
        endConflictTools();
        endDrawingLineMode();
        state.lineType = LINE_TYPE.polygon;
        state.isDrawingLineMode = true;
        canvasEditor.beginDrawPolygon(onEnd);
        canvasEditor.endDraw();
        ensureObjectSelEvStatus(!state.isDrawingLineMode, !state.isDrawingLineMode);
      } else {
        canvasEditor.discardPolygon();
      }
    };

    const freeDraw = () => {
      if (state.lineType === LINE_TYPE.freeDraw) {
        canvasEditor.endDraw();
        state.lineType = false;
        state.isDrawingLineMode = false;
      } else {
        endConflictTools();
        endDrawingLineMode();
        state.lineType = LINE_TYPE.freeDraw;
        state.isDrawingLineMode = true;
        canvasEditor.startDraw({ width: 20 });
      }
    };

    // 路径文字：自由绘制一条路径（自动平滑），松手即生成挂在路径上的文本
    const pathTextDraw = () => {
      if (state.lineType === LINE_TYPE.pathText) {
        canvasEditor.endTextPathDraw();
        state.lineType = false;
        state.isDrawingLineMode = false;
        ensureObjectSelEvStatus(!state.isDrawingLineMode, !state.isDrawingLineMode);
      } else {
        endConflictTools();
        endDrawingLineMode();
        state.lineType = LINE_TYPE.pathText;
        state.isDrawingLineMode = true;
        ensureObjectSelEvStatus(!state.isDrawingLineMode, !state.isDrawingLineMode);
        canvasEditor.startTextPathDraw({
          defaultText: props.defaultText,
          defaultFontSize: 20,
          color: '#000000',
          lineColor: '#000000',
          width: 2,
          onCreated: (textObject) => {
            state.lineType = false;
            state.isDrawingLineMode = false;
            ensureObjectSelEvStatus(!state.isDrawingLineMode, !state.isDrawingLineMode);
            canvasEditor.canvas.setActiveObject(textObject);
            canvasEditor.canvas.renderAll();
          },
        });
      }
    };

    const endConflictTools = () => {
      canvasEditor.discardPolygon();
      canvasEditor.endDraw();
      canvasEditor.endTextPathDraw();
    };
    const endDrawingLineMode = () => {
      state.isDrawingLineMode = false;
      state.lineType = '';
      canvasEditor.setMode(state.isDrawingLineMode);
      canvasEditor.setLineType(state.lineType);
    };
    const drawingLineModeSwitch = (type) => {
      if ([LINE_TYPE.polygon, LINE_TYPE.freeDraw, LINE_TYPE.pathText].includes(state.lineType)) {
        endConflictTools();
      }
      if (state.lineType === type) {
        state.isDrawingLineMode = false;
        state.lineType = '';
      } else {
        state.isDrawingLineMode = true;
        state.lineType = type;
      }
      canvasEditor.setMode(state.isDrawingLineMode);
      canvasEditor.setLineType(type);
      ensureObjectSelEvStatus(!state.isDrawingLineMode, !state.isDrawingLineMode);
    };

    const ensureObjectSelEvStatus = (evented, selectable) => {
      canvasEditor.canvas.forEachObject((obj) => {
        // 系统层交互态固定：跳过，否则退出绘制模式时背景图会被解锁成普通图片可选中
        if (isFixedLayerObject(obj)) {
          return;
        }
        obj.selectable = selectable;
        obj.evented = evented;
      });
    };

    // 退出绘制状态
    const cancelDraw = () => {
      if (!state.isDrawingLineMode) return;
      state.isDrawingLineMode = false;
      state.lineType = '';
      canvasEditor.setMode(false);
      endConflictTools();
      ensureObjectSelEvStatus(true, true);
    };

    onDeactivated(() => {
      cancelDraw();
    });

    return {
      state,
      canvasEditor,
      insertState,
      insertTypeHand,
      addText,
      addTextBox,
      addTriangle,
      addPolygon,
      addCircle,
      addRect,
      drawPolygon,
      freeDraw,
      pathTextDraw,
      drawingLineModeSwitch,
    };
  },
};
</script>

<style scoped lang="less">
.tool-panel {
  padding-bottom: 20px;
}

.tool-box {
  display: flex;
  justify-content: space-around;
  gap: 8px;
  font-size: 12px;
  > span {
    flex: 1;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    padding: 5px 0;
    gap: 4px;
    background: #f6f6f6;
    cursor: pointer;

    &:hover {
      background: #edf9ff;
      svg {
        fill: #2d8cf0;
      }
    }
  }
  .bg {
    background: #d8d8d8;

    &:hover {
      svg {
        fill: #2d8cf0;
      }
    }
  }
}
.img {
  width: 20px;
}
</style>
