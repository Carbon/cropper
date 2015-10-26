/* Copyright 2011-2015 Jason Nelson (@iamcarbon)
   Free to use and modify under the MIT licence
   You must not remove this notice.
*/
var Carbon;
(function (Carbon) {
    var Cropper = (function () {
        function Cropper(element, options) {
            this.active = false;
            this.dragging = false;
            this.element = $(element);
            if (this.element.length == 0)
                throw new Error('element not found');
            this.viewport = new Viewport(this.element.find('.viewport')[0]);
            this.content = new ViewportContent(this.element.find('.content'), this.viewport);
            this.viewport.content = this.content;
            this.options = options || {};
            this.mouseOffset = new Point(0, 0);
            this.viewport.element.addEventListener('mousedown', this.startDrag.bind(this), true);
            this.element.find('.content').css('cursor', 'grab');
            this.zoomer = new Slider(this.element.find('.zoomer')[0], {
                change: this.setScale.bind(this),
                end: this.onSlideStop.bind(this)
            });
            if (this.content.calculateMinScale() > 1) {
                this.zoomer.hide();
            }
            var data = this.element.data();
            this.setScale(this.options.scale || 0);
            this.center();
            if (data.transform) {
                this.setTransform(data.transform);
            }
            this.element.data('controller', this);
        }
        Cropper.prototype.onSlideStop = function () {
            this.element.triggerHandler({
                type: 'change',
                transform: this.getTransform().toString()
            });
        };
        Cropper.prototype.on = function (name, callback) {
            $(this.element).on(name, callback);
        };
        Cropper.prototype.off = function (name) {
            $(this.element).off(name);
        };
        Cropper.prototype.startDrag = function (e) {
            $(document).on({
                mousemove: this.moveDrag.bind(this),
                mouseup: this.endDrag.bind(this)
            });
            this.element.addClass('dragging');
            this.active = true;
            this.mouseOffset = new Point(e.clientX, e.clientY);
            this.startOffset = {
                top: this.viewport.offset.top || 0,
                left: this.viewport.offset.left || 0
            };
            this.element.triggerHandler('start');
            e.preventDefault();
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
                top: Math.round(distance.y + this.startOffset.top),
                left: Math.round(distance.x + this.startOffset.left)
            };
            this.viewport.setOffset(contentOffset);
        };
        Cropper.prototype.endDrag = function (e) {
            $(document).off('mousemove mouseup');
            this.element.removeClass('dragging');
            this.active = false;
            this.dragging = false;
            this.element.triggerHandler({
                type: 'change',
                transform: this.getTransform().toString()
            });
        };
        Cropper.prototype.setImage = function (image) {
            this.changeImage(image);
        };
        Cropper.prototype.changeImage = function (image) {
            this.content.changeImage(image);
            this.setScale(0);
        };
        Cropper.prototype.center = function () {
            this.viewport.centerContent();
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
            for (var i = 0, len = parts.length; i < len; i++) {
                var part = parts[i];
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
            this.element[stretched ? 'addClass' : 'removeClass']('stretched');
            return transformGroup;
        };
        Cropper.prototype.getTransform = function () {
            var transformGroup = new TransformGroup();
            transformGroup.resize = {
                width: this.content.width,
                height: this.content.height
            };
            transformGroup.rotate = this.content.rotate;
            transformGroup.crop = {
                x: (Math.abs(this.viewport.offset.left)) || 0,
                y: (Math.abs(this.viewport.offset.top)) || 0,
                width: this.viewport.width,
                height: this.viewport.height,
            };
            return transformGroup;
        };
        return Cropper;
    })();
    Carbon.Cropper = Cropper;
    var TransformGroup = (function () {
        function TransformGroup() {
        }
        TransformGroup.prototype.toString = function () {
            var parts = [];
            if (this.rotate) {
                parts.push('rotate(' + this.rotate + ')');
            }
            parts.push(this.resize.width + 'x' + this.resize.height);
            parts.push('crop:' + this.crop.x + '-' + this.crop.y + '_' + this.crop.width + 'x' + this.crop.height);
            return parts.join('/');
        };
        return TransformGroup;
    })();
    var Slider = (function () {
        function Slider(element, options) {
            this.dragging = false;
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
        Slider.prototype.hide = function () {
            this.element.style.display = 'none';
        };
        Slider.prototype.startDrag = function (e) {
            e.preventDefault();
            this.dragging = true;
            this.moveTo(e);
            $(document).on({
                mousemove: this.moveTo.bind(this),
                mouseup: this.endDrag.bind(this)
            });
            if (this.options.start)
                this.options.start();
            $(this.element).triggerHandler('start');
        };
        Slider.prototype.endDrag = function (e) {
            this.moveTo(e);
            this.dragging = false;
            $(document).off('mousemove mouseup');
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
            this.element = element;
            this.height = this.element.clientHeight;
            this.width = this.element.clientWidth;
            this.offset = {
                left: 0,
                top: 0
            };
            this.center = new Point(0, 0);
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
            var distanceToRightEdge = this.content.width - this.width + offset.left;
            if (distanceToRightEdge < 0) {
                offset.left = -(this.content.width - this.width);
            }
            var distanceToBottomEdge = this.content.height - this.height + offset.top;
            if (distanceToBottomEdge < 0) {
                offset.top = -(this.content.height - this.height);
            }
            this.offset.left = Math.round(offset.left);
            this.offset.top = Math.round(offset.top);
            this.element.scrollLeft = -this.offset.left;
            this.element.scrollTop = -this.offset.top;
            var leftToCenter = (-this.offset.left) + (this.width / 2);
            var topToCenter = (-this.offset.top) + (this.height / 2);
            this.center.x = (leftToCenter / this.content.width);
            this.center.y = (topToCenter / this.content.height);
        };
        Viewport.prototype.recenter = function () {
            var x = this.content.width * (this.center.x);
            var y = this.content.height * (this.center.y);
            var leftOffset = -(((x * 2) - this.width) / 2);
            var topOffset = -(((y * 2) - this.height) / 2);
            this.setOffset({ left: leftOffset, top: topOffset });
        };
        Viewport.prototype.centerContent = function () {
            this.center = new Point(0.5, 0.5);
            this.recenter();
        };
        return Viewport;
    })();
    var ViewportContent = (function () {
        function ViewportContent(element, viewport) {
            this.scale = 1;
            this.element = $(element);
            this.viewport = viewport;
            var data = this.element.data();
            this.sourceWidth = data.width;
            this.sourceHeight = data.height;
            this.width = this.sourceWidth;
            this.height = this.sourceHeight;
            this.relativeScale = new LinearScale([this.calculateMinScale(), 1]);
        }
        ViewportContent.prototype.changeImage = function (image) {
            var el = this.element[0];
            el.src = '';
            el.width = this.sourceWidth = image.width;
            el.height = this.sourceHeight = image.height;
            el.src = image.url;
            this.rotate = image.rotate;
            this.relativeScale = new LinearScale([this.calculateMinScale(), 1]);
        };
        ViewportContent.prototype.getCurrentScale = function () {
            return this.width / this.sourceWidth;
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
            this.width = size.width;
            this.height = size.height;
            this.scale = this.getCurrentScale();
            this.element.css({
                width: this.width + 'px',
                height: this.height + 'px'
            });
            this.viewport.recenter();
        };
        ViewportContent.prototype.setRelativeScale = function (value) {
            if (value > 1)
                return;
            this.scale = this.relativeScale.getValue(value);
            this.width = Math.round(this.scale * this.sourceWidth);
            this.height = Math.round(this.scale * this.sourceHeight);
            this.element.css({
                width: this.width + 'px',
                height: this.height + 'px'
            });
            this.viewport.recenter();
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
})(Carbon || (Carbon = {}));
