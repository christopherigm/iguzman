import React, {
  useEffect,
  useState
} from 'react';
import {
  useSelector,
  useDispatch
} from 'react-redux';
import SystemCheck from 'src/modules/system-check/system-check';
import {
  useParams
} from 'react-router-dom';
import NavBar from 'src/modules/nav-bar/nav-bar';
import Slides from 'src/modules/slides/slides';
import HorizontalSpace from 'src/modules/horizontal-space/horizontal-space';
import ActivateUserCall from 'src/pages/activate-user/activate-user-call';
import Footer from 'src/modules/footer/footer';
import fetchData from 'src/pages/home/redux/fetch-page-data';
import setPageData from 'src/pages/home/redux/page-actions';

const ActivateUser = (): React.ReactElement => {
  const dispatch = useDispatch();
  const pageData = useSelector((state: any) => state.page);
  const attr = pageData.data ? pageData.data.attributes ? pageData.data.attributes : {} : {};
  const params: any = useParams();
  const [status, setStatus] = useState({
    success: false,
    message: ''
  });
  const token = params.token || null;

  useEffect(() => {
    const version = attr.version ? attr.version : 0;
    fetchData( version )
      .then((d: any) => {
        if ( d ) dispatch(setPageData(d));
      })
      .catch((error) => {
        console.log(error);
    });
    ActivateUserCall( token )
      .then((d: any) => {
        setStatus(d);
      })
      .catch(() => {
        setStatus({
          success: false,
          message: 'Error activando la cuenta'
        });
      });
  }, [ActivateUserCall, fetchData]);

  return (
    <>
      <NavBar />
      <Slides />
      <HorizontalSpace size='large' />
      <p>{ status.success ? 'Cuenta activada correctamente' : status.message }</p>
      <Footer />
      <SystemCheck />
    </>
  );
};

export default ActivateUser;
