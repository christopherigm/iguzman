import React from 'react';
import { useSelector } from 'react-redux';
import * as M from 'materialize-css';
import EnvironmentVariables from 'src/constants/EnvironmentVariables';
import Contact from 'src/modules/contact/contact';
import 'src/modules/footer/footer.scss';

const env = EnvironmentVariables.getInstance();
const isMobileApp = env.isMobileApp;

const Footer = (): React.ReactElement => {
  const system = useSelector((state: any) => state.system);

  return (
    <footer className='page-footer blue Footer'>
      <Contact/>
      <div className='footer-copyright'>
        <div className='container Footer__info'>
          <div
            className='Footer__version'
            onClick={() => {
              M.toast({
                html: `(${system.platform.os} - ${env.branchName})`,
                classes: 'rounded'
              });
            }}>
            <span>V {env.version}&nbsp;</span>
            { !isMobileApp ?
              <a
                href='/static/app.apk'
                className='white-text Footer__app'>
                <span>-&nbsp;</span>
                <i className='material-icons'>android</i>
              </a> : null
            }
          </div>
          <span className='white-text'>With ♥ by&nbsp;
            <a href='https://github.com/GMR027'
              className='white-text'
              target='_blank'
              rel='noreferrer'>
              Edgar
            </a>
            &nbsp;&&nbsp;
            <a href='https://github.com/christopherigm'
              className='white-text'
              target='_blank'
              rel='noreferrer'>
              Chris
            </a>
            &nbsp;G.
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
