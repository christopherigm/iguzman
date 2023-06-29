from django.db import models
from common.models import (
    SmallPicture,
    MediumPicture,
)
from common.tools import set_media_url, get_unique_slug

class MealClassification(MediumPicture):
    stand=models.ForeignKey(
        "stand.Stand",
        related_name="stand_meal_classification",
        verbose_name="Restaurante",
        null=False,
        blank=False,
        help_text="Restaurante al que pertenece este registro",
        on_delete=models.CASCADE
    )
    name=models.CharField (
        max_length=64,
        null=False,
        blank=False
    )
    slug=models.SlugField (
        max_length=64,
        null=True,
        blank=True,
        unique=True
    )
    img_icon=models.CharField (
        verbose_name="Icono",
        max_length=32,
        null=True,
        blank=True
    )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(
                self.name,
                MealClassification
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name="Categoría de comida"
        verbose_name_plural="Categorías de comidas"

    class JSONAPIMeta:
        resource_name="MealClassification"


class MealAddon(SmallPicture):
    name=models.CharField (
        max_length=64,
        null=False,
        blank=False
    )
    stand=models.ForeignKey(
        "stand.Stand",
        related_name="stand_meal_addon",
        verbose_name="Restaurante",
        null=False,
        blank=False,
        help_text="Restaurante al que pertenece este registro",
        on_delete=models.CASCADE
    )
    quantity=models.CharField(
        verbose_name="Cantidad",
        max_length=32,
        null=False,
        blank=True,
        default="1"
    )
    price=models.DecimalField(
        verbose_name="Precio",
        max_digits=10,
        decimal_places=2,
        null=False,
        blank=False,
        default=5,
    )

    def __str__(self):
        return "[{0}] {1} ${2}".format(
            self.stand,
            self.name,
            self.price
        )

    class Meta:
        verbose_name="Ingrediente / adicional"
        verbose_name_plural="Ingredientes / adicionales"

    class JSONAPIMeta:
        resource_name="MealAddOn"


class MealPicture(MediumPicture):
    stand=models.ForeignKey (
        "stand.Stand",
        verbose_name="Restaurante",
        null=True,
        blank=False,
        help_text="Restaurante al que pertenece este registro",
        on_delete=models.CASCADE
    )
    meal=models.ForeignKey (
        "meal.Meal",
        verbose_name="Platillo",
        null=True,
        blank=False,
        help_text="Platillo al que pertenece este registro",
        on_delete=models.CASCADE
    )

    def __str__(self):
        return self.name or "-"

    def save(self, *args, **kwargs):
        if not self.name:
            self.name="{} - {} image".format(
                self.stand.name,
                self.meal.name
            )

        super().save(*args, **kwargs)

    class Meta:
        verbose_name="Foto de comida"
        verbose_name_plural="Fotos de comidas"

    class JSONAPIMeta:
        resource_name="MealPicture"


def meal_picture(instance, filename):
    return set_media_url("meal_picture/", filename)

class Meal(MediumPicture):
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
    classification=models.ForeignKey(
        "meal.MealClassification",
        verbose_name="Clasificación",
        null=True,
        blank=False,
        help_text="Clasificación al que pertenece este registro",
        on_delete=models.CASCADE
    )
    stand=models.ForeignKey(
        "stand.Stand",
        related_name="stand_meal",
        verbose_name="Restaurante",
        null=True,
        blank=False,
        help_text="Restaurante al que pertenece este registro",
        on_delete=models.CASCADE
    )
    publish_on_the_wall=models.BooleanField(
        verbose_name="Publicar en el muro",
        blank=False,
        default=False
    )
    stock=models.PositiveSmallIntegerField(
        verbose_name="Cantidad en Stock",
        null=True,
        blank=True,
        default=1,
        help_text="Cantidad que existe en stock"
    )
    is_breakfast=models.BooleanField(
        verbose_name="Es desayuno",
        blank=False,
        default=False
    )
    is_meal=models.BooleanField(
        verbose_name="Es comida",
        blank=False,
        default=True
    )
    is_dinner=models.BooleanField(
        verbose_name="Es cena",
        blank=False,
        default=False
    )
    short_description=models.CharField(
        verbose_name="Descripción corta",
        max_length=90,
        null=True,
        blank=True,
        help_text="Descripción corta (90 carácteres)"
    )
    description=models.TextField(
        verbose_name="Descripción",
        null=True,
        blank=True,
        default="Descripcion del platillo"
    )
    price=models.DecimalField(
        verbose_name="Precio del platillo",
        max_digits=10,
        decimal_places=2,
        null=False,
        blank=False,
        default=5,
        help_text="Precio del platillo"
    )
    discount=models.PositiveSmallIntegerField(
        verbose_name="Descuento",
        null=True,
        blank=True,
        default=0,
        help_text="Descuento de 1% a 99%"
    )
    final_price=models.DecimalField(
        verbose_name="Precio final",
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        default=0
    )
    meal_addons=models.ManyToManyField(
        "meal.MealAddon",
        verbose_name="Adicionales",
        blank=True,
        help_text="Ingredientes / Adicionales"
    )
    meal_pictures=models.ManyToManyField(
        "meal.MealPicture",
        related_name="meal_pictures",
        verbose_name="Fotos",
        blank=True,
        help_text="Fotos del platillo"
    )
    video_link=models.URLField(
        verbose_name="Link del vídeo",
        null=True,
        blank=True,
        help_text="Link del vídeo de youtube"
    )
    times_selled=models.PositiveSmallIntegerField(
        verbose_name="Cantidad de veces vendido",
        null=False,
        blank=True,
        default=0
    )
    views=models.PositiveSmallIntegerField(
        verbose_name="Cantidad de veces visto",
        null=False,
        blank=True,
        default=0
    )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(
                "{}-{}".format(
                    self.stand.slug,
                    self.name
                ),
                Meal
            )

        final_price=float(self.price)

        discount=0
        if self.discount is not None:
            discount=int(self.discount)

        if 99 > discount > 0:
            discount=discount / 100
            discount=discount * final_price
            final_price -= discount

        self.final_price=final_price

        if self.final_price > self.stand.meals_max_price:
            self.stand.meals_max_price = self.final_price
            self.stand.save()

        super().save(*args, **kwargs)

    def __str__(self):
        return "{} - {}".format(
            self.stand.name,
            self.name
        )

    class Meta:
        verbose_name="Platillo"
        verbose_name_plural="Platillos"

    class JSONAPIMeta:
        resource_name="Meal"
