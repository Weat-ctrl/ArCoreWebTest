// Remove the "export default" and use classic function syntax
function VirtualJoystick(options) {
    this.container = options.container;
    this.radius = options.radius || 50;
    this.onMove = options.onMove || function(){};
    
    // Create joystick element
    this.joystick = document.createElement('div');
    this.joystick.style.cssText = `
        position: absolute;
        width: 40px;
        height: 40px;
        background: rgba(255,255,255,0.5);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
    `;
    this.container.appendChild(this.joystick);
    
    // Touch handling
    this.touchId = null;
    this.active = false;
    
    // Event listeners
    this.container.addEventListener('touchstart', this.handleStart.bind(this));
    this.container.addEventListener('touchmove', this.handleMove.bind(this));
    this.container.addEventListener('touchend', this.handleEnd.bind(this));
}

VirtualJoystick.prototype.handleStart = function(e) {
    if (this.active) return;
    this.active = true;
    this.touchId = e.changedTouches[0].identifier;
    this.updatePosition(e.changedTouches[0]);
};

VirtualJoystick.prototype.handleMove = function(e) {
    if (!this.active) return;
    const touch = Array.from(e.changedTouches).find(t => t.identifier === this.touchId);
    if (touch) this.updatePosition(touch);
};

VirtualJoystick.prototype.handleEnd = function(e) {
    if (!this.active) return;
    this.active = false;
    this.joystick.style.left = '50%';
    this.joystick.style.top = '50%';
    this.onMove(0, 0);
};

VirtualJoystick.prototype.updatePosition = function(touch) {
    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width/2;
    const centerY = rect.top + rect.height/2;
    
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const distance = Math.sqrt(dx*dx + dy*dy);
    
    // Normalize to radius
    if (distance > this.radius) {
        dx = dx * this.radius / distance;
        dy = dy * this.radius / distance;
    }
    
    // Update visual position
    this.joystick.style.left = `${centerX + dx}px`;
    this.joystick.style.top = `${centerY + dy}px`;
    
    // Normalized values (-1 to 1)
    const normX = dx / this.radius;
    const normY = dy / this.radius;
    this.onMove(normX, normY);
};
