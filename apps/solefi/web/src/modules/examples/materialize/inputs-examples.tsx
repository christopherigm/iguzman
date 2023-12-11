import React, { useEffect, useRef } from 'react';
import * as M from 'materialize-css';
import {
  useSelector,
  useDispatch
} from 'react-redux';
import SwitchDarkMode from 'src/redux/actions/switch-dark-mode';

const InputExamples = (): React.ReactElement => {
  const inputRef: any = useRef(null);
  const dispatch = useDispatch();
  const platformOptions = useSelector((state: any) => state.platformOptions);

  const displayToast = ( event: any ) => {
    const value = inputRef.current.value;
    if ( value ) M.toast({html: value});
    inputRef.current.value = '';
    event.preventDefault();
  };

  useEffect(() => {
    M.AutoInit();
  });

  return (
    <>
      <form onSubmit={displayToast}>
        <div className='input-field col s6'>
          <input id='input_txt' type='text' className='validate' ref={inputRef}/>
          <label htmlFor='input_txt'>Property</label>
        </div>
      </form>

      <a className='waves-effect waves-light btn' onClick={displayToast}>
        <i className='material-icons left'>cloud</i>
        <span>Check</span>
      </a>

      <br /><br /><br />
      <div className='switch'>
        <label>
          Off
          <input type='checkbox'
            checked={platformOptions.darkMode}
            onChange={( e: any ) => {
            dispatch(SwitchDarkMode(e.target.checked));
          }}/>
          <span className='lever'></span>
          On
        </label>
      </div>

      <br /><br /><br />
      <div className='input-field col s12'>
        <select>
          <option value='' disabled defaultValue=''>Choose your option</option>
          <option value='1'>Option 1</option>
          <option value='2'>Option 2</option>
          <option value='3'>Option 3</option>
          { platformOptions.darkMode ? <option>Dark Mode enabled</option> : '' }
        </select>
        <label>Materialize Select</label>
      </div>

      <div className="fixed-action-btn">
        <a href='/static/app.apk' target='_blank'
          className="btn-floating btn-large waves-effect waves-light green darken-1">
          <i className="material-icons">adb</i>
        </a>
      </div>
    </>
  );
};

export default InputExamples;
