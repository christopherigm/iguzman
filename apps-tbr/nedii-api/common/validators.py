# Validators
from django.core.validators import RegexValidator

r_name='^[A-Za-z\u00C0-\u017F\s]{3,64}$'
r_code='^[A-Za-z0-9_-]{3,64}$'
r_mx_phone='^[0-9+]{10,10}$'
r_mx_zip_code='^[0-9]{5,5}$'
r_us_phone='^[0-9+]{10,10}$'
r_us_zip_code='^[0-9]{5,5}$'

class ModelValidators:
    def name(self):
        return RegexValidator(
            regex=r_name,
            message='Name doesn\'t comply',
        )
    def code(self):
        return RegexValidator(
            regex=r_code,
            message='Code name doesn\'t comply',
        )
    def mx_phone(self):
        return RegexValidator(
            regex=r_mx_phone,
            message='Phone number doesn\'t comply',
        )
    def us_phone(self):
        return RegexValidator(
            regex=r_us_phone,
            message='Phone number doesn\'t comply',
        )
    def mx_zip_code(self):
        return RegexValidator(
            regex=r_mx_zip_code,
            message='Zipcode number doesn\'t comply',
        )
    def us_zip_code(self):
        return RegexValidator(
            regex=r_us_zip_code,
            message='Zipcode number doesn\'t comply',
        )
