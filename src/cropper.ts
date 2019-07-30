/* 
Copyright 2011-2018 Jason Nelson (@iamcarbon)
Free to use and modify under the MIT licence.
You must not remove this notice.
*/

module Carbon {
  interface CropperOptions {
    zoomer: Slider;
    scale?: number;
    overscale: number;
  }
  
  export class Cropper {    
    element  : HTMLElement;
    viewport : Viewport;
    content  : ViewportContent;
    zoomer   : Slider;

    dragOrigin: Point;
    startOffset: Point;

    options: CropperOptions;
    
    listeners: Observer[] = [ ];
    reactive = new Carbon.Reactive();

    static instances = new WeakMap<HTMLElement, Cropper>();
    
    static get(element: HTMLElement) {  
      return Cropper.instances.get(element) || new Cropper(element);
    }
    
    constructor(element: HTMLElement, options?) {
      this.element = element;
      this.options = options || { };

      this.viewport = new Viewport(this.element.querySelector('.viewport'));
      this.content  = new ViewportContent(this.element.querySelector('.content'), this.viewport, { 
        overscale: this.options.overscale || 1
      });


      this.viewport.content = this.content;


      this.viewport.element.addEventListener('mousedown', this.startDrag.bind(this), true);
      
      if (this.options.zoomer) {
        this.zoomer = options.zoomer;
      }
      else {
        let zoomerEl: HTMLElement = this.element.querySelector('.zoomer');

        if (zoomerEl) {
          this.zoomer = new Slider(zoomerEl, {
            change : this.setRelativeScale.bind(this),
            end    : this.onSlideStop.bind(this)
          });
        }
      }      
      
      let transform = this.element.dataset['transform'];

      if (transform) {
        this.setTransform(transform);
      }
      else {
        this.viewport.anchorPoint = new Point(0.5, 0.5); // e.g. center
        this.setRelativeScale(this.options.scale || 0);
        this.viewport.centerAt(new Point(0.5, 0.5));     
      }
     
      if (this.content.calculateMinScale() > 1) {
        this.element.classList.add('stretched');
      }

      Cropper.instances.set(this.element, this);
    }

    onSlideStop() {
     this.onEnd();
    }

    onEnd() {
      this.reactive.trigger({
        type      : 'end',
        transform : this.getTransform().toString(),
        instance  : this
      });
    }
    
    on(type: string, callback: Function) {
      return this.reactive.on(type, callback);
    } 

    setImage(image: Media, transform?: string) {
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

    setRelativeScale(value: number) {
      this.content.setRelativeScale(value);
      this.zoomer.value = value;
    }

    setTransform(transform: string | CropTransform) {
      // 789x525/crop(273,191,240,140)

    
      // 911x911/crop(281,292,480,360)
      // 1822x1822/crop(562,584,960,720)

      let pipeline: CropTransform;

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
        x: - pipeline.crop.x,
        y: - pipeline.crop.y 
      });

      // stretch logic
      let stretched = this.viewport.content.calculateMinScale() > 1;

      this.element.classList[stretched ? 'add' : 'remove']('stretched');

      return pipeline;
    }

    set(crop: Rectangle) {
      let box = { 
        width  : this.content.width * crop.width,
        height : this.content.width * crop.height,
        x      : this.content.width * crop.x,
        y      : this.content.height * crop.y 
      };     
      
      this.content.setSize(box);
      this.viewport.setOffset(box);
    }
    
    getTransform() {
      let result = new CropTransform();
      
      result.resize = this.content.getScaledSize();

      // Flip crop origin from top left to bottom left

      result.crop = {
        x      : Math.abs(Math.round(this.viewport.offset.x)) || 0,
        y      : Math.abs(Math.round(this.viewport.offset.y)) || 0,
        width  : Math.round(this.viewport.width),
        height : Math.round(this.viewport.height),
      };

      return result;
    }
    
    private startDrag(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.which === 3) return;
      
      this.reactive.trigger({
        type      : 'start',
        instance  : this
      });

      this.dragOrigin = new Point(e.clientX, e.clientY);
      this.startOffset = this.viewport.offset;
       
      this.listeners.push(
        new Observer(document, 'mousemove', this.moveDrag.bind(this), false),
        new Observer(document, 'mouseup', this.endDrag.bind(this), false)  
      );

      this.element.classList.add('dragging');

      this.viewport.element.style.cursor = 'grabbing';
    }
    
    private moveDrag(e: PointerEvent) {            
      let delta = {
        x: (e.clientX - this.dragOrigin.x),
        y: (e.clientY - this.dragOrigin.y)
      };
      
      this.viewport.setOffset({
        x : delta.x + this.startOffset.x,
        y : delta.y + this.startOffset.y
      });
      
      this.reactive.trigger({
        type      : 'change',
        instance : this
      });
    }

    private endDrag(e: PointerEvent) {
      while (this.listeners.length > 0) {        
        this.listeners.pop().stop();
      }
      
      this.viewport.element.style.cursor = 'grab';

      this.element.classList.remove('dragging');
      
      this.onEnd();
    }
  }
  
  export class CropTransform {
    resize: Size;
    crop: Rectangle;

    static parse(text: string) {
      var result = new CropTransform();

      let parts = text.split('/');
      
      for (var part of parts) {
        if (part.startsWith('crop(')) {
          // crop({args})
          
          let args = part.substring(5, part.length - 1).split(',');

          result.crop = { 
            x      : parseInt(args[0]), 
            y      : parseInt(args[1]), 
            width  : parseInt(args[2]), 
            height : parseInt(args[3]) 
          };          
        }
        else if (part.indexOf('x') > -1) {
          // 100x100
          let args = part.split('x');

          result.resize = {
            width  : parseInt(args[0]),
            height : parseInt(args[1])
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

  class Slider {
    element: HTMLElement;
    options: any;
    trackEl: HTMLElement;
    handleEl: HTMLElement; 
    
    listeners: Observer[] = [];
    
    constructor(element: HTMLElement, options) {
      this.element = element;
      this.options = options || {};
      this.trackEl = this.element.querySelector('.track') || this.element;
      this.handleEl = this.element.querySelector('.handle');

      this.trackEl.addEventListener('mousedown', this.startDrag.bind(this), true);
    }
    
    startDrag(e: MouseEvent) {
      // ingore left click
      if (e.which === 3) return;

      e.preventDefault();
      e.stopPropagation();
      
      this.moveTo(e);
      
      this.listeners.push(
        new Observer(document, 'mousemove', this.moveTo.bind(this)),
        new Observer(document, 'mouseup', this.endDrag.bind(this))
      );

      if (this.options.start) this.options.start();
    }

    endDrag(e: MouseEvent) {
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

    set value(value: number) {
      let handleWidth = this.handleEl.clientWidth;

      let x = Math.floor((this.trackEl.clientWidth - handleWidth) * value);

      this.handleEl.style.left = x + 'px';
    }

    moveTo(e: MouseEvent) {
      let position = _.getRelativePosition(e.pageX, this.trackEl);

      this.handleEl.style.left = (position * 100) + '%';

      if (this.options.change) {
        this.options.change(position);
      }
    }
  }

  class Viewport {
    element: HTMLElement;
    width: number;
    height: number;
    
    content : ViewportContent;

    anchorPoint = new Point(0, 0);
    offset = new Point(0, 0);
    
    constructor(element: HTMLElement) {
      this.element = element;
      this.height  = this.element.clientHeight;
      this.width   = this.element.clientWidth;

      this.element.style.cursor = 'grab';
    }

    setSize(width: number, height: number) {
      this.element.style.width = width + 'px';
      this.element.style.height = height + 'px';

      this.height = height;
      this.width = width;
      
      this.content.relativeScale = new LinearScale([this.content.calculateMinScale(), 1 ]);
    }

    setOffset(offset: Point) {
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
    
    clamp(offset: Point) {
      if (offset.x > 0) {
        offset.x = 0;
      }

      if (offset.y > 0) {
        offset.y = 0;
      }
      
      let size = this.content.getScaledSize();
      
      // outside viewport
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

    centerAt(anchor: Point) {
      let size = this.content.getScaledSize();
      
      let x = size.width * anchor.x;
      let y = size.height * anchor.y;
      
      this.setOffset({
        x: - (((x * 2) - this.width) / 2),
        y: - (((y * 2) - this.height) / 2)
      });
    }
  }

  class ViewportContent {
    element: HTMLElement;
    viewport: Viewport;
    scale = 1;
    relativeScale: LinearScale;
    offset: Point;
    width: number;
    height: number;

    overscale = 1;
    
    constructor(element: HTMLElement, viewport: Viewport, options: any) {

      this.element = element;
      this.viewport = viewport;
      
      this.width  = this.element.scrollWidth;
      this.height = this.element.scrollHeight;
      
      this.element.style.transformOrigin = '0 0';

      if (options && options.overscale) {
        this.overscale = options.overscale;
      }

      this.relativeScale = new LinearScale([this.calculateMinScale(), this.overscale]); // to the min & max sizes
    }

    setImage(image: Media) {      
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

    // The minimum size for the content to fit entirely in the viewport
    // May be > 1 (stretched)
    calculateMinScale(): number {
      let minScale: number;
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

    setSize(size: Size) {
      this.scale = size.width / this.width;
      
      this.update();
    }

    _setOffset(offset: Point) {
      this.offset = offset;
        
      this.update();
    }
    
    setRelativeScale(value: number) {
      if (value > 1) return;

      this.scale = this.relativeScale.getValue(value); // Convert to absolute scale
      
      var anchor = this.viewport.anchorPoint;
      
      this.viewport.centerAt(anchor);
    }
    
    getScaledSize() {
      return { 
        width  : Math.round(this.scale * this.width),
        height : Math.round(this.scale * this.height)
      };
    }
    
    update() {
      // translate(x, y)
      this.element.style.transform = `scale(${this.scale}) translate(${this.offset.x / this.scale}px, ${this.offset.y / this.scale}px)`;
    }
  }

  class LinearScale {
    domain: Array<number>;
    range: Array<number>;

    constructor(domain: Array<number>) {
      this.domain = domain || [ 0, 1 ];
      this.range = [ 0, 1 ]; // Always 0-1
    }

    getValue(value: number) : number {
      let lower = this.domain[0];
      let upper = this.domain[1];

      let dif = upper - lower;

      return lower + (value * dif);
    }
  }

  interface Media {
    width  : number;
    height : number;
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

  let _ = {
    getRelativePosition(x: number, relativeElement: HTMLElement) {
      return Math.max(0, Math.min(1, (x - this.findPosX(relativeElement)) / relativeElement.offsetWidth));
    },

    findPosX(element: HTMLElement) {
      var curLeft = element.offsetLeft;

      while ((element = <HTMLElement>element.offsetParent)) {
        curLeft += element.offsetLeft;
      }

      return curLeft;
    }
  };
  
  class Observer {
    constructor(public element: Element | Document, public type, public handler, public useCapture = false) {
      this.element.addEventListener(type, handler, useCapture);
    }
     
    stop() {
      this.element.removeEventListener(this.type, this.handler, this.useCapture)
    }
  }
}