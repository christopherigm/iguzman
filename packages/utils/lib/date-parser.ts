export const DateParser = (date: string): string => {
  const parsedDate = new Date(date);
  const months = [
    'January', 'February', 'Narch', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'
  ];

  const month = months[parsedDate.getMonth()];
  const day = parsedDate.getDate();
  const year = parsedDate.getFullYear();

  return `${month} ${day}, ${year}`;
};

export const ShortDateParser = (date: string, year: boolean = false): string => {
  const parsedDate = new Date(date);
  const month = parsedDate.getMonth() + 1;
  const day = parsedDate.getDate();

  return `${month}/${day}${year ? `/${parsedDate.getFullYear()}` : ''}`;
};

export const HourParser = (date: string): string => {
  const parsedDate = new Date(date);
  const h = parsedDate.getHours();
  const m = parsedDate.getMinutes();

  return `${h > 9 ? h : `0${h}`}:${m > 9 ? m : `0${m}`} hrs`;
};

export const HourParser12Format = (date: string): string => {
  const parsedDate = new Date(date);
  let h = parsedDate.getHours();
  const m = parsedDate.getMinutes();
  let pmam = 'am';

  if (h > 12) {
    h = h - 12;
    pmam = 'pm';
  }

  return `${h > 9 ? h : `0${h}`}:${m > 9 ? m : `0${m}`} ${pmam}`;
};

export const ArrayErrorsToHTMLList = ( errors: Array<any> ): string => {
  let errorMessages = '';
  errors.forEach((i: any) => {
    if ( i.source ) {
      let field = i.source.pointer.split('/');
      field = field[field.length - 1];
      const unique = i.code === 'unique' ? true : false;
      if ( unique && field === 'email' ) {
        errorMessages += '<li>Hay una cuenta registrada con este correo electronico.</li>';
      } else if ( i.code !== 'blank' ) {
        errorMessages += `<li>${i.detail}: ${field}</li>`;
      }
    } else {
      if ( i.detail === 'Wrong credentials' ) {
        errorMessages += `<li>El correo o la contrasena son incorrectos (${i.detail}).</li>`;
      } else {
        errorMessages += `<li>${i.detail}</li>`;
      }
    }
  });
  return errorMessages;
};
