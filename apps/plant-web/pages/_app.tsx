import 'styles/globals.scss';
import '@fontsource/roboto';
import {
  Chart, ArcElement, LineElement, BarElement, PointElement, BarController, BubbleController, DoughnutController, LineController,
  PieController, PolarAreaController, RadarController, ScatterController, CategoryScale, LinearScale, LogarithmicScale,
  RadialLinearScale, TimeScale, TimeSeriesScale, Filler, Legend, Title, Tooltip
} from 'chart.js';

Chart.register(ArcElement, LineElement, BarElement, PointElement, BarController, BubbleController, DoughnutController, LineController,
  PieController, PolarAreaController, RadarController, ScatterController, CategoryScale, LinearScale, LogarithmicScale,
  RadialLinearScale, TimeScale, TimeSeriesScale, Filler, Legend, Title, Tooltip);

type Props = {
  Component: any,
  pageProps: any
}

export default function App({ Component, pageProps }: Props) {
  return <Component {...pageProps} />;
};
