import React, { useEffect, useRef } from 'react';
import { Chart } from 'chart.js';

const labels = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June'
];
const data = {
  labels: labels,
  datasets: [{
    label: 'My First dataset',
    backgroundColor: 'rgb(255, 99, 132)',
    borderColor: 'rgb(255, 99, 132)',
    data: [0, 10, 5, 2, 20, 30, 45]
  }]
};

const ChartExample = (): React.ReactElement => {
  const myChart: any = useRef(null);

  useEffect(() => {
    new Chart(myChart.current, {
      type: 'line',
      data: data,
      options: { }
    });
  });

  return (
    <div>
      <canvas id='myChart' ref={myChart}></canvas>
    </div>
  );
};

export default ChartExample;
