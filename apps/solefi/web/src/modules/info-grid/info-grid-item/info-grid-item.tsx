import React from 'react';
import 'src/modules/info-grid/info-grid-item/info-grid-item.scss';

const InfoGridItem = (props: any): React.ReactElement => {
  const attr = props.attr;
  if ( !attr ) return (<></>);

  return (
    <div className={`col s12 m6 l4 ${
      attr.hide_on_mobile ? 'hide-on-small-only' : ''}`
    }>
    <div className='InfoGridItem'>
      <i
        className='material-icons InfoGridItem__icon z-depth-5'
        style={{
          backgroundColor: attr.color
        }}
      >{attr.icon}</i>
    <div className='InfoGridItem__title'>{attr.title}</div>
    <div
      className='InfoGridItem__text'
      dangerouslySetInnerHTML={{__html: attr.description}}></div>
    </div>
    </div>
  );
};

export default InfoGridItem;
