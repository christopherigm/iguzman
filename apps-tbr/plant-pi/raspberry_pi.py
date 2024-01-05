from machine import Pin, PWM
from utime import sleep
import network
from internal_sensors import (
    read_cpu_temperature as read_cpu_temperature_helper
)
from read_analog_sensor import read_analog_sensor as read_analog_sensor_helper
from read_digital_sensor import read_digital_sensor as read_digital_sensor_helper
from read_soil_moisture_sensor import read_soil_moisture_sensor as read_soil_moisture_sensor_helper
from read_dht_sensor import (
    read_temperature as read_temperature_helper,
    read_humidity as read_humidity_helper,
)
from microcontroller_information import get_microcontroller_information as get_microcontroller_information_helper
from wifi_connection import (
    setup_wifi_connection as setup_wifi_connection_helper,
    prepare_connection as prepare_connection_helper,
    terminate_connection as terminate_connection_helper,
)
from tools import get_final_value
from rgb_led import rgb_led
from arduino import Arduino

import env

class RaspberryPi:
    debug=False
    
    wlan=None
    feed_the_dog=None
    
    temperature=None
    humidity=None
    ldr=None
    cpu_temperature=None
    is_day=None
    total_ram=None
    allocated_ram=None
    disk_total_space=None
    disk_allocated_space=None
    
    ldr_measurements=None
    temperature_measurements=None
    humidity_measurements=None
    ldr_measurements=None
    cpu_temperature_measurements=None
    
    arduino_enabled=False
    arduino=None
    tx_pin=None
    rx_pin=None
    arduino_soil_moisture_pin=False
    arduino_water_pump_pin=False
    
    reset_pin=None
    reset_instance=None
    
    led_1_pin=None
    led_1=None
    led_2_pin=None
    led_2=None
    led_3_pin=None
    led_3=None
    
    servo_1_pin=None
    servo_1=None
    servo_2_pin=None
    servo_2=None
    servo_3_pin=None
    servo_3=None
    servo_4_pin=None
    servo_4=None
    
    button_1_pin=None
    button_1=None
    button_2_pin=None
    button_2=None
    button_3_pin=None
    button_3=None
    
    pir_pin=None
    
    distance_sensor_1_pin=None
    distance_sensor_2_pin=None
    
    water_pump=None
    water_pump_1_pin=None
    water_pump_2_pin=None
    water_pump_3_pin=None
    water_pump_4_pin=None
    
    rgb_1_red_pin=None
    rgb_1_green_pin=None
    rgb_1_blue_pin=None
    rgb_1=None
    
    pir_pin=None
    ldr_pin=None
    dht_sensor_pin=None
    light_sensor_pin=None
    
    soil_moisture_sensor_1_pin=None
    soil_moisture_sensor_2_pin=None
    

    def __init__(
            self,
            version='1.0',
            wlan=None,
            feed_the_dog=None
        ):
        self.ldr_measurements=list()
        self.temperature_measurements=list()
        self.humidity_measurements=list()
        self.ldr_measurements=list()
        self.cpu_temperature_measurements=list()
        
        if wlan is not None:
            self.wlan=wlan
        if feed_the_dog is not None:
            self.feed_the_dog=feed_the_dog

        ENV=None
        if version is '1.0':
            ENV=env.pcb_version_1_0
            
        if ENV is not None:
            if ENV.get('arduino_enabled') is not None and ENV['arduino_enabled'] is True:
                self.tx_pin=ENV['tx_pin']
                self.tx_pin=ENV['rx_pin']
                self.arduino = Arduino(ENV['tx_pin'], ENV['rx_pin'])
            
            if ENV.get('reset_pin') is not None:
                self.reset_pin=ENV['reset_pin']
                self.reset_instance=Pin(self.reset_pin, Pin.OUT)
                self.reset_instance.off()
            
            if ENV.get('led_1_pin') is not None:
                self.led_1_pin=ENV['led_1_pin']
                self.led_1=Pin(self.led_1_pin, Pin.OUT)
            if ENV.get('led_2_pin') is not None:
                self.led_2_pin=ENV['led_2_pin']
                self.led_2=Pin(self.led_2_pin, Pin.OUT)
            if ENV.get('led_3_pin'):
                self.led_3_pin=ENV['led_3_pin']
                self.led_3=Pin(self.led_3_pin, Pin.OUT)

            if ENV.get('servo_1_pin') is not None:
                self.servo_1_pin=ENV['servo_1_pin']
                self.servo_1=PWM(Pin(self.servo_1_pin))
            if ENV.get('servo_2_pin') is not None:
                self.servo_2_pin=ENV['servo_2_pin']
                self.servo_2=PWM(Pin(self.servo_2_pin))
            if ENV.get('servo_3_pin') is not None:
                self.servo_3_pin=ENV['servo_3_pin']
                self.servo_3=PWM(Pin(self.servo_3_pin))
            if ENV.get('servo_4_pin') is not None:
                self.servo_4_pin=ENV['servo_4_pin']
                self.servo_4=PWM(Pin(self.servo_4_pin))
                
            if ENV.get('button_1_pin') is not None:
                self.button_1_pin=ENV['button_1_pin']
                self.button_1=Pin(self.button_1_pin, Pin.IN, Pin.PULL_UP)
            if ENV.get('button_2_pin') is not None:
                self.button_2_pin=ENV['button_2_pin']
                self.button_2=Pin(self.button_2_pin, Pin.IN, Pin.PULL_UP)
            if ENV.get('button_3_pin') is not None:
                self.button_3_pin=ENV['button_3_pin']
                self.button_3=Pin(self.button_3_pin, Pin.IN, Pin.PULL_UP)
                
            if ENV.get('pir_pin') is not None:
                self.pir_pin=ENV['pir_pin']
                
            if ENV.get('distance_sensor_1_pin') is not None:
                self.distance_sensor_1_pin=ENV['distance_sensor_1_pin']
            if ENV.get('distance_sensor_2_pin') is not None:
                self.distance_sensor_2_pin=ENV['distance_sensor_2_pin']
            if ENV.get('distance_sensor_3_pin') is not None:
                self.distance_sensor_3_pin=ENV['distance_sensor_3_pin']
                
            if ENV.get('water_pump_1_pin') is not None:
                self.water_pump_1_pin=ENV['water_pump_1_pin']
                #self.water_pump_1_pin=Pin(self.water_pump_1_pin, Pin.OUT)
            if ENV.get('water_pump_2_pin') is not None:
                self.water_pump_2_pin=ENV['water_pump_2_pin']
                #self.water_pump_2_pin=Pin(self.water_pump_2_pin, Pin.OUT)
            if ENV.get('water_pump_3_pin') is not None:
                self.water_pump_3_pin=ENV['water_pump_3_pin']
                #self.water_pump_3_pin=Pin(self.water_pump_3_pin, Pin.OUT)
            if ENV.get('water_pump_4_pin') is not None:
                self.water_pump_4_pin=ENV['water_pump_4_pin']
                #self.water_pump_4_pin=Pin(self.water_pump_4_pin, Pin.OUT)
                
            if ENV.get('rgb_1_red_pin') is not None:
                self.rgb_1_red_pin=ENV['rgb_1_red_pin']
            if ENV.get('rgb_1_green_pin') is not None:
                self.rgb_1_green_pin=ENV['rgb_1_green_pin']
            if ENV.get('rgb_1_blue_pin') is not None:
                self.rgb_1_blue_pin=ENV['rgb_1_blue_pin']
            if (
                self.rgb_1_red_pin is not None and
                self.rgb_1_green_pin is not None and
                self.rgb_1_blue_pin is not None and
                ENV.get('rgb_1_cathode') is not None
                ):
                self.rgb_1=rgb_led(
                    ENV.get('rgb_1_cathode'),
                    self.rgb_1_red_pin,
                    self.rgb_1_green_pin,
                    self.rgb_1_blue_pin,
                )
                
            if ENV.get('pir_pin') is not None:
                self.pir_pin=ENV['pir_pin']
            if ENV.get('ldr_pin') is not None:
                self.ldr_pin=ENV['ldr_pin']
            if ENV.get('dht_sensor_pin') is not None:
                self.dht_sensor_pin=ENV['dht_sensor_pin']
            if ENV.get('light_sensor_pin') is not None:
                self.light_sensor_pin=ENV['light_sensor_pin']


            if ENV.get('soil_moisture_sensor_1_pin') is not None:
                self.soil_moisture_sensor_1_pin=ENV['soil_moisture_sensor_1_pin']
            if ENV.get('soil_moisture_sensor_2_pin') is not None:
                self.soil_moisture_sensor_2_pin=ENV['soil_moisture_sensor_2_pin']
            if ENV.get('soil_moisture_sensor_3_pin') is not None:
                self.soil_moisture_sensor_3_pin=ENV['soil_moisture_sensor_3_pin']

    def reset(self):
        self.reset_instance.on()

    def lights_from_startup(self):
        self.arduino.rgb_1.off()
        self.rgb_1.off()
        self.arduino.rgb_1.on()
        self.rgb_1.on()
        sleep(1)
        self.arduino.rgb_1.blue()
        self.rgb_1.color('green')
        sleep(1)
        self.feed_the_dog()
        self.arduino.rgb_1.off()
        self.rgb_1.off()
    
    def setup_wifi_connection(self):
        self.rgb_1.color('purple')
        wlan=network.WLAN(network.STA_IF)
        wlan=setup_wifi_connection_helper(wlan, self.feed_the_dog)
        self.feed_the_dog()
        self.rgb_1.color('green')
        if wlan.isconnected():
            sleep(1)
        else:
            sleep(10) # trigger watch dog
        self.rgb_1.off()
        self.feed_the_dog()
        return wlan
    
    def activate_water_pump(self, seconds):
        counter=0
        self.water_pump.on()
        print('pumping about to start', counter, seconds)
        while seconds > counter:
            self.feed_the_dog()
            counter=counter+1
            print('pumping....', counter)
            sleep(1)
        self.water_pump.off()

    def prepare_connection(self):
        return prepare_connection_helper(self.wlan, self.feed_the_dog)
        
    def terminate_connection(self):
        return terminate_connection_helper(self.wlan)
    
    def read_digital_sensor(self, sensor_pin):
        value=read_digital_sensor_helper(sensor_pin)
        return value
    
    def read_analog_sensor(self, sensor_pin, raw_value=False):
        value=read_analog_sensor_helper(sensor_pin, raw_value)
        return value
    
    def read_soil_moisture_sensor(self, sensor_pin):
        value=read_soil_moisture_sensor_helper(sensor_pin)
        return value
    
    def record_microcontroller_information(self):
        mc_info=get_microcontroller_information_helper()
        self.total_ram=mc_info['total_ram']
        self.allocated_ram=mc_info['allocated_ram']
        self.disk_total_space=mc_info['disk_total_space']
        self.disk_allocated_space=mc_info['disk_allocated_space']

    def read_cpu_temperature(self):
        value=read_cpu_temperature_helper()
        return value
    def record_cpu_temperature(self):
        value=None
        while value is None:
            value=self.read_cpu_temperature()
        self.cpu_temperature_measurements.append(value)
        if len(self.cpu_temperature_measurements) > 15:
            self.cpu_temperature_measurements.pop(0)
        self.cpu_temperature=get_final_value(self.cpu_temperature_measurements)
    
    def get_ldr(self):
        if self.ldr_pin is None:
            return -1
        value=None
        while value is None:
            value=self.read_analog_sensor(self.ldr_pin)
        return self.read_analog_sensor(self.ldr_pin)
    def record_ldr(self):
        value=None
        while value is None:
            value=self.get_ldr()
        self.ldr_measurements.append(value)
        if len(self.ldr_measurements) > 15:
            self.ldr_measurements.pop(0)
        self.ldr=get_final_value(self.ldr_measurements)

    def read_temperature(self):
        if self.dht_sensor_pin is None:
            return -1
        value=read_temperature_helper(self.dht_sensor_pin)
        return value
    def record_temperature(self):
        value=None
        while value is None:
            value=self.read_temperature()
        self.temperature_measurements.append(value)
        if len(self.temperature_measurements) > 15:
            self.temperature_measurements.pop(0)
        self.temperature=get_final_value(self.temperature_measurements)
    
    def read_humidity(self):
        if self.dht_sensor_pin is None:
            return -1
        value=read_humidity_helper(self.dht_sensor_pin)
        return value
    def record_humidity(self):
        value=None
        while value is None:
            value=self.read_humidity()
        self.humidity_measurements.append(value)
        if len(self.humidity_measurements) > 15:
            self.humidity_measurements.pop(0)
        self.humidity=get_final_value(self.humidity_measurements)
    
    def read_is_day(self):
        if self.light_sensor_pin is None:
            return False
        value=False if self.read_digital_sensor(self.light_sensor_pin) is 1 else True
        return value
    def record_is_day(self):
        value=self.read_is_day()
        self.is_day=value