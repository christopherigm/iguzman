class PlantMicroControllerModel:
    id=None
    slug=None
    name=None
    zip_code=None
    img_picture=None
    created=None
    modified=None
    enabled=None
    
    cpu_temperature=None
    ram_allocated=None
    storage_allocated=None
    #city=None

    def __init__(self, data=None):
        if data is not None and data.get('id') is not None:
            self.id=data['id']
            self.slug=data['attributes']['slug']
            self.name=data['attributes']['name']
            self.img_picture=data['attributes']['img_picture']
            self.created=data['attributes']['created']
            self.modified=data['attributes']['modified']
            self.enabled=data['attributes']['enabled']
            
            self.cpu_temperature=data['attributes']['cpu_temperature']
            self.ram_allocated=data['attributes']['ram_allocated']
            self.storage_allocated=data['attributes']['storage_allocated']
