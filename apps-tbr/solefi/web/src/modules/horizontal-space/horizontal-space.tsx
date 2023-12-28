import React from 'react';
import 'src/modules/horizontal-space/horizontal-space.scss';

interface params {
  size: string
}

const HorizontalSpace = (props: params): React.ReactElement => {
  return (
    <div
      className={`HorizontalSpace HorizontalSpace--${props.size}`}
    ></div>
  );
};

export default HorizontalSpace;
