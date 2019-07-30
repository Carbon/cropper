"use strict";
var Carbon;
(function (Carbon) {
    class Cropper {
        constructor(element, options) {
            this.listeners = [];
            this.reactive = new Carbon.Reactive();
            this.element = element;
            this.options = options || {};
            this.viewport = new Viewport(this.element.querySelector('.viewport'));
            this.content = new ViewportContent(this.element.querySelector('.content'), this.viewport, {
                overscale: this.options.overscale || 1
            });
            this.viewport.content = this.content;
            this.viewport.element.addEventListener('mousedown', this.startDrag.bind(this), true);
            if (this.options.zoomer) {
                this.zoomer = options.zoomer;
            }
            else {
                let zoomerEl = this.element.querySelector('.zoomer');
                if (zoomerEl) {
                    this.zoomer = new Slider(zoomerEl, {
                        change: this.setRelativeScale.bind(this),
                        end: this.onSlideStop.bind(this)
                    });
                }
            }
            let transform = this.element.dataset['transform'];
            if (transform) {
                this.setTransform(transform);
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
            this.reactive.trigger({
                type: 'end',
                transform: this.getTransform().toString(),
                instance: this
            });
        }
        on(type, callback) {
            return this.reactive.on(type, callback);
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
            this.zoomer.value = value;
        }
        setTransform(transform) {
            let pipeline;
            if (typeof transform === 'string') {
                pipeline = CropTransform.parse(transform);
            }
            else {
                pipeline = transform;
            }
            if (pipeline.crop.width != this.viewport.width) {
                let sourceAspect = pipeline.crop.width / pipeline.crop.height;
                let targetAspect = this.viewport.width / this.viewport.height;
                if (sourceAspect != targetAspect) {
                    console.log('MISMATCHED ASPECT', sourceAspect, targetAspect);
                }
                let scale = pipeline.crop.width / this.viewport.width;
                console.log('updated scale to fit viewport', scale);
                pipeline.crop.width /= scale;
                pipeline.crop.height /= scale;
                pipeline.crop.x /= scale;
                pipeline.crop.y /= scale;
                pipeline.resize.width /= scale;
                pipeline.resize.height /= scale;
            }
            this.content.setSize(pipeline.resize);
            let minWidth = this.content.calculateMinScale() * this.content.width;
            let maxWidth = this.content.width;
            let diff = maxWidth - minWidth;
            let relativeScale = (pipeline.resize.width - minWidth) / diff;
            this.setRelativeScale(relativeScale);
            this.viewport.setOffset({
                x: -pipeline.crop.x,
                y: -pipeline.crop.y
            });
            let stretched = this.viewport.content.calculateMinScale() > 1;
            this.element.classList[stretched ? 'add' : 'remove']('stretched');
            return pipeline;
        }
        set(crop) {
            let box = {
                width: this.content.width * crop.width,
                height: this.content.width * crop.height,
                x: this.content.width * crop.x,
                y: this.content.height * crop.y
            };
            this.content.setSize(box);
            this.viewport.setOffset(box);
        }
        getTransform() {
            let result = new CropTransform();
            result.resize = this.content.getScaledSize();
            result.crop = {
                x: Math.abs(Math.round(this.viewport.offset.x)) || 0,
                y: Math.abs(Math.round(this.viewport.offset.y)) || 0,
                width: Math.round(this.viewport.width),
                height: Math.round(this.viewport.height),
            };
            return result;
        }
        startDrag(e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.which === 3)
                return;
            this.reactive.trigger({
                type: 'start',
                instance: this
            });
            this.dragOrigin = new Point(e.clientX, e.clientY);
            this.startOffset = this.viewport.offset;
            this.listeners.push(new Observer(document, 'mousemove', this.moveDrag.bind(this), false), new Observer(document, 'mouseup', this.endDrag.bind(this), false));
            this.element.classList.add('dragging');
            this.viewport.element.style.cursor = 'grabbing';
        }
        moveDrag(e) {
            let delta = {
                x: (e.clientX - this.dragOrigin.x),
                y: (e.clientY - this.dragOrigin.y)
            };
            this.viewport.setOffset({
                x: delta.x + this.startOffset.x,
                y: delta.y + this.startOffset.y
            });
            this.reactive.trigger({
                type: 'change',
                instance: this
            });
        }
        endDrag(e) {
            while (this.listeners.length > 0) {
                this.listeners.pop().stop();
            }
            this.viewport.element.style.cursor = 'grab';
            this.element.classList.remove('dragging');
            this.onEnd();
        }
    }
    Cropper.instances = new WeakMap();
    Carbon.Cropper = Cropper;
    class CropTransform {
        static parse(text) {
            var result = new CropTransform();
            let parts = text.split('/');
            for (var part of parts) {
                if (part.startsWith('crop(')) {
                    let args = part.substring(5, part.length - 1).split(',');
                    result.crop = {
                        x: parseInt(args[0]),
                        y: parseInt(args[1]),
                        width: parseInt(args[2]),
                        height: parseInt(args[3])
                    };
                }
                else if (part.indexOf('x') > -1) {
                    let args = part.split('x');
                    result.resize = {
                        width: parseInt(args[0]),
                        height: parseInt(args[1])
                    };
                }
            }
            console.log('parse', result);
            return result;
        }
        toString() {
            let parts = [];
            parts.push(this.resize.width + 'x' + this.resize.height);
            parts.push(`crop(${this.crop.x},${this.crop.y},${this.crop.width},${this.crop.height})`);
            return parts.join('/');
        }
    }
    Carbon.CropTransform = CropTransform;
    class Slider {
        constructor(element, options) {
            this.listeners = [];
            this.element = element;
            this.options = options || {};
            this.trackEl = this.element.querySelector('.track') || this.element;
            this.handleEl = this.element.querySelector('.handle');
            this.trackEl.addEventListener('mousedown', this.startDrag.bind(this), true);
        }
        startDrag(e) {
            if (e.which === 3)
                return;
            e.preventDefault();
            e.stopPropagation();
            this.moveTo(e);
            this.listeners.push(new Observer(document, 'mousemove', this.moveTo.bind(this)), new Observer(document, 'mouseup', this.endDrag.bind(this)));
            if (this.options.start)
                this.options.start();
        }
        endDrag(e) {
            e.preventDefault();
            e.stopPropagation();
            this.moveTo(e);
            while (this.listeners.length > 0) {
                this.listeners.pop().stop();
            }
            if (this.options.end) {
                this.options.end();
            }
        }
        set value(value) {
            let handleWidth = this.handleEl.clientWidth;
            let x = Math.floor((this.trackEl.clientWidth - handleWidth) * value);
            this.handleEl.style.left = x + 'px';
        }
        moveTo(e) {
            let position = _.getRelativePosition(e.pageX, this.trackEl);
            this.handleEl.style.left = (position * 100) + '%';
            if (this.options.change) {
                this.options.change(position);
            }
        }
    }
    class Viewport {
        constructor(element) {
            this.anchorPoint = new Point(0, 0);
            this.offset = new Point(0, 0);
            this.element = element;
            this.height = this.element.clientHeight;
            this.width = this.element.clientWidth;
            this.element.style.cursor = 'grab';
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
        constructor(element, viewport, options) {
            this.scale = 1;
            this.overscale = 1;
            this.element = element;
            this.viewport = viewport;
            this.width = this.element.scrollWidth;
            this.height = this.element.scrollHeight;
            this.element.style.transformOrigin = '0 0';
            if (options && options.overscale) {
                this.overscale = options.overscale;
            }
            this.relativeScale = new LinearScale([this.calculateMinScale(), this.overscale]);
        }
        setImage(image) {
            this.element.style.backgroundImage = '';
            this.width = image.width;
            this.height = image.height;
            this.element.style.width = image.width + 'px';
            this.element.style.height = image.height + 'px';
            this.element.style.backgroundImage = `url('${image.url}')`;
            this.relativeScale = new LinearScale([this.calculateMinScale(), this.overscale]);
            this.setSize(image);
            this.setRelativeScale(0);
        }
        calculateMinScale() {
            let minScale;
            let percentW = this.viewport.width / this.width;
            let percentH = this.viewport.height / this.height;
            if (percentH < percentW) {
                minScale = percentW;
            }
            else {
                minScale = percentH;
            }
            return minScale;
        }
        setSize(size) {
            this.scale = size.width / this.width;
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
                width: Math.round(this.scale * this.width),
                height: Math.round(this.scale * this.height)
            };
        }
        update() {
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
    let _ = {
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
