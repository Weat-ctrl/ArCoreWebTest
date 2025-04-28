// VirtualJoystick.js (updated)
export default class VirtualJoystick {
    constructor(options) {
        this.container = options.container;
        this.radius = 50;
        this.deltaX = 0;
        this.deltaY = 0;
        
        this.joystick = document.createElement('div');
        this.joystick.style.cssText = `
            position: absolute;
            width: 40px;
            height: 40px;
            background: rgba(255, 255, 255, 0.5);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
        `;
        this.container.appendChild(this.joystick);
        
        this.center = this.getContainerCenter();
        this.isActive = false;
        this.touchId = null;

        this.addEventListeners();
    }

    getContainerCenter() {
        const rect = this.container.getBoundingClientRect();
        return {
            x: rect.left + rect.width/2,
            y: rect.top + rect.height/2
        };
    }

    addEventListeners() {
        this.container.addEventListener('touchstart', this.handleStart.bind(this));
        this.container.addEventListener('touchmove', this.handleMove.bind(this));
        this.container.addEventListener('touchend', this.handleEnd.bind(this));
    }

    handleStart(e) {
        if (this.isActive) return;
        this.isActive = true;
        this.touchId = e.changedTouches[0].identifier;
        this.updatePosition(e.changedTouches[0]);
    }

    handleMove(e) {
        if (!this.isActive) return;
        const touch = Array.from(e.changedTouches).find(t => t.identifier === this.touchId);
        if (touch) this.updatePosition(touch);
    }

    handleEnd(e) {
        if (!this.isActive) return;
        this.isActive = false;
        this.deltaX = 0;
        this.deltaY = 0;
        this.joystick.style.left = '50%';
        this.joystick.style.top = '50%';
    }

    updatePosition(touch) {
        const dx = touch.clientX - this.center.x;
        const dy = touch.clientY - this.center.y;
        const distance = Math.sqrt(dx*dx + dy*dy);
        const angle = Math.atan2(dy, dx);

        if (distance > this.radius) {
            this.joystick.style.left = `${this.center.x + Math.cos(angle)*this.radius}px`;
            this.joystick.style.top = `${this.center.y + Math.sin(angle)*this.radius}px`;
            this.deltaX = dx/this.radius;
            this.deltaY = dy/this.radius;
        } else {
            this.joystick.style.left = `${touch.clientX}px`;
            this.joystick.style.top = `${touch.clientY}px`;
            this.deltaX = dx/this.radius;
            this.deltaY = dy/this.radius;
        }
    }
  }
