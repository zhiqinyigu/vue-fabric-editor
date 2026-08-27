<template>
  <div class="fabric-poster pos-r">
    <template v-if="posterSrc || background || backgroundColor || useFabric">
      <div
        class="preview-container"
        :class="{ 'visibility-hidden': !debug }"
        :style="[
          {
            overflow: ' hidden',
            position: ' absolute',
            top: ' -9999px',
            left: ' -9999px',
          },
          previewStyle,
        ]"
      >
        <canvas ref="canvas"></canvas>
      </div>
      <div v-if="errrorText" class="preview-error color-red">{{ errrorText }}</div>
      <Spinner v-else-if="!posterSrc" :theme="spinnerTheme" />
      <img
        v-show="posterSrc && (!waitPreviewLoadMeta || metadataLoaded)"
        ref="img"
        :class="[
          'preview-img full-width block pos-r',
          previewClassName,
          !posterSrc || debug ? 'visibility-hidden' : '',
        ]"
        :src="posterSrc"
        crossOrigin="Anonymous"
        alt=""
        @load="emitLoad"
        @click="emitClick"
      />
    </template>
  </div>
</template>
<script>
import UrlParse from 'url-parse';
import { calculateRatio } from '@s/utils/web-helper';
import userMixins from '@/mixins/user-mixins';
import { network } from '@/utils/network';
import { createSingletonPattern, detachVoid, pick, templateStringEvaluation } from '@/utils';
import Spinner from '@s/components/spinner.vue';
import { packIntoPromise, parseExp } from '@s/utils';

let _updateId = 0;
let fabric;
const expReg = /^\s*\{([\S\s]+)\}\s*$/;

const loadFabric = createSingletonPattern(function loadFabric() {
  return import('fabric').then((e) => {
    fabric = e.fabric;

    fabric.EllipsisTextbox = fabric.util.createClass(fabric.Textbox, {
      type: 'EllipsisTextbox',
      initDimensions() {
        this.callSuper('initDimensions');
        const self = this;
        const clipPathHeight = parseExp(self.clipPath, 'height');
        if (self.height && clipPathHeight) {
          const maxLineIndex = Math.round(clipPathHeight / (self.fontSize * self.lineHeight)) - 1;
          if (maxLineIndex < 0 || maxLineIndex + 1 >= self._textLines.length) return;

          const ellipsis = '...';
          const ellipsisWidth = self._measureWord(ellipsis, 0, 0);
          let wordWidth = 0;

          while (ellipsisWidth > wordWidth && self._textLines[maxLineIndex].length) {
            wordWidth += self._measureWord(self._textLines[maxLineIndex].pop(), 0, 0);
          }

          self._textLines[maxLineIndex].push(ellipsis);
        }
      },
      // initialize: function(text, options) {
      //   this.callSuper('initialize', text, options);
      //   // this.set('label', options.label || ''); // 设置 label ，默认值是空
      // },
      // toObject: function() {
      //   return fabric.util.object.extend(this.callSuper('toObject'), {
      //     name: this.get('name')
      //   });
      // },
      // _render: function(ctx) {
      //   this.callSuper('_render', ctx);
      // }
    });

    fabric.EllipsisTextbox.fromObject = function (object, callback) {
      return fabric.Object._fromObject('EllipsisTextbox', object, callback, 'text');
    };
  });
});

function loadImage(src) {
  return new Promise((resolve, reject) => {
    var img = new Image();

    if (src.indexOf('data:') !== 0) {
      src = UrlParse(src, true);
      if (!('v' in src.query)) {
        src.query.v = Date.now();
      }
      src = src.toString();
    }

    img.onload = () => resolve(img);
    img.onerror = (error) => reject({ img, error });

    img.crossOrigin = 'Anonymous';
    img.src = src;

    if (img.complete) {
      resolve(img);
    }
  });
}

function evaluateExpression(expression, context) {
  // 创建一个函数，该函数的参数是上下文对象的所有键
  const keys = Object.keys(context);
  const values = keys.map((key) => context[key]);

  // 使用Function构造函数创建一个函数，并执行表达式
  const func = new Function(...keys, `return ${expression};`);
  return func(...values);
}

function calculateCanvasSize(objects) {
  let maxWidth = 0;
  let maxHeight = 0;

  objects.forEach((obj) => {
    const rect = obj.getBoundingRect();
    const clipRect = (obj.clipPath && obj.clipPath.getBoundingRect()) || {
      ...rect,
      width: Infinity,
      height: Infinity,
    };
    const objRight = rect.left + Math.min(rect.width, clipRect.width);
    const objBottom = rect.top + Math.min(rect.height, clipRect.height);

    if (objRight > maxWidth) {
      maxWidth = objRight;
    }
    if (objBottom > maxHeight) {
      maxHeight = objBottom;
    }
  });

  return { width: maxWidth, height: maxHeight };
}

async function resolveObjExpression(obj, scope) {
  const { type } = obj;

  obj.hasControls = false;
  obj.hasBorders = false;

  if (type === 'image') {
    obj.src = templateStringEvaluation(obj.src, scope, ['{', '}']);
    let img;
    const cbQueue = [];
    const pickExpCallback = function (obj) {
      for (let key in obj) {
        const exp = obj[key];
        if (typeof exp === 'string' && expReg.test(exp)) {
          cbQueue.push(() => {
            obj[key] = evaluateExpression(expReg.exec(exp)[1], img);
          });
        } else if (typeof exp === 'object' && exp) {
          pickExpCallback(exp);
        }
      }
    };

    // 遍历obj，找出所有表达式，并包装成回调队列
    pickExpCallback(obj);

    // 有表达式需要执行的话，进行loadImage
    if (cbQueue.length) {
      img = await loadImage(obj.src);
      img = pick(img, ['naturalWidth', 'naturalHeight']);
      cbQueue.forEach((fn) => fn());
    }
  } else if (type === 'text' || type === 'textbox' || type === 'ellipsis-textbox') {
    obj.text = templateStringEvaluation(obj.text, scope, ['{', '}']);
  } else if (type === 'group') {
    obj.objects.forEach(async (obj) => {
      await resolveObjExpression(obj, scope);
    });
  }
}

const demoPreset = {
  createText(text, textIndex) {
    return detachVoid({
      role: textIndex,
      type: 'text',
      originX: 'left',
      originY: 'top',
      left: +text.x,
      top: +text.y,
      fill: text.color,
      text: text.text,
      textAlign: text.align || '',
      fontSize: +text.size,
      fontWeight: text.fontWeight || '',
      fontFamily: 'Arial, sans-serif, Microsoft YaHei',
      hasControls: false,
      hasBorders: false,

      ...(text.splitByGrapheme
        ? {
            type: 'ellipsis-textbox',
            splitByGrapheme: true,
            width: +text.width,
            editable: false,
            cursorWidth: 0,
            ...(+text.height
              ? {
                  clipPath: {
                    type: 'rect',
                    absolutePositioned: true,
                    paintFirst: 'fill',
                    originX: 0,
                    originY: 0,
                    left: +text.x,
                    top: +text.y,
                    width: +text.width,
                    height: +text.height,
                  },
                }
              : null),
          }
        : null),

      ...(+text.lineHeight
        ? {
            lineHeight: +text.lineHeight,
          }
        : null),
    });
  },

  async createImage(src, params, radius) {
    const img = await loadImage(src);

    return {
      crossOrigin: 'anonymous',
      originX: 'left',
      originY: 'top',
      ...params,
      type: 'image',
      src: img.src,
      scaleX: params && params.width ? params.width / img.naturalWidth : 1,
      scaleY: params && params.height ? params.height / img.naturalHeight : 1,
      width: img.naturalWidth,
      height: img.naturalHeight,

      ...(radius
        ? {
            clipPath: {
              paintFirst: 'fill',
              fill: 'rgb(0,0,0)',
              originX: 'center',
              originY: 'center',
              type: 'circle',
              width: img.naturalWidth,
              height: img.naturalHeight,
              radius: img.naturalWidth / 2,
            },
          }
        : null),
    };
  },
  async createAvatar(src, params, radius) {
    const img = await loadImage(src);
    const size = img.naturalHeight < img.naturalWidth ? img.naturalHeight : img.naturalWidth;
    return {
      crossOrigin: 'anonymous',
      originX: 'left',
      originY: 'top',
      ...params,
      type: 'image',
      src: img.src,
      scaleX: params && params.height ? params.height / size : 1,
      scaleY: params && params.height ? params.height / size : 1,
      width: size,
      height: size,

      ...(radius
        ? {
            clipPath: {
              paintFirst: 'fill',
              fill: 'rgb(0,0,0)',
              originX: 'center',
              originY: 'center',
              type: 'circle',
              width: size,
              height: size,
              radius: size / 2,
            },
          }
        : null),
    };
  },
};

export default {
  components: {
    Spinner,
  },
  mixins: [userMixins],
  props: {
    posterConfig: Object,
    scope: Object, // 字符串的模板作用域
    spinnerTheme: String,
    shareCode: { type: String },
    previewClassName: String,
    shareUrl: {
      type: [String, Function],
      default: location.href,
    },
    waitPreviewLoadMeta: Boolean,
    needLogin: { type: Boolean, default: true },
  },
  data() {
    return {
      metadataLoaded: false,
      background: '',
      backgroundColor: '',
      useFabric: false,
      posterSrc: '',
      previewStyle: {},
      debug: false, // 展示canvas，不展示图片。开发调试用
      error: null,
    };
  },
  computed: {
    errrorText() {
      const { error } = this;
      return typeof error === 'string' ? error : error?.message;
    },
  },
  watch: {
    posterConfig: {
      handler: 'updateCanvas',
    },
  },

  mounted() {
    const vm = this;
    const { background, backgroundColor, useFabric } = vm.posterConfig;
    const useColor = !background && backgroundColor;
    const loadBackground =
      useColor || useFabric
        ? packIntoPromise(backgroundColor)
        : loadImage(vm.posterConfig.background);

    Promise.all([loadBackground, loadFabric()]).then(
      ([img]) => {
        // const srcObj = urlParse(img.src, true);
        // srcObj.query.ve = Date.now(); // 跨域的图片被避免缓存
        // vm.background = srcObj.toString();

        if (useFabric) {
          vm.useFabric = true;
        } else if (useColor) {
          vm.backgroundColor = img;
        } else {
          vm.background = img.src;
        }

        vm.$nextTick(function () {
          vm.$canvas = new fabric.StaticCanvas(vm.$refs.canvas);
          vm.$canvas.selection = false;

          vm.updateCanvas();

          vm.$canvas.on('object:modified', (options) => {
            vm.$emit('modified', options.target);
          });
        });
      },
      ({ img }) => {
        img && vm.$emit('error', { message: `海报底图加载失败：${img.src}` });
      }
    );
  },
  beforeDestroy() {
    this.$canvas && this.$canvas.dispose();
  },

  methods: {
    updatePosition() {
      const img = this.$refs.img;
      const { offsetWidth, clientWidth } = img;

      this.previewStyle = {
        top: 0,
        left: 0,
        width: clientWidth + 'px',
        height: (offsetWidth / this.$canvas.getWidth()) * this.$canvas.getHeight() + 'px',
      };
    },
    async getShareCode() {
      const vm = this;
      if (this.shareCode) return { src: this.shareCode };
      const url = typeof vm.shareUrl === 'function' ? vm.shareUrl() : vm.shareUrl;
      console.log('海报分享链接', url);
      return await import('@/libs/qrcode2.js').then(({ default: qrcode }) => qrcode.image(url));
    },
    async getAvatarImage() {
      const vm = this;
      if (vm.userInfo.userKey || vm.needLogin) {
        return network('/courseApi/getUserBas64Avatar').then(
          (str) => (str ? 'data:image/jpeg;base64,' + str : vm.defaultAvatarSrc),
          () => import('@/assets/default_avatar.png').then((e) => e.default)
        );
      } else {
        return import('@/assets/default_avatar.png').then((e) => e.default);
      }
    },
    async updateCanvas() {
      this.error = null;

      try {
        let localUpdateId;
        const vm = this;
        const { background, backgroundColor, posterConfig, useFabric } = this;
        const $canvas = this.$canvas;
        const scope = { ...vm.userInfo, ...vm.scope };
        const setCanvasSize = (width, height) => {
          $canvas.setWidth(width);
          $canvas.setHeight(height);
          vm.updatePosition();
        };

        if (!$canvas) return null;
        $canvas.clear();

        if (background || backgroundColor || useFabric) {
          localUpdateId = ++_updateId;
          const state = { objects: [], backgroundImage: null };

          // 背景
          if (background) {
            state.backgroundImage = await demoPreset.createImage(background);
          }

          if (localUpdateId !== _updateId) return;

          const posterWidth = state.backgroundImage
            ? state.backgroundImage.width
            : posterConfig.width;
          const posterHeight = state.backgroundImage
            ? state.backgroundImage.height
            : posterConfig.height;
          const ratio = calculateRatio(posterWidth);

          const hasSize = posterWidth || posterHeight;
          if (hasSize) {
            setCanvasSize(posterWidth, posterHeight);
          }

          vm.$emit('update');

          // $canvas.setZoom(vm.$refs.img.clientWidth / posterWidth);

          // 头像
          const avatarConfig = (posterConfig.avatarPosition || '').split(',').map(Number);
          const avatar = await vm.getAvatarImage();
          if (avatar) {
            scope.avatar = avatar;
          }

          if (avatarConfig[2]) {
            try {
              state.objects.push(
                await demoPreset.createAvatar(
                  avatar,
                  {
                    left: avatarConfig[0],
                    top: avatarConfig[1],
                    width: avatarConfig[2],
                    height: avatarConfig[2],
                  },
                  true
                )
              );
            } catch (e) {
              console.error(e);
            }
          }

          // 文本
          const nickNameConfig = (posterConfig.nickNamePosition || '')
            .split(',')
            .filter((str) => '' !== str);
          [
            nickNameConfig.length
              ? {
                  color: nickNameConfig[2],
                  text: scope.nickname,
                  x: nickNameConfig[0] || 0,
                  y: nickNameConfig[1] || 0,
                  size: 12 * ratio,
                }
              : null,
            ...(posterConfig.text || []),
          ].forEach(function (item, i) {
            item &&
              state.objects.push(
                demoPreset.createText(
                  { ...item, text: templateStringEvaluation(item.text, scope, ['{', '}']) },
                  i
                )
              );
          });

          // [
          //   {
          //     text: '用户昵称',
          //     x: nickNameConfig[0],
          //     y: nickNameConfig[1],
          //     color: nickNameConfig[2],
          //     size: 12 * ratio,
          //   },
          // ]
          //   // .concat(texts)
          //   .forEach((item, i) => {
          //     state.objects.push(demoPreset.createText(item, i === 0 ? 'nickname' : i - 1));
          //   });

          // 图片
          await Promise.all(
            (posterConfig.img || []).map(function (item) {
              const src = templateStringEvaluation(item.src, scope, ['{', '}']);
              return demoPreset
                .createImage(src, {
                  left: +item.x,
                  top: +item.y,
                  width: item.width,
                  height: item.height,
                })
                .catch(() => {
                  window.pushKeyframeLog(`海报素材加载失败：${src}`);
                });
            })
          ).then((list) => state.objects.push(...list.filter(Boolean)));

          // 二维码
          const qrCodeConfig = (posterConfig.qrCodePosition || '').split(',').map(Number);
          const qrcodeImage = await vm.getShareCode();
          if (qrcodeImage) {
            scope.$posterQrcode = qrcodeImage.src || '';
          }

          if (qrCodeConfig[2]) {
            state.objects.push(
              await demoPreset.createImage(qrcodeImage.src, {
                left: qrCodeConfig[0],
                top: qrCodeConfig[1],
                width: qrCodeConfig[2],
                height: qrCodeConfig[2],
              })
            );
          }

          const jsonList = posterConfig.jsonList || [];
          for (const item of jsonList) {
            const i = jsonList.indexOf(item);
            if (item.json) {
              try {
                const obj = JSON.parse(item.json);
                obj.role = 'jsonList-' + i;
                await resolveObjExpression(obj, scope);

                state.objects.splice(
                  item.moveTo !== '' && !isNaN(item.moveTo) ? item.moveTo : state.objects.length,
                  0,
                  obj
                );
              } catch (e) {
                console.error(e);
              }
            }
          }

          console.log(state);
          localUpdateId = ++_updateId;
          $canvas.loadFromJSON(state, () => {
            if (localUpdateId === _updateId) {
              if (backgroundColor) {
                $canvas.backgroundColor =
                  typeof backgroundColor === 'function'
                    ? backgroundColor(fabric, $canvas)
                    : backgroundColor;
              }
              if (!hasSize) {
                const { width, height } = calculateCanvasSize($canvas.getObjects());
                setCanvasSize(width, height);
              }

              vm.$emit('before-render', { canvas: $canvas, fabric });
              $canvas.renderAll();
              $canvas.calcOffset();

              vm.posterSrc = $canvas.toDataURL({
                top: 0,
                left: 0,
                width: posterWidth,
                height: posterHeight,
              });

              vm.$nextTick(function () {
                vm.metadataLoaded = false;
                vm.$emit('render', vm.posterSrc);
                loopCheckImageRect();

                function loopCheckImageRect() {
                  setTimeout(() => {
                    if (vm.$refs.img.naturalWidth && vm.$refs.img.naturalHeight) {
                      if (!vm.metadataLoaded) {
                        vm.emitLoadedmetadata();
                      }
                    } else {
                      loopCheckImageRect();
                    }
                  }, 30);
                }
              });
              // vm.debug &&
              //   setTimeout(function () {
              //     const text = new fabric.Textbox(
              //       '首先要道一句祝贺！你怀抱初心，达成给自己的承诺，坚持完成「情绪行动营」，你做到了！',
              //       {
              //         stroke: 'red',
              //         fill: 'blue',
              //         width: 100,
              //         top: 0,
              //         left: 0,
              //         fontSize: 18,
              //         lineHeight: 1,
              //         fontWeight: 'bold',
              //         textAlign: 'left', // 文字对齐
              //         lockRotation: true, // 禁止旋转
              //         lockScalingY: true, // 禁止Y轴伸缩
              //         lockScalingFlip: true, // 禁止负值反转
              //         splitByGrapheme: true, // 拆分中文，可以实现自动换行
              //         objectCaching: false,
              //       }
              //     );

              //     $canvas.add(text);
              //     console.log($canvas.toJSON())
              //   }, 2000);
            }
          });
        }
      } catch (e) {
        console.error(e);
        if ('img' in e && 'error' in e) {
          this.emitError(`素材加载失败：${e.img.src}`);
        } else {
          this.emitError({ ...e, message: e.message });
        }
      }
    },
    emitClick(e) {
      console.log(e);
      this.$emit('img-click', e);
    },
    emitLoad(e) {
      if (!this.metadataLoaded) {
        this.emitLoadedmetadata();
      }
      this.$emit('img-load', e);
    },
    emitLoadedmetadata() {
      this.metadataLoaded = true;
      this.$emit('img-load-meta', this.$refs.img);
    },
    emitError(e) {
      this.error = e;
      this.$emit('error', e);
    },
  },
};
</script>
