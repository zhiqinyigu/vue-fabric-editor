/*
 * 文本框，修改两端对齐逻辑 + 尺寸锁（裁剪到框）与省略号能力
 * - 尺寸锁：在 _render 中手动 clip 到 [±w/2, ±h/2]（与文本渲染空间一致，避免 fabric clipPath 缓存错位）
 * - 控制手柄：直接操作 width / frameHeight，而非缩放
 */
import { fabric } from 'fabric';

var controlsUtils = fabric.controlsUtils;

// 宽度手柄（ml/mr）：直接改 obj.width；顶部恒固定（自动高度变化不产生 Y 漂移），旋转感知
function changeTextWidth(eventData, transform, x, y) {
    var target = transform.target;
    var localPoint = controlsUtils.getLocalPoint(transform, transform.originX, transform.originY, x, y);
    var oldW = target.width;
    var newW = Math.max(Math.abs(localPoint.x), 0);
    // 拖 ml（左边缘）锚定右上角，拖 mr（右边缘）锚定左上角（即 origin 点）→ 顶部始终固定
    var ox = transform.originX === 'right' ? 'right' : 'left';
    var anchor = target.translateToOriginPoint(target.getCenterPoint(), ox, 'top');
    target.set('width', newW);
    target.setPositionByOrigin(anchor, ox, 'top');
    return oldW !== target.width;
}
// 高度手柄（mt/mb）：直接改 frameHeight（尺寸锁开启时生效）
function changeTextHeight(eventData, transform, x, y) {
    var target = transform.target;
    if (!target.clipEnabled) {
        return false;
    }
    var localPoint = controlsUtils.getLocalPoint(transform, transform.originX, transform.originY, x, y);
    var oldH = target.frameHeight;
    var newH = Math.max(Math.abs(localPoint.y), 0);
    // 拖 mt（上边缘）：下边缘锚定；拖 mb（下边缘）：上边缘即 origin 点，天然锚定
    var anchor = transform.originY === 'bottom' ? target.translateToOriginPoint(target.getCenterPoint(), transform.originX, transform.originY) : null;
    target.setFrameHeight(newH);
    if (anchor) {
        target.setPositionByOrigin(anchor, transform.originX, transform.originY);
    }
    return oldH !== target.frameHeight;
}
// 角点（tl/tr/bl/br）：自由修改宽度与高度
function changeTextSize(eventData, transform, x, y) {
    var target = transform.target;
    var localPoint = controlsUtils.getLocalPoint(transform, transform.originX, transform.originY, x, y);
    var oldW = target.width;
    var oldH = target.clipEnabled ? target.frameHeight || target.height : null;
    var newW = Math.max(Math.abs(localPoint.x), 0);
    var newH = target.clipEnabled ? Math.max(Math.abs(localPoint.y), 0) : null;

    if (target.clipEnabled) {
        // 对角固定：先记录锚点（画布坐标），改尺寸后恢复该点
        var anchor = target.translateToOriginPoint(target.getCenterPoint(), transform.originX, transform.originY);
        target.set('width', newW);
        target.setFrameHeight(newH);
        target.setPositionByOrigin(anchor, transform.originX, transform.originY);
    }
    else {
        // 自动高度：顶部恒固定（Y 不漂移），高度向下生长，仅改宽度；旋转感知
        var ox = transform.originX === 'right' ? 'right' : 'left';
        var anchor = target.translateToOriginPoint(target.getCenterPoint(), ox, 'top');
        target.set('width', newW);
        target.setPositionByOrigin(anchor, ox, 'top');
    }
    return true;
}

function makeTextControls() {
    var base = fabric.Textbox.prototype.controls;
    var controls = {};
    for (var key in base) {
        controls[key] = base[key];
    }
    var cw = controlsUtils.wrapWithFireEvent('resizing', changeTextWidth);
    var ch = controlsUtils.wrapWithFireEvent('resizing', changeTextHeight);
    var cs = controlsUtils.wrapWithFireEvent('resizing', changeTextSize);
    var scaleSkewCursor = controlsUtils.scaleSkewCursorStyleHandler;
    var scaleCursor = controlsUtils.scaleCursorStyleHandler;
    controls.ml = new fabric.Control({ x: -0.5, y: 0, cursorStyleHandler: scaleSkewCursor, actionHandler: cw, actionName: 'resizing' });
    controls.mr = new fabric.Control({ x: 0.5, y: 0, cursorStyleHandler: scaleSkewCursor, actionHandler: cw, actionName: 'resizing' });
    controls.mt = new fabric.Control({ x: 0, y: -0.5, cursorStyleHandler: scaleSkewCursor, actionHandler: ch, actionName: 'resizing' });
    controls.mb = new fabric.Control({ x: 0, y: 0.5, cursorStyleHandler: scaleSkewCursor, actionHandler: ch, actionName: 'resizing' });
    // mt/mb 可见性始终由 clipEnabled 派生（尺寸锁关闭=高度自适应，隐藏上下手柄）
    // 覆盖 Control.getVisibility，避免依赖 selection 事件设置 _controlsVisibility
    controls.mt.getVisibility = function (object) {
        return !!object.clipEnabled;
    };
    controls.mb.getVisibility = function (object) {
        return !!object.clipEnabled;
    };
    controls.tl = new fabric.Control({ x: -0.5, y: -0.5, cursorStyleHandler: scaleCursor, actionHandler: cs, actionName: 'resizing' });
    controls.tr = new fabric.Control({ x: 0.5, y: -0.5, cursorStyleHandler: scaleCursor, actionHandler: cs, actionName: 'resizing' });
    controls.bl = new fabric.Control({ x: -0.5, y: 0.5, cursorStyleHandler: scaleCursor, actionHandler: cs, actionName: 'resizing' });
    controls.br = new fabric.Control({ x: 0.5, y: 0.5, cursorStyleHandler: scaleCursor, actionHandler: cs, actionName: 'resizing' });
    return controls;
}

fabric.Textbox = fabric.util.createClass(fabric.Textbox, {
    type: 'textbox',

    // 尺寸锁：开启后文本超出 width/height 框则裁剪
    clipEnabled: false,
    // 裁剪时末行使用 "..." 省略号
    ellipsisEnabled: false,
    // 尺寸锁开启时的框高度（height 由内容自适应，frame 高度存于此）
    frameHeight: null,
    // 自定义控制手柄：直接改 width/frameHeight
    controls: makeTextControls(),

    initialize: function (text, options) {
        this.callSuper('initialize', text, options);
        // 从 JSON 恢复 / 直接构造时：clip 开启且有 frame 高度则恢复
        if (this.clipEnabled && this.frameHeight) {
            this.height = this.frameHeight;
        }
        // 仅编辑态展示完整文本布局（跳过省略号），保证光标与选中定位基于完整文本；
        // 选中但不编辑仍显示省略号；退出编辑 / 取消选中后恢复截断
        this._ellipsisSuspended = false;
        this._pendingEdit = false;
        var self = this;
        this.on('deselected', function () {
            if (self.clipEnabled && self.ellipsisEnabled && !self.isEditing) {
                self._pendingEdit = false;
                self.initDimensions();
                self.set('dirty', true);
                self.canvas && self.canvas.requestRenderAll();
            }
        });
    },
    // 仅编辑态跳过省略号截断（展示完整文本）；其余状态一律恢复截断，避免标志位卡死
    _refreshEllipsisState: function () {
        this._ellipsisSuspended = !!(this.isEditing || this._pendingEdit);
        if (!this._ellipsisSuspended) {
            this._applyEllipsis();
        }
    },
    // 点击已选中文本正文（即将进入编辑）时，先用完整布局计算光标位置，再立即恢复截断
    setCursorByClick: function (e) {
        var pend = !this.isEditing && this.clipEnabled && this.ellipsisEnabled && !this.__corner;
        if (pend) {
            this._pendingEdit = true;
            this.initDimensions();
            this.set('dirty', true);
        }
        var ret = this.callSuper('setCursorByClick', e);
        if (pend && !this.isEditing) {
            this._pendingEdit = false;
            this.initDimensions();
            this.set('dirty', true);
        }
        return ret;
    },
    enterEditing: function (e) {
        var wasEditing = this.isEditing;
        var ret = this.callSuper('enterEditing', e);
        if (!wasEditing && this.clipEnabled && this.ellipsisEnabled) {
            this._pendingEdit = false;
            this.initDimensions();
            this.set('dirty', true);
            this.canvas && this.canvas.requestRenderAll();
        }
        return ret;
    },
    exitEditing: function () {
        var ret = this.callSuper('exitEditing');
        if (this.clipEnabled && this.ellipsisEnabled) {
            this._pendingEdit = false;
            this.initDimensions();
            this.set('dirty', true);
            this.canvas && this.canvas.requestRenderAll();
        }
        return ret;
    },

    // 尺寸锁：在本地坐标系裁剪到 [±w/2, ±h/2]（文本渲染同空间），避免 fabric clipPath 缓存错位
    _render: function (ctx) {
        if (this.clipEnabled && this.height) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(-this.width / 2, -this.height / 2, this.width, this.height);
            ctx.closePath();
            ctx.clip();
            this.callSuper('_render', ctx);
            ctx.restore();
        }
        else {
            this.callSuper('_render', ctx);
        }
    },

    _renderChars: function (method, ctx, line, left, top, lineIndex) {
        // set proper line offset
        var lineHeight = this.getHeightOfLine(lineIndex), isJustify = this.textAlign.indexOf('justify') !== -1, actualStyle, nextStyle, charsToRender = '', charBox, boxWidth = 0, timeToRender, path = this.path, shortCut = !isJustify && this.charSpacing === 0 && this.isEmptyStyles(lineIndex) && !path, isLtr = this.direction === 'ltr', sign = this.direction === 'ltr' ? 1 : -1, drawingLeft, currentDirection = ctx.canvas.getAttribute('dir');
        ctx.save();
        if (currentDirection !== this.direction) {
            ctx.canvas.setAttribute('dir', isLtr ? 'ltr' : 'rtl');
            ctx.direction = isLtr ? 'ltr' : 'rtl';
            ctx.textAlign = isLtr ? 'left' : 'right';
        }
        top -= (lineHeight * this._fontSizeFraction) / this.lineHeight;
        if (shortCut) {
            this._renderChar(method, ctx, lineIndex, 0, line.join(''), left, top, lineHeight);
            ctx.restore();
            return;
        }
        for (var i = 0, len = line.length - 1; i <= len; i++) {
            timeToRender = i === len || this.charSpacing || path;
            charsToRender += line[i];
            charBox = this.__charBounds[lineIndex][i];
            if (boxWidth === 0) {
                left += sign * (charBox.kernedWidth - charBox.width);
                boxWidth += charBox.width;
            }
            else {
                boxWidth += charBox.kernedWidth;
            }
            if (isJustify && !timeToRender) {
                if (this._reSpaceAndTab.test(line[i])) {
                    timeToRender = true;
                }
            }
            if (!timeToRender) {
                actualStyle = actualStyle || this.getCompleteStyleDeclaration(lineIndex, i);
                nextStyle = this.getCompleteStyleDeclaration(lineIndex, i + 1);
                timeToRender = fabric.util.hasStyleChanged(actualStyle, nextStyle, false);
            }
            if (path) {
                ctx.save();
                ctx.translate(charBox.renderLeft, charBox.renderTop);
                ctx.rotate(charBox.angle);
                this._renderChar(method, ctx, lineIndex, i, charsToRender, -boxWidth / 2, 0, lineHeight);
                ctx.restore();
            }
            else {
                drawingLeft = left;
                this._renderChar(method, ctx, lineIndex, i, charsToRender, drawingLeft, top, lineHeight);
            }
            charsToRender = '';
            actualStyle = nextStyle;
            left += sign * boxWidth;
            boxWidth = 0;
        }
        ctx.restore();
    },
    enlargeSpaces: function () {
        var diffSpace, currentLineWidth, numberOfSpaces, accumulatedSpace, line, charBound, spaces;
        for (var i = 0, len = this._textLines.length; i < len; i++) {
            if (this.textAlign !== 'justify' && (i === len - 1 || this.isEndOfWrapping(i))) {
                continue;
            }
            accumulatedSpace = 0;
            line = this._textLines[i];
            currentLineWidth = this.getLineWidth(i);
            if (currentLineWidth < this.width &&
                (spaces = this.textLines[i].split('')) &&
                spaces.length > 1) {
                numberOfSpaces = spaces.length;
                diffSpace = (this.width - currentLineWidth) / (numberOfSpaces - 1);
                for (var j = 0, jlen = line.length; j <= jlen; j++) {
                    charBound = this.__charBounds[i][j];
                    charBound.left += accumulatedSpace;
                    if (j < jlen - 1) {
                        charBound.width += diffSpace;
                        charBound.kernedWidth += diffSpace;
                        accumulatedSpace += diffSpace;
                    }
                }
            }
        }
    },
    // 重新计算尺寸后恢复 frame 高度并应用省略号截断
    initDimensions: function () {
        this.callSuper('initDimensions');
        if (this.clipEnabled && this.frameHeight) {
            this.height = this.frameHeight;
        }
        // 编辑/选中态跳过省略号（光标与选中定位需基于完整文本），其余状态实时恢复截断
        this._refreshEllipsisState();
    },
    // 换行：按词边界换行；仅超宽单词（比 desiredWidth 宽）按字符断行，其余单词不拆、box 不撑宽
    // 复刻 fabric._wrapLine 并加入超宽单词处理
    _wrapLine: function (_line, lineIndex, desiredWidth, reservedSpace) {
        var lineWidth = 0,
            // 行内含空格时按词边界换行（英文词不被拆开），无空格（如中文）才逐字断行
            wordWrap = !this.splitByGrapheme || /[\s\t\r]/.test(_line),
            graphemeLines = [],
            line = [],
            words = wordWrap ? _line.split(this._wordJoiners) : fabric.util.string.graphemeSplit(_line),
            word = '',
            offset = 0,
            infix = wordWrap ? ' ' : '',
            wordWidth = 0,
            infixWidth = 0,
            largestWordWidth = 0,
            lineJustStarted = true,
            additionalSpace = this._getWidthOfCharSpacing(),
            reservedSpace = reservedSpace || 0;
        if (words.length === 0) {
            words.push([]);
        }
        desiredWidth -= reservedSpace;
        for (var i = 0; i < words.length; i++) {
            word = wordWrap ? fabric.util.string.graphemeSplit(words[i]) : words[i];
            wordWidth = this._measureWord(word, lineIndex, offset);
            offset += word.length;
            // 超宽单词：按字符断成若干 ≤ desiredWidth 的段，逐段成行
            if (wordWidth > desiredWidth && word.length > 1) {
                if (line.length) {
                    graphemeLines.push(line);
                    line = [];
                    lineWidth = 0;
                }
                var chunk = [], chunkW = 0, chunkOffset = offset - word.length, segMax = 0;
                for (var c = 0; c < word.length; c++) {
                    var cw = this._measureWord(word[c], lineIndex, chunkOffset + c);
                    if (chunk.length && chunkW + cw > desiredWidth) {
                        graphemeLines.push(chunk);
                        if (chunkW > segMax) {
                            segMax = chunkW;
                        }
                        chunk = [];
                        chunkW = 0;
                    }
                    chunk.push(word[c]);
                    chunkW += cw;
                }
                if (chunk.length) {
                    graphemeLines.push(chunk);
                    if (chunkW > segMax) {
                        segMax = chunkW;
                    }
                }
                if (segMax > largestWordWidth) {
                    largestWordWidth = segMax;
                }
                // 超宽单词已自成一行，下一词从新行开始：无前置空格、行宽从 0 计
                infixWidth = 0;
                offset++;
                lineJustStarted = true;
                continue;
            }
            lineWidth += infixWidth + wordWidth - additionalSpace;
            if (lineWidth > desiredWidth && !lineJustStarted) {
                graphemeLines.push(line);
                line = [];
                lineWidth = wordWidth;
                lineJustStarted = true;
            }
            else {
                lineWidth += additionalSpace;
            }
            if (!lineJustStarted && wordWrap) {
                line.push(infix);
            }
            line = line.concat(word);
            infixWidth = wordWrap ? this._measureWord([infix], lineIndex, offset) : 0;
            offset++;
            lineJustStarted = false;
            if (wordWidth > largestWordWidth) {
                largestWordWidth = wordWidth;
            }
        }
        // 保留空行（换行符产生的空逻辑行），超宽单词断行后 line 为空则不再重复 push
        if (line.length || _line === '') {
            graphemeLines.push(line);
        }
        if (largestWordWidth + reservedSpace > this.dynamicMinWidth) {
            this.dynamicMinWidth = largestWordWidth - additionalSpace + reservedSpace;
        }
        return graphemeLines;
    },
    // 依据 frame 高度，只保留能完整显示的行，并在最后一行截断追加 "..."
    _applyEllipsis: function () {
        if (!this.clipEnabled || !this.ellipsisEnabled || !this.frameHeight) {
            return;
        }
        var frameH = this.frameHeight;
        if (!this.height || !frameH) {
            return;
        }
        // 防御：setOptions 期间某些 initDimensions 触发时 _textLines 可能尚未计算
        if (!this._textLines || !this._textLines.length) {
            return;
        }
        // 用实际行高累加，只统计能完整放下的行
        var accumulated = 0, visibleLines = 0;
        for (var i = 0; i < this._textLines.length; i++) {
            var lineH = this.getHeightOfLine(i);
            if (accumulated + lineH <= frameH) {
                accumulated += lineH;
                visibleLines++;
            }
            else {
                break;
            }
        }
        // 所有行都能完整显示，无需省略号
        if (visibleLines >= this._textLines.length) {
            return;
        }
        // 极矮 frame：连一行都放不下时，至少保留首行并补 "..."（避免整段被静默裁剪）
        // 单行文本无隐藏内容，不追加省略号，交给高度裁剪即可
        if (visibleLines === 0) {
            if (this._textLines.length <= 1) {
                return;
            }
            visibleLines = 1;
        }
        var maxLineIndex = visibleLines - 1;
        if (maxLineIndex < 0) {
            return;
        }
        // 真正截断：只保留能完整显示的行（超出部分不再渲染）
        this._textLines = this._textLines.slice(0, visibleLines);
        // 在最后一行截断补 "..."
        var ellipsis = '...';
        var ellipsisWidth = this._measureWord(ellipsis, 0, 0);
        // 极窄 frame：连 "..." 都放不下时不做水平省略号
        if (ellipsisWidth > this.width) {
            return;
        }
        var wordWidth = 0;
        // 末行若未排满（如段落末行），"..." 直接追加即可放得下 → 不截断字符
        if (this.getLineWidth(maxLineIndex) + ellipsisWidth <= this.width) {
            this._textLines[maxLineIndex].push(ellipsis);
            return;
        }
        // 末行已排满，弹出末尾字符为 "..." 腾出空间
        while (ellipsisWidth > wordWidth && this._textLines[maxLineIndex].length) {
            wordWidth += this._measureWord(this._textLines[maxLineIndex].pop(), 0, 0);
        }
        this._textLines[maxLineIndex].push(ellipsis);
    },
    // 设置 frame 高度（尺寸锁开启时）
    setFrameHeight: function (h) {
        if (!this.clipEnabled) {
            return;
        }
        h = Number(h) > 0 ? Number(h) : 0;
        this.frameHeight = h;
        this.height = h;
        this.set('dirty', true);
        this.initDimensions();
    },
    // 同步 frame：clip 开启时初始化 frame 高度（当前内容高度），关闭时复位
    syncFrame: function () {
        if (!this.clipEnabled) {
            this.frameHeight = null;
            this.set('dirty', true);
            return;
        }
        if (!this.frameHeight) {
            this.frameHeight = this.height;
        }
        this.height = this.frameHeight;
        this.set('dirty', true);
    },
    toObject: function (propertiesToInclude) {
        return this.callSuper('toObject', ['clipEnabled', 'ellipsisEnabled', 'frameHeight'].concat(propertiesToInclude));
    },
});
fabric.Textbox.fromObject = function (options, callback) {
    const { text } = options;
    return callback(new fabric.Textbox(text, options));
};
export default fabric.Rect;
