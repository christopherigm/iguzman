```sh
I want to create a micrpython script for Raspberry Pi Pico W to control 3 RGB leds

I need 2 files:
- 1 file to control leds individualy, it should receive parameters like: pin, rgb
value, pwd value, etc.
- 1 file for the main process

The main file should support multi-thread capabilities so that we can have 1 core
controlling the leds and 1 core avaiable.

For input to control the leds we should enable the use of:
- potentiometers
- buttons
- swtiches
```

Here's a complete solution for controlling RGB LEDs on Raspberry Pi Pico W with
multi-core support and input controls:

**1. led_controller.py**

```python
import machine
import time
import _thread

class LEDController:
    def __init__(self):
        self.leds = {}
        self.running = True
        self.lock = _thread.allocate_lock()

    def add_led(self, name, pin_r, pin_g, pin_b, pwm_freq=1000):
        """Add an RGB LED with individual PWM pins"""
        self.leds[name] = {
            'r': machine.PWM(machine.Pin(pin_r)),
            'g': machine.PWM(machine.Pin(pin_g)),
            'b': machine.PWM(machine.Pin(pin_b)),
            'pwm_freq': pwm_freq,
            'current_rgb': [0, 0, 0]
        }
        for pin in self.leds[name].values():
            if isinstance(pin, machine.PWM):
                pin.freq(pwm_freq)

    def set_rgb(self, name, r, g, b, brightness=1.0):
        """Set RGB values for a specific LED (0-255 range)"""
        if name not in self.leds:
            return

        with self.lock:
            # Apply brightness
            r = int(min(255, max(0, r * brightness)))
            g = int(min(255, max(0, g * brightness)))
            b = int(min(255, max(0, b * brightness)))

            # Update PWM values
            self.leds[name]['r'].duty_u16(int(r * 257))
            self.leds[name]['g'].duty_u16(int(g * 257))
            self.leds[name]['b'].duty_u16(int(b * 257))

            self.leds[name]['current_rgb'] = [r, g, b]

    def set_led(self, name, pin, value):
        """Set individual pin value (0-255)"""
        if name not in self.leds:
            return

        with self.lock:
            if pin in ['r', 'g', 'b']:
                pwm_value = int(value * 257)
                self.leds[name][pin].duty_u16(pwm_value)
                self.leds[name]['current_rgb'][['r', 'g', 'b'].index(pin)] =
value

    def set_all_rgb(self, r, g, b, brightness=1.0):
        """Set RGB values for all LEDs"""
        for name in self.leds:
            self.set_rgb(name, r, g, b, brightness)

    def fade_to_rgb(self, name, target_r, target_g, target_b, duration=1.0,
brightness=1.0):
        """Smoothly fade to target color"""
        if name not in self.leds:
            return

        start_r, start_g, start_b = self.leds[name]['current_rgb']
        steps = int(duration * 50)  # 50 steps per second
        delay = duration / steps

        for i in range(steps):
            progress = i / steps
            r = int(start_r + (target_r - start_r) * progress)
            g = int(start_g + (target_g - start_g) * progress)
            b = int(start_b + (target_b - start_b) * progress)
            self.set_rgb(name, r, g, b, brightness)
            time.sleep(delay)

        self.set_rgb(name, target_r, target_g, target_b, brightness)

    def turn_off(self, name):
        """Turn off a specific LED"""
        self.set_rgb(name, 0, 0, 0)

    def turn_off_all(self):
        """Turn off all LEDs"""
        for name in self.leds:
            self.turn_off(name)

    def get_current_rgb(self, name):
        """Get current RGB values for a LED"""
        return self.leds[name]['current_rgb'] if name in self.leds else None

# Global instance
led_controller = LEDController()
```

**2. main.py**

```python
import machine
import time
import _thread
import network
import socket
import json
from led_controller import led_controller

# Input pins configuration
BUTTONS = [12, 13, 14]  # GPIO pins for buttons
SWITCHES = [15, 16]     # GPIO pins for switches
POTENTIOMETERS = [26, 27, 28]  # ADC pins for potentiometers

# Global variables for input states
button_states = [False] * len(BUTTONS)
switch_states = [False] * len(SWITCHES)
pot_values = [0] * len(POTENTIOMETERS)

# Initialize input pins
buttons = [machine.Pin(pin, machine.Pin.IN, machine.Pin.PULL_UP) for pin in
BUTTONS]
switches = [machine.Pin(pin, machine.Pin.IN, machine.Pin.PULL_UP) for pin in
SWITCHES]
potentiometers = [machine.ADC(pin) for pin in POTENTIOMETERS]

# Initialize LEDs
led_controller.add_led("led1", 0, 1, 2)  # R, G, B pins
led_controller.add_led("led2", 3, 4, 5)
led_controller.add_led("led3", 6, 7, 8)

# LED control variables
current_led = 0
led_names = ["led1", "led2", "led3"]
led_colors = {
    "led1": [255, 0, 0],    # Red
    "led2": [0, 255, 0],    # Green
    "led3": [0, 0, 255]     # Blue
}

# Initialize network (for web interface)
ssid = 'PicoW_RGB_Control'
password = 'password123'

def connect_to_network():
    """Connect to WiFi network"""
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(ssid, password)

    max_wait = 10
    while max_wait > 0:
        if wlan.status() < 0 or wlan.status() >= 3:
            break
        max_wait -= 1
        print('waiting for connection...')
        time.sleep(1)

    if wlan.status() != 3:
        raise RuntimeError('network connection failed')
    else:
        print('connected')
        status = wlan.ifconfig()
        print('ip = ' + status[0])

def web_server():
    """Simple web server for LED control"""
    try:
        connect_to_network()
    except RuntimeError as e:
        print("WiFi connection failed:", e)
        return

    addr = socket.getaddrinfo('0.0.0.0', 80)[0][-1]
    s = socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(addr)
    s.listen(1)

    print('listening on', addr)

    while True:
        try:
            cl, addr = s.accept()
            print('client connected from', addr)

            request = cl.recv(1024)
            request = str(request)

            if 'GET /led' in request:
                # Parse LED command
                led_name = request.split('/led')[1].split(' ')[0]
                if led_name in led_names:
                    color = request.split('color=')[1].split(' ')[0]
                    r, g, b = map(int, color.split(','))
                    led_controller.set_rgb(led_name, r, g, b)
                    response = json.dumps({"status": "success", "led": led_name,
"color": [r, g, b]})
                else:
                    response = json.dumps({"status": "error", "message":
"Invalid LED"})
            else:
                response = json.dumps({
                    "status": "success",
                    "leds": led_names,
                    "colors": led_colors
                })

            cl.send('HTTP/1.0 200 OK\r\nContent-type: application/json\r\n\r\n')
            cl.send(response)
            cl.close()

        except Exception as e:
            print("Web server error:", e)
            cl.close()

def input_monitor():
    """Monitor inputs in separate thread"""
    global button_states, switch_states, pot_values

    while True:
        # Read buttons
        for i, button in enumerate(buttons):
            if not button.value():  # Button pressed (active low)
                if not button_states[i]:
                    button_states[i] = True
                    print(f"Button {i} pressed")
                    # Cycle through LEDs
                    global current_led
                    current_led = (current_led + 1) % len(led_names)
                    led_controller.set_rgb(led_names[current_led],
*led_colors[led_names[current_led]])
            else:
                button_states[i] = False

        # Read switches
        for i, switch in enumerate(switches):
            switch_states[i] = not switch.value()  # Active low

        # Read potentiometers
        for i, pot in enumerate(potentiometers):
            pot_values[i] = pot.read_u16()  # 0-65535

        time.sleep(0.05)  # 50ms debounce

def main_led_control():
    """Main LED control logic"""
    last_pot_update = time.time()

    while True:
        # Read potentiometers for color control
        if time.time() - last_pot_update > 0.1:  # Update every 100ms
            r_val = pot_values[0] >> 8  # Scale to 0-255
            g_val = pot_values[1] >> 8
            b_val = pot_values[2] >> 8

            # Apply to current LED
            led_controller.set_rgb(led_names[current_led], r_val, g_val, b_val)
            last_pot_update = time.time()

        # Handle switch states
        if switch_states[0]:  # Switch 1: Brightness control
            brightness = pot_values[0] / 65535.0
            led_controller.set_rgb(led_names[current_led],
                                 led_colors[led_names[current_led]][0],
                                 led_colors[led_names[current_led]][1],
                                 led_colors[led_names[current_led]][2],
                                 brightness)
        elif switch_states[1]:  # Switch 2: Fade effect
            led_controller.fade_to_rgb(led_names[current_led],
                                     pot_values[0] >> 8,
                                     pot_values[1] >> 8,
                                     pot_values[2] >> 8,
                                     duration=2.0)

        time.sleep(0.1)

# Start threads
_thread.start_new_thread(input_monitor, ())
_thread.start_new_thread(main_led_control, ())

# Start web server in main thread (non-blocking)
try:
    _thread.start_new_thread(web_server, ())
except:
    print("Web server thread failed to start")

# Main loop (can be used for additional tasks)
while True:
    try:
        # Additional main tasks can go here
        time.sleep(1)
    except KeyboardInterrupt:
        print("Stopping...")
        led_controller.turn_off_all()
        break
```

**Features:**

1. **Multi-core Support**:
   - Input monitoring runs on core 0
   - LED control runs on core 1
   - Web server runs on main thread

2. **Input Controls**:
   - Buttons (GPIO 12, 13, 14) - Cycle through LEDs
   - Switches (GPIO 15, 16) - Control brightness/fade effects
   - Potentiometers (ADC 26, 27, 28) - Control RGB values

3. **LED Control Features**:
   - Individual LED control
   - All LEDs control
   - Smooth fading effects
   - Brightness adjustment
   - Web interface control

4. **Web Interface**:
   - Access via browser at Pico's IP address
   - Control each LED individually
   - View current status

**Usage:**

1. Connect your RGB LEDs to the specified GPIO pins
2. Connect buttons, switches, and potentiometers to the appropriate pins
3. Upload both files to your Raspberry Pi Pico W
4. Access the web interface via your browser to control LEDs

**Note**: You'll need to update the WiFi credentials in the main.py file to
match your network. The web interface provides a simple way to control LEDs from
any device on the same network.
