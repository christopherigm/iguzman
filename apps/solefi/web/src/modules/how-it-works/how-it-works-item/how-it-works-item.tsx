import React from 'react';
import 'src/modules/how-it-works/how-it-works-item/how-it-works-item.scss';
import { useSelector } from 'react-redux';

const HowItWorksItem = (props: any): React.ReactElement => {
  const system = useSelector((state: any) => state.system);
  const attr = props.attr;
  if ( !attr ) return (<></>);

  return (
    <div
      className={`col s12 m6 l4 ${
        attr.hide_on_mobile ? 'hide-on-small-only' : null
      }`}
      key={props.number}>
      <div className='HowItWorksItem z-depth-3'>
        <div className='HowItWorksItem__img'
          style = {{backgroundImage: `url(${attr.img_picture})`}}>
        </div>
        <div
          className='HowItWorksItem__button'
          style={{
            backgroundColor: system.darkMode ? 'gray' : '#f44336'
          }}>
          <a
            href='#'
            className='HowItWorksItem__number'
            style = {{color: 'white'}}
            >{Number(props.number) + 1}</a>
        </div>
        <div className='HowItWorksItem__title'>{attr.title}</div>
        <div
          className='HowItWorksItem__text'
          dangerouslySetInnerHTML={{__html: attr.description}}
        ></div>
      </div>
    </div>
  );
};

export default HowItWorksItem;
