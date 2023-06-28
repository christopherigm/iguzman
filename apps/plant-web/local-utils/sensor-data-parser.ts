import MeasurementInterface from "interfaces/measurement-interface";

type Props = {
  min: number;
  max: number;
  current: number;
}

type StatusByRange = {
  diff: number;
  offset: number;
  color: '#CA2704' | 'green' | 'orange';
}
const warningLimit = 30;

// https://cssgradient.io/
export const getStatusBackground = (offset: number): string => {
  let value = Math.abs(offset);
  if (value === 0) {
    return '';
  }
  if (value >= warningLimit) {
    return 'radial-gradient(circle, rgba(251,63,63,0) 0%, rgba(252,70,70,0.8) 100%);';
  }
  return 'radial-gradient(circle, rgba(233,218,47,0) 0%, rgba(218,201,20,0.73) 100%);';
}

export const getStatusByRange = ({min, max, current}: Props): StatusByRange => {
  if (current >= min && current <= max) {
    return {
      diff: 0,
      offset: 0,
      color: 'green'
    };
  }
  let percentage = 0;
  if (current >= max) {
    percentage = Number(((((current-min) * 100) / (max-min))-100).toFixed(2));
    return {
      diff: Number((current - max).toFixed(2)),
      offset: percentage,
      color: percentage >= warningLimit ? '#CA2704' : 'orange'
    };
  }
  percentage = Number(((((current-min) * 100) / (max-min))).toFixed(2));
  return {
    diff: Number((min - current).toFixed(2)),
    offset: percentage,
    color: Math.abs(percentage) >= warningLimit ? '#CA2704' : 'orange'
  };
};