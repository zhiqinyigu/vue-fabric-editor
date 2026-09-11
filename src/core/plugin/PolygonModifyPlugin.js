import { fabric } from 'fabric';
import { drawImg } from '../utils/utils';
import edgeImg from '!!file-loader!../assets/edgecontrol.svg';
import { noop } from 'lodash-es';
const actionHandler = function (eventData, transform, x, y) {
  const polygon = transform.target,
    currentControl = polygon.controls[polygon.__corner],
    mouseLocalPosition = polygon.toLocalPoint(new fabric.Point(x, y), 'center', 'center'),
    polygonBaseSize = getObjectSizeWithStroke(polygon),
    size = polygon._getTransformedDimensions(0, 0);
  if (polygon.points == null) return false;
  polygon.points[currentControl.pointIndex] = new fabric.Point(
    (mouseLocalPosition.x * polygonBaseSize.x) / size.x + polygon.pathOffset.x,
    (mouseLocalPosition.y * polygonBaseSize.y) / size.y + polygon.pathOffset.y
  );
  return true;
};
const anchorWrapper = function (anchorIndex, fn) {
  return function (eventData, transform, x, y) {
    const fabricObject = transform.target;
    if (fabricObject.points == null) return false;
    const absolutePoint = fabric.util.transformPoint(
        new fabric.Point(
          fabricObject.points[anchorIndex].x - fabricObject.pathOffset.x,
          fabricObject.points[anchorIndex].y - fabricObject.pathOffset.y
        ),
        fabricObject.calcTransformMatrix()
      ),
      actionPerformed = fn(eventData, transform, x, y),
      // newDim = fabricObject._setPositionDimensions({}),
      polygonBaseSize = getObjectSizeWithStroke(fabricObject),
      newX = (fabricObject.points[anchorIndex].x - fabricObject.pathOffset.x) / polygonBaseSize.x,
      newY = (fabricObject.points[anchorIndex].y - fabricObject.pathOffset.y) / polygonBaseSize.y;
    const originX = newX + 0.5;
    const originY = newY + 0.5;
    fabricObject.setPositionByOrigin(absolutePoint, originX, originY);
    return actionPerformed;
  };
};
const getObjectSizeWithStroke = function (object) {
  const stroke = new fabric.Point(
    object.strokeUniform ? 1 / object.scaleX : 1,
    object.strokeUniform ? 1 / object.scaleY : 1
  ).multiply(object.strokeWidth);
  return new fabric.Point(object.width + stroke.x, object.height + stroke.y);
};
const polygonPositionHandler = function (dim, finalMatrix, fabricObject) {
  const x = fabricObject.points[this.pointIndex].x - fabricObject.pathOffset.x,
    y = fabricObject.points[this.pointIndex].y - fabricObject.pathOffset.y;
  // 求出在世界坐标系的位置
  return fabric.util.transformPoint(
    new fabric.Point(x, y), // 物体坐标系下的位置
    fabric.util.multiplyTransformMatrices(
      fabricObject.canvas.viewportTransform,
      fabricObject.calcTransformMatrix()
    )
  );
};
function renderIconEdge(ctx, left, top, styleOverride, fabricObject, img) {
  drawImg(ctx, left, top, img, 25, 25, fabric.util.degreesToRadians(fabricObject.angle || 0));
}
class PolygonModifyPlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this._onDeselected = noop;
    this.isEdit = false;
    const img = document.createElement('img');
    img.src = edgeImg;
    this.img = img;
    this.init();
  }
  init() {
    console.info('[PolygonModifyPlugin]: init');
  }
  _ensureEvent(poly) {
    poly.off('deselected', this._onDeselected);
  }
  toggleEdit() {
    this.isEdit ? this.inActiveEdit() : this.activeEdit();
  }
  activeEdit() {
    this.isEdit = true;
    const poly = this.canvas.getActiveObject();
    if (poly && poly.type === 'polygon') {
      this._ensureEvent(poly);
      if (poly.points == null) return;
      const lastControl = poly.points.length - 1;
      const This = this;
      poly.controls = poly.points.reduce(function (acc, point, index) {
        acc['p' + index] = new fabric.Control({
          positionHandler: polygonPositionHandler,
          actionHandler: anchorWrapper(index > 0 ? index - 1 : lastControl, actionHandler),
          actionName: 'modifyPolygon',
          render: (...args) => renderIconEdge(...args, This.img),
        });
        Object.defineProperty(acc['p' + index], 'pointIndex', { value: index });
        return acc;
      }, {});
      poly.set({
        objectCaching: false,
      });
      poly.hasBorders = !this.isEdit;
      this.canvas.requestRenderAll();
      this._onDeselected = () => this.inActiveEdit(poly);
      poly.on('deselected', this._onDeselected);
    }
  }
  inActiveEdit(poly) {
    this.isEdit = false;
    poly = poly || this.canvas.getActiveObject();
    if (poly && poly.type === 'polygon') {
      poly.cornerColor = 'blue';
      poly.cornerStyle = 'rect';
      poly.controls = fabric.Object.prototype.controls;
      poly.hasBorders = !this.isEdit;
      poly.set({
        objectCaching: true,
      });
      if (this._onDeselected) {
        poly.off('deselected', this._onDeselected);
        this._onDeselected = noop;
      }
    }
    this.canvas.requestRenderAll();
  }
}
PolygonModifyPlugin.pluginName = 'PolygonModifyPlugin';
PolygonModifyPlugin.events = [];
PolygonModifyPlugin.apis = ['toggleEdit', 'activeEdit', 'inActiveEdit'];
export default PolygonModifyPlugin;
