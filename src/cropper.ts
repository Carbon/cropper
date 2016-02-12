/* Copyright 2011-2016 Jason Nelson (@iamcarbon)
   Free to use and modify under the MIT licence
   You must not remove this notice.
*/

module Carbon {
  export class Cropper {
    static map = new WeakMap<HTMLElement, Cropper>();

    static get(el: HTMLElement) : Cropper {
      return Cropper.map.get(el) || new Cropper(el);
    }
    
    element  : HTMLElement;
    viewport : Viewport;
    content  : ViewportContent;
    zoomer   : Slider;

    active = false;
    dragging = false;

    mouseOffset: Point;
    startOffset: any;

    options: any;

    mousemoveListener: any;
    mouseupListener: any;
    
    listeners: Observer[] = [ ];
    
    constructor(element: HTMLElement | string, options?) {
      if (typeof element === 'string') {
        this.element = <HTMLElement>document.querySelector(element);
      }
      else {
        this.element = element;
      }
      
      let contentEl = <HTMLImageElement>this.element.querySelector('.content');      
      let viewportEl = <HTMLElement>this.element.querySelector('.viewport');
      
      this.viewport = new Viewport(viewportEl);
      this.content  = new ViewportContent(contentEl, this.viewport);

      this.viewport.content = this.content;

      this.options = options || { };
      this.mouseOffset = new Point(0, 0);

      this.viewport.element.addEventListener('mousedown', this.startDrag.bind(this), true);
      
      contentEl.style.cursor = 'grab';

      if (this.options.zoomer) {
        this.zoomer = options.zoomer;
      }
      else {
        let zoomerEl = <HTMLElement>this.element.querySelector('.zoomer');
      
        this.zoomer = new Slider(zoomerEl, {
          change : this.setScale.bind(this),
          end    : this.onSlideStop.bind(this)
        });
      }
    
      this.setScale(this.options.scale || 0);
      this.center();

      if (this.element.dataset['transform']) {
        this.setTransform(this.element.dataset['transform']);
      }
     
      if (this.content.calculateMinScale() > 1) {
        this.element.classList.add('stretched');
      }
       
      Cropper.map.set(this.element, this);
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
    
    on(type: string, listener: EventListener) {
      this.element.addEventListener(type, listener, true);
    } 

    startDrag(e: MouseEvent) {
      e.preventDefault();
      
      if (!_.trigger(this.element, 'start', { instance: this })) {
        return;
      }
      
      this.listeners.push(
        new Observer(document, 'mousemove', this.moveDrag.bind(this), false),
        new Observer(document, 'mouseup', this.endDrag.bind(this), false)  
      );

      this.element.classList.add('dragging');

      // e.which == 1

      this.active = true;
      this.mouseOffset = new Point(e.clientX, e.clientY);

      this.startOffset = {
        top  : this.viewport.offset.top || 0,
        left : this.viewport.offset.left || 0
      };
    }

    moveDrag(e) {
      if(!this.active) return;

      this.dragging = true;

      let distance = {
        x: e.clientX - this.mouseOffset.x,
        y: e.clientY - this.mouseOffset.y
      };

      let contentOffset = {
      	top  : Math.round(distance.y + this.startOffset.top),
        left : Math.round(distance.x + this.startOffset.left)
      };

      this.viewport.setOffset(contentOffset);
      
      _.trigger(this.element, 'crop:change', {
        instance: this
      });
    }

    endDrag(e) {
      while(this.listeners.length > 0) {        
        this.listeners.pop().stop();
      }
      
      this.element.classList.remove('dragging');

      this.active = false;
      this.dragging = false;
      
      this.onEnd();
    }

    setImage(image: IMedia) {
      this.changeImage(image);
    }

    changeImage(image: IMedia) {
    	this.content.changeImage(image);

    	this.setScale(0);
    }

    center() {
    	this.viewport.centerContent();
    }

    setScale(value: number) {
      this.content.setRelativeScale(value);
      this.zoomer.setValue(value);
    }

    setTransform(text: string) {
      // 789x525/crop:273-191_240x140
      // rotate(90)/...

      let parts = text.split('/');

      let transformGroup = new TransformGroup();

      for (var part of parts) {
        if (part.indexOf(':') > -1) {
          // Flip crop origin from top left to bottom left

          let cropValue = part.split(':')[1];

          transformGroup.crop = {
            x      : parseInt(cropValue.split('_')[0].split('-')[0], 10),
            y      : parseInt(cropValue.split('_')[0].split('-')[1], 10),
            width  : parseInt(cropValue.split('_')[1].split('x')[0], 10),
            height : parseInt(cropValue.split('_')[1].split('x')[1], 10)
          };
        }
        else if (part.indexOf('x') > -1) {
          transformGroup.resize = {
            width  : parseInt(part.split('x')[0], 10),
            height : parseInt(part.split('x')[1], 10)
          };
        }
        else if (part.indexOf('rotate') > -1) {
          transformGroup.rotate = parseInt(part.replace('rotate(', '').replace(')', ''), 10);
        }
      }

      this.content.setSize(transformGroup.resize);

      let minWidth = this.content.calculateMinScale() * this.content.sourceWidth;
      let maxWidth = this.content.sourceWidth;

      let dif = maxWidth - minWidth;

      let relativeScale = (transformGroup.resize.width - minWidth) / dif;

      this.setScale(relativeScale);

      this.viewport.setOffset({ top: - transformGroup.crop.y, left: - transformGroup.crop.x });

      if (transformGroup.rotate) {
        this.content.rotate = transformGroup.rotate;
      }

      // stretch logic
      let stretched = this.viewport.content.calculateMinScale() > 1;

      this.element.classList[stretched ? 'add' : 'remove']('stretched');

      return transformGroup;
    }

    set(crop: Rectangle) {
      let box = { 
        width  : this.content.sourceWidth * crop.width,
        height : this.content.sourceWidth * crop.height,
        top    : this.content.sourceHeight * crop.y,
        left   : this.content.sourceWidth * crop.x
      };     
      
      this.content.setSize(box);
      this.viewport.setOffset(box);
    }
    
    getTransform() {
      let transformGroup = new TransformGroup();

      transformGroup.resize = {
        width: 	this.content.width,
        height: this.content.height
      };

      transformGroup.rotate = this.content.rotate;

      // Flip crop origin from top left to bottom left

      transformGroup.crop = {
        x      : (Math.abs(this.viewport.offset.left)) || 0,
        y      : (Math.abs(this.viewport.offset.top)) || 0,
        width  : this.viewport.width,
        height : this.viewport.height,
      };

      return transformGroup;
    }
  }
  
  
  class TransformGroup {
    rotate: number;
    resize: Size;
    crop: Rectangle;

    toString() {
      let parts = [];

      if (this.rotate) {
        parts.push(`rotate(${this.rotate})`);
      }

      parts.push(this.resize.width + 'x' + this.resize.height);
      parts.push(`crop:${this.crop.x}-${this.crop.y}_${this.crop.width}x${this.crop.height}`);

      return parts.join('/');
    }
  }

  export class Slider {
    element: HTMLElement;
    options: any;
    trackEl: HTMLElement;
    nubEl: HTMLElement;

    dragging = false;
    trackWidth: number;

    mousemoveListener = this.moveTo.bind(this);
    mouseupListener = this.endDrag.bind(this);
    
    constructor(element: HTMLElement, options) {
      this.element = element;
      this.options = options || {};
      this.trackEl = <HTMLElement>this.element.querySelector('.track');
      this.nubEl = <HTMLElement>this.element.querySelector('.nub');

      this.trackEl.addEventListener('mousedown', this.startDrag.bind(this), true);
      this.trackEl.addEventListener('mouseup', this.endDrag.bind(this), true);

      this.nubEl.addEventListener('mousedown', this.startDrag.bind(this), true);
      this.nubEl.addEventListener('mouseup', this.endDrag.bind(this), true);

      this.trackWidth = this.trackEl.clientWidth;      
    }
    
    startDrag(e: MouseEvent) {
      e.preventDefault();

      this.dragging = true;
      this.moveTo(e);
      
      document.addEventListener('mousemove', this.mousemoveListener, true);
      document.addEventListener('mouseup', this.mouseupListener, true);

      if (this.options.start) this.options.start();
    }

    endDrag(e) {
      this.moveTo(e);
      this.dragging = false;
      
      document.removeEventListener('mousemove', this.mousemoveListener, true);
      document.removeEventListener('mouseup', this.mouseupListener, true);

      if (this.options.end) this.options.end();
    }

    setValue(value: number) {
      let nubWidth = this.nubEl.clientWidth;

      let x = Math.floor((this.trackWidth - nubWidth) * value);

    	this.nubEl.style.left = x + 'px';
    }

    moveTo(e: MouseEvent) {
      let position = Util.getRelativePosition(e.pageX, this.trackEl);

      this.nubEl.style.left = (position * 100) + '%';

      if (this.options.change) this.options.change(position);
    }
  }

  class Viewport {
    element: HTMLElement;
    width: number;
    height: number;
    
    content : ViewportContent;

    center = new Point(0, 0);
    offset = { top: 0, left: 0 };
    
    constructor(element: HTMLElement) {
      this.element = element;
      this.height  = this.element.clientHeight;
      this.width   = this.element.clientWidth;
    }

    setSize(width: number, height: number) {
      this.element.style.width = width + 'px';
      this.element.style.height = height + 'px';

      this.height = height;
      this.width = width;
    }

    setOffset(offset) {
      if (offset.left > 0) {
        offset.left = 0;
      }

      if (offset.top > 0) {
        offset.top = 0;
      }

      let distanceToRightEdge = this.content.width - this.width + offset.left;

      if (distanceToRightEdge < 0) {
        offset.left = -(this.content.width - this.width);
      }

      let distanceToBottomEdge = this.content.height - this.height + offset.top;

      if (distanceToBottomEdge < 0) {
        offset.top = -(this.content.height - this.height);
      }

      // round to pixels
      this.offset.left = Math.round(offset.left);
      this.offset.top = Math.round(offset.top);

      this.element.scrollLeft = -this.offset.left;
      this.element.scrollTop  = -this.offset.top;

      let leftToCenter = (-this.offset.left) + (this.width / 2);
      let topToCenter = (-this.offset.top) + (this.height / 2);

      this.center.x = (leftToCenter / this.content.width);
      this.center.y = (topToCenter / this.content.height);
    }

    recenter() {
      let x = this.content.width * (this.center.x);
      let y = this.content.height * (this.center.y);

      let leftOffset = -(((x * 2) - this.width) / 2);
      let topOffset = -(((y * 2) - this.height) / 2);

      this.setOffset({ left: leftOffset, top: topOffset });
    }

    centerContent() {
      this.center = new Point(0.5, 0.5);

      this.recenter();
    }
  }

  class ViewportContent {
    element: HTMLImageElement;
    viewport: Viewport;
    sourceWidth: number;
    sourceHeight: number;

    scale = 1;

    width: number;
    height: number;

    relativeScale: LinearScale;
    rotate: number;

    constructor(element: HTMLImageElement, viewport: Viewport) {
      this.element = element;
      this.viewport = viewport;
      
      this.sourceWidth = parseInt(this.element.dataset['width'], 10);
      this.sourceHeight = parseInt(this.element.dataset['height'], 10);

      this.width = this.sourceWidth;
      this.height = this.sourceHeight;

      this.relativeScale = new LinearScale([this.calculateMinScale(), 1]); // to the min & max sizes
    }

    changeImage(image : IMedia) {
      this.element.src = '';

      this.element.width = this.sourceWidth = image.width;
      this.element.height = this.sourceHeight = image.height;

      this.element.src = image.url;

      this.rotate = image.rotate;

      this.relativeScale = new LinearScale([this.calculateMinScale(), 1]);
   	}

    getCurrentScale() : number {
      return this.width / this.sourceWidth;
    }

    // The minimum size for the content to fit entirely in the viewport
    // May be great than 1 (stretched)
    calculateMinScale() : number {
      let minScale: number;
      let percentW = this.viewport.width / this.sourceWidth;
      let percentH = this.viewport.height / this.sourceHeight;

      if (percentH < percentW) {
        minScale = percentW;
      }
      else {
        minScale = percentH;
      }

      return minScale;
    }

    // TEMP
    setSize(size: Size) {
      this.width = size.width;
      this.height = size.height;

      this.scale = this.getCurrentScale();
      
      this.element.style.width = this.width + 'px';
      this.element.style.height = this.height + 'px';

      this.viewport.recenter();
    }

    setRelativeScale(value: number) {
      if (value > 1) return;

      this.scale = this.relativeScale.getValue(value); // Convert to absolute scale

      // Scaled width & height
      this.width = Math.round(this.scale * this.sourceWidth);
      this.height = Math.round(this.scale * this.sourceHeight);
      
      this.element.style.width = this.width + 'px';
      this.element.style.height = this.height + 'px';

      this.viewport.recenter();
    }
  }

  class LinearScale {
    domain: Array<number>;
    range: Array<number>;

    constructor(domain: Array<number>) {
      this.domain = domain || [0, 1];
      this.range = [0, 1]; // Always 0-1
    }

    getValue(value: number) : number {
      let lower = this.domain[0];
      let upper = this.domain[1];

      let dif = upper - lower;

      return lower + (value * dif);
    }
  }

  interface IMedia {
    width  : number;
    height : number;
    rotate : number;
    url    : string;
  }

  interface Size {
    width: number;
    height: number;
  }

  interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  class Point {
    constructor(public x: number,
                public y: number) { }
  }

  var Util = {
    getRelativePosition(x: number, relativeElement: HTMLElement) {
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

  module _ {
    export function trigger(element: Element, name: string, detail?) : boolean {
      return element.dispatchEvent(new CustomEvent(name, {
        bubbles: true,
        detail: detail
      }));
    }
  }
  
  class Observer {
    constructor(public element: Element | Document, public type, public handler, public useCapture = false) {
      this.element.addEventListener(type, handler, useCapture);
    }
	   
    start() {
      this.element.addEventListener(this.type, this.handler, this.useCapture);
    }
     
    stop() {
      this.element.removeEventListener(this.type, this.handler, this.useCapture)
    }
  }
}