import React, {
  useEffect
} from 'react';
import {
  useSelector,
  useDispatch
} from 'react-redux';
import SystemCheck from 'src/modules/system-check/system-check';
import NavBar from 'src/modules/nav-bar/nav-bar';
import HorizontalSpace from 'src/modules/horizontal-space/horizontal-space';
import Mosaic from 'src/modules/mosaic/mosaic';
import Footer from 'src/modules/footer/footer';
import MediaVideo from 'src/modules/media-video/media-video';
import fetchData from 'src/pages/home/redux/fetch-page-data';
import setPageData from 'src/pages/home/redux/page-actions';

const About = (): React.ReactElement => {
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
      <MediaVideo/>
      <Mosaic />
      <HorizontalSpace size='large' />
      <Footer />
      <SystemCheck />
    </>
  );
};

export default About;
