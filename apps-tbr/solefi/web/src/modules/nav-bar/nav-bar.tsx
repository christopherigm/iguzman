import { Link } from 'react-router-dom';
import React, { useRef, useEffect } from 'react';
import * as M from 'materialize-css';
import { useSelector } from 'react-redux';
import 'src/modules/nav-bar/nav-bar.scss';
import ClientAccess from 'src/modules/client-access/client-access';

const CommonMenuItems = ( props: any ): React.ReactElement => {
  return (
    <>
      <li>
        <em
          className='SideNavBar__logo hide-on-large-only'style={{
          backgroundImage: `url(${props.img_logo})`
        }}></em>
      </li>
      <li>
        <Link className='grey-text text-darken-2' to='/'>Inicio</Link>
      </li>
      <li>
        <Link className='grey-text text-darken-2' to='/about'>Acerca</Link>
      </li>
      <li>
        <ClientAccess/>
      </li>
    </>
  );
};

const SideNavBar = ( props: any ): React.ReactElement => {
  const img_logo = props.pageAttr.img_logo;

  return (
    <ul className='sidenav SideNavBar' id='mobile-demo'
      ref={props.sideNavRef}
      onClick={props.closeSideNav}>
      <CommonMenuItems img_logo={img_logo} />
    </ul>
  );
};

const NavBar = (): React.ReactElement => {
  const sideNavRef: any = useRef(null);
  const pageData = useSelector((state: any) => state.page);
  const pageAttr: any = pageData.data ? pageData.data.attributes ? pageData.data.attributes : {} : {};

  const closeSideNav = () => {
    const sideNav = M.Sidenav.getInstance(sideNavRef.current);
    sideNav.close();
  };

  useEffect(() => {
    M.Sidenav.init(sideNavRef.current, {
      edge: 'left'
    });
  });

  return (
    <>
      <div className='navbar-fixed'>
        <nav className='white'>
          <div className='nav-wrapper container'>
            <Link
              to='/'
              className='brand-logo Logo'
              style={{
                backgroundImage: `url(${pageAttr.img_logo})`
              }}>
            </Link>
            <a href='#'
              data-target='mobile-demo'
              className='sidenav-trigger blue-text text-darken-2'>
              <i className='material-icons'>menu</i>
            </a>
            <ul
              id='nav-mobile'
              className='right hide-on-med-and-down'>
              <CommonMenuItems />
            </ul>
          </div>
        </nav>
      </div>
      <SideNavBar
        sideNavRef={sideNavRef}
        closeSideNav={closeSideNav}
        pageAttr={pageAttr}/>
    </>
  );
};

export default NavBar;
