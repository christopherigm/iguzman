import React, {
  useEffect
} from 'react';
import {
  useSelector,
  useDispatch
} from 'react-redux';
import SystemCheck from 'src/modules/system-check/system-check';
import NavBar from 'src/modules/nav-bar/nav-bar';
import Slides from 'src/modules/slides/slides';
import HorizontalSpace from 'src/modules/horizontal-space/horizontal-space';
import InfoGrid from 'src/modules/info-grid/info-grid';
import PlatformTrial from 'src/modules/platform-trial/platform-trial';
import HowItWorks from 'src/modules/how-it-works/how-it-works';
import Footer from 'src/modules/footer/footer';
import fetchData from 'src/pages/home/redux/fetch-page-data';
import setPageData from 'src/pages/home/redux/page-actions';

const Home = (): React.ReactElement => {
  const dispatch = useDispatch();
  const pageData = useSelector((state: any) => state.page);
  const attr = pageData.data ? pageData.data.attributes ? pageData.data.attributes : {} : {};

  useEffect(() => {
    const version = attr.version ? attr.version : 0;
    fetchData( version )
      .then((d: any) => {
        if ( d ) dispatch(setPageData(d));
      })
      .catch((error) => {
        console.log(error);
      });
  }, [fetchData]);

  return (
    <>
      <NavBar />
      <Slides />
      <HorizontalSpace size='large' />
      <InfoGrid/>
      <HorizontalSpace size='medium' />
      <PlatformTrial/>
      <HorizontalSpace size='x-large' />
      <HowItWorks/>
      <HorizontalSpace size='large' />
      <Footer />
      <SystemCheck />
    </>
  );
};

export default Home;
