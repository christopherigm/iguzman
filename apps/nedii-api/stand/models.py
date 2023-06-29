from django.db import models
from colorfield.fields import ColorField
from django_resized import ResizedImageField
from common.validators import ModelValidators
from common.models import CommonFields
from common.models import (
    RegularPicture,
    MediumPicture
)
from common.tools import set_media_url, get_unique_slug

class StandBookingQuestion(CommonFields):
    name=models.CharField(
        verbose_name="Pregunta de reservación",
        max_length=128,
        null=False,
        blank=False
    )
    open_answer=models.BooleanField(
        verbose_name="Es pregunta abierta",
        blank=False,
        default=True
    )
    options=models.ManyToManyField(
        "stand.StandBookingQuestionOption",
        related_name="question_options",
        verbose_name="Respuestas",
        blank=True
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name="Pregunta de reservación"
        verbose_name_plural="Preguntas de reservaciones"

    class JSONAPIMeta:
        resource_name="StandBookingQuestion"


class StandBookingQuestionOption(CommonFields):
    value=models.CharField(
        verbose_name="Opcion a pregunta de reservacion",
        max_length=128,
        null=True,
        blank=True
    )

    def __str__(self):
        return self.value

    class Meta:
        verbose_name="Respuesta de pregunta de reservación"
        verbose_name_plural="Respuestas de preguntas de reservaciones"

    class JSONAPIMeta:
        resource_name="StandBookingQuestionOption"


def stand_new(instance, filename):
    return set_media_url("stand_new/", filename)

class StandNew(RegularPicture):
    name=models.CharField (
        max_length=64,
        null=False,
        blank=False
    )
    stand=models.ForeignKey(
        "stand.Stand",
        verbose_name="Empresa",
        null=True,
        blank=False,
        help_text="Empresa al que pertenece este registro",
        on_delete=models.CASCADE
    )
    slug=models.SlugField(
        max_length=64,
        null=True,
        blank=True,
        unique=True
    )

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(
                "{} {}".format(
                    self.stand.name,
                    self.name
                ),
                StandNew
            )
        super().save(*args, **kwargs)

    class Meta:
        verbose_name="Noticia de Stand"
        verbose_name_plural="Noticias de Stands"

    class JSONAPIMeta:
        resource_name="StandNew"


class StandPhone(CommonFields):
    stand=models.ForeignKey(
        "stand.Stand",
        verbose_name="Empresa",
        null=True,
        blank=False,
        help_text="Empresa al que pertenece este registro",
        on_delete=models.CASCADE
    )
    phone=models.CharField(
        verbose_name="Teléfono",
        max_length=10,
        null=False,
        blank=False,
        help_text="Teléfono de la empresa"
    )

    def __str__(self):
        return "{} {}".format(
            self.stand.name,
            self.phone
        )

    class Meta:
        verbose_name="Teléfono de Stand"
        verbose_name_plural="Teléfonos de los Stands"

    class JSONAPIMeta:
        resource_name="StandPhone"


class StandPicture(MediumPicture):
    stand=models.ForeignKey(
        "stand.Stand",
        verbose_name="Empresa",
        null=True,
        blank=False,
        help_text="Empresa al que pertenece este registro",
        on_delete=models.CASCADE
    )

    def __str__(self):
        return self.name or "-"

    def save(self, *args, **kwargs):
        if not self.name:
            self.name="{} - image".format(
                self.stand.name
            )

        super().save(*args, **kwargs)

    class Meta:
        verbose_name="Foto de la empresa"
        verbose_name_plural="Fotos de la empresa"

    class JSONAPIMeta:
        resource_name="StandPicture"


class StandPromotion(MediumPicture):
    name=models.CharField (
        max_length=64,
        null=False,
        blank=False
    )
    slug=models.SlugField(
        max_length=64,
        null=True,
        blank=True,
        unique=True
    )
    stand=models.ForeignKey(
        "stand.Stand",
        related_name="stand_deal",
        verbose_name="Empresa",
        null=False,
        blank=False,
        help_text="Empresa al que pertenece este registro",
        on_delete=models.CASCADE
    )
    # product=models.ForeignKey(
    #     "products.Product",
    #     related_name="product_deal",
    #     verbose_name="Producto",
    #     null=True,
    #     blank=True,
    #     help_text="Producto de la promoción",
    #     on_delete=models.CASCADE
    # )
    # service=models.ForeignKey(
    #     "services.Service",
    #     related_name="service_deal",
    #     verbose_name="Servicio",
    #     blank=True,
    #     null=True,
    #     help_text="Servicio de la promoción",
    #     on_delete=models.CASCADE
    # )
    # meal=models.ForeignKey(
    #     "meals.Meal",
    #     related_name="meal_deal",
    #     verbose_name="Platillo",
    #     blank=True,
    #     null=True,
    #     help_text="Platillo de la promoción",
    #     on_delete=models.CASCADE
    # )
    # real_estate=models.ForeignKey(
    #     "real_estate.RealEstate",
    #     related_name="real_estate_deal",
    #     verbose_name="Inmueble",
    #     blank=True,
    #     null=True,
    #     help_text="Inmueble de la promoción",
    #     on_delete=models.CASCADE
    # )
    # vehicle=models.ForeignKey(
    #     "vehicles.Vehicle",
    #     related_name="vehicle_deal",
    #     verbose_name="Vehículo",
    #     blank=True,
    #     null=True,
    #     help_text="Vehículo de la promoción",
    #     on_delete=models.CASCADE
    # )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(
                "{} {}".format(
                    self.stand.name,
                    self.name
                ),
                StandPromotion
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name="Promoción de Stand"
        verbose_name_plural="Promociones de Stands"

    class JSONAPIMeta:
        resource_name="StandPromotion"


class StandRating(CommonFields):
    stand=models.ForeignKey(
        "stand.Stand",
        verbose_name="Empresa",
        null=True,
        blank=False,
        help_text="Empresa al que pertenece este registro",
        on_delete=models.CASCADE
    )
    author=models.ForeignKey(
        'users.User',
        verbose_name="Autor",
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    rating=models.PositiveSmallIntegerField(
        null=False,
        blank=False,
        default=5
    )
    description=models.TextField(
        verbose_name="Comentario adicional",
        null=True,
        blank=True
    )

    def __str__(self):
        return "{} dio {} estrellas a {}".format(
            self.author.username,
            str(self.rating),
            self.stand.name
        )

    class Meta:
        verbose_name="Puntuación"
        verbose_name_plural="Puntuaciones"
        unique_together=(('stand', 'author'),)

    class JSONAPIMeta:
        resource_name="StandRating"


class SurveyQuestion(CommonFields):
    name=models.CharField(
        verbose_name="Pregunta de encuesta",
        max_length=128,
        null=False,
        blank=False,
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name="Pregunta de encuesta"
        verbose_name_plural="Preguntas de encuestas"

    class JSONAPIMeta:
        resource_name="SurveyQuestion"


class VideoLink(CommonFields):
    stand=models.ForeignKey(
        'stand.Stand',
        verbose_name="Empresa",
        null=True,
        blank=False,
        help_text="Empresa al que pertenece este registro",
        on_delete=models.CASCADE
    )
    name=models.CharField(
        verbose_name="Titulo del link",
        max_length=128,
        null=True,
        blank=True
    )
    link=models.URLField(
        verbose_name="Link del vídeo",
        max_length=256,
        null=False,
        blank=False
    )

    def __str__(self):
        return '{} {}'.format(
            self.stand.name,
            self.name
        )

    class Meta:
        verbose_name="Link de vídeo"
        verbose_name_plural="Links de vídeos"

    class JSONAPIMeta:
        resource_name="VideoLink"


class Expo(RegularPicture):
    name=models.CharField (
        max_length=64,
        null=False,
        blank=False
    )
    real=models.BooleanField(
        verbose_name="Expo Física",
        blank=False,
        default=False,
        help_text="Define si es una exposición física"
    )
    email=models.EmailField(
        verbose_name="Correo electrónico",
        max_length=128,
        null=False,
        blank=False,
        help_text="Correo electrónico del responsable"
    )
    slug=models.SlugField(
        max_length=64,
        null=True,
        blank=True,
        unique=True
    )
    groups=models.ManyToManyField(
        "stand.Group",
        related_name="expo_groups",
        verbose_name="Grupos",
        blank=True,
        help_text="Grupos de esta expo"
    )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(self.name, Expo)
        super().save(*args, **kwargs)

    def __str__(self):
        if self.real:
            return "Expo física: {0}".format(self.name)
        else:
            return "Expo virtual: {0}".format(self.name)

    class Meta:
        verbose_name="Expo"
        verbose_name_plural="Expos"

    class JSONAPIMeta:
        resource_name="Expo"

class Group(RegularPicture):
    name=models.CharField (
        max_length=64,
        null=False,
        blank=False
    )
    slug=models.SlugField(
        max_length=64,
        null=True,
        blank=True,
        unique=True
    )
    icon=models.CharField (
        null=True,
        blank=True,
        max_length=32
    )
    color=ColorField(
        null=True,
        blank=True,
        default="#42a5f5"
    )

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(self.name, Group)
        super().save(*args, **kwargs)

    class Meta:
        verbose_name="Pabellon"
        verbose_name_plural="Pabellones"

    class JSONAPIMeta:
        resource_name="Group"


def stand(instance, filename):
    return set_media_url("stand/", filename)

class Stand(CommonFields):
    plan=models.ForeignKey (
        "common.NediiPlan",
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    restaurant=models.BooleanField(
        verbose_name="Es Restaurante",
        blank=True,
        default=False,
        help_text="Indica si este Stand es un Resturante"
    )
    owner=models.ForeignKey (
        'users.User',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    expo=models.ForeignKey(
        "stand.Expo",
        verbose_name="Expo",
        null=False,
        blank=False,
        help_text="Expo al que pertenece este registro",
        on_delete=models.CASCADE
    )
    group=models.ForeignKey(
        "stand.Group",
        verbose_name="Pabellon",
        null=False,
        blank=False,
        help_text="Grupo al que pertenece este registro",
        on_delete=models.CASCADE
    )
    name=models.CharField(
        verbose_name="Nombre del Stand",
        max_length=128,
        null=False,
        blank=False
    )
    slug=models.SlugField(
        max_length=64,
        null=True,
        blank=True,
        unique=True
    )
    slogan=models.CharField(
        verbose_name="Slogan",
        max_length=90,
        null=True,
        blank=True
    )
    bar_code=models.CharField(
        verbose_name="Código de Barras",
        max_length=400,
        null=True,
        blank=True,
        unique=True
    )
    description=models.TextField(
        verbose_name="Descripción del stand",
        null=True,
        blank=True,
        default="Descripción del stand",
        help_text="Descripción del stand"
    )
    short_description=models.CharField(
        verbose_name="Descripción corta",
        max_length=90,
        null=True,
        blank=True,
        help_text="Descripción corta (90 carácteres)"
    )
    img_logo=ResizedImageField(
        verbose_name="Logo",
        null=True,
        blank=False,
        size=[256, 256],
        quality=100,
        upload_to=stand,
        help_text="Logo del stand"
    )
    img_cover=ResizedImageField(
        verbose_name="Imágen Cover",
        null=True,
        blank=True,
        size=[1920, 1080],
        quality=90,
        upload_to=stand,
        help_text="Imágen Cover del stand"
    )
    panorama=models.ManyToManyField(
        "stand.StandPicture",
        related_name="stand_panorama",
        verbose_name="Imágenes 360°",
        blank=True,
        help_text="Imágenes 360° del stand"
    )
    video_links=models.ManyToManyField(
        "stand.VideoLink",
        related_name="stand_video_links",
        verbose_name="Links de Videos",
        blank=True
    )
    pictures=models.ManyToManyField(
        "stand.StandPicture",
        related_name="stand_pictures",
        verbose_name="Fotos",
        blank=True,
        help_text="Fotos del stand"
    )
    contact_email=models.EmailField(
        verbose_name="Correo de contacto",
        max_length=128,
        null=False,
        blank=False,
        help_text="Correo electrónico de contacto"
    )
    support_email=models.EmailField(
        verbose_name="Correo de soporte",
        max_length=128,
        null=True,
        blank=True,
        help_text="Correo electrónico de soporte"
    )
    always_open=models.BooleanField(
        verbose_name="Siempre abierto",
        blank=False,
        default=False
    )
    monday_open=models.TimeField( null=True, blank=True,
        verbose_name="Apertura los lunes", default="09:00" )
    monday_close=models.TimeField( null=True, blank=True,
        verbose_name="Cierre los lunes",default="18:00" )
    tuesday_open=models.TimeField( null=True, blank=True,
        verbose_name="Apertura los martes", default="09:00" )
    tuesday_close=models.TimeField( null=True, blank=True,
        verbose_name="Cierre los martes",default="18:00" )
    wednesday_open=models.TimeField( null=True, blank=True,
        verbose_name="Apertura los miércoles", default="09:00" )
    wednesday_close=models.TimeField( null=True, blank=True,
        verbose_name="Cierre los miércoles",default="18:00" )
    thursday_open=models.TimeField( null=True, blank=True,
        verbose_name="Apertura los jueves", default="09:00" )
    thursday_close=models.TimeField( null=True, blank=True,
        verbose_name="Cierre los jueves",default="18:00" )
    friday_open=models.TimeField( null=True, blank=True,
        verbose_name="Apertura los viernes", default="09:00" )
    friday_close=models.TimeField( null=True, blank=True,
        verbose_name="Cierre los viernes",default="18:00" )
    saturday_open=models.TimeField( null=True, blank=True,
        verbose_name="Apertura los sabados", default="09:00" )
    saturday_close=models.TimeField( null=True, blank=True,
        verbose_name="Cierre los sabados",default="14:00" )
    sunday_open=models.TimeField( null=True, blank=True,
        verbose_name="Apertura los domingos", default=None )
    sunday_close=models.TimeField( null=True, blank=True,
        verbose_name="Cierre los domingos",default=None )
    booking_active=models.BooleanField(
        verbose_name="Reservaciones activas",
        blank=False,
        default=False,
        help_text="Define si este stand admite reservaciones"
    )
    booking_fee=models.PositiveSmallIntegerField(
        verbose_name="Costo de la reservación",
        null=True,
        blank=True,
        default=5
    )
    booking_email=models.EmailField(
        verbose_name="Correo de reservaciones",
        max_length=128,
        null=True,
        blank=True,
        help_text="Correo electrónico de reservaciones"
    )
    phones=models.ManyToManyField(
        "stand.StandPhone",
        related_name="stand_phones",
        verbose_name="Teléfonos",
        blank=True,
        help_text="Teléfonos del stand"
    )
    city=models.ForeignKey(
        "common.City",
        verbose_name="Ciudad",
        null=True,
        blank=False,
        help_text="Ciudad al que pertenece este registro",
        on_delete=models.CASCADE
    )
    zip_code=models.CharField (
        max_length=5,
        null=True,
        blank=True,
        validators=[
            ModelValidators.us_zip_code,
        ]
    )
    address=models.CharField(
        verbose_name="Dirección del Stand",
        max_length=256,
        null=False,
        blank=False,
        help_text="Dirección física del Stand"
    )
    about=models.TextField(
        verbose_name="Acerca del Stand",
        null=True,
        blank=True,
        default="Acerca del Stand",
        help_text="Acerca del Stand"
    )
    mission=models.TextField(
        verbose_name="Misión del Stand",
        null=True,
        blank=True,
        default="Misión del Stand",
		help_text="Misión del Stand"
    )
    vision=models.TextField(
        verbose_name="Visión del Stand",
        null=True,
        blank=True,
        default="Visión del Stand",
		help_text="Visión del Stand"
    )
    web_link=models.URLField(
        verbose_name="Web del Stand",
        null=True,
        blank=True,
        help_text="Link de página web del Stand"
    )
    facebook_link=models.URLField(
        verbose_name="Facebook del Stand",
        max_length=256,
        null=True,
        blank=True,
        help_text="Link del Facebook del Stand"
    )
    twitter_link=models.URLField(
        verbose_name="Twitter del Stand",
        null=True,
        blank=True,
        help_text="Link del Twitter del Stand"
    )
    instagram_link=models.URLField(
        verbose_name="Instagram del Stand",
        null=True,
        blank=True,
        help_text="Link del Instagram del Stand"
    )
    linkedin_link=models.URLField(
        verbose_name="LinkedIn del Stand",
        null=True,
        blank=True,
        help_text="Link de Linkedin del Stand"
    )
    google_link=models.URLField(
        verbose_name="Google+ del Stand",
        null=True,
        blank=True,
        help_text="Link del Google del Stand"
    )
    youtube_link=models.URLField(
        verbose_name="Youtube del Stand",
        null=True,
        blank=True,
        help_text="Link del Youtube del Stand"
    )
    stand_booking_questions=models.ManyToManyField(
        "stand.StandBookingQuestion",
        related_name="stand_booking_questions",
        verbose_name="Informacion de reservaciones",
        blank=True,
        help_text="Formulario de reservaciones"
    )
    stand_news=models.ManyToManyField(
        "stand.StandNew",
        related_name="stand_news",
        verbose_name="Noticias",
        blank=True,
        help_text="Noticias del stand"
    )
    promotions=models.ManyToManyField(
        "stand.StandPromotion",
        related_name="stand_promotions",
        verbose_name="Promociones",
        blank=True,
        help_text="Promociones del stand"
    )
    survey_questions=models.ManyToManyField(
        "stand.SurveyQuestion",
        related_name="survey_quetions",
        verbose_name="Preguntas de la encuesta",
        blank=True,
        help_text="Seleccione preguntas de la encuesta"
    )
    average_rating = models.DecimalField(
        verbose_name="Puntuaje promedio",
        max_digits=10,
        decimal_places=2,
        blank=False,
        null=False,
        default=0
    )
    ratings=models.ManyToManyField(
        "stand.StandRating",
        related_name="stand_ratings",
        verbose_name="Stand ratings",
        blank=True
    )
    products_max_price=models.PositiveIntegerField(
        blank=False,
        null=False,
        default=0
    )
    meals_max_price=models.PositiveIntegerField(
        blank=False,
        null=False,
        default=0
    )
    services_max_price=models.PositiveIntegerField(
        blank=False,
        null=False,
        default=0
    )
    vehicles_max_price=models.PositiveIntegerField(
        blank=False,
        null=False,
        default=0
    )
    real_state_max_price=models.PositiveIntegerField(
        blank=False,
        null=False,
        default=0
    )
    # highlighted_products=models.ManyToManyField(
    #     "products.Product",
    #     related_name="highlighted_products",
    #     verbose_name="Productos destacados",
    #     blank=True,
    #     help_text="Productos destacados"
    # )
    # highlighted_services=models.ManyToManyField(
    #     "services.Service",
    #     related_name="highlighted_services",
    #     verbose_name="Servicios destacados",
    #     blank=True,
    #     help_text="Servicios destacados"
    # )
    # highlighted_meals=models.ManyToManyField(
    #     "meals.Meal",
    #     related_name="highlighted_meals",
    #     verbose_name="Platillos destacados",
    #     blank=True,
    #     help_text="Platillos destacados"
    # )
    # highlighted_real_estates=models.ManyToManyField(
    #     "real_estate.RealEstate",
    #     related_name="highlighted_real_estates",
    #     verbose_name="Inmuebles destacados",
    #     blank=True,
    #     help_text="Inmuebles destacados"
    # )
    # highlighted_vehicles=models.ManyToManyField(
    #     "vehicles.Vehicle",
    #     related_name="highlighted_vehicles",
    #     verbose_name="Vehículos destacados",
    #     blank=True,
    #     help_text="Vehículos destacados"
    # )

    def save(self, *args, **kwargs):
        if not self.slug:
            string=self.name
            self.slug=get_unique_slug(string, Stand)
        super().save(*args, **kwargs)


    def __str__(self):
        return self.name

    class Meta:
        verbose_name="Stand"
        verbose_name_plural="Stands"

    class JSONAPIMeta:
        resource_name="Stand"
