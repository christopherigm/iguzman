from machine import UART, Pin
from utime import sleep

from arduino_rgb_led import arduino_rgb_led

class Arduino:
    uart=None
    rgb_1=None
    
    D2=4
    D3=5
    D4=6
    PMW5=11
    D6=12
    D7=13
    D8=14
    D9_RGB_BLUE=15
    D10_RGB_GREEN=16
    D11_RGB_RED=17
    D12_PUMP_1=18
    D13_PUMP_2=19
    A0_GENERAL_PWM=23
    A1_SOIL_MOISTURE_PWM=24
    A2_SOIL_MOISTURE_PWM=25
    A3_SOIL_MOISTURE_PWM=26
    A4_SOIL_MOISTURE_PWM=27
    A5_SOIL_MOISTURE_PWM=28

    def __init__(self, tx_pin=16, rx_pin=17):
        self.uart = UART(0, 9600, tx=Pin(tx_pin), rx=Pin(rx_pin))
        self.uart.init(9600, bits=4, parity=None, stop=1)
        self.rgb_1=arduino_rgb_led(
            uart=self.uart,
            cathode=False,
            red_pin=self.D11_RGB_RED,
            green_pin=self.D10_RGB_GREEN,
            blue_pin=self.D9_RGB_BLUE,
        )

    def handle_buffer(self, buff):
        if buff is not "None" and buff is not None and buff is not "":        
            buff = buff.replace("b'", '')
            buff = buff.split("\\r\\n'")
            if len(buff) is 3:
                buff = buff[1]
                buff = buff.split(' ')
                if len(buff) is 3:
                    pin = int(buff[0])
                    val = int(buff[1])
                    sent = int(buff[2])
                    return {
                        'pin': pin,
                        'value': val,
                        'sent': sent,
                    }
            
        return {
            'pin': None,
            'value': None,
            'sent': None,
        }

    def get_soil_moisture_value(self, value):
        if value is None or int(value) is 0:
            return 0
        max_value=800
        min_value = 200
        diff=max_value-min_value
        val=int(value)
        #print('Val', val)
        if val > max_value or val < min_value:
            return None
        val=((max_value-val) * 100) / diff
        return val

    def get_analog_input(self, pin):
        data=None
        value=None
        
        while data is None and value is None:
            self.uart.write(str(pin))
            self.uart.write('\n')
            
            data = ''
            while self.uart.any():
                data = data + str(self.uart.readline())
            data = self.handle_buffer(data)
            data = None if data['value'] is None else data
            
            if not data is None:
                if data['pin'] is 0:
                    return data
                else:
                    print
                    #data['value']=self.get_soil_moisture_value(data['value'])
                    value=self.get_soil_moisture_value(data['value'])
                    if value is not None:
                        data['value']=value
                        return data
                    else:
                        print('Data:', data)
                        print('value:', value)
            sleep(1)

    def set_digital_output(self, pin, state='on'):
        value = pin
        if state is not 'on':
            value = value * 10
        self.uart.write(str(value))
        self.uart.write('\n')

    # To be fixed
    def get_all_arduino_analog_input(self):
        
        data = None
        
        self.uart.write('2{}'.format(str(pin)))
        self.uart.write('\n')
        while self.uart.any():
            data = data + str(self.uart.readline())
        data = self.handle_buffer(data)
        data = None if data['sent'] is None else data
        
        if not data is None:
            if data['pin'] is not 0:
                data['value'] = get_arduino_soil_moisture_value(data['value'])
            print(data, '\n')
        
        arduino_analog = arduino_analog + 1
        if arduino_analog is 10:
            arduino_analog = 3
            sleep(60)
        sleep(2)
