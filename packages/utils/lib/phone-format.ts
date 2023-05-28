const phoneFormats: any = {
  1: [3, 3, 4],
  52: [2, 4, 4]
};

const PhoneFormat = (phone: string, countryPhoneCode = 1) => {
  if (phone.length < 10) return phone;
  const arrayPhone = phone.split('');
  let phoneString = '';
  let counter = 0;
  const indexCode = phoneFormats[countryPhoneCode] ? countryPhoneCode : 1;
  phoneFormats[indexCode].forEach((i: number) => {
    for (let j = 0; j < i; j++) {
      const element = arrayPhone[counter + j];
      phoneString += element;
    }
    phoneString += ' ';
    counter += i;
  });
  return phoneString.substring(0, phoneString.length - 1);
};

export default PhoneFormat;
