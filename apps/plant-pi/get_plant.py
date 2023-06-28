from machine import Pin
import urequests as requests
from utime import sleep
import ujson
from log import log
from constants import plant_base_url

def get_plant(plant_slug='test-plant'):
    step = 0
    response_text='-'
    
    base_url=plant_base_url
    plant_url = str(base_url + plant_slug)
    
    try:
        response = requests.get(url=plant_url)
        
        status_code = response.status_code
        response_text=response.text
        response.close()
        
        if response_text is None:
            return None
        
        if status_code is 200:
            plant = ujson.loads(str(response_text))
            if plant['data'] is not None and len(plant['data']) is 1 and len(plant['included']) is 2:
                plant_type = None
                micro_controller = None
                if plant['included'][0]['type'] == 'PlantMicroController':
                    micro_controller = plant['included'][0]
                    plant_type = plant['included'][1]
                else:
                    plant_type = plant['included'][0]
                    micro_controller = plant['included'][1]
                    
                return {
                    'plant': plant['data'][0],
                    'plant_type': plant_type,
                    'micro_controller': micro_controller,
                }
        log('Error getting plant ID. URL: ' + plant_url)
        log('status_code: ' + str(status_code))
        return None
    except Exception as e:
        print('except e: "{}"'.format(str(e)))
        log('Error on get_plant: url: ' + plant_url)
        return None
