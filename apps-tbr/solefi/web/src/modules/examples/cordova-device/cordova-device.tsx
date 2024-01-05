import React, { useEffect, useRef, useState } from 'react';
import * as M from 'materialize-css';

const CordovaDevice = (): React.ReactElement => {
  const collapsibleRef: any = useRef(null);
  const [device, setDevice] = useState({
    platform: '',
    model: '',
    uuid: '',
    memory: ''
  });

  useEffect(() => {
    M.Collapsible.init(collapsibleRef.current, {});
    const w: any = window;
    w.document.addEventListener('deviceready', () => {
      if ( w.device ) {
        setDevice(w.device);
      }
    }, false);
  });

  return (
    <>
      <br /><br />
      <p>Device information</p>
      <ul className='collapsible' ref={collapsibleRef}>
        <li>
          <div className='collapsible-header'><i className='material-icons'>phone_iphone</i>Device</div>
          <div className='collapsible-body'>
            <span>{ device.platform ? device.platform : 'Web' }</span>
          </div>
        </li>
        <li>
          <div className='collapsible-header'><i className='material-icons'>merge_type</i>Model</div>
          <div className='collapsible-body'>
            <span>{ device.model ? device.model : '-' }</span>
          </div>
        </li>
        <li>
          <div className='collapsible-header'><i className='material-icons'>memory</i>UUID</div>
          <div className='collapsible-body'>
            <span>{ device.uuid ? device.uuid : 'none' }</span>
          </div>
        </li>
      </ul>
    </>
  );
};

export default CordovaDevice;
