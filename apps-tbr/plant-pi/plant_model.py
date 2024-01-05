class PlantModel:
    id=None
    slug=None
    name=None
    img_picture=None
    created=None
    modified=None
    enabled=None
    
    last_measurement=None

    def __init__(self, data=None):
        if data is not None and data.get('id') is not None:
            self.id=data['id']
            self.slug=data['attributes']['slug']
            self.name=data['attributes']['name']
            self.img_picture=data['attributes']['img_picture']
            self.created=data['attributes']['created']
            self.modified=data['attributes']['modified']
            self.enabled=data['attributes']['enabled']
            if (
                    data['attributes'].get('last_measurement') is not None and
                    data['attributes']['last_measurement'].get('created') is not None
                ):
                self.last_measurement=data['attributes']['last_measurement']['created']
