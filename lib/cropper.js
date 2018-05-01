"use strict";
var Carbon;
(function (Carbon) {
    class Cropper {
        constructor(element, options) {
            this.listeners = [];
            this.element = element;
            let contentEl = this.element.querySelector('.content');
            let viewportEl = this.element.querySelector('.viewport');
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
                let zoomerEl = this.element.querySelector('.zoomer');
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
        static get(element) {
            return Cropper.instances.get(element) || new Cropper(element);
        }
        onSlideStop() {
            this.onEnd();
        }
        onEnd() {
            _.trigger(this.element, 'end', {
                instance: this,
                transform: this.getTransform().toString()
            });
        }
        on(type, listener) {
            this.element.addEventListener(type, listener, false);
        }
        setImage(image, transform) {
            this.content.setImage(image);
            if (transform) {
                this.setTransform(transform);
            }
            else {
                this.setRelativeScale(0);
                this.viewport.centerAt(new Point(0.5, 0.5));
            }
        }
        center() {
            this.viewport.centerAt(new Point(0.5, 0.5));
        }
        setRelativeScale(value) {
            this.content.setRelativeScale(value);
            this.zoomer.setValue(value);
        }
        setTransform(text) {
            let parts = text.split('/');
            let transformGroup = new TransformGroup();
            for (var part of parts) {
                if (part.startsWith('crop')) {
                    let cropValue = part.substring(5);
                    if (part[4] == '(') {
                        let args = cropValue.substring(0, cropValue.length - 1).split(',');
                        transformGroup.crop = {
                            x: parseInt(args[0], 10),
                            y: parseInt(args[1], 10),
                            width: parseInt(args[2], 10),
                            height: parseInt(args[3], 10)
                        };
                    }
                    else {
                        transformGroup.crop = {
                            x: parseInt(cropValue.split('_')[0].split('-')[0], 10),
                            y: parseInt(cropValue.split('_')[0].split('-')[1], 10),
                            width: parseInt(cropValue.split('_')[1].split('x')[0], 10),
                            height: parseInt(cropValue.split('_')[1].split('x')[1], 10)
                        };
                    }
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
            let minWidth = this.content.calculateMinScale() * this.content.sourceSize.width;
            let maxWidth = this.content.sourceSize.width;
            let dif = maxWidth - minWidth;
            let relativeScale = (transformGroup.resize.width - minWidth) / dif;
            this.setRelativeScale(relativeScale);
            this.viewport.setOffset({
                x: -transformGroup.crop.x,
                y: -transformGroup.crop.y
            });
            if (transformGroup.rotate) {
                this.content.rotate = transformGroup.rotate;
            }
            let stretched = this.viewport.content.calculateMinScale() > 1;
            this.element.classList[stretched ? 'add' : 'remove']('stretched');
            return transformGroup;
        }
        set(crop) {
            let box = {
                width: this.content.sourceSize.width * crop.width,
                height: this.content.sourceSize.width * crop.height,
                x: this.content.sourceSize.width * crop.x,
                y: this.content.sourceSize.height * crop.y
            };
            this.content.setSize(box);
            this.viewport.setOffset(box);
        }
        getTransform() {
            let transformGroup = new TransformGroup();
            transformGroup.resize = this.content.getScaledSize();
            transformGroup.rotate = this.content.rotate;
            transformGroup.crop = {
                x: (Math.abs(Math.round(this.viewport.offset.x))) || 0,
                y: (Math.abs(Math.round(this.viewport.offset.y))) || 0,
                width: this.viewport.width,
                height: this.viewport.height,
            };
            return transformGroup;
        }
        _startDrag(e) {
            e.preventDefault();
            _.trigger(this.element, 'start', { instance: this });
            this.dragOrigin = new Point(e.clientX, e.clientY);
            this.startOffset = this.viewport.offset;
            this.listeners.push(new Observer(document, 'mousemove', this._moveDrag.bind(this), false), new Observer(document, 'mouseup', this._endDrag.bind(this), false));
            this.element.classList.add('dragging');
        }
        _moveDrag(e) {
            let multipler = 1;
            let distance = {
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
        }
        _endDrag(e) {
            while (this.listeners.length > 0) {
                this.listeners.pop().stop();
            }
            this.element.classList.remove('dragging');
            this.onEnd();
        }
    }
    Cropper.instances = new WeakMap();
    Carbon.Cropper = Cropper;
    class TransformGroup {
        toString() {
            let parts = [];
            if (this.rotate) {
                parts.push(`rotate(${this.rotate})`);
            }
            parts.push(this.resize.width + 'x' + this.resize.height);
            parts.push(`crop(${this.crop.x},${this.crop.y},${this.crop.width},${this.crop.height})`);
            return parts.join('/');
        }
    }
    class Slider {
        constructor(element, options) {
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
        startDrag(e) {
            e.preventDefault();
            e.stopPropagation();
            this.moveTo(e);
            this.listeners.push(new Observer(document, 'mousemove', this.moveTo.bind(this)), new Observer(document, 'mouseup', this.endDrag.bind(this)));
            if (this.options.start)
                this.options.start();
        }
        endDrag(e) {
            this.moveTo(e);
            while (this.listeners.length > 0) {
                this.listeners.pop().stop();
            }
            if (this.options.end)
                this.options.end();
        }
        setValue(value) {
            let nubWidth = this.nubEl.clientWidth;
            let x = Math.floor((this.trackEl.clientWidth - nubWidth) * value);
            this.nubEl.style.left = x + 'px';
        }
        moveTo(e) {
            let position = Util.getRelativePosition(e.pageX, this.trackEl);
            this.nubEl.style.left = (position * 100) + '%';
            if (this.options.change)
                this.options.change(position);
        }
    }
    Carbon.Slider = Slider;
    class Viewport {
        constructor(element) {
            this.anchorPoint = new Point(0, 0);
            this.offset = new Point(0, 0);
            this.element = element;
            this.height = this.element.clientHeight;
            this.width = this.element.clientWidth;
        }
        setSize(width, height) {
            this.element.style.width = width + 'px';
            this.element.style.height = height + 'px';
            this.height = height;
            this.width = width;
            this.content.relativeScale = new LinearScale([this.content.calculateMinScale(), 1]);
        }
        setOffset(offset) {
            this.offset = this.clamp(offset);
            this.content._setOffset(this.offset);
            let leftToCenter = -this.offset.x + (this.width / 2);
            let topToCenter = -this.offset.y + (this.height / 2);
            let size = this.content.getScaledSize();
            this.anchorPoint = {
                x: leftToCenter / size.width,
                y: topToCenter / size.height
            };
        }
        clamp(offset) {
            if (offset.x > 0) {
                offset.x = 0;
            }
            if (offset.y > 0) {
                offset.y = 0;
            }
            let size = this.content.getScaledSize();
            let xOverflow = size.width - this.width;
            let yOverflow = size.height - this.height;
            if (-offset.x > xOverflow) {
                offset.x = -xOverflow;
            }
            if (-offset.y > yOverflow) {
                offset.y = -yOverflow;
            }
            return offset;
        }
        centerAt(anchor) {
            let size = this.content.getScaledSize();
            let x = size.width * anchor.x;
            let y = size.height * anchor.y;
            this.setOffset({
                x: -(((x * 2) - this.width) / 2),
                y: -(((y * 2) - this.height) / 2)
            });
        }
    }
    class ViewportContent {
        constructor(element, viewport) {
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
        setImage(image) {
            this.element.style.backgroundImage = '';
            this.sourceSize = image;
            this.element.dataset['width'] = image.width.toString();
            this.element.dataset['height'] = image.height.toString();
            this.element.style.width = image.width + 'px';
            this.element.style.height = image.height + 'px';
            this.element.style.backgroundImage = `url('${image.url}')`;
            this.rotate = image.rotate;
            this.relativeScale = new LinearScale([this.calculateMinScale(), 1]);
            this.setSize(image);
            this.setRelativeScale(0);
        }
        calculateMinScale() {
            let minScale;
            let percentW = this.viewport.width / this.sourceSize.width;
            let percentH = this.viewport.height / this.sourceSize.height;
            if (percentH < percentW) {
                minScale = percentW;
            }
            else {
                minScale = percentH;
            }
            return minScale;
        }
        setSize(size) {
            this.scale = size.width / this.sourceSize.width;
            this.update();
        }
        _setOffset(offset) {
            this.offset = offset;
            this.update();
        }
        setRelativeScale(value) {
            if (value > 1)
                return;
            this.scale = this.relativeScale.getValue(value);
            var anchor = this.viewport.anchorPoint;
            this.viewport.centerAt(anchor);
        }
        getScaledSize() {
            return {
                width: Math.round(this.scale * this.sourceSize.width),
                height: Math.round(this.scale * this.sourceSize.height)
            };
        }
        update() {
            this.element.style.transformOrigin = '0 0';
            this.element.style.transform = `scale(${this.scale}) translate(${this.offset.x / this.scale}px, ${this.offset.y / this.scale}px)`;
        }
    }
    class LinearScale {
        constructor(domain) {
            this.domain = domain || [0, 1];
            this.range = [0, 1];
        }
        getValue(value) {
            let lower = this.domain[0];
            let upper = this.domain[1];
            let dif = upper - lower;
            return lower + (value * dif);
        }
    }
    class Point {
        constructor(x, y) {
            this.x = x;
            this.y = y;
        }
    }
    var Util = {
        getRelativePosition(x, relativeElement) {
            return Math.max(0, Math.min(1, (x - this.findPosX(relativeElement)) / relativeElement.offsetWidth));
        },
        findPosX(element) {
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
    class Observer {
        constructor(element, type, handler, useCapture = false) {
            this.element = element;
            this.type = type;
            this.handler = handler;
            this.useCapture = useCapture;
            this.element.addEventListener(type, handler, useCapture);
        }
        stop() {
            this.element.removeEventListener(this.type, this.handler, this.useCapture);
        }
    }
})(Carbon || (Carbon = {}));
