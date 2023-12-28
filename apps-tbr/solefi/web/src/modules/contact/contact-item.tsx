import React from 'react';

const ContactItem = (props: any): React.ReactElement => {
  return (
    <a
      className='ContactItem__info white-text'
      href={props.link}
      rel='noreferrer'
      target='_blank'>
      <i className='Large material-icons'>{props.icon}</i>
      <div className='ContactItem__title'>{props.tile}</div>
      <div className='ContactItem__text'>{props.text}</div>
      <div className='ContactItem__textclick'>{props.linkText}</div>
    </a>
  );
};

export default ContactItem;
