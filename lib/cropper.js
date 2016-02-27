/* Copyright 2011-2016 Jason Nelson (@iamcarbon)
   Free to use and modify under the MIT licence
   You must not remove this notice.
*/
var Carbon;
(function (Carbon) {
    var Cropper = (function () {
        function Cropper(element, options) {
            this.listeners = [];
            this.element = element;
            var contentEl = this.element.querySelector('.content');
            var viewportEl = this.element.querySelector('.viewport');
            this.viewport = new Viewport(viewportEl);
            this.content = new ViewportContent(contentEl, this.viewport);
            this.viewport.content = this.content;
            this.options = options || {};
            this.viewport.element.addEventListener('mousedown', this._startDrag.bind(this), true);
            contentEl.style.cursor = 'grab';
            if (this.options.zoomer) {
                this.zoomer = options.zoomer;
            }
            else {
                var zoomerEl = this.element.querySelector('.zoomer');
                this.zoomer = new Slider(zoomerEl, {
                    change: this.setRelativeScale.bind(this),
                    end: this.onSlideStop.bind(this)
                });
            }
            if (this.element.dataset['transform']) {
                this.setTransform(this.element.dataset['transform']);
            }
            else {
                this.viewport.anchorPoint = new Point(0.5, 0.5);
                this.setRelativeScale(this.options.scale || 0);
                this.viewport.centerAt(new Point(0.5, 0.5));
            }
            if (this.content.calculateMinScale() > 1) {
                this.element.classList.add('stretched');
            }
            Cropper.instances.set(this.element, this);
        }
        Cropper.get = function (element) {
            return Cropper.instances.get(element) || new Cropper(element);
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
        Cropper.prototype.setImage = function (image, transform) {
            this.content.setImage(image);
            if (transform) {
                this.setTransform(transform);
            }
            else {
                this.setRelativeScale(0);
                this.viewport.centerAt(new Point(0.5, 0.5));
            }
        };
        Cropper.prototype.center = function () {
            this.viewport.centerAt(new Point(0.5, 0.5));
        };
        Cropper.prototype.setRelativeScale = function (value) {
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
            var minWidth = this.content.calculateMinScale() * this.content.sourceSize.width;
            var maxWidth = this.content.sourceSize.width;
            var dif = maxWidth - minWidth;
            var relativeScale = (transformGroup.resize.width - minWidth) / dif;
            this.setRelativeScale(relativeScale);
            this.viewport.setOffset({
                x: -transformGroup.crop.x,
                y: -transformGroup.crop.y
            });
            if (transformGroup.rotate) {
                this.content.rotate = transformGroup.rotate;
            }
            var stretched = this.viewport.content.calculateMinScale() > 1;
            this.element.classList[stretched ? 'add' : 'remove']('stretched');
            return transformGroup;
        };
        Cropper.prototype.set = function (crop) {
            var box = {
                width: this.content.sourceSize.width * crop.width,
                height: this.content.sourceSize.width * crop.height,
                x: this.content.sourceSize.width * crop.x,
                y: this.content.sourceSize.height * crop.y
            };
            this.content.setSize(box);
            this.viewport.setOffset(box);
        };
        Cropper.prototype.getTransform = function () {
            var transformGroup = new TransformGroup();
            transformGroup.resize = this.content.getScaledSize();
            transformGroup.rotate = this.content.rotate;
            transformGroup.crop = {
                x: (Math.abs(Math.round(this.viewport.offset.x))) || 0,
                y: (Math.abs(Math.round(this.viewport.offset.y))) || 0,
                width: this.viewport.width,
                height: this.viewport.height,
            };
            return transformGroup;
        };
        Cropper.prototype._startDrag = function (e) {
            e.preventDefault();
            _.trigger(this.element, 'start', { instance: this });
            this.dragOrigin = new Point(e.clientX, e.clientY);
            this.startOffset = this.viewport.offset;
            this.listeners.push(new Observer(document, 'mousemove', this._moveDrag.bind(this), false), new Observer(document, 'mouseup', this._endDrag.bind(this), false));
            this.element.classList.add('dragging');
        };
        Cropper.prototype._moveDrag = function (e) {
            var multipler = 1;
            var distance = {
                x: (e.clientX - this.dragOrigin.x) / multipler,
                y: (e.clientY - this.dragOrigin.y) / multipler
            };
            this.viewport.setOffset({
                x: distance.x + this.startOffset.x,
                y: distance.y + this.startOffset.y
            });
            _.trigger(this.element, 'crop:change', {
                instance: this
            });
        };
        Cropper.prototype._endDrag = function (e) {
            while (this.listeners.length > 0) {
                this.listeners.pop().stop();
            }
            this.element.classList.remove('dragging');
            this.onEnd();
        };
        Cropper.instances = new WeakMap();
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
            this.listeners = [];
            this.element = element;
            this.options = options || {};
            this.trackEl = this.element.querySelector('.track');
            this.nubEl = this.element.querySelector('.nub');
            this.trackEl.addEventListener('mousedown', this.startDrag.bind(this), true);
            this.trackEl.addEventListener('mouseup', this.endDrag.bind(this), true);
            this.nubEl.addEventListener('mousedown', this.startDrag.bind(this), true);
            this.nubEl.addEventListener('mouseup', this.endDrag.bind(this), true);
        }
        Slider.prototype.startDrag = function (e) {
            e.preventDefault();
            e.stopPropagation();
            this.moveTo(e);
            this.listeners.push(new Observer(document, 'mousemove', this.moveTo.bind(this)), new Observer(document, 'mouseup', this.endDrag.bind(this)));
            if (this.options.start)
                this.options.start();
        };
        Slider.prototype.endDrag = function (e) {
            this.moveTo(e);
            while (this.listeners.length > 0) {
                this.listeners.pop().stop();
            }
            if (this.options.end)
                this.options.end();
        };
        Slider.prototype.setValue = function (value) {
            var nubWidth = this.nubEl.clientWidth;
            var x = Math.floor((this.trackEl.clientWidth - nubWidth) * value);
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
            this.anchorPoint = new Point(0, 0);
            this.offset = new Point(0, 0);
            this.element = element;
            this.height = this.element.clientHeight;
            this.width = this.element.clientWidth;
        }
        Viewport.prototype.setSize = function (width, height) {
            this.element.style.width = width + 'px';
            this.element.style.height = height + 'px';
            this.height = height;
            this.width = width;
            this.content.relativeScale = new LinearScale([this.content.calculateMinScale(), 1]);
        };
        Viewport.prototype.setOffset = function (offset) {
            this.offset = this.clamp(offset);
            this.content._setOffset(this.offset);
            var leftToCenter = -this.offset.x + (this.width / 2);
            var topToCenter = -this.offset.y + (this.height / 2);
            var size = this.content.getScaledSize();
            this.anchorPoint = {
                x: leftToCenter / size.width,
                y: topToCenter / size.height
            };
        };
        Viewport.prototype.clamp = function (offset) {
            if (offset.x > 0) {
                offset.x = 0;
            }
            if (offset.y > 0) {
                offset.y = 0;
            }
            var size = this.content.getScaledSize();
            var xOverflow = size.width - this.width;
            var yOverflow = size.height - this.height;
            if (-offset.x > xOverflow) {
                offset.x = -xOverflow;
            }
            if (-offset.y > yOverflow) {
                offset.y = -yOverflow;
            }
            return offset;
        };
        Viewport.prototype.centerAt = function (anchor) {
            var size = this.content.getScaledSize();
            var x = size.width * anchor.x;
            var y = size.height * anchor.y;
            this.setOffset({
                x: -(((x * 2) - this.width) / 2),
                y: -(((y * 2) - this.height) / 2)
            });
        };
        return Viewport;
    })();
    var ViewportContent = (function () {
        function ViewportContent(element, viewport) {
            this.rotate = 0;
            this.scale = 1;
            this.element = element;
            this.viewport = viewport;
            this.sourceSize = {
                width: parseInt(this.element.dataset['width'], 10),
                height: parseInt(this.element.dataset['height'], 10)
            };
            this.relativeScale = new LinearScale([this.calculateMinScale(), 1]);
        }
        ViewportContent.prototype.setImage = function (image) {
            this.element.style.backgroundImage = '';
            this.sourceSize = image;
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
            var percentW = this.viewport.width / this.sourceSize.width;
            var percentH = this.viewport.height / this.sourceSize.height;
            if (percentH < percentW) {
                minScale = percentW;
            }
            else {
                minScale = percentH;
            }
            return minScale;
        };
        ViewportContent.prototype.setSize = function (size) {
            this.scale = size.width / this.sourceSize.width;
            this.update();
        };
        ViewportContent.prototype._setOffset = function (offset) {
            this.offset = offset;
            this.update();
        };
        ViewportContent.prototype.setRelativeScale = function (value) {
            if (value > 1)
                return;
            this.scale = this.relativeScale.getValue(value);
            var anchor = this.viewport.anchorPoint;
            this.viewport.centerAt(anchor);
        };
        ViewportContent.prototype.getScaledSize = function () {
            return {
                width: Math.round(this.scale * this.sourceSize.width),
                height: Math.round(this.scale * this.sourceSize.height)
            };
        };
        ViewportContent.prototype.update = function () {
            this.element.style.transformOrigin = '0 0';
            this.element.style.transform = "scale(" + this.scale + ") translate(" + this.offset.x / this.scale + "px, " + this.offset.y / this.scale + "px)";
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
