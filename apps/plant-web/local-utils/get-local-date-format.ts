import {
  HourParser12Format,
  ShortDateParser,
} from 'utils';

const getLocalDateFormat = (d: string): string => {
  let date = `${ShortDateParser(d).split(',')[0]}  ${HourParser12Format(d)}`; 
  return date;
};

export default getLocalDateFormat;
