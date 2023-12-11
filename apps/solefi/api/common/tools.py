import binascii, os, bcrypt, base64
from django.conf import settings
from django.utils.text import slugify
from enum import Enum
from django.core.files import File
import os, re

def get_random_mame( size=None ):
	return binascii.hexlify(os.urandom(size)).decode()

def set_media_url( path, filename ):
	ext = filename.split('.')[-1]
	renamedfile = '{}/{}.{}'.format (
        path,
        get_random_mame(18),
        ext
    )
	return renamedfile

def get_media_url(image_name):
    if image_name:
        return '{}/{}/{}'.format(settings.HOST, settings.MEDIA_ROOT, image_name)

def get_cypher_password(password):
    if password:
        password = bcrypt.hashpw(bytes(password, 'utf8'), bcrypt.gensalt(14)).decode('utf-8')
    return password

def base64_to_file(picture, dir):
    try:
        os.stat(settings.MEDIA_ROOT)
    except:
        os.mkdir(settings.MEDIA_ROOT)

    try:
        os.stat(settings.MEDIA_ROOT + '/' + dir)
    except:
        os.mkdir(settings.MEDIA_ROOT + '/' + dir)

    if picture.find(';base64,') < 0 and picture.find('/') < 0:
        return None

    ext = picture.split(';base64,')[0]
    ext = ext.split('/')[-1]
    picture = picture.split(';base64,')[1]
    picture_name = set_media_url(dir,'picture_profile.' + ext )
    with open(settings.MEDIA_ROOT + '/' + picture_name, 'wb') as fh:
        fh.write(base64.decodebytes( bytes(picture,'utf8') ))
    return picture_name

def save_base64_picture(request):
    dir = 'common/'
    try:
        dir = '{0}/'.format(json.loads(request.body.decode('utf-8'))['data']['type'])
        pass
    except:
        pass
    for i in request.data:
        if len(re.findall(r'img',i)) > 0:
            picture = base64_to_file( request.data[i], dir )
            path = os.path.join(settings.BASE_DIR, settings.MEDIA_ROOT + '/' + picture)
            picture = open(path, 'rb')
            request.data[i] = File(picture)
            os.remove(path)
    return request

def get_unique_slug(string, Model):
    slug = slugify(string)
    unique_slug = slug
    num = 1
    while Model.objects.filter(slug=unique_slug).exists():
        unique_slug = '{}-{}'.format(slug, num)
        num += 1
    return unique_slug
