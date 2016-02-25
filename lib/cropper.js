/* Copyright 2011-2016 Jason Nelson (@iamcarbon)
   Free to use and modify under the MIT licence
   You must not remove this notice.
*/
var Carbon;
(function (Carbon) {
    var Cropper = (function () {
        function Cropper(element, options) {
            this.active = false;
            this.dragging = false;
            this.listeners = [];
            if (typeof element === 'string') {
                this.element = document.querySelector(element);
            }
            else {
                this.element = element;
            }
            var contentEl = this.element.querySelector('.content');
            var viewportEl = this.element.querySelector('.viewport');
            this.viewport = new Viewport(viewportEl);
            this.content = new ViewportContent(contentEl, this.viewport);
            this.viewport.content = this.content;
            this.options = options || {};
            this.mouseOffset = new Point(0, 0);
            this.viewport.element.addEventListener('mousedown', this.startDrag.bind(this), true);
            contentEl.style.cursor = 'grab';
            if (this.options.zoomer) {
                this.zoomer = options.zoomer;
            }
            else {
                var zoomerEl = this.element.querySelector('.zoomer');
                this.zoomer = new Slider(zoomerEl, {
                    change: this.setScale.bind(this),
                    end: this.onSlideStop.bind(this)
                });
            }
            this.viewport.center = new Point(0.5, 0.5);
            this.setScale(this.options.scale || 0);
            this.viewport.recenter();
            if (this.element.dataset['transform']) {
                this.setTransform(this.element.dataset['transform']);
            }
            if (this.content.calculateMinScale() > 1) {
                this.element.classList.add('stretched');
            }
            Cropper.map.set(this.element, this);
        }
        Cropper.get = function (el) {
            return Cropper.map.get(el) || new Cropper(el);
        };
        Cropper.prototype.onSlideStop = function () {
            this.onEnd();
        };
        Cropper.prototype.onEnd = function () {
            _.trigger(this.element, 'end', {
                instance: this,
                transform: this.getTransform().toString()
            });
        };
        Cropper.prototype.on = function (type, listener) {
            this.element.addEventListener(type, listener, false);
        };
        Cropper.prototype.startDrag = function (e) {
            e.preventDefault();
            if (!_.trigger(this.element, 'start', { instance: this })) {
                return;
            }
            this.listeners.push(new Observer(document, 'mousemove', this.moveDrag.bind(this), false), new Observer(document, 'mouseup', this.endDrag.bind(this), false));
            this.element.classList.add('dragging');
            this.active = true;
            this.mouseOffset = new Point(e.clientX, e.clientY);
            this.startOffset = this.viewport.offset;
        };
        Cropper.prototype.moveDrag = function (e) {
            if (!this.active)
                return;
            this.dragging = true;
            var distance = {
                x: e.clientX - this.mouseOffset.x,
                y: e.clientY - this.mouseOffset.y
            };
            var contentOffset = {
                top: distance.y + this.startOffset.top,
                left: distance.x + this.startOffset.left
            };
            this.viewport.setOffset(contentOffset);
            _.trigger(this.element, 'crop:change', {
                instance: this
            });
        };
        Cropper.prototype.endDrag = function (e) {
            while (this.listeners.length > 0) {
                this.listeners.pop().stop();
            }
            this.element.classList.remove('dragging');
            this.active = false;
            this.dragging = false;
            this.onEnd();
        };
        Cropper.prototype.setImage = function (image) {
            this.changeImage(image);
        };
        Cropper.prototype.changeImage = function (image) {
            this.content.changeImage(image);
            this.setScale(0);
        };
        Cropper.prototype.center = function () {
            this.viewport.center = new Point(0.5, 0.5);
            this.viewport.recenter();
        };
        Cropper.prototype.setScale = function (value) {
            this.content.setRelativeScale(value);
            this.zoomer.setValue(value);
        };
        Cropper.prototype.setTransform = function (text) {
            // 789x525/crop:273-191_240x140
            // rotate(90)/...
            var parts = text.split('/');
            var transformGroup = new TransformGroup();
            for (var _i = 0; _i < parts.length; _i++) {
                var part = parts[_i];
                if (part.indexOf(':') > -1) {
                    var cropValue = part.split(':')[1];
                    transformGroup.crop = {
                        x: parseInt(cropValue.split('_')[0].split('-')[0], 10),
                        y: parseInt(cropValue.split('_')[0].split('-')[1], 10),
                        width: parseInt(cropValue.split('_')[1].split('x')[0], 10),
                        height: parseInt(cropValue.split('_')[1].split('x')[1], 10)
                    };
                }
                else if (part.indexOf('x') > -1) {
                    transformGroup.resize = {
                        width: parseInt(part.split('x')[0], 10),
                        height: parseInt(part.split('x')[1], 10)
                    };
                }
                else if (part.indexOf('rotate') > -1) {
                    transformGroup.rotate = parseInt(part.replace('rotate(', '').replace(')', ''), 10);
                }
            }
            this.content.setSize(transformGroup.resize);
            var minWidth = this.content.calculateMinScale() * this.content.sourceWidth;
            var maxWidth = this.content.sourceWidth;
            var dif = maxWidth - minWidth;
            var relativeScale = (transformGroup.resize.width - minWidth) / dif;
            this.setScale(relativeScale);
            this.viewport.setOffset({ top: -transformGroup.crop.y, left: -transformGroup.crop.x });
            if (transformGroup.rotate) {
                this.content.rotate = transformGroup.rotate;
            }
            var stretched = this.viewport.content.calculateMinScale() > 1;
            this.element.classList[stretched ? 'add' : 'remove']('stretched');
            return transformGroup;
        };
        Cropper.prototype.set = function (crop) {
            var box = {
                width: this.content.sourceWidth * crop.width,
                height: this.content.sourceWidth * crop.height,
                top: this.content.sourceHeight * crop.y,
                left: this.content.sourceWidth * crop.x
            };
            this.content.setSize(box);
            this.viewport.setOffset(box);
        };
        Cropper.prototype.getTransform = function () {
            var transformGroup = new TransformGroup();
            transformGroup.resize = this.content.getScaledSize();
            transformGroup.rotate = this.content.rotate;
            transformGroup.crop = {
                x: (Math.abs(Math.round(this.viewport.offset.left))) || 0,
                y: (Math.abs(Math.round(this.viewport.offset.top))) || 0,
                width: this.viewport.width,
                height: this.viewport.height,
            };
            return transformGroup;
        };
        Cropper.map = new WeakMap();
        return Cropper;
    })();
    Carbon.Cropper = Cropper;
    var TransformGroup = (function () {
        function TransformGroup() {
        }
        TransformGroup.prototype.toString = function () {
            var parts = [];
            if (this.rotate) {
                parts.push("rotate(" + this.rotate + ")");
            }
            parts.push(this.resize.width + 'x' + this.resize.height);
            parts.push("crop:" + this.crop.x + "-" + this.crop.y + "_" + this.crop.width + "x" + this.crop.height);
            return parts.join('/');
        };
        return TransformGroup;
    })();
    var Slider = (function () {
        function Slider(element, options) {
            this.dragging = false;
            this.mousemoveListener = this.moveTo.bind(this);
            this.mouseupListener = this.endDrag.bind(this);
            this.element = element;
            this.options = options || {};
            this.trackEl = this.element.querySelector('.track');
            this.nubEl = this.element.querySelector('.nub');
            this.trackEl.addEventListener('mousedown', this.startDrag.bind(this), true);
            this.trackEl.addEventListener('mouseup', this.endDrag.bind(this), true);
            this.nubEl.addEventListener('mousedown', this.startDrag.bind(this), true);
            this.nubEl.addEventListener('mouseup', this.endDrag.bind(this), true);
            this.trackWidth = this.trackEl.clientWidth;
        }
        Slider.prototype.startDrag = function (e) {
            e.preventDefault();
            this.dragging = true;
            this.moveTo(e);
            document.addEventListener('mousemove', this.mousemoveListener, true);
            document.addEventListener('mouseup', this.mouseupListener, true);
            if (this.options.start)
                this.options.start();
        };
        Slider.prototype.endDrag = function (e) {
            this.moveTo(e);
            this.dragging = false;
            document.removeEventListener('mousemove', this.mousemoveListener, true);
            document.removeEventListener('mouseup', this.mouseupListener, true);
            if (this.options.end)
                this.options.end();
        };
        Slider.prototype.setValue = function (value) {
            var nubWidth = this.nubEl.clientWidth;
            var x = Math.floor((this.trackWidth - nubWidth) * value);
            this.nubEl.style.left = x + 'px';
        };
        Slider.prototype.moveTo = function (e) {
            var position = Util.getRelativePosition(e.pageX, this.trackEl);
            this.nubEl.style.left = (position * 100) + '%';
            if (this.options.change)
                this.options.change(position);
        };
        return Slider;
    })();
    Carbon.Slider = Slider;
    var Viewport = (function () {
        function Viewport(element) {
            this.center = new Point(0, 0);
            this.offset = { top: 0, left: 0 };
            this.element = element;
            this.height = this.element.clientHeight;
            this.width = this.element.clientWidth;
        }
        Viewport.prototype.setSize = function (width, height) {
            this.element.style.width = width + 'px';
            this.element.style.height = height + 'px';
            this.height = height;
            this.width = width;
        };
        Viewport.prototype.setOffset = function (offset) {
            if (offset.left > 0) {
                offset.left = 0;
            }
            if (offset.top > 0) {
                offset.top = 0;
            }
            var size = this.content.getScaledSize();
            var distanceToRightEdge = (size.width - this.width) + offset.left;
            if (distanceToRightEdge < 0) {
                offset.left = -(size.width - this.width);
            }
            var distanceToBottomEdge = size.height - this.height + offset.top;
            if (distanceToBottomEdge < 0) {
                offset.top = -(size.height - this.height);
            }
            this.offset = offset;
            this.content._setOffset(this.offset);
            var leftToCenter = -(this.offset.left) + (this.width / 2);
            var topToCenter = -(this.offset.top) + (this.height / 2);
            this.center = new Point(leftToCenter / size.width, topToCenter / size.height);
        };
        Viewport.prototype.recenter = function () {
            var size = this.content.getScaledSize();
            var x = size.width * this.center.x;
            var y = size.height * this.center.y;
            var offset = {
                left: -(((x * 2) - this.width) / 2),
                top: -(((y * 2) - this.height) / 2)
            };
            this.setOffset(offset);
        };
        return Viewport;
    })();
    var ViewportContent = (function () {
        function ViewportContent(element, viewport) {
            this.scale = 1;
            this.element = element;
            this.viewport = viewport;
            this.sourceWidth = parseInt(this.element.dataset['width'], 10);
            this.sourceHeight = parseInt(this.element.dataset['height'], 10);
            this.relativeScale = new LinearScale([this.calculateMinScale(), 1]);
        }
        ViewportContent.prototype.changeImage = function (image) {
            this.element.style.backgroundImage = '';
            this.sourceWidth = image.width;
            this.sourceHeight = image.height;
            this.element.dataset['width'] = image.width.toString();
            this.element.dataset['height'] = image.height.toString();
            this.element.style.width = image.width + 'px';
            this.element.style.height = image.height + 'px';
            this.element.style.backgroundImage = "url('" + image.url + "')";
            this.rotate = image.rotate;
            this.relativeScale = new LinearScale([this.calculateMinScale(), 1]);
            this.setSize(image);
            this.setRelativeScale(0);
        };
        ViewportContent.prototype.calculateMinScale = function () {
            var minScale;
            var percentW = this.viewport.width / this.sourceWidth;
            var percentH = this.viewport.height / this.sourceHeight;
            if (percentH < percentW) {
                minScale = percentW;
            }
            else {
                minScale = percentH;
            }
            return minScale;
        };
        ViewportContent.prototype.setSize = function (size) {
            this.scale = size.width / this.sourceWidth;
            this.update();
            this.viewport.recenter();
        };
        ViewportContent.prototype._setOffset = function (offset) {
            this.offset = offset;
            this.update();
        };
        ViewportContent.prototype.setRelativeScale = function (value) {
            if (value > 1)
                return;
            this.scale = this.relativeScale.getValue(value);
            this.viewport.recenter();
        };
        ViewportContent.prototype.getScaledSize = function () {
            return {
                width: Math.round(this.scale * this.sourceWidth),
                height: Math.round(this.scale * this.sourceHeight)
            };
        };
        ViewportContent.prototype.update = function () {
            this.element.style.transformOrigin = '0 0';
            this.element.style.transform = "scale(" + this.scale + ") translate(" + this.offset.left / this.scale + "px, " + this.offset.top / this.scale + "px)";
        };
        return ViewportContent;
    })();
    var LinearScale = (function () {
        function LinearScale(domain) {
            this.domain = domain || [0, 1];
            this.range = [0, 1];
        }
        LinearScale.prototype.getValue = function (value) {
            var lower = this.domain[0];
            var upper = this.domain[1];
            var dif = upper - lower;
            return lower + (value * dif);
        };
        return LinearScale;
    })();
    var Point = (function () {
        function Point(x, y) {
            this.x = x;
            this.y = y;
        }
        return Point;
    })();
    var Util = {
        getRelativePosition: function (x, relativeElement) {
            return Math.max(0, Math.min(1, (x - this.findPosX(relativeElement)) / relativeElement.offsetWidth));
        },
        findPosX: function (element) {
            var curLeft = element.offsetLeft;
            while ((element = element.offsetParent)) {
                curLeft += element.offsetLeft;
            }
            return curLeft;
        }
    };
    var _;
    (function (_) {
        function trigger(element, name, detail) {
            return element.dispatchEvent(new CustomEvent(name, {
                bubbles: true,
                detail: detail
            }));
        }
        _.trigger = trigger;
    })(_ || (_ = {}));
    var Observer = (function () {
        function Observer(element, type, handler, useCapture) {
            if (useCapture === void 0) { useCapture = false; }
            this.element = element;
            this.type = type;
            this.handler = handler;
            this.useCapture = useCapture;
            this.element.addEventListener(type, handler, useCapture);
        }
        Observer.prototype.stop = function () {
            this.element.removeEventListener(this.type, this.handler, this.useCapture);
        };
        return Observer;
    })();
})(Carbon || (Carbon = {}));
