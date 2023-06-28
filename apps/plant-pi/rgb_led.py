from machine import Pin, PWM

class RGB:
    red=None
    green=None
    blue=None
    cathode=True
    pmw_max=65535
    rgb_max=255

    def __init__(
            self,
            cathode,
            red_pin,
            green_pin,
            blue_pin
        ):
        self.cathode = cathode
        self.red = PWM(Pin(red_pin))
        self.green = PWM(Pin(green_pin))
        self.blue = PWM(Pin(blue_pin))

        self.red.freq(1000)
        self.green.freq(1000)
        self.blue.freq(1000)
        
    def get_values(
            self,
            red_value,
            green_value,
            blue_value,
        ):
        red = red_value
        green = green_value
        blue = blue_value
        
        red = int((red * 100) / self.rgb_max)
        green = int((green * 100) / self.rgb_max)
        blue = int((blue * 100) / self.rgb_max)
        
        red = int((red / 100) * self.pmw_max)
        green = int((green / 100) * self.pmw_max)
        blue = int((blue / 100) * self.pmw_max)
        
        if self.cathode is not True:
            red = abs(red - self.pmw_max)
            green = abs(green - self.pmw_max)
            blue = abs(blue - self.pmw_max)
        return {
            'red': red,
            'green': green,
            'blue': blue,
        }
        
    
    def val(
            self,
            red,
            green,
            blue,
        ):
        values = self.get_values(red, green, blue)
        self.red.duty_u16(values['red'])
        self.green.duty_u16(values['green'])
        self.blue.duty_u16(values['blue'])
    
    def color(
            self,
            color_value
        ):
        values = self.get_values(0, 0, 0)
        
        if color_value is 'red':
            values = self.get_values(255, 0, 0)
        elif color_value is 'green':
            values = self.get_values(0, 255, 0)
        elif color_value is 'blue':
            values = self.get_values(0, 0, 255)
        elif color_value is 'white':
            values = self.get_values(255, 255, 255)
        elif color_value is 'brown':
            values = self.get_values(102, 51, 0)
        elif color_value is 'purple':
            values = self.get_values(255, 0, 255)
        elif color_value is 'yellow':
            values = self.get_values(255, 255, 0)
        elif color_value is 'orange':
            values = self.get_values(255, 128, 0)
        elif color_value is 'aqua':
            values = self.get_values(0, 255, 255)
        elif color_value is 'light-blue':
            values = self.get_values(0, 128, 255)
        
        red = values['red']
        green = values['green']
        blue = values['blue']
    
        self.red.duty_u16(red)
        self.green.duty_u16(green)
        self.blue.duty_u16(blue)
    
    def on(self):
        values = self.get_values(255, 255, 255)
        self.red.duty_u16(values['red'])
        self.green.duty_u16(values['green'])
        self.blue.duty_u16(values['blue'])
    
    def off(self):
        values = self.get_values(0, 0, 0)
        self.red.duty_u16(values['red'])
        self.green.duty_u16(values['green'])
        self.blue.duty_u16(values['blue'])
        
# https://projects.raspberrypi.org/en/projects/getting-started-with-the-pico/8
# https://www.rapidtables.com/web/color/RGB_Color.html