import {
  combineReducers
} from 'redux';
import {
  UserReducer
} from 'src/redux/reducers/user-reducer';
import SystemReducer from 'src/redux/reducers/system-reducer';
import InfoGridReducer from 'src/modules/info-grid/redux/info-grid-reducer';
import SlidesReducer from 'src/modules/slides/redux/slides-reducer';
import HowItWorks from 'src/modules/how-it-works/redux/how-it-works-reducer';
import MosaicReducer from 'src/modules/mosaic/redux/mosaic-reducer';
import PageReducer from 'src/pages/home/redux/page-reducer';

const reducers = {
  user: UserReducer,
  system: SystemReducer,
  infoGrid: InfoGridReducer,
  slides: SlidesReducer,
  howItWorks: HowItWorks,
  mosaicData: MosaicReducer,
  page: PageReducer
};

export default combineReducers(reducers);
