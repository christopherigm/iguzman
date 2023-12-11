import React from 'react';
import 'src/modules/mosaic/mosaic.scss';

const MosaicItem = ( props: any ): React.ReactElement => {
  const item = props.item;

  return (
    <div className={`container ${
        item.hide_on_mobile ? 'hide-on-small-only' : null
      }`}>
      <div className='MosaicItem row'>
        {
          item.image_position === 'left' ?
            <div className='MosaicItem__image-wrapper col m8 hide-on-small-only'>
              <em
                className='MosaicItem__image'
                style={{backgroundImage: `url(${item.img_picture})`}}></em>
            </div> : null
        }
        <div
          className='MosaicItem__image-wrapper col s12 hide-on-med-and-up'
          style={{ justifyContent: 'flex-end' }}>
          <em
            className='MosaicItem__image'
            style={{backgroundImage: `url(${item.img_picture})`}}></em>
        </div>
        <div
          className='MosaicItem__information col s12 m4 valign-wrapper'
          style={{
            backgroundImage: `linear-gradient(${item.gradient_degree}deg, ${item.color}, ${item.secondary_color})`
          }}>
          <p
            className='MosaicItem__text'
            dangerouslySetInnerHTML={{__html: item.description}}></p>
        </div>
        {
          item.image_position === 'right' ?
            <div
              className='MosaicItem__image-wrapper col m8 hide-on-small-only'
              style={{ justifyContent: 'flex-end' }}>
              <em
                className='MosaicItem__image'
                style={{backgroundImage: `url(${item.img_picture})`}}></em>
            </div> : null
        }
      </div>
    </div>
  );
};

export default MosaicItem;
