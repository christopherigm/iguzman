from machine import Pin
from utime import sleep
import ujson
from raspberry_pi import RaspberryPi

from tools import get_final_value
from date_time import DateTime

from get_plant import get_plant
from create_measurement_record import create_measurement_record

from plant_model import PlantModel
from plant_type_model import PlantTypeModel
from plant_micro_controller_model import PlantMicroControllerModel

class Plant(RaspberryPi):
    slug=None
    plant_number=None
        
    plant=None
    plant_type=None
    micro_controller=None

    soil_moisture_pin=None
    water_pump_pin=None
    
    initial_measurement=True
    soil_moisture=None
    soil_moisture_measurements=None
    
    next_update=None
    next_measurement=None
    
    performing_measurement=False
    performing_update=False

    def __init__(
            self,
            wlan,
            feed_the_dog,
            version,
            slug,
            debug,
            plant_number=1
        ):
        super().__init__(
            version=version,
            wlan=wlan,
            feed_the_dog=feed_the_dog
        )
        self.slug=slug
        self.debug=debug
        self.plant_number=plant_number
        
        self.soil_moisture_measurements=list()
        self.temperature_measurements=list()
        self.humidity_measurements=list()
        self.ldr_measurements=list()
        self.cpu_temperature_measurements=list()
        
        self.soil_moisture=None
        self.temperature=None
        self.humidity=None
        self.ldr=None
        self.cpu_temperature=None
        self.is_day=None
        
        self.next_update=None
        self.next_measurement=None
        
        self.performing_measurement=False
        self.performing_update=False
        
        if plant_number is 1:
            self.soil_moisture_pin=self.soil_moisture_sensor_1_pin
            self.water_pump_pin=self.water_pump_1_pin
            self.water_pump=Pin(self.water_pump_pin, Pin.OUT)
        
        if plant_number is 2:
            self.soil_moisture_pin=self.soil_moisture_sensor_2_pin
            self.water_pump_pin=self.water_pump_2_pin
            self.water_pump=Pin(self.water_pump_pin, Pin.OUT)
        
        if plant_number is 3 and self.arduino is not None:
            self.arduino_soil_moisture_pin=True
            self.soil_moisture_pin=self.arduino.A5_SOIL_MOISTURE_PWM
            self.water_pump_pin=self.water_pump_3_pin
            self.water_pump=Pin(self.water_pump_pin, Pin.OUT)
        
        if plant_number is 4 and self.arduino is not None:
            self.arduino_soil_moisture_pin=True
            self.soil_moisture_pin=self.arduino.A4_SOIL_MOISTURE_PWM
            self.water_pump_pin=self.water_pump_4_pin
            self.water_pump=Pin(self.water_pump_pin, Pin.OUT)
            
        if plant_number is 5 and self.arduino is not None:
            self.arduino_soil_moisture_pin=True
            self.soil_moisture_pin=self.arduino.A3_SOIL_MOISTURE_PWM
            self.arduino_water_pump_pin=True
            self.water_pump_pin=self.arduino.D12_PUMP_1
        
        if plant_number is 6 and self.arduino is not None:
            self.arduino_soil_moisture_pin=True
            self.soil_moisture_pin=self.arduino.A2_SOIL_MOISTURE_PWM
            self.arduino_water_pump_pin=True
            self.water_pump_pin=self.arduino.D13_PUMP_2
        
        if plant_number is 7 and self.arduino is not None:
            self.arduino_soil_moisture_pin=True
            self.soil_moisture_pin=self.arduino.A1_SOIL_MOISTURE_PWM


            
        
    def get_plant_information(self):
        self.prepare_connection()
        data=get_plant(
            feed_the_dog=self.feed_the_dog,
            plant_slug=self.slug,
        )
        if data is not None:
            self.plant=PlantModel(data['plant'])
            self.plant_type=PlantTypeModel(data['plant_type'])
            self.micro_controller=PlantMicroControllerModel(data['micro_controller'])
            self.minutes_for_update=self.plant_type.minutes_to_upload_sensor_data
            self.set_next_measurement()
            self.set_next_update()
            self.feed_the_dog()
        self.terminate_connection()

    def set_next_update(self):
        self.next_update=DateTime()
        if self.debug is True:
            self.minutes_for_update=3
        self.next_update.add_minutes_to_date(self.minutes_for_update)
            
    def set_next_measurement(self):
        self.next_measurement=DateTime()
        self.next_measurement.add_minutes_to_date(1)
        
    def reset_array_of_measurements(self):
        self.soil_moisture_measurements=list()
        self.temperature_measurements=list()
        self.humidity_measurements=list()
        self.ldr_measurements=list()
        self.cpu_temperature_measurements=list()
        
    def create_measurement(self):
        debug_measurment_data = {
            'soil_moisture_measurements': self.soil_moisture_measurements
        }
        if (
                self.plant is None or
                self.plant.id is None or
                self.ldr is None or
                #self.soil_moisture is None or
                self.temperature is None or
                self.humidity is None or
                self.is_day is None or
                self.cpu_temperature is None
            ):
            print("Missing data")
            print("plant:", self.plant)
            print("plant.id:", self.plant.id)
            print("soil_moisture:", self.soil_moisture)
            print("temperature:", self.temperature)
            print("humidity:", self.humidity)
            print("ldr:", self.ldr)
            print("cpu_temperature:", self.cpu_temperature)
            print("is_day:", self.is_day)
            return
        #print("============ From Raspberry Pi Class ============")
        #print("total_ram:", self.total_ram)
        #print("allocated_ram:", self.allocated_ram)
        #print("disk_total_space:", self.disk_total_space)
        #print("disk_allocated_space:", self.disk_allocated_space)
        #print("temperature:", self.temperature)
        #print("humidity:", self.humidity)
        #print("ldr:", self.ldr)
        #print("cpu_temperature:", self.cpu_temperature)
        #print("is_day:", self.is_day)
        #print("============ From Raspberry Pi Class ============")
        if self.is_day:
            self.rgb_1.color('yellow')
        self.feed_the_dog()
        self.terminate_connection()
        self.prepare_connection()
        status_code=create_measurement_record(
            self.feed_the_dog,
            plant_id=self.plant.id,
            ldr=self.ldr,
            soil_moisture=self.soil_moisture,
            temperature=self.temperature,
            humidity=self.humidity,
            is_day=self.is_day,
            cpu_temperature=self.cpu_temperature,
            #total_ram=self.total_ram,
            allocated_ram=self.allocated_ram,
            #disk_total_space=self.disk_total_space,
            disk_allocated_space=self.disk_allocated_space,
            debug_measurment_data=ujson.dumps(debug_measurment_data),
            initial_measurement=self.initial_measurement,
            debug=self.debug,
            retries=0
        )
        self.terminate_connection()
        if self.is_day:
            if status_code is not 201:
                self.rgb_1.color('red')
            else:
                self.rgb_1.color('green')
        self.initial_measurement=False
        sleep(1)
        self.rgb_1.off()

    def perform_update_operation(
            self,
            ldr=None,
            temperature=None,
            humidity=None,
            is_day=None,
            cpu_temperature=None,
            total_ram=None,
            allocated_ram=None,
            disk_total_space=None,
            disk_allocated_space=None,
        ):
        now=DateTime()
        if (
                self.performing_update is False and
                len(self.soil_moisture_measurements) > 0 and
                now.get_date_time_minutes() >= self.next_update.get_date_time_minutes()
            ):
            self.performing_update=True
            #print('\n+++++++++++++++++++++++++')
            #print(self.plant.name, '(', self.plant_number, ')', 'pin:', self.soil_moisture_pin)
            #print('perform_update_operation:', now.get_human_readable_date_time())
            #print('soil_moisture_measurements:', self.soil_moisture_measurements)
            self.soil_moisture=get_final_value(self.soil_moisture_measurements)
            
            if ldr is not None:
                self.ldr=ldr
            if temperature is not None:
                self.temperature=temperature
            if humidity is not None:
                self.humidity=humidity
            if is_day is not None:
                self.is_day=is_day
            if cpu_temperature is not None:
                self.cpu_temperature=cpu_temperature
            if total_ram is not None:
                self.total_ram=total_ram
            if allocated_ram is not None:
                self.allocated_ram=allocated_ram
            if disk_total_space is not None:
                self.disk_total_space=disk_total_space
            if disk_allocated_space is not None:
                self.disk_allocated_space=disk_allocated_space
    
            self.create_measurement()
            self.soil_moisture_measurements=list()
            self.performing_update=False
            self.set_next_update()
            self.rgb_1.off()

    def perform_measurement_operation(self):
        now=DateTime()
        if (
                self.performing_update is False and
                self.performing_measurement is False and
                now.get_date_time_minutes() >= self.next_measurement.get_date_time_minutes()
            ):
            #print('\n+++++++++++++++++++++++++')
            #print(self.plant.name, '(', self.plant_number, ')', 'pin:', self.soil_moisture_pin)
            #print('perform_measurement_operation:', now.get_human_readable_date_time())
            self.performing_measurement=True
            self.record_soil_moisture()
            #print('soil_moisture:', self.soil_moisture)
            #if int(self.get_soil_moisture()) < 90:
            #   self.activate_water_pump(1)
            self.performing_measurement=False
            self.set_next_measurement()
            self.feed_the_dog()

    def get_soil_moisture(self):
        value=None
        
        #For Arduino Soil Moisture
        if self.arduino is not None and self.arduino_soil_moisture_pin is True:
            #print('Arduino Plant:', self.plant.name)
            if self.is_day:
                self.arduino.rgb_1.green()
            #while value is None:
            #    data=self.arduino.get_analog_input(self.soil_moisture_pin)
            #    if data is not None and data['value'] is not None:
            #        value=data['value']
            #    else:
            #        self.feed_the_dog()
            data=self.arduino.get_analog_input(self.soil_moisture_pin)
            if data is not None:
                value=data['value']
            self.arduino.rgb_1.off()
            return value
        
        # For Raspberry Pico Soil Moisture
        if self.soil_moisture_pin is None:
            return -1
        while value is None:
            if self.is_day:
                self.arduino.rgb_1.blue()
            value=self.read_soil_moisture_sensor(self.soil_moisture_pin)
            self.arduino.rgb_1.off()
        return value

    def record_soil_moisture(self):
        value=self.get_soil_moisture()
        if value is not None:
            value=self.get_soil_moisture()
            self.soil_moisture_measurements.append(value)
        #value=None
        #while value is None:
        #    value=self.get_soil_moisture()
        #self.soil_moisture_measurements.append(value)