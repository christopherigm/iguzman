class PlantTypeModel:
    id=None
    slug=None
    name=None
    img_picture=None
    created=None
    modified=None
    enabled=None
    
    min_soil_humidity=None
    max_soil_humidity=None
    min_ambient_temperature=None
    max_ambient_temperature=None
    min_ambient_humidity=None
    max_ambient_humidity=None
    min_light_value=None
    max_light_value=None
    min_hours_of_direct_light=None
    max_hours_of_direct_light=None
    minutes_to_upload_sensor_data=None

    def __init__(self, data=None):
        if data is not None and data.get('id') is not None:
            self.id=data['id']
            self.slug=data['attributes']['slug']
            self.name=data['attributes']['name']
            self.img_picture=data['attributes']['img_picture']
            self.created=data['attributes']['created']
            self.modified=data['attributes']['modified']
            self.enabled=data['attributes']['enabled']
            
            self.min_soil_humidity=data['attributes']['min_soil_humidity']
            self.max_soil_humidity=data['attributes']['max_soil_humidity']
            self.min_ambient_temperature=data['attributes']['min_ambient_temperature']
            self.max_ambient_temperature=data['attributes']['max_ambient_temperature']
            self.min_ambient_humidity=data['attributes']['min_ambient_humidity']
            self.max_ambient_humidity=data['attributes']['max_ambient_humidity']
            self.min_light_value=data['attributes']['min_light_value']
            self.max_light_value=data['attributes']['max_light_value']
            self.min_hours_of_direct_light=data['attributes']['min_hours_of_direct_light']
            self.max_hours_of_direct_light=data['attributes']['max_hours_of_direct_light']
            self.minutes_to_upload_sensor_data=data['attributes']['minutes_to_upload_sensor_data']
