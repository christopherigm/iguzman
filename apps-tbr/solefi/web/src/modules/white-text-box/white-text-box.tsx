import React from 'react';
import 'src/modules/white-text-box/white-text-box.scss';

const WhiteTextBox = (props: any): React.ReactElement => {
  return (
    <div className='WhiteTextBox row z-depth-3'>
      <em className='col s0 m1 l0 hid-on-small-only Box__space'></em>
        <div
          className='col s12 m10 l12 WhiteTextBox__text'
          dangerouslySetInnerHTML={{__html: props.text}}></div>
      <em className='col s0 m1 l0 hid-on-small-only Box__space'></em>
    </div>

  );
};

export default WhiteTextBox;
