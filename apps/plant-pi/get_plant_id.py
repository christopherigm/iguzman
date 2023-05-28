import urequests as requests
import ujson
from log import log

def get_plant_id(url):
    try:
        response = requests.get(url=url)
        status_code = response.status_code
        response_text = str(response.text)
        response.close()
        
        if status_code is 200:
            plant = ujson.loads(response_text)
            if plant['data'] is not None and len(plant['data']) is 1:
                plant_id = int(plant['data'][0]['id'])
                return plant_id
        log('Error getting plant ID. URL: ' + url)
        log('status_code: ' + str(status_code))
        log('response_text:' + response_text)
        return None
    except:
        log('url: ' + url)
        log('could not connect')
        return None

