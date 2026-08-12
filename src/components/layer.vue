<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:20:43
 * @Description: 图层面板
-->

<template>
  <div class="box">
    <template v-if="list.length">
      <Divider plain orientation="left">{{ $t('layers') }}</Divider>
      <div class="layer-box">
        <div
          v-for="item in list"
          :key="item.id"
          :class="isSelect(item) && 'active'"
          @click="select(item.id)"
        >
          <Row class="ellipsis">
            <Col span="20">
              <Tooltip :content="item.name || item.text || item.type" placement="left">
                <span :class="isSelect(item) && 'active'" v-html="iconType(item.type)"></span>
                | {{ textType(item.type, item) }}
              </Tooltip>
            </Col>
            <Col span="4">
              <Button
                long
                :icon="item.isLock ? 'md-lock' : 'md-unlock'"
                type="text"
                @click="doLock(item)"
              ></Button>
            </Col>
          </Row>
        </div>
      </div>
      <!-- 层级调整按钮 -->
      <div class="btn-box">
        <ButtonGroup v-show="isOne" size="small">
          <Button @click="up"><span v-html="btnIconType('up')"></span></Button>
          <Button @click="down"><span v-html="btnIconType('down')"></span></Button>
          <Button @click="upTop"><span v-html="btnIconType('upTop')"></span></Button>
          <Button @click="downTop"><span v-html="btnIconType('downTop')"></span></Button>
        </ButtonGroup>
      </div>
    </template>
    <template v-else>
      <p class="empty-text">暂无图层</p>
    </template>
  </div>
</template>

<script>
import { ref, unref, onMounted } from '@vue/composition-api';
import { uniqBy } from 'lodash-es';
import useSelect from '@/hooks/select';
import groupIcon from '!!raw-loader!@/assets/icon/layer/group.svg';
import textbox from '!!raw-loader!@/assets/icon/layer/textbox.svg';
import iText from '!!raw-loader!@/assets/icon/layer/iText.svg';
import imageIcon from '!!raw-loader!@/assets/icon/layer/image.svg';
import rectIcon from '!!raw-loader!@/assets/icon/layer/rect.svg';
import circleIcon from '!!raw-loader!@/assets/icon/layer/circle.svg';
import triangleIcon from '!!raw-loader!@/assets/icon/layer/triangle.svg';
import polygonIcon from '!!raw-loader!@/assets/icon/layer/polygon.svg';

import upIcon from '!!raw-loader!@/assets/icon/layer/up.svg';
import downIcon from '!!raw-loader!@/assets/icon/layer/down.svg';
import upTopIcon from '!!raw-loader!@/assets/icon/layer/upTop.svg';
import downTopIcon from '!!raw-loader!@/assets/icon/layer/downTop.svg';

export default {
  name: 'Layer',
  setup() {
    const { canvasEditor, isOne, fabric, mixinState } = useSelect();

    const list = ref([]);

    // 是否选中元素
    const isSelect = (item) => {
      return item.id === mixinState.mSelectId || mixinState.mSelectIds.includes(item.id);
    };

    // 图层类型图标
    const iconType = (type) => {
      const iconType = {
        group: groupIcon,
        textbox: textbox,
        'i-text': iText,
        image: imageIcon,
        rect: rectIcon,
        circle: circleIcon,
        triangle: triangleIcon,
        polygon: polygonIcon,
      };
      const defaultIcon = '';
      return iconType[type] || defaultIcon;
    };
    const textType = (type, item) => {
      if (type.includes('text')) {
        return item.name || item.text;
      }
      const typeText = {
        group: '组合',
        image: '图片',
        rect: '矩形',
        circle: '圆形',
        triangle: '三角形',
        polygon: '多边形',
        path: '路径',
      };
      return typeText[type] || '默认元素';
    };
    // 选中元素
    const select = (id) => {
      const info = canvasEditor.canvas.getObjects().find((item) => item.id === id);
      canvasEditor.canvas.discardActiveObject();
      canvasEditor.canvas.setActiveObject(info);
      canvasEditor.canvas.requestRenderAll();
    };

    // 按钮类型
    const btnIconType = (type) => {
      const iconType = {
        up: upIcon,
        down: downIcon,
        upTop: upTopIcon,
        downTop: downTopIcon,
      };
      return iconType[type];
    };
    const up = () => {
      canvasEditor.up();
    };
    const upTop = () => {
      canvasEditor.toFront();
    };
    const down = () => {
      canvasEditor.down();
    };
    const downTop = () => {
      canvasEditor.toBack();
    };

    const getList = () => {
      // 不改原数组 反转
      list.value = [
        ...canvasEditor.canvas.getObjects().filter((item) => {
          // return item;
          // 过滤掉辅助线、工作区、背景图
          return !(
            item instanceof fabric.GuideLine ||
            item.id === 'workspace' ||
            item.id === 'backgroundImage'
          );
        }),
      ]
        .reverse()
        .map((item) => {
          const { type, id, name, text, selectable } = item;
          return {
            type,
            id,
            name,
            text,
            isLock: !selectable,
          };
        });
      list.value = uniqBy(unref(list), 'id');
    };

    const doLock = (item) => {
      select(item.id);
      item.isLock ? canvasEditor.unLock() : canvasEditor.lock();
      canvasEditor.canvas.discardActiveObject();
    };

    onMounted(() => {
      getList();
      canvasEditor.canvas.on('after:render', getList);
    });

    return {
      list,
      isOne,
      isSelect,
      iconType,
      textType,
      select,
      btnIconType,
      up,
      upTop,
      down,
      downTop,
      doLock,
    };
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped lang="less">
/deep/ .ivu-tooltip-inner {
  white-space: normal;
}

/deep/ .ivu-tooltip {
  display: block;
}

// :deep(.ivu-tooltip-rel) {
//   display: block;
// }
.box {
  width: 100%;
}
.layer-box {
  height: calc(100vh - 170px);
  overflow-y: auto;
  margin-bottom: 5px;
  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  & > div {
    padding: 0px 5px;
    margin: 3px 0;
    background: #f7f7f7;
    color: #c8c8c8;
    border-radius: 3px;
    font-size: 14px;
    line-height: 28px;
    &.active {
      color: #2d8cf0;
      background: #f0faff;
      font-weight: bold;
    }
  }
}
.btn-box {
  width: 100%;
  margin-bottom: 20px;
  background: #f3f3f3;
  .ivu-btn-group {
    display: flex;
  }
  .ivu-btn-group > .ivu-btn {
    flex: 1;
  }
}
svg {
  vertical-align: text-top;
}
/deep/ .ivu-divider-plain {
  &.ivu-divider-with-text-left {
    margin: 10px 0;
    font-size: 16px;
    font-weight: bold;
    color: #000000;
  }
}
.empty-text {
  width: 100%;
  text-align: center;
  padding-top: 10px;
  color: #999;
}
</style>

<style lang="less">
span {
  svg {
    vertical-align: middle;
  }
  &.active {
    svg.icon {
      fill: #2d8cf0;
    }
  }
}
</style>
