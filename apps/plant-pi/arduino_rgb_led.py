from machine import Pin, PWM

class arduino_rgb_led:
    uart=None
    red_pin=None
    green_pin=None
    blue_pin=None
    cathode=True

    def __init__(
            self,
            uart,
            cathode,
            red_pin,
            green_pin,
            blue_pin,
        ):
        self.uart = uart
        self.cathode = cathode
        self.red_pin = red_pin
        self.green_pin = green_pin
        self.blue_pin = blue_pin

    def set_digital_output(self, pin, state='on'):
        value = pin
        if state is not 'on':
            value = value * 10
        self.uart.write(str(value))
        self.uart.write('\n')
    
    def on(self):
        state='on'
        if self.cathode is not True:
            state='off'
        self.set_digital_output(self.red_pin, state)
        self.set_digital_output(self.green_pin, state)
        self.set_digital_output(self.blue_pin, state)
    
    def off(self):
        state='off'
        if self.cathode is not True:
            state='on'
        self.set_digital_output(self.red_pin, state)
        self.set_digital_output(self.green_pin, state)
        self.set_digital_output(self.blue_pin, state)
    
    def red(self):
        state_on='on'
        state_off='off'
        if self.cathode is not True:
            state_on='off'
            state_off='on'
        self.set_digital_output(self.red_pin, state_on)
        self.set_digital_output(self.green_pin, state_off)
        self.set_digital_output(self.blue_pin, state_off)
    
    def green(self):
        state_on='on'
        state_off='off'
        if self.cathode is not True:
            state_on='off'
            state_off='on'
        self.set_digital_output(self.red_pin, state_off)
        self.set_digital_output(self.green_pin, state_on)
        self.set_digital_output(self.blue_pin, state_off)
    
    def blue(self):
        state_on='on'
        state_off='off'
        if self.cathode is not True:
            state_on='off'
            state_off='on'
        self.set_digital_output(self.red_pin, state_off)
        self.set_digital_output(self.green_pin, state_off)
        self.set_digital_output(self.blue_pin, state_on)
