import {ShortDateParser} from 'utils';

const getLocalDayDateFormat = (d: string): string => {
  let date = ShortDateParser(d).split(',')[0]; 
  return date;
};

export default getLocalDayDateFormat;
